<?php

declare(strict_types=1);

use App\Enums\Role;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Support\Facades\Redis;
use Laravel\Sanctum\Sanctum;

function makeSyncWebhookDefinition(
    string $responseMode = 'respondNode',
    int $responseTimeoutMs = 5000,
    string $path = '/api/v1/webhooks/sync-flow'
): array {
    return [
        'schema' => 'rpa/v1',
        'entry' => 'hook_1',
        'nodes' => [
            'hook_1' => [
                'id' => 'hook_1',
                'type' => 'webhook',
                'description' => 'Webhook síncrono',
                'params' => [
                    'httpMethod' => 'POST',
                    'path' => $path,
                    'outputVariable' => 'webhook',
                    'responseCode' => 202,
                    'responseBody' => '{"queued":true}',
                    'responseMode' => $responseMode,
                    'responseTimeoutMs' => $responseTimeoutMs,
                ],
                'next' => 'resp_1',
            ],
            'resp_1' => [
                'id' => 'resp_1',
                'type' => 'respond',
                'description' => 'Responder',
                'params' => [
                    'responseType' => 'json',
                    'statusCode' => 200,
                    'body' => '{"ok":true}',
                ],
            ],
        ],
        'edges' => [
            ['from' => 'hook_1', 'to' => 'resp_1'],
        ],
    ];
}

beforeEach(function () {
    $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);

    $this->user = User::factory()->create();
    $this->workspace = Workspace::create(['name' => 'Sync Webhook WS', 'slug' => 'sync-wh-'.uniqid()]);
    $this->workspace->members()->attach($this->user->id, ['role' => Role::Owner->value]);
    $this->project = $this->workspace->projects()->create(['name' => 'Proyecto Sync']);

    Sanctum::actingAs($this->user);

    Redis::shouldReceive('connection')->byDefault()->andReturnSelf();
    Redis::shouldReceive('hgetall')->byDefault()->andReturn([]);
    Redis::shouldReceive('executeRaw')->byDefault()->andReturn('1-0');
});

it('espera la respuesta del runner en responseMode=respondNode para JSON, HTML, texto y headers', function () {
    $this->postJson("/api/v1/projects/{$this->project->uuid}/recipes", [
        'name' => 'Webhook Sync JSON',
        'definition' => makeSyncWebhookDefinition('respondNode', 5000, '/api/v1/webhooks/sync-json'),
    ])->assertCreated();

    $envelopeJson = json_encode([
        'kind' => 'respond',
        'responseType' => 'json',
        'statusCode' => 201,
        'contentType' => 'application/json; charset=utf-8',
        'headers' => ['X-RPA-Custom' => 'procesado'],
        'body' => json_encode(['total' => 99, 'status' => 'created']),
        'isBase64' => false,
    ]);

    Redis::shouldReceive('blpop')
        ->once()
        ->andReturn(['rpa:run:fake:response', $envelopeJson]);

    $res = $this->postJson('/api/v1/webhooks/sync-json', ['item' => 'A'])
        ->assertStatus(201)
        ->assertJson(['total' => 99, 'status' => 'created']);

    expect($res->headers->get('X-RPA-Custom'))->toBe('procesado')
        ->and($res->headers->get('X-RPA-Run-Id'))->not->toBeEmpty();

    // HTML
    $envelopeHtml = json_encode([
        'kind' => 'respond',
        'responseType' => 'html',
        'statusCode' => 200,
        'contentType' => 'text/html; charset=utf-8',
        'headers' => [],
        'body' => '<h1>Reporte Listo</h1>',
        'isBase64' => false,
    ]);

    Redis::shouldReceive('blpop')
        ->once()
        ->andReturn(['rpa:run:fake:response', $envelopeHtml]);

    $htmlRes = $this->postJson('/api/v1/webhooks/sync-json', ['item' => 'B'])
        ->assertOk();
    expect($htmlRes->getContent())->toBe('<h1>Reporte Listo</h1>')
        ->and($htmlRes->headers->get('Content-Type'))->toContain('text/html');
});

