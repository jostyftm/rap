<?php

declare(strict_types=1);

use App\Enums\Role;
use App\Models\User;
use App\Models\Workspace;
use App\Services\RunnerEventProcessor;
use Laravel\Sanctum\Sanctum;

function createTestRecipePayload(): array
{
    return [
        'name' => 'Receta de Login y Extracción',
        'description' => 'Automatización de login determinista',
        'definition' => [
            'schema' => 'rpa/v1',
            'entry' => 'node_1',
            'nodes' => [
                'node_1' => [
                    'id' => 'node_1',
                    'type' => 'navigate',
                    'description' => 'Ir a login',
                    'params' => ['url' => 'http://localhost:8088/login'],
                    'next' => 'node_2',
                ],
                'node_2' => [
                    'id' => 'node_2',
                    'type' => 'type',
                    'description' => 'Escribir usuario',
                    'locator' => [
                        'primary' => ['strategy' => 'testid', 'value' => 'username-input', 'score' => 95],
                        'fallbacks' => [],
                    ],
                    'params' => ['text' => 'admin_test', 'clear' => true],
                ],
            ],
            'edges' => [
                ['from' => 'node_1', 'to' => 'node_2'],
            ],
        ],
    ];
}

it('crea una receta válida y su versión inicial', function () {
    $user = User::factory()->create();
    $ws = Workspace::create(['name' => 'W1', 'slug' => 'w1']);
    $ws->members()->attach($user->id, ['role' => Role::Owner->value]);
    $project = $ws->projects()->create(['name' => 'Proyecto Demo']);

    Sanctum::actingAs($user);

    $response = $this->postJson("/api/v1/projects/{$project->uuid}/recipes", createTestRecipePayload());

    $response->assertCreated()
        ->assertJsonPath('data.name', 'Receta de Login y Extracción')
        ->assertJsonPath('data.latest_version.version', 1);

    $this->assertDatabaseHas('recipes', ['name' => 'Receta de Login y Extracción']);
    $this->assertDatabaseHas('recipe_versions', ['version' => 1]);
});

it('rechaza una receta con DSL inválido retornando RFC 9457', function () {
    $user = User::factory()->create();
    $ws = Workspace::create(['name' => 'W1', 'slug' => 'w1']);
    $ws->members()->attach($user->id, ['role' => Role::Owner->value]);
    $project = $ws->projects()->create(['name' => 'Proyecto Demo']);

    Sanctum::actingAs($user);

    $payload = createTestRecipePayload();
    $payload['definition']['entry'] = 'nodo_que_no_existe';

    $response = $this->postJson("/api/v1/projects/{$project->uuid}/recipes", $payload);

    $response->assertStatus(422)
        ->assertHeader('Content-Type', 'application/problem+json')
        ->assertJsonStructure(['type', 'title', 'status', 'errors' => ['definition']]);
});

it('encola un run para una receta y procesa eventos del runner', function () {
    $user = User::factory()->create();
    $ws = Workspace::create(['name' => 'W1', 'slug' => 'w1']);
    $ws->members()->attach($user->id, ['role' => Role::Owner->value]);
    $project = $ws->projects()->create(['name' => 'Proyecto Demo']);

    Sanctum::actingAs($user);

    $recipe = $project->recipes()->create(['name' => 'R1', 'status' => 'active']);
    $recipe->versions()->create([
        'version' => 1,
        'definition' => createTestRecipePayload()['definition'],
    ]);

    $response = $this->postJson("/api/v1/recipes/{$recipe->uuid}/runs");
    $response->assertCreated()
        ->assertJsonPath('data.status', 'queued');

    $runUuid = $response->json('data.id');

    // Simular eventos enviados por el Runner a través de RunnerEventProcessor
    $processor = app(RunnerEventProcessor::class);

    $processor->process([
        'event' => 'run.started',
        'run_id' => $runUuid,
    ]);

    $processor->process([
        'event' => 'step.started',
        'run_id' => $runUuid,
        'node_id' => 'node_1',
    ]);

    $processor->process([
        'event' => 'step.finished',
        'run_id' => $runUuid,
        'node_id' => 'node_1',
        'duration_ms' => 140,
        'locator_strategy' => 'testid',
        'screenshot_path' => 'screenshots/run1/step1.png',
    ]);

    $processor->process([
        'event' => 'run.finished',
        'run_id' => $runUuid,
        'status' => 'success',
        'duration_ms' => 520,
    ]);

    $runResponse = $this->getJson("/api/v1/runs/{$runUuid}");
    $runResponse->assertOk()
        ->assertJsonPath('data.status', 'completed')
        ->assertJsonPath('data.duration_ms', 520)
        ->assertJsonCount(1, 'data.steps')
        ->assertJsonPath('data.steps.0.status', 'success')
        ->assertJsonCount(1, 'data.artifacts');
});

it('permite pausar, reanudar y consultar logs persistidos de un run', function () {
    $user = User::factory()->create();
    $ws = Workspace::create(['name' => 'W1', 'slug' => 'w1-logs']);
    $ws->members()->attach($user->id, ['role' => Role::Owner->value]);
    $project = $ws->projects()->create(['name' => 'Proyecto Demo']);

    Sanctum::actingAs($user);

    $recipe = $project->recipes()->create(['name' => 'R_LOGS', 'status' => 'active']);
    $recipe->versions()->create([
        'version' => 1,
        'definition' => createTestRecipePayload()['definition'],
    ]);

    $response = $this->postJson("/api/v1/recipes/{$recipe->uuid}/runs", [
        'options' => [
            'display' => 'headed',
            'slow_mo_ms' => 300,
            'highlight' => true,
        ],
    ]);
    $response->assertCreated();
    $runUuid = $response->json('data.id');

    // Control: pausar
    $controlRes = $this->postJson("/api/v1/runs/{$runUuid}/control", ['action' => 'pause']);
    $controlRes->assertOk()->assertJsonPath('action', 'pause');

    // Procesar logs enriquecidos del runner
    $processor = app(RunnerEventProcessor::class);
    $processor->process([
        'event' => 'run.log',
        'run_id' => $runUuid,
        'level' => 'info',
        'source' => 'runner',
        'node_id' => 'node_1',
        'message' => 'Ejecutando click en botón',
    ]);

    $processor->process([
        'event' => 'run.log',
        'run_id' => $runUuid,
        'level' => 'info',
        'source' => 'browser',
        'node_id' => 'node_1',
        'message' => 'Evento click recibido en DOM',
    ]);

    // Consultar logs persistidos
    $logsRes = $this->getJson("/api/v1/runs/{$runUuid}/logs");
    $logsRes->assertOk()
        ->assertJsonCount(2, 'data')
        ->assertJsonPath('data.0.source', 'runner')
        ->assertJsonPath('data.1.source', 'browser');

    // Filtro por origen
    $filterRes = $this->getJson("/api/v1/runs/{$runUuid}/logs?source=browser");
    $filterRes->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.source', 'browser');
});

