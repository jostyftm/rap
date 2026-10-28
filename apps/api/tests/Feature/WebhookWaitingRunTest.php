<?php

declare(strict_types=1);

use App\Enums\Role;
use App\Events\RunUpdated;
use App\Events\WebhookTestReceived;
use App\Models\Recipe;
use App\Models\Run;
use App\Models\User;
use App\Models\Workspace;
use App\Services\RunnerEventProcessor;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Redis;
use Laravel\Sanctum\Sanctum;

beforeEach(function () {
    $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
});

function createWaitingWebhookRecipe(): Recipe
{
    $user = User::factory()->create();
    $workspace = Workspace::create(['name' => 'Wait WS', 'slug' => 'wait-ws-'.uniqid()]);
    $workspace->members()->attach($user->id, ['role' => Role::Owner->value]);
    $project = $workspace->projects()->create(['name' => 'Proyecto Wait']);

    /** @var Recipe $recipe */
    $recipe = $project->recipes()->create([
        'name' => 'Receta en espera',
        'status' => 'active',
        'webhook_token' => 'token-wait-'.uniqid(),
        'webhook_enabled' => true,
    ]);

    $recipe->versions()->create([
        'version' => 1,
        'definition' => [
            'schema' => 'rpa/v1',
            'entry' => 'webhook_1',
            'nodes' => [
                'webhook_1' => [
                    'id' => 'webhook_1',
                    'type' => 'webhook',
                    'description' => 'Recibir lead',
                    'params' => [
                        'httpMethod' => 'POST',
                        'path' => '/api/v1/webhooks/lead',
                        'outputVariable' => 'webhook',
                    ],
                    'next' => 'type_1',
                ],
                'type_1' => [
                    'id' => 'type_1',
                    'type' => 'type',
                    'description' => 'Escribir email',
                    'locator' => [
                        'primary' => ['strategy' => 'testid', 'value' => 'email-input', 'score' => 95],
                        'fallbacks' => [],
                    ],
                    'params' => ['text' => '{{webhook.body.email}}', 'clear' => true],
                ],
            ],
            'edges' => [
                ['from' => 'webhook_1', 'to' => 'type_1'],
            ],
        ],
    ]);

    Sanctum::actingAs($user);

    return $recipe->fresh(['latestVersion']);
}

function waitingRun(Recipe $recipe, string $status = 'waiting'): Run
{
    return Run::create([
        'recipe_version_id' => $recipe->latestVersion->id,
        'status' => $status,
        'trigger' => 'manual',
        'parameters' => [],
    ]);
}

function waitingMeta(Run $run, Recipe $recipe, string $nodeId = 'webhook_1'): string
{
    return (string) json_encode([
        'run_id' => $run->uuid,
        'recipe_id' => $recipe->uuid,
        'node_id' => $nodeId,
        'method' => 'POST',
        'path' => '/api/v1/webhooks/lead',
        'trigger' => 'manual',
        'created_at' => now()->toIso8601String(),
        'timeout_ms' => 300000,
    ]);
}

it('pre-registra la espera en Redis al despachar un run manual con entrada webhook', function () {
    $recipe = createWaitingWebhookRecipe();

    Redis::shouldReceive('set')
        ->once()
        ->withArgs(function (string $key, string $value, string $mode, int $ttl): bool {
            return str_starts_with($key, 'rpa:run:') && str_ends_with($key, ':waiting')
                && $mode === 'EX'
                && $ttl === 360
                && json_decode($value, true)['node_id'] === 'webhook_1';
        })
        ->andReturnTrue();
    Redis::shouldReceive('hset')->atLeast()->once()->andReturn(1);
    Redis::shouldReceive('expire')->atLeast()->once()->andReturn(1);
    Redis::shouldReceive('executeRaw')->once()->andReturn('1-0');

    $response = $this->postJson("/api/v1/recipes/{$recipe->uuid}/runs");

    $response->assertCreated()->assertJsonPath('data.status', 'queued');
});

