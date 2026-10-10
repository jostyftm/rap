<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\RunResource;
use App\Models\Recipe;
use App\Models\Run;
use App\Services\Audit;
use App\Services\RunnerDispatcher;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

final class RunController extends Controller
{
    public function store(Request $request, Recipe $recipe, RunnerDispatcher $dispatcher): JsonResponse
    {
        $recipe->loadMissing('latestVersion');
        if (! $recipe->latestVersion) {
            abort(Response::HTTP_UNPROCESSABLE_ENTITY, 'La receta no posee versiones ejecutables.');
        }

        $data = $request->validate([
            'parameters' => ['nullable', 'array'],
        ]);

        $run = Run::create([
            'recipe_version_id' => $recipe->latestVersion->id,
            'user_id' => $request->user()?->id,
            'status' => 'queued',
            'trigger' => 'manual',
            'parameters' => $data['parameters'] ?? [],
        ]);

        $dispatcher->dispatchRun($run);

        Audit::log('run.dispatched', $request->user(), $recipe->project->workspace, $run);

        return (new RunResource($run->load('steps')))
            ->response()
            ->setStatusCode(Response::HTTP_CREATED);
    }

    public function show(Run $run): RunResource
    {
        return new RunResource($run->load(['steps', 'artifacts']));
    }
}
