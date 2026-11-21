<?php

declare(strict_types=1);

use App\Enums\Role;
use App\Events\WebhookTestReceived;
use App\Models\Recipe;
use App\Models\Run;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Redis;
use Laravel\Sanctum\Sanctum;

function makePublishedWebhookDefinition(
    string $path = '/api/v1/webhooks/pedidos',
    string $method = 'POST',
    int $responseCode = 200,
    string $responseBody = '{"ok":true,"env":"prod"}',
    string $nextText = '{{webhook.body.email}}'
): array {
    return [
        'schema' => 'rpa/v1',
        'entry' => 'webhook_1',
        'nodes' => [
            'webhook_1' => [
                'id' => 'webhook_1',
                'type' => 'webhook',
                'description' => 'Entrada webhook',
                'params' => [
                    'httpMethod' => $method,
                    'path' => $path,
                    'outputVariable' => 'webhook',
                    'responseCode' => $responseCode,
                    'responseBody' => $responseBody,
                ],
                'next' => 'type_1',
            ],
            'type_1' => [
                'id' => 'type_1',
                'type' => 'type',
                'description' => 'Escribir dato',
                'locator' => [
                    'primary' => ['strategy' => 'testid', 'value' => 'email-input', 'score' => 95],
                    'fallbacks' => [],
                ],
                'params' => ['text' => $nextText, 'clear' => true],
            ],
        ],
        'edges' => [
            ['from' => 'webhook_1', 'to' => 'type_1'],
        ],
    ];
}

beforeEach(function () {
    $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);

    $this->user = User::factory()->create();
    $this->workspace = Workspace::create(['name' => 'Prod Webhook WS', 'slug' => 'prod-wh-'.uniqid()]);
    $this->workspace->members()->attach($this->user->id, ['role' => Role::Owner->value]);
    $this->project = $this->workspace->projects()->create(['name' => 'Proyecto Prod']);

    Sanctum::actingAs($this->user);

    Redis::shouldReceive('connection')->byDefault()->andReturnSelf();
    Redis::shouldReceive('hgetall')->byDefault()->andReturn([]);
    Redis::shouldReceive('executeRaw')->byDefault()->andReturn('1-0');
});

it('escucha siempre en la URL de producción cuando se publica una receta que inicia con webhook', function () {
    $createRes = $this->postJson("/api/v1/projects/{$this->project->uuid}/recipes", [
        'name' => 'Pedidos Inbound',
        'definition' => makePublishedWebhookDefinition('/api/v1/webhooks/pedidos', 'POST', 201, '{"accepted":true}'),
    ])->assertCreated();

    $createRes->assertJsonPath('data.published_webhook.path', '/api/v1/webhooks/pedidos')
        ->assertJsonPath('data.published_webhook.method', 'POST');

    // Sin necesidad de activar "Escuchar evento de prueba", dos peticiones consecutivas
    // disparan dos ejecuciones contra la versión publicada (v1).
    $r1 = $this->postJson('/api/v1/webhooks/pedidos', ['email' => 'uno@test.com'])
        ->assertStatus(201)
        ->assertJson(['accepted' => true]);

    $r2 = $this->postJson('/api/v1/webhooks/pedidos', ['email' => 'dos@test.com'])
        ->assertStatus(201)
        ->assertJson(['accepted' => true]);

    expect($r1->headers->get('X-RPA-Run-Id'))->not->toBeEmpty()
        ->and($r2->headers->get('X-RPA-Run-Id'))->not->toBeEmpty()
        ->and($r1->headers->get('X-RPA-Run-Id'))->not->toBe($r2->headers->get('X-RPA-Run-Id'))
        ->and($r1->headers->get('X-RPA-Recipe-Version'))->toBe('1');

    expect(Run::query()->count())->toBe(2);
    $runs = Run::query()->with('recipeVersion')->orderBy('id')->get();
    expect($runs[0]->trigger)->toBe('webhook')
        ->and($runs[0]->recipeVersion->version)->toBe(1)
        ->and($runs[0]->parameters['webhook']['body']['email'])->toBe('uno@test.com')
        ->and($runs[1]->parameters['webhook']['body']['email'])->toBe('dos@test.com');
});

