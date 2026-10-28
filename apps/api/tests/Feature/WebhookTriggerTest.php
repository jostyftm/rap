<?php

declare(strict_types=1);

use App\Enums\Role;
use App\Models\Recipe;
use App\Models\Run;
use App\Models\User;
use App\Models\Workspace;
use Laravel\Sanctum\Sanctum;

function createWebhookRecipePayload(): array
{
    return [
        'name' => 'Receta con Webhook',
        'description' => 'Automatización disparada por webhook',
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
    ];
}

beforeEach(function () {
    $user = User::factory()->create();
    $workspace = Workspace::create(['name' => 'Webhook WS', 'slug' => 'webhook-ws-'.uniqid()]);
    $workspace->members()->attach($user->id, ['role' => Role::Owner->value]);
    $project = $workspace->projects()->create(['name' => 'Proyecto Webhook']);

    Sanctum::actingAs($user);

    $this->postJson("/api/v1/projects/{$project->uuid}/recipes", createWebhookRecipePayload())
        ->assertCreated();

    $this->recipe = Recipe::query()->firstOrFail();
    $this->recipe->update(['webhook_token' => 'token-webhook-test', 'webhook_enabled' => true]);
});

it('despacha el payload del webhook normalizado en los parámetros del run', function () {
    $response = $this->postJson('/api/v1/webhooks/recipes/token-webhook-test/trigger?foo=bar', [
        'email' => 'lead@example.com',
    ], ['X-Custom-Header' => 'Antigravity'])
        ->assertAccepted()
        ->assertJsonPath('data.status', 'queued');

    $run = Run::query()->where('uuid', $response->json('data.id'))->firstOrFail();
    $parameters = $run->parameters;

    expect($parameters['webhook']['method'])->toBe('POST');
    expect($parameters['webhook']['path'])->toBe('/api/v1/webhooks/recipes/token-webhook-test/trigger');
    expect($parameters['webhook']['query']['foo'])->toBe('bar');
    expect($parameters['webhook']['body']['email'])->toBe('lead@example.com');
    expect($parameters['webhook']['headers']['x-custom-header'])->toBe('Antigravity');

    // El body se conserva en la raíz por retrocompatibilidad con {{campo}}
    expect($parameters['email'])->toBe('lead@example.com');
});

it('responde 404 cuando el token de webhook no existe o está deshabilitado', function () {
    $this->recipe->update(['webhook_enabled' => false]);

    $this->postJson('/api/v1/webhooks/recipes/token-webhook-test/trigger', ['email' => 'x@y.z'])
        ->assertNotFound();
});
