<?php

declare(strict_types=1);

namespace App\Http\Resources\Schedule;

use App\Models\RecipeSchedule;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin RecipeSchedule */
final class RecipeScheduleResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->uuid,
            'recipe_id' => $this->recipe?->uuid,
            'name' => $this->name,
            'cron_expression' => $this->cron_expression,
            'is_active' => $this->is_active,
            'parameters' => $this->parameters,
            'last_run_at' => $this->last_run_at?->toIso8601String(),
            'next_run_at' => $this->next_run_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