it('marca el run como waiting cuando el runner emite run.waiting', function () {
    $recipe = createWaitingWebhookRecipe();
    $run = waitingRun($recipe, 'queued');

    Event::fake([RunUpdated::class]);

    app(RunnerEventProcessor::class)->process([
        'event' => 'run.waiting',
        'run_id' => $run->uuid,
        'node_id' => 'webhook_1',
        'method' => 'POST',
        'path' => '/api/v1/webhooks/lead',
    ]);

    expect($run->refresh()->status)->toBe('waiting');
    Event::assertDispatched(RunUpdated::class);
});

it('entrega el trigger público al run en espera sin crear otro run', function () {
    $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);

    $recipe = createWaitingWebhookRecipe();
    $run = waitingRun($recipe);
    $meta = waitingMeta($run, $recipe);

    Redis::shouldReceive('hgetall')
        ->once()
        ->with("rpa:recipe:{$recipe->uuid}:waiting")
        ->andReturn([$run->uuid => $meta]);
    Redis::shouldReceive('rpush')
        ->once()
        ->withArgs(function (string $key, string $value) use ($run): bool {
            $payload = json_decode($value, true);

            return $key === "rpa:run:{$run->uuid}:webhook"
                && $payload['body']['email'] === 'lead@example.com'
                && $payload['method'] === 'POST';
        })
        ->andReturn(1);
    Redis::shouldReceive('expire')->once()->andReturn(1);

    $response = $this->postJson("/api/v1/webhooks/recipes/{$recipe->webhook_token}/trigger", [
        'email' => 'lead@example.com',
    ]);

    $response->assertAccepted()->assertJsonPath('data.id', $run->uuid);
    expect(Run::query()->count())->toBe(1);
});

it('entrega la escucha de prueba al run en espera del mismo nodo', function () {
    $recipe = createWaitingWebhookRecipe();
    $run = waitingRun($recipe);
    $meta = waitingMeta($run, $recipe);

    Event::fake([WebhookTestReceived::class]);

    $this->postJson("/api/v1/recipes/{$recipe->uuid}/webhook-test/listen", [
        'node_id' => 'webhook_1',
        'path' => '/api/v1/webhooks/lead',
        'http_method' => 'POST',
        'response_code' => 202,
    ])->assertCreated();

    Redis::shouldReceive('hgetall')
        ->once()
        ->with("rpa:recipe:{$recipe->uuid}:waiting")
        ->andReturn([$run->uuid => $meta]);
    Redis::shouldReceive('rpush')
        ->once()
        ->withArgs(function (string $key, string $value) use ($run): bool {
            $payload = json_decode($value, true);

            return $key === "rpa:run:{$run->uuid}:webhook"
                && $payload['body']['email'] === 'test@example.com'
                && $payload['path'] === '/api/v1/webhooks/lead';
        })
        ->andReturn(1);
    Redis::shouldReceive('expire')->once()->andReturn(1);

    $this->postJson('/api/v1/webhooks/lead', ['email' => 'test@example.com'])
        ->assertStatus(202);
});

it('entrega petición directa por ruta a un run en espera sin sesión efímera previa', function () {
    $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);

    $recipe = createWaitingWebhookRecipe();
    $run = waitingRun($recipe);
    $meta = waitingMeta($run, $recipe);

    Redis::shouldReceive('connection')->byDefault()->andReturnSelf();
    Redis::shouldReceive('get')->andReturnNull();
    Redis::shouldReceive('hgetall')
        ->once()
        ->with('rpa:webhook:path:/api/v1/webhooks/lead:waiting')
        ->andReturn([$run->uuid => $meta]);
    Redis::shouldReceive('rpush')
        ->once()
        ->withArgs(function (string $key, string $value) use ($run): bool {
            $payload = json_decode($value, true);

            return $key === "rpa:run:{$run->uuid}:webhook"
                && $payload['body']['pedido_id'] === 1234
                && $payload['path'] === '/api/v1/webhooks/lead';
        })
        ->andReturn(1);
    Redis::shouldReceive('expire')->once()->andReturn(1);

    $this->postJson('/api/v1/webhooks/lead', ['pedido_id' => 1234])
        ->assertOk()
        ->assertJsonPath('ok', true)
        ->assertJsonPath('delivered_to_runs.0', $run->uuid);
});
