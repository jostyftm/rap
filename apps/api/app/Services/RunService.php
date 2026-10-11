<?php

declare(strict_types=1);

namespace App\Services;

use App\Http\Requests\Run\RunCreateRequest;
use App\Models\Recipe;
use App\Models\Run;
use App\Models\User;
use Symfony\Component\HttpFoundation\Response;

class RunService
{
    public function __construct(
        private RunnerDispatcher $dispatcher
    ) {}

    public function get(Run $run): Run
    {
        return $run->load(['steps', 'artifacts']);
    }

    public function dispatch(RunCreateRequest $request, Recipe $recipe): Run
    {
        $validated = $request->validated();

        return $this->dispatchDirect(
            recipe: $recipe,
            parameters: $validated['parameters'] ?? [],
            options: $validated['options'] ?? [],
            trigger: 'manual',
            user: $request->user()
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
        ?User $user = null
    ): Run {
        $recipe->loadMissing(['latestVersion', 'project.workspace']);
        if (! $recipe->latestVersion) {
            abort(Response::HTTP_UNPROCESSABLE_ENTITY, 'La receta no posee versiones ejecutables.');
        }

        $run = Run::create([
            'recipe_version_id' => $recipe->latestVersion->id,
            'user_id' => $user?->id,
            'status' => 'queued',
            'trigger' => $trigger,
            'parameters' => $parameters,
        ]);

        $this->dispatcher->dispatchRun($run, $options);

        Audit::log('run.dispatched', $user, $recipe->project->workspace, $run);

        return $run->load('steps');
    }
}
