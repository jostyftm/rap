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
use App\Models\Workspace;
use App\Support\ArtifactUrl;

final class RunnerEventProcessor
{
    /** @var array<int,?SecretRedactor> */
    private array $redactors = [];

    public function __construct(
        private WorkspaceSecretService $secretService
    ) {}

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

            case 'run.waiting':
                if ($run->finished_at !== null) {
                    break;
                }
                $run->update(['status' => 'waiting']);
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
                if ($run->finished_at !== null) {
                    break;
                }
                $run->update([
                    'status' => 'failed',
                    'finished_at' => now(),
                    'error_message' => 'Ejecución detenida por el usuario',
                ]);
                event(new RunUpdated($run));
                break;

            case 'run.log':
                $redactor = $this->redactorFor($run);
                $level = $payload['level'] ?? 'info';
                $message = substr((string) ($payload['message'] ?? ''), 0, 2000);
                $nodeId = $payload['node_id'] ?? null;
                $source = $payload['source'] ?? 'runner';
                $context = $payload['context'] ?? null;
                if (is_string($context)) {
                    $context = json_decode($context, true) ?: null;
                }

                if ($redactor !== null) {
                    $message = (string) $redactor->redact($message);
                    if (is_array($context)) {
                        $context = $redactor->redactArray($context);
                    }
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
                $nodeId = (string) ($payload['node_id'] ?? '');
                $step = RunStep::firstOrCreate(
                    ['run_id' => $run->id, 'node_id' => $nodeId],
                    ['status' => 'running']
                );
                $step->update(['status' => 'running']);
                event(new RunStepUpdated($step));
                break;

            case 'step.finished':
                $redactor = $this->redactorFor($run);
                $nodeId = (string) ($payload['node_id'] ?? '');
                $step = RunStep::firstOrCreate(
                    ['run_id' => $run->id, 'node_id' => $nodeId],
                    ['status' => 'running']
                );
                $locatorValue = $payload['locator_value'] ?? null;
                if ($redactor !== null && is_string($locatorValue)) {
                    $locatorValue = $redactor->redact($locatorValue);
                }

                $output = $this->decodeAndRedact($payload['output'] ?? null, $redactor);
                $screenshotPath = ! empty($payload['screenshot_path'])
                    ? (string) $payload['screenshot_path']
                    : null;

                $step->update([
                    'status' => 'success',
                    'duration_ms' => isset($payload['duration_ms']) ? (int) $payload['duration_ms'] : null,
                    'locator_strategy_used' => $payload['locator_strategy'] ?? null,
                    'locator_value_used' => $locatorValue,
                    'screenshot_path' => $screenshotPath,
                    'output' => $output,
                ]);

                $screenshotUrl = null;
                if ($screenshotPath !== null) {
                    $artifact = $this->recordScreenshotArtifact($run, $screenshotPath, $nodeId, 'success');
                    $screenshotUrl = ArtifactUrl::forArtifact($artifact);
                }

                event(new RunStepUpdated($step, $screenshotUrl));
                break;

            case 'step.failed':
                $redactor = $this->redactorFor($run);
                $nodeId = (string) ($payload['node_id'] ?? '');
                $step = RunStep::firstOrCreate(
                    ['run_id' => $run->id, 'node_id' => $nodeId],
                    ['status' => 'running']
                );

                $rawError = isset($payload['error']) ? (string) $payload['error'] : null;
                $redactedError = ($rawError !== null && $redactor !== null) ? $redactor->redact($rawError) : $rawError;
                $screenshotPath = ! empty($payload['screenshot_path'])
                    ? (string) $payload['screenshot_path']
                    : null;

                $step->update([
                    'status' => 'failed',
                    'duration_ms' => isset($payload['duration_ms']) ? (int) $payload['duration_ms'] : null,
                    'error_message' => $redactedError,
                    'screenshot_path' => $screenshotPath,
                ]);

                $screenshotUrl = null;
                if ($screenshotPath !== null) {
                    $artifact = $this->recordScreenshotArtifact($run, $screenshotPath, $nodeId, 'failed');
                    $screenshotUrl = ArtifactUrl::forArtifact($artifact);
                }

                event(new RunStepUpdated($step, $screenshotUrl));
                break;

            case 'run.finished':
                if ($run->finished_at !== null) {
                    break;
                }
                $redactor = $this->redactorFor($run);
                $status = ($payload['status'] ?? '') === 'success' ? 'completed' : 'failed';
                $rawError = isset($payload['error']) ? (string) $payload['error'] : null;
                $redactedError = ($rawError !== null && $redactor !== null) ? $redactor->redact($rawError) : $rawError;
                $decodedResult = $this->decodeAndRedact($payload['result'] ?? null, $redactor);
                $result = is_array($decodedResult) ? $decodedResult : null;

                $run->update([
                    'status' => $status,
                    'finished_at' => now(),
                    'duration_ms' => isset($payload['duration_ms']) ? (int) $payload['duration_ms'] : null,
                    'error_message' => $redactedError,
                    'result' => $result,
                ]);

                if (is_array($result) && ! empty($result['last_screenshot_path']) && is_string($result['last_screenshot_path'])) {
                    $this->recordScreenshotArtifact($run, $result['last_screenshot_path'], null, $status);
                }

                event(new RunUpdated($run));
                break;
        }
    }

    private function decodeAndRedact(mixed $raw, ?SecretRedactor $redactor): mixed
    {
        if ($raw === null || $raw === '') {
            return null;
        }

        $decoded = $raw;
        if (is_string($raw)) {
            $json = json_decode($raw, true);
            if (json_last_error() === JSON_ERROR_NONE) {
                $decoded = $json;
            }
        }

        if ($redactor === null) {
            return $decoded;
        }

        if (is_array($decoded)) {
            return $redactor->redactArray($decoded);
        }

        if (is_string($decoded)) {
            return $redactor->redact($decoded);
        }

        return $decoded;
    }

    private function recordScreenshotArtifact(
        Run $run,
        string $s3Key,
        ?string $nodeId = null,
        ?string $status = null
    ): Artifact {
        $metadata = array_filter([
            'node_id' => $nodeId,
            'status' => $status,
        ], fn ($v) => $v !== null && $v !== '');

        /** @var Artifact $artifact */
        $artifact = Artifact::firstOrCreate(
            [
                'run_id' => $run->id,
                's3_key' => $s3Key,
            ],
            [
                'type' => 'screenshot',
                'mime_type' => ArtifactUrl::mimeFromPath($s3Key),
                'metadata' => $metadata !== [] ? $metadata : null,
            ]
        );

        return $artifact;
    }

    /**
     * Resuelve (y cachea) el redactor del workspace del run.
     */
    private function redactorFor(Run $run): ?SecretRedactor
    {
        if (array_key_exists($run->id, $this->redactors)) {
            return $this->redactors[$run->id];
        }

        $run->loadMissing('recipeVersion.recipe.project.workspace');
        $workspace = $run->recipeVersion?->recipe?->project?->workspace;

        if (! $workspace instanceof Workspace) {
            return $this->redactors[$run->id] = null;
        }

        $secrets = $this->secretService->getDecryptedForWorkspace($workspace);

        return $this->redactors[$run->id] = $secrets === [] ? null : new SecretRedactor($secrets);
    }
}
