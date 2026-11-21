<?php

declare(strict_types=1);

use App\Enums\Role;
use App\Models\Recipe;
use App\Models\Run;
use App\Models\User;
use App\Models\Workspace;
use Laravel\Sanctum\Sanctum;

function getSampleDsl(string $url = 'https://example.com/login'): array
{
    return [
        'schema' => 'rpa/v1',
        'entry' => 'node_1',
        'nodes' => [
            'node_1' => [
                'id' => 'node_1',
                'type' => 'navigate',
                'description' => 'Ir a la URL',
                'params' => ['url' => $url],
            ],
        ],
        'edges' => [],
    ];
}

beforeEach(function () {
    $this->user = User::factory()->create();
    $this->workspace = Workspace::create(['name' => 'WS Versioning', 'slug' => 'ws-ver-'.uniqid()]);
    $this->workspace->members()->attach($this->user->id, ['role' => Role::Owner->value]);
    $this->project = $this->workspace->projects()->create(['name' => 'Proyecto Versioning']);

    Sanctum::actingAs($this->user);
});

it('crea una receta con version 1 publicada y borrador v0 sincronizado', function () {
    $res = $this->postJson("/api/v1/projects/{$this->project->uuid}/recipes", [
        'name' => 'Receta Versionada',
        'definition' => getSampleDsl('https://example.com/v1'),
    ])->assertCreated();

    $res->assertJsonPath('data.name', 'Receta Versionada')
        ->assertJsonPath('data.published_version.version', 1)
        ->assertJsonPath('data.draft.version', 0)
        ->assertJsonPath('data.has_unpublished_changes', false);

    $recipe = Recipe::where('uuid', $res->json('data.id'))->firstOrFail();
    expect($recipe->published_version_id)->not->toBeNull();
    expect($recipe->draft)->not->toBeNull();
    expect($recipe->versions()->count())->toBe(1);
});

it('el modo edicion actualiza el borrador v0 sin generar nuevas versiones', function () {
    $recipe = $this->project->recipes()->create(['name' => 'R_Edit', 'status' => 'active']);
    $v1 = $recipe->allVersions()->create([
        'version' => 1,
        'definition' => getSampleDsl('https://example.com/v1'),
        'changelog' => 'V1',
    ]);
    $recipe->allVersions()->create([
        'version' => 0,
        'definition' => getSampleDsl('https://example.com/v1'),
        'changelog' => 'Borrador',
    ]);
    $recipe->update(['published_version_id' => $v1->id]);

    // Modificamos el borrador vía PUT
    $updatedDsl = getSampleDsl('https://example.com/v2-draft');
    $putRes = $this->putJson("/api/v1/recipes/{$recipe->uuid}", [
        'name' => 'R_Edit (Borrador modificado)',
        'definition' => $updatedDsl,
    ])->assertOk();

    $putRes->assertJsonPath('data.name', 'R_Edit (Borrador modificado)')
        ->assertJsonPath('data.has_unpublished_changes', true)
        ->assertJsonPath('data.published_version.version', 1)
        ->assertJsonPath('data.published_version.definition.nodes.node_1.params.url', 'https://example.com/v1')
        ->assertJsonPath('data.draft.definition.nodes.node_1.params.url', 'https://example.com/v2-draft');

    // No se crearon versiones publicadas adicionales
    expect($recipe->fresh()->versions()->count())->toBe(1);
});

it('despacha ejecucion de borrador cuando use_draft es true y de version publicada por defecto', function () {
    $recipe = $this->project->recipes()->create(['name' => 'R_Exec', 'status' => 'active']);
    $v1 = $recipe->allVersions()->create([
        'version' => 1,
        'definition' => getSampleDsl('https://example.com/published'),
    ]);
    $v0 = $recipe->allVersions()->create([
        'version' => 0,
        'definition' => getSampleDsl('https://example.com/draft'),
    ]);
    $recipe->update(['published_version_id' => $v1->id]);

    // Ejecución por defecto (producción / publicado)
    $resPub = $this->postJson("/api/v1/recipes/{$recipe->uuid}/runs")
        ->assertCreated();
    $runPub = Run::where('uuid', $resPub->json('data.id'))->firstOrFail();
    expect($runPub->recipe_version_id)->toBe($v1->id);

    // Ejecución de prueba desde el editor (borrador)
    $resDraft = $this->postJson("/api/v1/recipes/{$recipe->uuid}/runs", [
        'use_draft' => true,
    ])->assertCreated();
    $runDraft = Run::where('uuid', $resDraft->json('data.id'))->firstOrFail();
    expect($runDraft->recipe_version_id)->toBe($v0->id);
});

