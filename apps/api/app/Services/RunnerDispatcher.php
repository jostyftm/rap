<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Run;
use App\Support\RecipeSecretRefs;
use Illuminate\Support\Facades\Redis;
use Illuminate\Support\Str;

final class RunnerDispatcher
{
    private string $commandStream;

    public function __construct()
    {
        $this->commandStream = (string) config('rpa.runner.command_stream', 'rpa:cmd');
    }

    public function dispatchRun(Run $run, array $options = []): string
    {
        $run->loadMissing('recipeVersion.recipe.project.workspace');
        $definition = $run->recipeVersion->definition;

        $secretRefs = RecipeSecretRefs::fromDefinition((array) $definition);

        $messageId = (string) Str::ulid();

        $payload = [
            'id' => $messageId,
            'command' => 'run.start',
            'run_id' => $run->uuid,
            'version_id' => $run->recipeVersion->uuid,
            'definition' => json_encode($definition),
            'parameters' => json_encode($run->parameters ?? []),
            'secret_refs' => json_encode($secretRefs),
            'options' => json_encode($options),
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
            // En entornos de testing sin Redis activo, no romper el flujo
            report($e);
        }

        return $messageId;
    }
}
