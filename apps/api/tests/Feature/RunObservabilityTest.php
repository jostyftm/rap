<?php

declare(strict_types=1);

use App\Enums\Role;
use App\Events\RunStepUpdated;
use App\Events\RunUpdated;
use App\Models\Artifact;
use App\Models\Run;
use App\Models\RunLog;
use App\Models\User;
use App\Models\Workspace;
use App\Models\WorkspaceSecret;
use App\Services\RunnerEventIngestor;
use App\Support\ArtifactUrl;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Redis;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;

function createObservabilityFixture(): array
{
    $user = User::factory()->create();
    $ws = Workspace::create(['name' => 'Obs WS', 'slug' => 'obs-'.uniqid()]);
    $ws->members()->attach($user->id, ['role' => Role::Owner->value]);
    $project = $ws->projects()->create(['name' => 'Obs Project']);

    Sanctum::actingAs($user);

    Redis::shouldReceive('connection')->byDefault()->andReturnSelf();
    Redis::shouldReceive('hgetall')->byDefault()->andReturn([]);
    Redis::shouldReceive('executeRaw')->byDefault()->andReturn('1-0');

    return [$user, $ws, $project];
}

it('lista las ejecuciones recientes de una receta con filtros, conteos y vista previa firmada', function () {
    [, , $project] = createObservabilityFixture();

    $create = $this->postJson("/api/v1/projects/{$project->uuid}/recipes", [
        'name' => 'Receta Observabilidad',
        'definition' => [
            'schema' => 'rpa/v1',
            'entry' => 'webhook_1',
            'nodes' => [
                'webhook_1' => [
                    'id' => 'webhook_1',
                    'type' => 'webhook',
                    'description' => 'Entrada',
                    'params' => [
                        'httpMethod' => 'POST',
                        'path' => '/api/v1/webhooks/obs-demo',
                        'outputVariable' => 'webhook',
                    ],
                    'next' => 'nav_1',
                ],
                'nav_1' => [
                    'id' => 'nav_1',
                    'type' => 'navigate',
                    'description' => 'Ir a sitio',
                    'params' => ['url' => 'https://example.test'],
                ],
            ],
            'edges' => [
                ['from' => 'webhook_1', 'to' => 'nav_1'],
            ],
        ],
    ])->assertCreated();

    $recipeUuid = $create->json('data.id');
    $recipe = \App\Models\Recipe::where('uuid', $recipeUuid)->firstOrFail();

    // 1. Disparar ejecución manual (borrador)
    $manualRes = $this->postJson("/api/v1/recipes/{$recipeUuid}/runs", [
        'use_draft' => true,
        'parameters' => ['origen' => 'manual'],
    ])->assertCreated();
    $manualRunUuid = $manualRes->json('data.id');

    // 2. Disparar ejecución por webhook publicado (v1)
    $whRes = $this->postJson('/api/v1/webhooks/obs-demo', ['pedido' => 'A-100'])
        ->assertOk();
    $whRunUuid = $whRes->headers->get('X-RPA-Run-Id');

    // Adjuntar artefacto y resultado al run de webhook
    $whRun = Run::where('uuid', $whRunUuid)->firstOrFail();
    $whRun->update([
        'status' => 'completed',
        'duration_ms' => 410,
        'result' => ['final_url' => 'https://example.test/ok', 'outputs' => ['nav_1' => ['title' => 'OK']]],
    ]);
    $whRun->steps()->create(['node_id' => 'nav_1', 'status' => 'success', 'duration_ms' => 200]);
    RunLog::create([
        'run_id' => $whRun->id,
        'level' => 'info',
        'source' => 'runner',
        'message' => 'Paso completado',
        'logged_at' => now(),
    ]);
    Artifact::create([
        'run_id' => $whRun->id,
        'type' => 'screenshot',
        's3_key' => "runs/{$whRunUuid}/screenshots/nav_1.jpg",
        'mime_type' => 'image/jpeg',
    ]);

    // Listado general ordenado más reciente primero
    $list = $this->getJson("/api/v1/recipes/{$recipeUuid}/runs")
        ->assertOk()
        ->assertJsonCount(2, 'data');

    expect($list->json('data.0.id'))->toBe($whRunUuid)
        ->and($list->json('data.0.trigger'))->toBe('webhook')
        ->and($list->json('data.0.recipe_version'))->toBe(1)
        ->and($list->json('data.0.is_draft'))->toBeFalse()
        ->and($list->json('data.0.steps_count'))->toBe(1)
        ->and($list->json('data.0.logs_count'))->toBe(1)
        ->and($list->json('data.0.preview_url'))->toContain('/api/v1/artifacts/')
        ->and($list->json('data.0.preview_url'))->toContain('signature=')
        ->and($list->json('data.0.result.final_url'))->toBe('https://example.test/ok')
        ->and($list->json('data.1.id'))->toBe($manualRunUuid)
        ->and($list->json('data.1.is_draft'))->toBeTrue();

    // Filtro por trigger y status
    $filtered = $this->getJson("/api/v1/recipes/{$recipeUuid}/runs?trigger=webhook&status=completed")
        ->assertOk()
        ->assertJsonCount(1, 'data');
    expect($filtered->json('data.0.id'))->toBe($whRunUuid);
});