it('publicar congela el borrador como version 2 e impide publicar sin cambios', function () {
    $createRes = $this->postJson("/api/v1/projects/{$this->project->uuid}/recipes", [
        'name' => 'Receta Para Publicar',
        'definition' => getSampleDsl('https://example.com/v1'),
    ])->assertCreated();

    $recipeUuid = $createRes->json('data.id');

    // Intentar publicar de inmediato sin cambios debe dar 422
    $this->postJson("/api/v1/recipes/{$recipeUuid}/publish", [
        'changelog' => 'Sin cambios',
    ])->assertUnprocessable()
      ->assertJsonValidationErrors(['recipe']);

    // Modificamos el borrador
    $this->putJson("/api/v1/recipes/{$recipeUuid}", [
        'definition' => getSampleDsl('https://example.com/v2-final'),
    ])->assertOk();

    // Publicamos
    $pubRes = $this->postJson("/api/v1/recipes/{$recipeUuid}/publish", [
        'changelog' => 'Lanzamiento v2',
    ])->assertOk();

    $pubRes->assertJsonPath('data.published_version.version', 2)
        ->assertJsonPath('data.published_version.changelog', 'Lanzamiento v2')
        ->assertJsonPath('data.has_unpublished_changes', false);

    $recipe = Recipe::where('uuid', $recipeUuid)->firstOrFail();
    expect($recipe->versions()->count())->toBe(2);
});

it('lista el historial de versiones y permite rollback creando una nueva version publicada', function () {
    $createRes = $this->postJson("/api/v1/projects/{$this->project->uuid}/recipes", [
        'name' => 'Receta Rollback',
        'definition' => getSampleDsl('https://example.com/v1'),
    ])->assertCreated();
    $recipeUuid = $createRes->json('data.id');

    // Modificar y publicar v2
    $this->putJson("/api/v1/recipes/{$recipeUuid}", [
        'definition' => getSampleDsl('https://example.com/v2'),
    ]);
    $this->postJson("/api/v1/recipes/{$recipeUuid}/publish", ['changelog' => 'Paso a v2']);

    // Modificar y publicar v3
    $this->putJson("/api/v1/recipes/{$recipeUuid}", [
        'definition' => getSampleDsl('https://example.com/v3'),
    ]);
    $this->postJson("/api/v1/recipes/{$recipeUuid}/publish", ['changelog' => 'Paso a v3']);

    // Listar historial
    $historyRes = $this->getJson("/api/v1/recipes/{$recipeUuid}/versions")
        ->assertOk();
    $historyRes->assertJsonCount(3, 'data');
    expect($historyRes->json('data.0.version'))->toBe(3);
    expect($historyRes->json('data.0.is_published'))->toBeTrue();
    expect($historyRes->json('data.1.version'))->toBe(2);
    expect($historyRes->json('data.2.version'))->toBe(1);

    // Retroceder / rollback a la versión 1
    $restoreRes = $this->postJson("/api/v1/recipes/{$recipeUuid}/versions/1/restore")
        ->assertOk();

    // Debe haberse creado la versión 4 que tiene la definición de la versión 1
    $restoreRes->assertJsonPath('data.published_version.version', 4)
        ->assertJsonPath('data.published_version.definition.nodes.node_1.params.url', 'https://example.com/v1')
        ->assertJsonPath('data.draft.definition.nodes.node_1.params.url', 'https://example.com/v1')
        ->assertJsonPath('data.has_unpublished_changes', false);

    $recipe = Recipe::where('uuid', $recipeUuid)->firstOrFail();
    expect($recipe->versions()->count())->toBe(4);
    $v4 = $recipe->allVersions()->where('version', 4)->firstOrFail();
    expect($v4->restored_from_version_id)->not->toBeNull();
});
