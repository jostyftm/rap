<?php

declare(strict_types=1);

namespace App\Services;

use App\Events\RunStepUpdated;
use App\Events\RunUpdated;
use App\Models\Artifact;
use App\Models\Run;
use App\Models\RunStep;

final class RunnerEventProcessor
{
    /**
     * @param  array<string,mixed>  $payload
     */
    public function process(array $payload): void
    {
        $event = $payload['event'] ?? '';
        $runUuid = $payload['run_id'] ?? '';

        /** @var Run|null $run */
        $run = Run::where('uuid', $runUuid)->first();
        if (! $run) {
            return;
        }

        switch ($event) {
            case 'run.started':
                $run->update([
                    'status' => 'running',
                    'started_at' => now(),
                ]);
                event(new RunUpdated($run));
                break;

            case 'step.started':
                $nodeId = $payload['node_id'] ?? '';
                $step = RunStep::firstOrCreate(
                    ['run_id' => $run->id, 'node_id' => $nodeId],
                    ['status' => 'running']
                );
                $step->update(['status' => 'running']);
                event(new RunStepUpdated($step));
                break;

            case 'step.finished':
                $nodeId = $payload['node_id'] ?? '';
                $step = RunStep::where('run_id', $run->id)->where('node_id', $nodeId)->first();
                if ($step) {
                    $step->update([
                        'status' => 'success',
                        'duration_ms' => isset($payload['duration_ms']) ? (int) $payload['duration_ms'] : null,
                        'locator_strategy_used' => $payload['locator_strategy'] ?? null,
                        'locator_value_used' => $payload['locator_value'] ?? null,
                        'screenshot_path' => $payload['screenshot_path'] ?? null,
                    ]);
                    event(new RunStepUpdated($step));
                }

                if (! empty($payload['screenshot_path'])) {
                    Artifact::create([
                        'run_id' => $run->id,
                        'type' => 'screenshot',
                        's3_key' => $payload['screenshot_path'],
                        'mime_type' => 'image/png',
                    ]);
                }
                break;

            case 'step.failed':
                $nodeId = $payload['node_id'] ?? '';
                $step = RunStep::where('run_id', $run->id)->where('node_id', $nodeId)->first();
                if ($step) {
                    $step->update([
                        'status' => 'failed',
                        'duration_ms' => isset($payload['duration_ms']) ? (int) $payload['duration_ms'] : null,
                        'error_message' => $payload['error'] ?? null,
                        'screenshot_path' => $payload['screenshot_path'] ?? null,
                    ]);
                    event(new RunStepUpdated($step));
                }
                break;

            case 'run.finished':
                $status = ($payload['status'] ?? '') === 'success' ? 'completed' : 'failed';
                $run->update([
                    'status' => $status,
                    'finished_at' => now(),
                    'duration_ms' => isset($payload['duration_ms']) ? (int) $payload['duration_ms'] : null,
                    'error_message' => $payload['error'] ?? null,
                ]);
                event(new RunUpdated($run));
                break;
        }
    }
}
