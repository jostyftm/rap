<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\v1\Schedule;

use App\Http\Controllers\Controller;
use App\Http\Requests\Schedule\RecipeScheduleCreateRequest;
use App\Http\Requests\Schedule\RecipeScheduleUpdateRequest;
use App\Http\Resources\Schedule\RecipeScheduleResource;
use App\Models\Recipe;
use App\Models\RecipeSchedule;
use App\Services\RecipeScheduleService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

class RecipeScheduleController extends Controller
{
    public function __construct(
        private RecipeScheduleService $scheduleService
    ) {}

    public function index(Recipe $recipe): AnonymousResourceCollection
    {
        $schedules = $this->scheduleService->list($recipe);

        return RecipeScheduleResource::collection($schedules);
    }

    public function store(RecipeScheduleCreateRequest $request, Recipe $recipe): JsonResponse
    {
        $schedule = $this->scheduleService->create($request, $recipe);

        return (new RecipeScheduleResource($schedule))
            ->response()
            ->setStatusCode(Response::HTTP_CREATED);
    }

    public function update(RecipeScheduleUpdateRequest $request, RecipeSchedule $schedule): RecipeScheduleResource
    {
        $updated = $this->scheduleService->update($request, $schedule);

        return new RecipeScheduleResource($updated);
    }

    public function destroy(RecipeSchedule $schedule): Response
    {
        $this->scheduleService->delete($schedule);

        return response()->noContent();
    }

    public function toggle(RecipeSchedule $schedule): RecipeScheduleResource
    {
        $updated = $this->scheduleService->toggle($schedule);

        return new RecipeScheduleResource($updated);
    }
}