it('aisla estrictamente URL de pruebas y URL de producción sin contaminar versiones', function () {
    Event::fake([WebhookTestReceived::class]);

    $createRes = $this->postJson("/api/v1/projects/{$this->project->uuid}/recipes", [
        'name' => 'Aislamiento Prod vs Test',
        'definition' => makePublishedWebhookDefinition('/api/v1/webhooks/pedidos', 'POST', 200, '{"from":"v1"}', 'TEXT_V1'),
    ])->assertCreated();

    $recipeUuid = $createRes->json('data.id');
    $recipe = Recipe::query()->where('uuid', $recipeUuid)->firstOrFail();

    // Editar el borrador (v0) cambiando ruta y texto, SIN publicar todavía
    $this->putJson("/api/v1/recipes/{$recipeUuid}", [
        'definition' => makePublishedWebhookDefinition('/api/v1/webhooks/pedidos-borrador', 'POST', 200, '{"from":"draft"}', 'TEXT_DRAFT'),
    ])->assertOk();

    // 1. Iniciar escucha de prueba sobre el borrador y llamar a /webhooks-test/pedidos-borrador
    // NO debe crear ningún Run de producción
    $listenRes = $this->postJson("/api/v1/recipes/{$recipeUuid}/webhook-test/listen", [
        'node_id' => 'webhook_1',
        'path' => '/api/v1/webhooks/pedidos-borrador',
        'http_method' => 'POST',
        'response_code' => 202,
        'response_body' => '{"test_only":true}',
    ])->assertCreated();

    expect($listenRes->json('url'))->toEndWith('/api/v1/webhooks-test/pedidos-borrador');

    $this->postJson('/api/v1/webhooks-test/pedidos-borrador', ['probando' => true])
        ->assertStatus(202)
        ->assertJson(['test_only' => true]);

    Event::assertDispatched(WebhookTestReceived::class);
    expect(Run::query()->count())->toBe(0);

    // 2. La ruta del borrador NO responde en producción antes de publicar
    $this->postJson('/api/v1/webhooks/pedidos-borrador', ['cliente' => 'x'])
        ->assertNotFound();

    // 3. La ruta publicada v1 (/webhooks/pedidos) sigue ejecutando v1, nunca el borrador
    $prodRes = $this->postJson('/api/v1/webhooks/pedidos', ['cliente' => 'real'])
        ->assertOk()
        ->assertJson(['from' => 'v1']);

    $prodRun = Run::query()->where('uuid', $prodRes->headers->get('X-RPA-Run-Id'))->with('recipeVersion')->firstOrFail();
    expect($prodRun->recipeVersion->version)->toBe(1)
        ->and($prodRun->recipeVersion->definition['nodes']['type_1']['params']['text'])->toBe('TEXT_V1');

    // 4. Al publicar v2, cambia a la nueva ruta (/webhooks/pedidos-borrador) y desactiva la anterior
    $this->postJson("/api/v1/recipes/{$recipeUuid}/publish", [
        'changelog' => 'Cambio a v2',
    ])->assertOk()
        ->assertJsonPath('data.published_webhook.path', '/api/v1/webhooks/pedidos-borrador');

    $this->postJson('/api/v1/webhooks/pedidos', ['tarde' => true])->assertNotFound();
    $v2Res = $this->postJson('/api/v1/webhooks/pedidos-borrador', ['cliente' => 'real_v2'])
        ->assertOk()
        ->assertJson(['from' => 'draft']);

    $v2Run = Run::query()->where('uuid', $v2Res->headers->get('X-RPA-Run-Id'))->with('recipeVersion')->firstOrFail();
    expect($v2Run->recipeVersion->version)->toBe(2)
        ->and($v2Run->recipeVersion->definition['nodes']['type_1']['params']['text'])->toBe('TEXT_DRAFT');

    // 5. Al hacer rollback a v1, se reactiva /webhooks/pedidos en la nueva versión publicada v3
    $this->postJson("/api/v1/recipes/{$recipeUuid}/versions/1/restore")
        ->assertOk()
        ->assertJsonPath('data.published_webhook.path', '/api/v1/webhooks/pedidos');

    $this->postJson('/api/v1/webhooks/pedidos-borrador', ['tarde' => true])->assertNotFound();
    $v3Res = $this->postJson('/api/v1/webhooks/pedidos', ['cliente' => 'rollback'])
        ->assertOk()
        ->assertJson(['from' => 'v1']);

    $v3Run = Run::query()->where('uuid', $v3Res->headers->get('X-RPA-Run-Id'))->with('recipeVersion')->firstOrFail();
    expect($v3Run->recipeVersion->version)->toBe(3);

    // 6. Método incorrecto retorna 405 con cabecera Allow
    $this->getJson('/api/v1/webhooks/pedidos')
        ->assertStatus(405)
        ->assertHeader('Allow', 'POST');

    // 7. Receta archivada o eliminada deja de escuchar (404)
    $recipe->update(['status' => 'archived']);
    $this->postJson('/api/v1/webhooks/pedidos', ['x' => 1])->assertNotFound();
});

it('rechaza publicar otra automatización con ruta y método webhook ya activos en producción y prefijo recipes/', function () {
    $this->postJson("/api/v1/projects/{$this->project->uuid}/recipes", [
        'name' => 'Receta A',
        'definition' => makePublishedWebhookDefinition('/api/v1/webhooks/duplicado', 'POST'),
    ])->assertCreated();

    $this->postJson("/api/v1/projects/{$this->project->uuid}/recipes", [
        'name' => 'Receta B',
        'definition' => makePublishedWebhookDefinition('/api/v1/webhooks/duplicado', 'POST'),
    ])->assertStatus(422)
        ->assertJsonValidationErrors(['definition']);

    $this->postJson("/api/v1/projects/{$this->project->uuid}/recipes", [
        'name' => 'Receta Reservada',
        'definition' => makePublishedWebhookDefinition('/api/v1/webhooks/recipes/abc/trigger', 'POST'),
    ])->assertStatus(422)
        ->assertJsonValidationErrors(['definition']);
});
