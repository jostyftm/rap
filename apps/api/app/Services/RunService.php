<?php

declare(strict_types=1);

namespace App\Services;

use App\Events\RunUpdated;
use App\Http\Requests\Run\RunCreateRequest;
use App\Models\Recipe;
use App\Models\Run;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Symfony\Component\HttpFoundation\Response;

class RunService
{
    public function __construct(
        private RunnerDispatcher $dispatcher,
        private WebhookRunDelivery $webhookRuns
    ) {}

    public function get(Run $run): Run
    {
        $run->load(['recipeVersion.recipe:id,uuid', 'steps', 'artifacts']);
        $run->loadCount(['steps', 'logs']);

        return $run;
    }

    /**
     * Lista las ejecuciones recientes de una receta (de todas sus versiones y borrador).
     *
     * @return Collection<int, Run>
     */
    public function listForRecipe(
        Recipe $recipe,
        ?string $trigger = null,
        ?string $status = null,
        int $limit = 25
    ): Collection {
        $query = Run::query()
            ->whereHas('recipeVersion', fn ($q) => $q->where('recipe_id', $recipe->id))
            ->with([
                'recipeVersion:id,uuid,recipe_id,version',
                'recipeVersion.recipe:id,uuid',
                'artifacts',
            ])
            ->withCount(['steps', 'logs'])
            ->orderByDesc('id');

        if ($trigger !== null && $trigger !== '' && $trigger !== 'all') {
            $query->where('trigger', $trigger);
        }

        if ($status !== null && $status !== '' && $status !== 'all') {
            $query->where('status', $status);
        }

        return $query->limit(max(1, min(100, $limit)))->get();
    }

    public function dispatch(RunCreateRequest $request, Recipe $recipe): Run
    {
        $validated = $request->validated();

        return $this->dispatchDirect(
            recipe: $recipe,
            parameters: $validated['parameters'] ?? [],
            options: $validated['options'] ?? [],
            trigger: 'manual',
            user: $request->user(),
            useDraft: $request->boolean('use_draft')
        );
    }

    /**
     * Despacho directo de ejecuciones (usado por Schedules, Webhooks y API)
     *
     * @param  array<string, mixed>  $parameters
     * @param  array<string, mixed>  $options
     */
    public function dispatchDirect(
        Recipe $recipe,
        array $parameters = [],
        array $options = [],
        string $trigger = 'manual',
        ?User $user = null,
        bool $useDraft = false
    ): Run {
        $recipe->loadMissing(['draft', 'publishedVersion', 'project.workspace']);

        $version = $useDraft ? $recipe->draft : $recipe->publishedVersion;
        if (! $version) {
            abort(
                Response::HTTP_UNPROCESSABLE_ENTITY,
                $useDraft
                    ? 'La receta no posee borrador ejecutable.'
                    : 'La receta no posee una versión publicada.'
            );
        }

        $run = Run::create([
            'recipe_version_id' => $version->id,
            'user_id' => $user?->id,
            'status' => 'queued',
            'trigger' => $trigger,
            'parameters' => $parameters,
        ]);

        // Pre-registramos la espera antes de despachar para que una petición
        // webhook que llegue antes de que arranque el runner no se pierda.
        $this->webhookRuns->registerWaitingRun($run, (array) $version->definition);

        $this->dispatcher->dispatchRun($run, $options);

        $run->loadMissing('recipeVersion.recipe');

        try {
            event(new RunUpdated($run));
        } catch (\Throwable $e) {
            report($e);
        }

        Audit::log('run.dispatched', $user, $recipe->project->workspace, $run);

        return $run->load(['steps', 'recipeVersion.recipe']);
    }
}
