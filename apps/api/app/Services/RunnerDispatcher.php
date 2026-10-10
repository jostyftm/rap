<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Run;
use Illuminate\Support\Facades\Redis;
use Illuminate\Support\Str;

final class RunnerDispatcher
{
    private string $commandStream;

    public function __construct()
    {
        $this->commandStream = (string) config('rpa.runner.command_stream', 'rpa:cmd');
    }

    public function dispatchRun(Run $run): string
    {
        $run->loadMissing('recipeVersion');
        $definition = $run->recipeVersion->definition;

        $messageId = (string) Str::ulid();

        $payload = [
            'id' => $messageId,
            'command' => 'run.start',
            'run_id' => $run->uuid,
            'version_id' => $run->recipeVersion->uuid,
            'definition' => json_encode($definition),
            'parameters' => json_encode($run->parameters ?? []),
            'timestamp' => (string) now()->timestamp,
        ];

        try {
            Redis::xadd($this->commandStream, '*', $payload);
        } catch (\Throwable $e) {
            // En entornos de testing sin Redis activo, no romper el flujo
            report($e);
        }

        return $messageId;
    }
}
