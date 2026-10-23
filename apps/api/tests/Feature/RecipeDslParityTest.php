<?php

declare(strict_types=1);

use App\Enums\Role;
use App\Models\User;
use App\Models\Workspace;
use App\Services\DslValidator;
use Laravel\Sanctum\Sanctum;

function dslParityNode(string $id, string $type, array $params = []): array
{
    return [
        'id' => $id,
        'type' => $type,
        'description' => "Nodo {$id}",
        'params' => $params,
    ];
}

function dslParityRecipe(array $nodes, string $entry = 'node_1'): array
{
    return [
        'schema' => 'rpa/v1',
        'entry' => $entry,
        'nodes' => $nodes,
        'edges' => [],
    ];
}

it('acepta recetas con nodos scroll y webhook que antes rechazaba el JSON Schema', function () {
    $validator = app(DslValidator::class);

    $scroll = dslParityRecipe([
        'node_1' => dslParityNode('node_1', 'scroll', ['mode' => 'bottom']),
    ]);

    $webhook = dslParityRecipe([
        'node_1' => dslParityNode('node_1', 'webhook', ['httpMethod' => 'POST']),
    ]);

    expect($validator->validate($scroll))->toBe([])
        ->and($validator->validate($webhook))->toBe([]);
});

it('acepta un bloque tryCatch con referencias existentes', function () {
    $validator = app(DslValidator::class);

    $recipe = dslParityRecipe([
        'node_1' => [
            'id' => 'node_1',
            'type' => 'tryCatch',
            'description' => 'Bloque protegido',
            'params' => [
                'tryEntryNodeId' => 'try_1',
                'catchEntryNodeId' => 'catch_1',
                'finallyEntryNodeId' => 'finally_1',
                'rethrow' => false,
            ],
            'next' => 'cont',
        ],
        'try_1' => array_merge(
            dslParityNode('try_1', 'navigate', ['url' => 'https://example.com/try']),
            ['next' => 'cont'],
        ),
        'catch_1' => array_merge(
            dslParityNode('catch_1', 'navigate', ['url' => 'https://example.com/catch']),
            ['next' => 'cont'],
        ),
        'finally_1' => array_merge(
            dslParityNode('finally_1', 'navigate', ['url' => 'https://example.com/finally']),
            ['next' => 'cont'],
        ),
        'cont' => dslParityNode('cont', 'navigate', ['url' => 'https://example.com/cont']),
    ]);

    expect($validator->validate($recipe))->toBe([]);
});

it('rechaza un tryCatch con una rama inexistente', function () {
    $validator = app(DslValidator::class);

    $recipe = dslParityRecipe([
        'node_1' => [
            'id' => 'node_1',
            'type' => 'tryCatch',
            'description' => 'Bloque protegido',
            'params' => [
                'tryEntryNodeId' => 'try_1',
                'catchEntryNodeId' => 'missing_catch',
            ],
        ],
        'try_1' => dslParityNode('try_1', 'navigate', ['url' => 'https://example.com/try']),
    ]);

    $errors = $validator->validate($recipe);

    expect($errors)->not->toBeEmpty()
        ->and(implode("\n", $errors))->toContain('catchEntryNodeId')
        ->and(implode("\n", $errors))->toContain('missing_catch');
});

it('acepta la reconvergencia de ramas de una condición', function () {
    $validator = app(DslValidator::class);

    $recipe = dslParityRecipe([
        'node_1' => [
            'id' => 'node_1',
            'type' => 'condition',
            'description' => 'Condición',
            'params' => [
                'expression' => 'variables.ok',
                'thenNodeId' => 'then_1',
                'elseNodeId' => 'else_1',
            ],
            'next' => 'after',
        ],
        'then_1' => array_merge(
            dslParityNode('then_1', 'setVariable', ['name' => 'branch', 'expression' => "'then'"]),
            ['next' => 'after'],
        ),
        'else_1' => array_merge(
            dslParityNode('else_1', 'setVariable', ['name' => 'branch', 'expression' => "'else'"]),
            ['next' => 'after'],
        ),
        'after' => dslParityNode('after', 'navigate', ['url' => 'https://example.com/after']),
    ]);

    expect($validator->validate($recipe))->toBe([]);
});