it('persiste output de pasos y resultado redactado, crea artifacts en éxito y fallo, y emite en canal de receta', function () {
    [, $ws, $project] = createObservabilityFixture();

    WorkspaceSecret::create([
        'workspace_id' => $ws->id,
        'key' => 'TOKEN_SECRETO',
        'value' => 'tok_super_privado_12345',
    ]);

    $create = $this->postJson("/api/v1/projects/{$project->uuid}/recipes", [
        'name' => 'Receta Eventos Canal',
        'definition' => [
            'schema' => 'rpa/v1',
            'entry' => 'webhook_1',
            'nodes' => [
                'webhook_1' => [
                    'id' => 'webhook_1',
                    'type' => 'webhook',
                    'description' => 'Entrada',
                    'params' => [
                        'httpMethod' => 'POST',
                        'path' => '/api/v1/webhooks/canal-obs',
                        'outputVariable' => 'webhook',
                    ],
                    'next' => 'extract_1',
                ],
                'extract_1' => [
                    'id' => 'extract_1',
                    'type' => 'extract',
                    'description' => 'Extraer',
                    'locator' => [
                        'primary' => ['strategy' => 'css', 'value' => '#res', 'score' => 80],
                        'fallbacks' => [],
                    ],
                    'params' => ['extractType' => 'text', 'variable' => 'res'],
                ],
            ],
            'edges' => [
                ['from' => 'webhook_1', 'to' => 'extract_1'],
            ],
        ],
    ])->assertCreated();

    $recipeUuid = $create->json('data.id');

    Event::fake([RunUpdated::class, RunStepUpdated::class]);

    $whRes = $this->postJson('/api/v1/webhooks/canal-obs', ['cliente' => 'Beta'])
        ->assertOk();
    $runUuid = $whRes->headers->get('X-RPA-Run-Id');

    Event::assertDispatched(RunUpdated::class, function (RunUpdated $ev) use ($recipeUuid, $runUuid) {
        $channels = array_map(fn ($c) => $c->name, $ev->broadcastOn());

        return $ev->run->uuid === $runUuid
            && in_array("recipe.{$recipeUuid}", $channels, true)
            && in_array("run.{$runUuid}", $channels, true);
    });

    $ingestor = app(RunnerEventIngestor::class);

    $ingestor->ingest([
        'id' => (string) Str::ulid(),
        'event' => 'step.started',
        'run_id' => $runUuid,
        'node_id' => 'extract_1',
    ]);

    $ingestor->ingest([
        'id' => (string) Str::ulid(),
        'event' => 'step.finished',
        'run_id' => $runUuid,
        'node_id' => 'extract_1',
        'duration_ms' => 180,
        'locator_strategy' => 'css',
        'locator_value' => '#res',
        'screenshot_path' => "runs/{$runUuid}/screenshots/extract_1.jpg",
        'output' => json_encode(['texto' => 'Token tok_super_privado_12345 OK']),
    ]);

    $ingestor->ingest([
        'id' => (string) Str::ulid(),
        'event' => 'step.failed',
        'run_id' => $runUuid,
        'node_id' => 'step_err',
        'duration_ms' => 95,
        'error' => 'Falló con tok_super_privado_12345',
        'screenshot_path' => "runs/{$runUuid}/screenshots/error-step_err.png",
    ]);

    $ingestor->ingest([
        'id' => (string) Str::ulid(),
        'event' => 'run.finished',
        'run_id' => $runUuid,
        'status' => 'success',
        'duration_ms' => 390,
        'result' => json_encode([
            'final_url' => 'https://portal.test/tok_super_privado_12345',
            'final_title' => 'Confirmado',
            'last_screenshot_path' => "runs/{$runUuid}/screenshots/extract_1.jpg",
            'outputs' => ['extract_1' => ['texto' => 'Token tok_super_privado_12345 OK']],
        ]),
    ]);

    Event::assertDispatched(RunStepUpdated::class, function (RunStepUpdated $ev) {
        if ($ev->step->node_id !== 'extract_1' || $ev->step->status !== 'success') {
            return false;
        }
        $payload = $ev->broadcastWith();

        return $payload['output'] === ['texto' => 'Token *** OK']
            && is_string($payload['screenshot_url'])
            && str_contains($payload['screenshot_url'], '/api/v1/artifacts/');
    });

    // Verificar persistencia redactada + detalle completo en /runs/{run}
    $detail = $this->getJson("/api/v1/runs/{$runUuid}")->assertOk();
    $detail->assertJsonPath('data.trigger', 'webhook')
        ->assertJsonPath('data.parameters.webhook.body.cliente', 'Beta')
        ->assertJsonPath('data.result.final_url', 'https://portal.test/***')
        ->assertJsonPath('data.result.outputs.extract_1.texto', 'Token *** OK')
        ->assertJsonPath('data.steps.0.output.texto', 'Token *** OK')
        ->assertJsonCount(2, 'data.artifacts');

    expect($detail->json('data.steps.0.screenshot_url'))->toContain('signature=')
        ->and($detail->json('data.artifacts.0.mime_type'))->toBe('image/jpeg')
        ->and($detail->json('data.artifacts.1.mime_type'))->toBe('image/png');
});