it('retorna archivo binario decodificado, redirect 302 y empty 204', function () {
    $this->postJson("/api/v1/projects/{$this->project->uuid}/recipes", [
        'name' => 'Webhook Sync Multi',
        'definition' => makeSyncWebhookDefinition('respondNode', 5000, '/api/v1/webhooks/sync-multi'),
    ])->assertCreated();

    // Binario
    $envelopeBinary = json_encode([
        'kind' => 'respond',
        'responseType' => 'binary',
        'statusCode' => 200,
        'contentType' => 'application/pdf',
        'headers' => [],
        'body' => base64_encode('%PDF-DEMO'),
        'isBase64' => true,
        'filename' => 'recibo.pdf',
    ]);
    Redis::shouldReceive('blpop')->once()->andReturn(['key', $envelopeBinary]);

    $binRes = $this->postJson('/api/v1/webhooks/sync-multi', [])->assertOk();
    expect($binRes->getContent())->toBe('%PDF-DEMO')
        ->and($binRes->headers->get('Content-Type'))->toBe('application/pdf')
        ->and($binRes->headers->get('Content-Disposition'))->toBe('attachment; filename="recibo.pdf"');

    // Redirect 302
    $envelopeRedirect = json_encode([
        'kind' => 'respond',
        'responseType' => 'redirect',
        'statusCode' => 302,
        'contentType' => '',
        'headers' => [],
        'body' => '',
        'isBase64' => false,
        'redirectUrl' => 'https://example.com/gracias',
    ]);
    Redis::shouldReceive('blpop')->once()->andReturn(['key', $envelopeRedirect]);

    $redirRes = $this->postJson('/api/v1/webhooks/sync-multi', [])->assertStatus(302);
    expect($redirRes->headers->get('Location'))->toBe('https://example.com/gracias');

    // Empty 204
    $envelopeEmpty = json_encode([
        'kind' => 'respond',
        'responseType' => 'empty',
        'statusCode' => 204,
        'contentType' => '',
        'headers' => [],
        'body' => '',
        'isBase64' => false,
    ]);
    Redis::shouldReceive('blpop')->once()->andReturn(['key', $envelopeEmpty]);

    $emptyRes = $this->postJson('/api/v1/webhooks/sync-multi', [])->assertStatus(204);
    expect($emptyRes->getContent())->toBe('');
});

it('redacta secretos en la respuesta síncrona del webhook y devuelve 504 si expira timeout', function () {
    $this->workspace->secrets()->create([
        'key' => 'SECRET_KEY',
        'value' => 'super-secret-value-123',
    ]);

    $this->postJson("/api/v1/projects/{$this->project->uuid}/recipes", [
        'name' => 'Webhook Sync Timeout y Redacción',
        'definition' => makeSyncWebhookDefinition('lastNode', 1000, '/api/v1/webhooks/sync-last'),
    ])->assertCreated();

    $envelopeLeaked = json_encode([
        'kind' => 'lastNode',
        'responseType' => 'json',
        'statusCode' => 200,
        'contentType' => 'application/json; charset=utf-8',
        'headers' => ['X-Leak' => 'tok=super-secret-value-123'],
        'body' => json_encode(['token' => 'super-secret-value-123']),
        'isBase64' => false,
    ]);
    Redis::shouldReceive('blpop')->once()->andReturn(['key', $envelopeLeaked]);

    $safeRes = $this->postJson('/api/v1/webhooks/sync-last', [])->assertOk();
    expect($safeRes->getContent())->not->toContain('super-secret-value-123')
        ->and($safeRes->headers->get('X-Leak'))->not->toContain('super-secret-value-123');

    // Timeout 504
    Redis::shouldReceive('blpop')->once()->andReturnUsing(function () {
        usleep(1_100_000);

        return null;
    });

    $timeoutRes = $this->postJson('/api/v1/webhooks/sync-last', [])->assertStatus(504);
    expect($timeoutRes->json('ok'))->toBeFalse()
        ->and($timeoutRes->headers->get('X-RPA-Run-Id'))->not->toBeEmpty();
});
