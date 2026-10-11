<?php

declare(strict_types=1);

namespace App\Services;

use App\Events\LiveBrowserEvent;
use App\Events\RecordingActionCaptured;
use App\Events\RunLogEmitted;
use App\Events\RunStepUpdated;
use App\Events\RunUpdated;
use App\Models\Artifact;
use App\Models\Run;
use App\Models\RunLog;
use App\Models\RunStep;

final class RunnerEventProcessor
{
    /**
     * @param  array<string,mixed>  $payload
     */
    public function process(array $payload): void
    {
        $event = $payload['event'] ?? '';

        // Manejar eventos de grabación interactiva en vivo
        if ($event === 'recorder.action') {
            $recipeUuid = $payload['recipe_id'] ?? '';
            $sessionId = $payload['session_id'] ?? '';
            $action = $payload['action'] ?? [];
            if (is_string($action)) {
                $action = json_decode($action, true) ?? [];
            }

            if ($recipeUuid && $sessionId && ! empty($action)) {
                event(new RecordingActionCaptured($recipeUuid, $sessionId, $action));
            }

            return;
        }

        // Eventos del Chromium externo (selección de elementos / resultados de pasos)
        if ($event === 'live.event') {
            $recipeUuid = $payload['recipe_id'] ?? '';
            $sessionId = $payload['session_id'] ?? '';
            $data = $payload['payload'] ?? [];
            if (is_string($data)) {
                $data = json_decode($data, true) ?? [];
            }
            if ($recipeUuid && $sessionId && ! empty($data)) {
                event(new LiveBrowserEvent($recipeUuid, $sessionId, $data));
            }

            return;
        }

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

            case 'run.paused':
                $run->update(['status' => 'paused']);
                event(new RunUpdated($run));
                break;

            case 'run.resumed':
                $run->update(['status' => 'running']);
                event(new RunUpdated($run));
                break;

            case 'run.stopped':
                $run->update([
                    'status' => 'failed',
                    'finished_at' => now(),
                    'error_message' => 'Ejecución detenida por el usuario',
                ]);
                event(new RunUpdated($run));
                break;

            case 'run.log':
                $level = $payload['level'] ?? 'info';
                $message = substr((string) ($payload['message'] ?? ''), 0, 2000);
                $nodeId = $payload['node_id'] ?? null;
                $source = $payload['source'] ?? 'runner';
                $context = $payload['context'] ?? null;
                if (is_string($context)) {
                    $context = json_decode($context, true) ?: null;
                }

                // Guardar en base de datos si no excede 2000 logs para depurar
                if ($run->logs()->count() < 2000) {
                    RunLog::create([
                        'run_id' => $run->id,
                        'level' => $level,
                        'source' => $source,
                        'node_id' => $nodeId,
                        'message' => $message,
                        'context' => $context,
                        'logged_at' => now(),
                    ]);
                }

                event(new RunLogEmitted(
                    $run->uuid,
                    $level,
                    $message,
                    $nodeId,
                    $source,
                    $context,
                    now()->toIso8601String()
                ));
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
