<?php

declare(strict_types=1);

namespace App\Events;

use App\Models\Run;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

final class RunUpdated implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public Run $run) {}

    public function broadcastOn(): array
    {
        return [
            new Channel("run.{$this->run->uuid}"),
        ];
    }

    public function broadcastAs(): string
    {
        return 'run.updated';
    }

    /** @return array<string,mixed> */
    public function broadcastWith(): array
    {
        return [
            'id' => $this->run->uuid,
            'status' => $this->run->status,
            'started_at' => $this->run->started_at?->toIso8601String(),
            'finished_at' => $this->run->finished_at?->toIso8601String(),
            'duration_ms' => $this->run->duration_ms,
            'error_message' => $this->run->error_message,
        ];
    }
}
