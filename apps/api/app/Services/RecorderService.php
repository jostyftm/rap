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

    public function start(Recipe $recipe, string $initialUrl): string
    {
        $sessionId = (string) Str::ulid();

        $payload = [
            'id' => (string) Str::ulid(),
            'command' => 'recorder.start',
            'session_id' => $sessionId,
            'recipe_id' => $recipe->uuid,
            'initial_url' => $initialUrl,
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
