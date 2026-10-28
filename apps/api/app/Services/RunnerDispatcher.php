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
        $recipe = $run->recipeVersion->recipe;

        $secretRefs = RecipeSecretRefs::fromDefinition((array) $definition);

        $messageId = (string) Str::ulid();

        $webhookEnabled = (bool) $recipe?->webhook_enabled;
        $webhookTriggerUrl = $webhookEnabled && $recipe?->webhook_token
            ? url("/api/v1/webhooks/recipes/{$recipe->webhook_token}/trigger")
            : null;

        $payload = [
            'id' => $messageId,
            'command' => 'run.start',
            'run_id' => $run->uuid,
            'recipe_id' => (string) $recipe?->uuid,
            'version_id' => $run->recipeVersion->uuid,
            'trigger' => (string) ($run->trigger ?? 'manual'),
            'webhook_enabled' => $webhookEnabled ? '1' : '0',
            'webhook_trigger_url' => (string) ($webhookTriggerUrl ?? ''),
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
