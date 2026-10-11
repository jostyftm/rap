<?php

declare(strict_types=1);

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

final class LiveBrowserEvent implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    /**
     * @param  array<string, mixed>  $message
     */
    public function __construct(
        public string $recipeUuid,
        public string $sessionId,
        public array $message
    ) {}

    public function broadcastOn(): array
    {
        return [new Channel("recipe.{$this->recipeUuid}")];
    }

    public function broadcastAs(): string
    {
        return 'live.event';
    }

    /** @return array<string, mixed> */
    public function broadcastWith(): array
    {
        return [
            'session_id' => $this->sessionId,
            'recipe_id' => $this->recipeUuid,
            'message' => $this->message,
        ];
    }
}
