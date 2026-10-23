<?php

declare(strict_types=1);

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

final class WebhookTestReceived implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    /**
     * @param  array<string, mixed>  $payload
     */
    public function __construct(
        public string $listenId,
        public string $recipeUuid,
        public string $nodeId,
        public array $payload
    ) {}

    public function broadcastOn(): array
    {
        return [
            new Channel("webhook-test.{$this->listenId}"),
        ];
    }

    public function broadcastAs(): string
    {
        return 'webhook.test.received';
    }

    /**
     * @return array<string, mixed>
     */
    public function broadcastWith(): array
    {
        return [
            'listen_id' => $this->listenId,
            'recipe_uuid' => $this->recipeUuid,
            'node_id' => $this->nodeId,
            'payload' => $this->payload,
        ];
    }
}