it('rechaza ciclos y reingresos en las ramas de una condición', function () {
    $validator = app(DslValidator::class);

    $base = dslParityRecipe([
        'node_1' => [
            'id' => 'node_1',
            'type' => 'condition',
            'description' => 'Condición',
            'params' => [
                'expression' => 'variables.ok',
                'thenNodeId' => 'then_1',
                'elseNodeId' => 'else_1',
            ],
            'next' => 'after',
        ],
        'then_1' => array_merge(
            dslParityNode('then_1', 'setVariable', ['name' => 'branch', 'expression' => "'then'"]),
            ['next' => 'after'],
        ),
        'else_1' => array_merge(
            dslParityNode('else_1', 'setVariable', ['name' => 'branch', 'expression' => "'else'"]),
            ['next' => 'after'],
        ),
        'after' => dslParityNode('after', 'navigate', ['url' => 'https://example.com/after']),
    ]);

    $cycle = $base;
    $cycle['nodes']['then_1']['next'] = 'then_1';
    $cycleErrors = implode("\n", $validator->validate($cycle));

    $reentry = $base;
    $reentry['nodes']['else_1']['next'] = 'node_1';
    $reentryErrors = implode("\n", $validator->validate($reentry));

    expect($cycleErrors)->toContain("ciclo de 'next'")
        ->and($reentryErrors)->toContain('vuelve a entrar');
});

it('rechaza un ciclo de next dentro del cuerpo de un loop', function () {
    $validator = app(DslValidator::class);

    $recipe = dslParityRecipe([
        'node_1' => [
            'id' => 'node_1',
            'type' => 'loop',
            'description' => 'Iterar',
            'params' => [
                'collectionExpression' => 'variables.items',
                'itemVariable' => 'item',
                'bodyEntryNodeId' => 'body_1',
                'maxIterations' => 5,
            ],
            'next' => 'cont',
        ],
        'body_1' => array_merge(
            dslParityNode('body_1', 'setVariable', ['name' => 'total', 'expression' => 'total + item']),
            ['next' => 'body_1'],
        ),
        'cont' => dslParityNode('cont', 'setVariable', ['name' => 'done', 'expression' => 'true']),
    ]);

    expect(implode("\n", $validator->validate($recipe)))->toContain("ciclo de 'next'");
});

it('acepta un loop con un cuerpo existente y rechaza uno inexistente', function () {
    $validator = app(DslValidator::class);

    $valid = dslParityRecipe([
        'node_1' => [
            'id' => 'node_1',
            'type' => 'loop',
            'description' => 'Iterar',
            'params' => [
                'collectionExpression' => 'variables.items',
                'itemVariable' => 'item',
                'bodyEntryNodeId' => 'body_1',
                'maxIterations' => 5,
            ],
            'next' => 'cont',
        ],
        'body_1' => array_merge(
            dslParityNode('body_1', 'setVariable', ['name' => 'total', 'expression' => 'total + item']),
            ['next' => 'cont'],
        ),
        'cont' => dslParityNode('cont', 'setVariable', ['name' => 'done', 'expression' => 'true']),
    ]);

    $invalid = $valid;
    $invalid['nodes']['node_1']['params']['bodyEntryNodeId'] = 'missing_body';

    expect($validator->validate($valid))->toBe([]);

    $errors = $validator->validate($invalid);

    expect($errors)->not->toBeEmpty()
        ->and(implode("\n", $errors))->toContain('bodyEntryNodeId')
        ->and(implode("\n", $errors))->toContain('missing_body');
});

