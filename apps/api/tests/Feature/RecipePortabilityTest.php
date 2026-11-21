<?php

declare(strict_types=1);

use App\Enums\Role;
use App\Models\Recipe;
use App\Models\User;
use App\Models\Workspace;
use App\Models\WorkspaceSecret;
use Laravel\Sanctum\Sanctum;

function createValidPortabilityDsl(string $url = 'https://example.com/start', ?string $text = null): array
{
    if ($text !== null) {
        return [
            'schema' => 'rpa/v1',
            'entry' => 'node_1',
            'nodes' => [
                'node_1' => [
                    'id' => 'node_1',
                    'type' => 'type',
                    'description' => 'Escribir texto',
                    'locator' => [
                        'primary' => ['strategy' => 'testid', 'value' => 'input-field', 'score' => 90],
                        'fallbacks' => [],
                    ],
                    'params' => [
                        'text' => $text,
                        'clear' => true,
                    ],
                ],
            ],
            'edges' => [],
        ];
    }

    return [
        'schema' => 'rpa/v1',
        'entry' => 'node_1',
        'nodes' => [
            'node_1' => [
                'id' => 'node_1',
                'type' => 'navigate',
                'description' => 'Navegación inicial',
                'params' => ['url' => $url],
            ],
        ],
        'edges' => [],
    ];
}

beforeEach(function () {
    $this->user = User::factory()->create();
    $this->workspace = Workspace::create(['name' => 'WS Portability', 'slug' => 'ws-port-'.uniqid()]);
    $this->workspace->members()->attach($this->user->id, ['role' => Role::Owner->value]);
    $this->project = $this->workspace->projects()->create(['name' => 'Proyecto Portability']);

    Sanctum::actingAs($this->user);
});

it('exporta el borrador y versiones historicas en formato JSON estandarizado', function () {
    $createRes = $this->postJson("/api/v1/projects/{$this->project->uuid}/recipes", [
        'name' => 'Receta Exportable',
        'description' => 'Descripcion de prueba',
        'definition' => createValidPortabilityDsl('https://example.com/start'),
    ])->assertCreated();
    $recipeUuid = $createRes->json('data.id');

    // Modificamos borrador
    $this->putJson("/api/v1/recipes/{$recipeUuid}", [
        'definition' => createValidPortabilityDsl('https://example.com/draft-url'),
    ])->assertOk();

    // Exportar borrador (sin query param version)
    $exportDraftRes = $this->getJson("/api/v1/recipes/{$recipeUuid}/export")
        ->assertOk();
    $exportDraftRes->assertJsonPath('format', 'rpa-studio.recipe')
        ->assertJsonPath('format_version', 1)
        ->assertJsonPath('source.is_draft', true)
        ->assertJsonPath('definition.nodes.node_1.params.url', 'https://example.com/draft-url');

    // Exportar versión 1 publicada
    $exportV1Res = $this->getJson("/api/v1/recipes/{$recipeUuid}/export?version=1")
        ->assertOk();
    $exportV1Res->assertJsonPath('source.version', 1)
        ->assertJsonPath('definition.nodes.node_1.params.url', 'https://example.com/start');
});

it('importa una receta como nueva automatizacion y reporta secretos faltantes', function () {
    // Agregamos un secreto en el workspace pero no el otro
    WorkspaceSecret::create([
        'workspace_id' => $this->workspace->id,
        'key' => 'EXISTING_SECRET',
        'value' => 'secret_val',
    ]);

    $importPayload = [
        'format' => 'rpa-studio.recipe',
        'format_version' => 1,
        'recipe' => [
            'name' => 'Receta Con Secretos Importada',
            'description' => 'Receta que usa secretos',
        ],
        'definition' => createValidPortabilityDsl(
            text: 'Login {{secrets.EXISTING_SECRET}} and {{secrets.MISSING_API_KEY}}'
        ),
    ];

    $res = $this->postJson("/api/v1/projects/{$this->project->uuid}/recipes/import", [
        'data' => $importPayload,
    ])->assertCreated();

    $res->assertJsonPath('data.name', 'Receta Con Secretos Importada')
        ->assertJsonPath('missing_secrets.0', 'MISSING_API_KEY');

    expect($res->json('missing_secrets'))->not->toContain('EXISTING_SECRET');

    // Verificar que existe en BD
    $recipe = Recipe::where('uuid', $res->json('data.id'))->firstOrFail();
    expect($recipe->draft)->not->toBeNull();
});

it('rechaza importaciones con formato invalido o DSL malformado', function () {
    // Formato no reconocido
    $this->postJson("/api/v1/projects/{$this->project->uuid}/recipes/import", [
        'data' => [
            'format' => 'other-format',
            'definition' => [],
        ],
    ])->assertUnprocessable()
      ->assertJsonValidationErrors(['file']);

    // DSL sin entry ni nodes
    $this->postJson("/api/v1/projects/{$this->project->uuid}/recipes/import", [
        'data' => [
            'format' => 'rpa-studio.recipe',
            'format_version' => 1,
            'definition' => [
                'schema' => 'rpa/v1',
            ],
        ],
    ])->assertUnprocessable()
      ->assertJsonValidationErrors(['definition']);
});

it('importa y reemplaza el borrador de una automatizacion existente', function () {
    $createRes = $this->postJson("/api/v1/projects/{$this->project->uuid}/recipes", [
        'name' => 'Receta Para Reemplazar Borrador',
        'definition' => createValidPortabilityDsl('https://example.com/v1'),
    ])->assertCreated();
    $recipeUuid = $createRes->json('data.id');

    $importPayload = [
        'format' => 'rpa-studio.recipe',
        'format_version' => 1,
        'definition' => [
            'schema' => 'rpa/v1',
            'entry' => 'node_new',
            'nodes' => [
                'node_new' => [
                    'id' => 'node_new',
                    'type' => 'navigate',
                    'description' => 'Nueva navegacion importada',
                    'params' => ['url' => 'https://imported.com/new'],
                ],
            ],
            'edges' => [],
        ],
    ];

    $res = $this->postJson("/api/v1/recipes/{$recipeUuid}/import", [
        'data' => $importPayload,
    ])->assertOk();

    $res->assertJsonPath('data.has_unpublished_changes', true)
        ->assertJsonPath('data.draft.definition.nodes.node_new.params.url', 'https://imported.com/new')
        ->assertJsonPath('data.published_version.definition.nodes.node_1.params.url', 'https://example.com/v1');
});
