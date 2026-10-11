<?php

declare(strict_types=1);

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

final class RunLogEmitted implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    /**
     * @param  array<string, mixed>|null  $context
     */
    public function __construct(
        public string $runUuid,
        public string $level,
        public string $message,
        public ?string $nodeId = null,
        public string $source = 'runner',
        public ?array $context = null,
        public ?string $timestamp = null
    ) {}

    public function broadcastOn(): array
    {
        return [
            new Channel("run.{$this->runUuid}"),
        ];
    }

    public function broadcastAs(): string
    {
        return 'run.log';
    }

    /** @return array<string, mixed> */
    public function broadcastWith(): array
    {
        return [
            'run_id' => $this->runUuid,
            'level' => $this->level,
            'message' => $this->message,
            'node_id' => $this->nodeId,
            'source' => $this->source,
            'context' => $this->context,
            'timestamp' => $this->timestamp ?? now()->toIso8601String(),
        ];
    }
}
