<?php

declare(strict_types=1);

namespace App\Events;

use App\Models\Run;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

final class RunUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public Run $run) {}

    public function broadcastOn(): array
    {
        $this->run->loadMissing('recipeVersion.recipe');
        $channels = [
            new Channel("run.{$this->run->uuid}"),
        ];

        $recipeUuid = $this->run->recipeVersion?->recipe?->uuid;
        if (is_string($recipeUuid) && $recipeUuid !== '') {
            $channels[] = new Channel("recipe.{$recipeUuid}");
        }

        return $channels;
    }

    public function broadcastAs(): string
    {
        return 'run.updated';
    }

    /** @return array<string,mixed> */
    public function broadcastWith(): array
    {
        $this->run->loadMissing('recipeVersion.recipe');
        $version = $this->run->recipeVersion;

        return [
            'id' => $this->run->uuid,
            'recipe_id' => $version?->recipe?->uuid,
            'recipe_version' => $version?->version,
            'is_draft' => $version !== null ? $version->version === 0 : false,
            'trigger' => $this->run->trigger,
            'status' => $this->run->status,
            'started_at' => $this->run->started_at?->toIso8601String(),
            'finished_at' => $this->run->finished_at?->toIso8601String(),
            'created_at' => $this->run->created_at?->toIso8601String(),
            'duration_ms' => $this->run->duration_ms,
            'error_message' => $this->run->error_message,
            'result' => $this->run->result,
        ];
    }
}