it('sirve artefactos con firma criptográfica válida y rechaza firmas ausentes o alteradas', function () {
    Storage::fake('s3');
    [, , $project] = createObservabilityFixture();

    $create = $this->postJson("/api/v1/projects/{$project->uuid}/recipes", [
        'name' => 'Receta Artefactos',
        'definition' => [
            'schema' => 'rpa/v1',
            'entry' => 'nav_1',
            'nodes' => [
                'nav_1' => [
                    'id' => 'nav_1',
                    'type' => 'navigate',
                    'description' => 'Navegar',
                    'params' => ['url' => 'https://example.test'],
                ],
            ],
            'edges' => [],
        ],
    ])->assertCreated();

    $runRes = $this->postJson("/api/v1/recipes/{$create->json('data.id')}/runs")->assertCreated();
    $run = Run::where('uuid', $runRes->json('data.id'))->firstOrFail();

    $key = "runs/{$run->uuid}/screenshots/nav_1.jpg";
    Storage::disk('s3')->put($key, 'fake-jpeg-binary-content');

    $artifact = Artifact::create([
        'run_id' => $run->id,
        'type' => 'screenshot',
        's3_key' => $key,
        'mime_type' => 'image/jpeg',
    ]);

    // Sin sesión Sanctum (simula <img src> cross-origin) usando URL firmada relativa
    auth()->forgetGuards();
    $signedUrl = ArtifactUrl::forArtifact($artifact);
    $pathWithQuery = (string) parse_url($signedUrl, PHP_URL_PATH).'?'.parse_url($signedUrl, PHP_URL_QUERY);

    $this->get($pathWithQuery)
        ->assertOk()
        ->assertHeader('Content-Type', 'image/jpeg');

    // Sin firma o firma manipulada -> 403
    $this->get("/api/v1/artifacts/{$artifact->uuid}")->assertForbidden();
    $this->get("{$pathWithQuery}tampered")->assertForbidden();

    // Objeto faltante en S3 -> 404
    Storage::disk('s3')->delete($key);
    $this->get($pathWithQuery)->assertNotFound();
});
