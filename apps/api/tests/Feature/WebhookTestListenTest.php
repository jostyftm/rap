<?php

declare(strict_types=1);

use App\Events\WebhookTestReceived;
use App\Models\Recipe;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Support\Facades\Event;
use Laravel\Sanctum\Sanctum;

beforeEach(function () {
    $this->user = User::factory()->create();
    $this->workspace = Workspace::create(['name' => 'Test WS', 'slug' => 'test-ws-'.uniqid()]);
    $this->workspace->members()->attach($this->user->id, ['role' => 'owner']);
    $this->project = $this->workspace->projects()->create(['name' => 'Project']);
    $this->recipe = $this->project->recipes()->create(['name' => 'Recipe Webhook']);
});

it('permite iniciar una escucha de prueba y capturar una petición con su respuesta configurada', function () {
    Sanctum::actingAs($this->user);
    Event::fake();

    $listenRes = $this->postJson("/api/v1/recipes/{$this->recipe->uuid}/webhook-test/listen", [
        'node_id' => 'webhook_1',
        'path' => '/api/v1/webhooks/webhook_1',
        'http_method' => 'POST',
        'response_code' => 201,
        'response_body' => '{"status":"ok","custom":true}',
    ]);

    $listenRes->assertCreated()
        ->assertJsonStructure(['listen_id', 'url', 'channel', 'expires_at']);

    $listenId = $listenRes->json('listen_id');
    expect($listenId)->not->toBeEmpty();

    // Capturar petición entrante de prueba
    $captureRes = $this->postJson('/api/v1/webhooks/webhook_1?foo=bar', [
        'email' => 'test@example.com',
        'age' => 30,
    ], ['X-Custom-Header' => 'Antigravity']);

    $captureRes->assertStatus(201)
        ->assertHeader('Content-Type', 'application/json')
        ->assertExactJson(['status' => 'ok', 'custom' => true]);

    Event::assertDispatched(WebhookTestReceived::class, function ($event) use ($listenId) {
        return $event->listenId === $listenId
            && $event->nodeId === 'webhook_1'
            && $event->payload['method'] === 'POST'
            && $event->payload['body']['email'] === 'test@example.com'
            && $event->payload['query']['foo'] === 'bar'
            && isset($event->payload['headers']['x-custom-header']);
    });

    // Sesión de un solo uso: la siguiente petición debe retornar 404
    $secondRes = $this->postJson('/api/v1/webhooks/webhook_1', ['email' => 'again@example.com']);
    $secondRes->assertNotFound();
});

it('retorna 404 si no hay ninguna escucha activa para la ruta', function () {
    $res = $this->postJson('/api/v1/webhooks/inexistente', ['data' => 123]);
    $res->assertNotFound();
});

it('rechaza con 405 si el método HTTP no coincide y mantiene la sesión activa', function () {
    Sanctum::actingAs($this->user);

    $this->postJson("/api/v1/recipes/{$this->recipe->uuid}/webhook-test/listen", [
        'node_id' => 'webhook_strict',
        'path' => '/api/v1/webhooks/webhook_strict',
        'http_method' => 'POST',
    ])->assertCreated();

    // Enviar GET cuando se esperaba POST
    $getRes = $this->getJson('/api/v1/webhooks/webhook_strict');
    $getRes->assertStatus(405);

    // Enviar POST correcto
    $postRes = $this->postJson('/api/v1/webhooks/webhook_strict', ['ok' => true]);
    $postRes->assertOk();
});

it('permite cancelar la escucha antes de recibir peticiones', function () {
    Sanctum::actingAs($this->user);

    $listenRes = $this->postJson("/api/v1/recipes/{$this->recipe->uuid}/webhook-test/listen", [
        'node_id' => 'webhook_cancel',
        'path' => '/api/v1/webhooks/webhook_cancel',
        'http_method' => 'POST',
    ]);
    $listenId = $listenRes->json('listen_id');

    $stopRes = $this->deleteJson("/api/v1/recipes/{$this->recipe->uuid}/webhook-test/{$listenId}");
    $stopRes->assertNoContent();

    // La ruta ya no debe responder
    $captureRes = $this->postJson('/api/v1/webhooks/webhook_cancel', ['test' => true]);
    $captureRes->assertNotFound();
});

it('rechaza iniciar escucha sin autenticación', function () {
    $this->postJson("/api/v1/recipes/{$this->recipe->uuid}/webhook-test/listen", [
        'node_id' => 'wh_anon',
        'path' => '/api/v1/webhooks/wh_anon',
        'http_method' => 'POST',
    ])->assertUnauthorized();
});
