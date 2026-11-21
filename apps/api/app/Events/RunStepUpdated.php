<?php

declare(strict_types=1);

namespace App\Events;

use App\Models\RunStep;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

final class RunStepUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public RunStep $step,
        public ?string $screenshotUrl = null
    ) {}

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
        $run = $this->step->run;

        return [
            'id' => $this->step->uuid,
            'run_id' => $run?->uuid,
            'node_id' => $this->step->node_id,
            'status' => $this->step->status,
            'locator_strategy' => $this->step->locator_strategy_used,
            'locator_value' => $this->step->locator_value_used,
            'duration_ms' => $this->step->duration_ms,
            'output' => $this->step->output,
            'screenshot_path' => $this->step->screenshot_path,
            'screenshot_url' => $this->screenshotUrl,
            'error_message' => $this->step->error_message,
        ];
    }
}
