<?php

declare(strict_types=1);

namespace App\Events;

use App\Models\RunStep;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

final class RunStepUpdated implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public RunStep $step) {}

    public function broadcastOn(): array
    {
        $run = $this->step->run;

        return [
            new Channel("run.{$run->uuid}"),
        ];
    }

    public function broadcastAs(): string
    {
        return 'step.updated';
    }

    /** @return array<string,mixed> */
    public function broadcastWith(): array
    {
        return [
            'id' => $this->step->uuid,
            'node_id' => $this->step->node_id,
            'status' => $this->step->status,
            'locator_strategy' => $this->step->locator_strategy_used,
            'duration_ms' => $this->step->duration_ms,
            'screenshot_path' => $this->step->screenshot_path,
            'error_message' => $this->step->error_message,
        ];
    }
}
