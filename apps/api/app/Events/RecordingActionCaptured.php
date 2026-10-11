<?php

declare(strict_types=1);

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

final class RecordingActionCaptured implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    /**
     * @param  array<string, mixed>  $action
     */
    public function __construct(
        public string $recipeUuid,
        public string $sessionId,
        public array $action
    ) {}

    public function broadcastOn(): array
    {
        return [
            new Channel("recipe.{$this->recipeUuid}"),
        ];
    }

    public function broadcastAs(): string
    {
        return 'recording.action';
    }

    /** @return array<string, mixed> */
    public function broadcastWith(): array
    {
        return [
            'session_id' => $this->sessionId,
            'recipe_id' => $this->recipeUuid,
            'action' => $this->action,
            'timestamp' => now()->toIso8601String(),
        ];
    }
}
