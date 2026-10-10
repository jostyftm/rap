<?php

declare(strict_types=1);

use App\Enums\Role;
use App\Models\User;
use App\Models\Workspace;
use Laravel\Sanctum\Sanctum;

it('exporta una receta existente a Playwright TypeScript', function () {
    $user = User::factory()->create();
    $ws = Workspace::create(['name' => 'W1', 'slug' => 'w1']);
    $ws->members()->attach($user->id, ['role' => Role::Owner->value]);
    $project = $ws->projects()->create(['name' => 'Proyecto Demo']);

    Sanctum::actingAs($user);

    $recipe = $project->recipes()->create([
        'name' => 'Flujo de Extracción Playwright',
        'status' => 'active',
    ]);

    $recipe->versions()->create([
        'version' => 1,
        'definition' => [
            'schema' => 'rpa/v1',
            'entry' => 'step_1',
            'variables' => [
                ['name' => 'token', 'type' => 'string', 'defaultValue' => 'secret'],
            ],
            'nodes' => [
                'step_1' => [
                    'id' => 'step_1',
                    'type' => 'navigate',
                    'description' => 'Ir al sitio',
                    'params' => ['url' => 'https://example.com'],
                    'next' => 'step_2',
                ],
                'step_2' => [
                    'id' => 'step_2',
                    'type' => 'click',
                    'description' => 'Clic botón',
                    'locator' => [
                        'primary' => ['strategy' => 'testid', 'value' => 'submit-btn', 'score' => 95],
                        'fallbacks' => [],
                    ],
                    'params' => ['button' => 'left'],
                ],
            ],
            'edges' => [
                ['from' => 'step_1', 'to' => 'step_2'],
            ],
        ],
        'changelog' => 'v1 inicial',
    ]);

    $response = $this->getJson("/api/v1/recipes/{$recipe->uuid}/export/playwright");

    $response->assertOk()
        ->assertJsonPath('recipe_name', 'Flujo de Extracción Playwright')
        ->assertJsonPath('format', 'playwright-test');

    $code = $response->json('code');
    expect($code)->toContain("import { test, expect, type Page, type Locator } from '@playwright/test';")
        ->toContain('test("Flujo de Extracción Playwright", async ({ page }) => {')
        ->toContain('await page.goto("https://example.com"')
        ->toContain('resolveLocator(page, [{"strategy":"testid","value":"submit-btn"}]');
});

it('permite descargar el script .spec.ts con la cabecera adecuada', function () {
    $user = User::factory()->create();
    $ws = Workspace::create(['name' => 'W1', 'slug' => 'w1']);
    $ws->members()->attach($user->id, ['role' => Role::Owner->value]);
    $project = $ws->projects()->create(['name' => 'Proyecto Demo']);

    Sanctum::actingAs($user);

    $recipe = $project->recipes()->create([
        'name' => 'Flujo Descargable',
        'status' => 'active',
    ]);

    $recipe->versions()->create([
        'version' => 1,
        'definition' => [
            'schema' => 'rpa/v1',
            'entry' => 'step_1',
            'nodes' => [
                'step_1' => [
                    'id' => 'step_1',
                    'type' => 'navigate',
                    'description' => 'Ir',
                    'params' => ['url' => 'https://example.com'],
                ],
            ],
            'edges' => [],
        ],
    ]);

    $response = $this->get("/api/v1/recipes/{$recipe->uuid}/export/playwright?download=true");

    $response->assertOk()
        ->assertHeader('content-disposition', 'attachment; filename=flujo-descargable.spec.ts');
});

it('actualiza una receta y genera una nueva versión incrementada', function () {
    $user = User::factory()->create();
    $ws = Workspace::create(['name' => 'W1', 'slug' => 'w1']);
    $ws->members()->attach($user->id, ['role' => Role::Owner->value]);
    $project = $ws->projects()->create(['name' => 'Proyecto Demo']);

    Sanctum::actingAs($user);

    $recipe = $project->recipes()->create([
        'name' => 'Receta Original',
        'status' => 'active',
    ]);

    $recipe->versions()->create([
        'version' => 1,
        'definition' => [
            'schema' => 'rpa/v1',
            'entry' => 'step_1',
            'nodes' => [
                'step_1' => [
                    'id' => 'step_1',
                    'type' => 'navigate',
                    'description' => 'Ir',
                    'params' => ['url' => 'https://example.com'],
                ],
            ],
            'edges' => [],
        ],
    ]);

    $payload = [
        'name' => 'Receta Modificada',
        'changelog' => 'Ajuste de nodo inicial',
        'definition' => [
            'schema' => 'rpa/v1',
            'entry' => 'step_1',
            'nodes' => [
                'step_1' => [
                    'id' => 'step_1',
                    'type' => 'navigate',
                    'description' => 'Ir a nueva URL',
                    'params' => ['url' => 'https://updated.com'],
                ],
            ],
            'edges' => [],
        ],
    ];

    $response = $this->putJson("/api/v1/recipes/{$recipe->uuid}", $payload);

    $response->assertOk()
        ->assertJsonPath('data.name', 'Receta Modificada')
        ->assertJsonPath('data.latest_version.version', 2);

    $this->assertDatabaseHas('recipes', ['name' => 'Receta Modificada']);
    $this->assertDatabaseHas('recipe_versions', ['version' => 2]);
});
