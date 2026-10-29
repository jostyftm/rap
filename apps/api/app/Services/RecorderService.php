<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Recipe;
use Illuminate\Support\Facades\Redis;
use Illuminate\Support\Str;

class RecorderService
{
    private string $commandStream;

    public function __construct()
    {
        $this->commandStream = (string) config('rpa.runner.command_stream', 'rpa:cmd');
    }

    public function start(
        Recipe $recipe,
        ?string $initialUrl = null,
        string $mode = 'browser',
        ?string $targetWindow = null,
        int $typeDebounceMs = 1000,
        bool $captureScroll = true
    ): string
    {
        $sessionId = (string) Str::ulid();

        $payload = [
            'id' => (string) Str::ulid(),
            'command' => 'recorder.start',
            'session_id' => $sessionId,
            'recipe_id' => $recipe->uuid,
            'mode' => $mode,
            'type_debounce_ms' => (string) $typeDebounceMs,
            'capture_scroll' => $captureScroll ? 'true' : 'false',
            'timestamp' => (string) now()->timestamp,
        ];

        if ($initialUrl) {
            $payload['initial_url'] = $initialUrl;
        }

        if ($targetWindow) {
            $payload['target_window'] = $targetWindow;
        }

        $args = ['XADD', $this->commandStream, '*'];
        foreach ($payload as $key => $val) {
            $args[] = (string) $key;
            $args[] = (string) $val;
        }

        try {
            Redis::executeRaw($args);
        } catch (\Throwable $e) {
            report($e);
        }

        return $sessionId;
    }

    public function stop(Recipe $recipe, string $sessionId): void
    {
        $payload = [
            'id' => (string) Str::ulid(),
            'command' => 'recorder.stop',
            'session_id' => $sessionId,
            'recipe_id' => $recipe->uuid,
            'timestamp' => (string) now()->timestamp,
        ];

        $args = ['XADD', $this->commandStream, '*'];
        foreach ($payload as $key => $val) {
            $args[] = (string) $key;
            $args[] = (string) $val;
        }

        try {
            Redis::executeRaw($args);
        } catch (\Throwable $e) {
            report($e);
        }
    }
}
