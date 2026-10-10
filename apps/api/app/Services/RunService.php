<?php

declare(strict_types=1);

namespace App\Services;

use App\Http\Requests\Run\RunCreateRequest;
use App\Models\Recipe;
use App\Models\Run;
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
        $recipe->loadMissing('latestVersion');
        if (! $recipe->latestVersion) {
            abort(Response::HTTP_UNPROCESSABLE_ENTITY, 'La receta no posee versiones ejecutables.');
        }

        $validated = $request->validated();

        $run = Run::create([
            'recipe_version_id' => $recipe->latestVersion->id,
            'user_id' => $request->user()?->id,
            'status' => 'queued',
            'trigger' => 'manual',
            'parameters' => $validated['parameters'] ?? [],
        ]);

        $this->dispatcher->dispatchRun($run);

        Audit::log('run.dispatched', $request->user(), $recipe->project->workspace, $run);

        return $run->load('steps');
    }
}
