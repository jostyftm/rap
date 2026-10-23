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

it('persiste vía API una receta con tryCatch, scroll y webhook', function () {
    $user = User::factory()->create();
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
