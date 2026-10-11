<?php

declare(strict_types=1);

namespace App\Services;

use App\Http\Requests\Schedule\RecipeScheduleCreateRequest;
use App\Http\Requests\Schedule\RecipeScheduleUpdateRequest;
use App\Models\Recipe;
use App\Models\RecipeSchedule;
use Cron\CronExpression;
use Illuminate\Database\Eloquent\Collection;

class RecipeScheduleService
{
    public function __construct(
        private RunService $runService
    ) {}

    /**
     * @return Collection<int, RecipeSchedule>
     */
    public function list(Recipe $recipe): Collection
    {
        return $recipe->schedules()->orderBy('name')->get();
    }

    public function create(RecipeScheduleCreateRequest $request, Recipe $recipe): RecipeSchedule
    {
        $validated = $request->validated();
        $cron = new CronExpression($validated['cron_expression']);
        $nextRun = $cron->getNextRunDate();

        $schedule = RecipeSchedule::create([
            'recipe_id' => $recipe->id,
            'workspace_id' => $recipe->project->workspace_id,
            'name' => $validated['name'],
            'cron_expression' => $validated['cron_expression'],
            'is_active' => $validated['is_active'] ?? true,
            'parameters' => $validated['parameters'] ?? [],
            'next_run_at' => $nextRun,
        ]);

        Audit::log('schedule.created', $request->user(), $recipe->project->workspace, $schedule);

        return $schedule;
    }

    public function update(RecipeScheduleUpdateRequest $request, RecipeSchedule $schedule): RecipeSchedule
    {
        $validated = $request->validated();

        if (isset($validated['cron_expression'])) {
            $cron = new CronExpression($validated['cron_expression']);
            $validated['next_run_at'] = $cron->getNextRunDate();
        }

        $schedule->update($validated);

        Audit::log('schedule.updated', $request->user(), $schedule->workspace, $schedule);

        return $schedule->fresh();
    }

    public function delete(RecipeSchedule $schedule): void
    {
        $schedule->delete();
    }

    public function toggle(RecipeSchedule $schedule): RecipeSchedule
    {
        $schedule->update([
            'is_active' => ! $schedule->is_active,
        ]);

        return $schedule->fresh();
    }

    /**
     * Evalúa y despacha todas las recetas programadas correspondientes
     */
    public function dispatchDue(): int
    {
        $now = now();
        $dueSchedules = RecipeSchedule::query()
            ->where('is_active', true)
            ->where(function ($query) use ($now): void {
                $query->whereNull('next_run_at')
                    ->orWhere('next_run_at', '<=', $now);
            })
            ->with(['recipe.latestVersion', 'recipe.project.workspace'])
            ->get();

        $count = 0;
        foreach ($dueSchedules as $schedule) {
            $cron = new CronExpression($schedule->cron_expression);

            // Despachar ejecución
            if ($schedule->recipe) {
                try {
                    $this->runService->dispatchDirect(
                        recipe: $schedule->recipe,
                        parameters: $schedule->parameters ?? [],
                        trigger: 'schedule'
                    );
                    $count++;
                } catch (\Throwable $e) {
                    report($e);
                }
            }

            // Calcular siguiente fecha
            $schedule->update([
                'last_run_at' => $now,
                'next_run_at' => $cron->getNextRunDate($now),
            ]);
        }

        return $count;
    }
}