it('persiste vía API una receta con tryCatch, scroll y webhook', function () {    $user = User::factory()->create();
    $workspace = Workspace::create(['name' => 'Paridad', 'slug' => 'paridad']);
    $workspace->members()->attach($user->id, ['role' => Role::Owner->value]);
    $project = $workspace->projects()->create(['name' => 'Proyecto Paridad']);

    Sanctum::actingAs($user);

    $definition = dslParityRecipe([
        'nav' => array_merge(
            dslParityNode('nav', 'navigate', ['url' => 'https://example.com']),
            ['next' => 'tc'],
        ),
        'tc' => [
            'id' => 'tc',
            'type' => 'tryCatch',
            'description' => 'Bloque protegido',
            'params' => [
                'tryEntryNodeId' => 'scroll_1',
                'catchEntryNodeId' => 'webhook_1',
                'finallyEntryNodeId' => 'shot_1',
                'errorVariable' => 'error',
                'rethrow' => false,
            ],
            'next' => 'cont',
        ],
        'scroll_1' => array_merge(
            dslParityNode('scroll_1', 'scroll', ['mode' => 'bottom']),
            ['next' => 'cont'],
        ),
        'webhook_1' => array_merge(
            dslParityNode('webhook_1', 'webhook', ['httpMethod' => 'POST']),
            ['next' => 'cont'],
        ),
        'shot_1' => array_merge(
            dslParityNode('shot_1', 'screenshot', ['fullPage' => false]),
            ['next' => 'cont'],
        ),
        'cont' => dslParityNode('cont', 'setVariable', ['name' => 'listo', 'expression' => 'true']),
    ], 'nav');

    $response = $this->postJson("/api/v1/projects/{$project->uuid}/recipes", [
        'name' => 'Receta con tryCatch',
        'definition' => $definition,
    ]);

    $response->assertCreated()
        ->assertJsonPath('data.name', 'Receta con tryCatch');
});

it('rechaza la creación de una receta sin definition', function () {
    $user = User::factory()->create();
    $workspace = Workspace::create(['name' => 'Creación', 'slug' => 'creacion']);
    $workspace->members()->attach($user->id, ['role' => Role::Owner->value]);
    $project = $workspace->projects()->create(['name' => 'Proyecto Creación']);

    Sanctum::actingAs($user);

    $this->postJson("/api/v1/projects/{$project->uuid}/recipes", [
        'name' => 'Sin definición',
    ])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['definition']);

    expect($project->recipes()->count())->toBe(0);
});

it('crea una receta con el DSL inicial y la devuelve en el listado', function () {
    $user = User::factory()->create();
    $workspace = Workspace::create(['name' => 'Creación OK', 'slug' => 'creacion-ok']);
    $workspace->members()->attach($user->id, ['role' => Role::Owner->value]);
    $project = $workspace->projects()->create(['name' => 'Proyecto Creación OK']);

    Sanctum::actingAs($user);

    $definition = [
        'schema' => 'rpa/v1',
        'name' => 'Nueva Receta RPA',
        'entry' => 'step_navigate',
        'variables' => [],
        'nodes' => [
            'step_navigate' => [
                'id' => 'step_navigate',
                'type' => 'navigate',
                'description' => 'Navegar a la página web',
                'params' => ['url' => 'https://example.com', 'waitUntil' => 'domcontentloaded'],
                'next' => 'step_click',
            ],
            'step_click' => [
                'id' => 'step_click',
                'type' => 'click',
                'description' => 'Hacer clic en el botón principal',
                'locator' => [
                    'primary' => [
                        'strategy' => 'role',
                        'value' => "button[name='More information...']",
                        'score' => 90,
                    ],
                    'fallbacks' => [
                        ['strategy' => 'css', 'value' => "a[href*='iana.org']", 'score' => 70],
                    ],
                ],
                'params' => ['button' => 'left'],
            ],
        ],
        'edges' => [
            ['from' => 'step_navigate', 'to' => 'step_click'],
        ],
    ];

    $created = $this->postJson("/api/v1/projects/{$project->uuid}/recipes", [
        'name' => 'Nueva Receta RPA #1',
        'description' => 'Flujo determinista creado con el editor visual',
        'definition' => $definition,
    ]);

    $created->assertCreated()
        ->assertJsonPath('data.name', 'Nueva Receta RPA #1')
        ->assertJsonPath('data.latest_version.version', 1);

    $recipeId = $created->json('data.id');
    expect($recipeId)->toBeString()->not->toBeEmpty();

    $this->getJson("/api/v1/projects/{$project->uuid}/recipes")
        ->assertOk()
        ->assertJsonPath('data.0.id', $recipeId)
        ->assertJsonPath('data.0.name', 'Nueva Receta RPA #1');

    $this->getJson("/api/v1/recipes/{$recipeId}")
        ->assertOk()
        ->assertJsonPath('data.latest_version.definition.entry', 'step_navigate');
});
