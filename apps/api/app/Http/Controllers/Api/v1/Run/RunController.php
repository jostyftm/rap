<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\v1\Run;

use App\Http\Controllers\Controller;
use App\Http\Requests\Run\RunCreateRequest;
use App\Http\Resources\Run\RunResource;
use App\Models\Recipe;
use App\Models\Run;
use App\Services\RunService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;

class RunController extends Controller
{
    public function __construct(
        private RunService $runService
    ) {}

    /**
     * Dispatch a deterministic run for a recipe
     */
    public function store(RunCreateRequest $request, Recipe $recipe): JsonResponse
    {
        $run = $this->runService->dispatch($request, $recipe);

        return (new RunResource($run))
            ->response()
            ->setStatusCode(Response::HTTP_CREATED);
    }

    /**
     * Get run execution status, steps and artifacts
     */
    public function show(Run $run): RunResource
    {
        $result = $this->runService->get($run);

        return new RunResource($result);
    }
}
