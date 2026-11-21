<?php

declare(strict_types=1);

use App\Enums\Role;
use App\Models\Recipe;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Http\Client\Request as ClientRequest;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;

function createRecipeForHttpTest(Workspace $workspace): Recipe
{
    $project = $workspace->projects()->create(['name' => 'Proyecto HTTP']);

    return Recipe::create([
        'project_id' => $project->id,
        'name' => 'Receta HTTP Test',
        'status' => 'draft',
    ]);
}

beforeEach(function () {
    $this->user = User::factory()->create();
    $this->workspace = Workspace::create(['name' => 'HTTP Test WS', 'slug' => 'http-ws-'.uniqid()]);
    $this->workspace->members()->attach($this->user->id, ['role' => Role::Owner->value]);
    $this->recipe = createRecipeForHttpTest($this->workspace);

    Sanctum::actingAs($this->user);
});

it('ejecuta petición HTTP de prueba interpolando secretos y redactando valores sensibles en la respuesta', function () {
    $this->workspace->secrets()->create([
        'key' => 'CRM_API_KEY',
        'value' => 'secret-crm-key-xyz',
    ]);

    Http::fake([
        'https://api.example.com/*' => Http::response([
            'receivedAuth' => 'secret-crm-key-xyz',
            'items' => [1, 2, 3],
        ], 200, [
            'Content-Type' => 'application/json',
            'X-Echo-Secret' => 'secret-crm-key-xyz',
        ]),
    ]);

    $res = $this->postJson("/api/v1/recipes/{$this->recipe->uuid}/http-test", [
        'method' => 'POST',
        'url' => 'https://api.example.com/v1/users/:userId',
        'pathParams' => [
            ['key' => 'userId', 'value' => 'u_55', 'enabled' => true],
        ],
        'queryParams' => [
            ['key' => 'expand', 'value' => 'orders', 'enabled' => true],
        ],
        'headers' => [
            ['key' => 'X-Client', 'value' => 'rpa-studio', 'enabled' => true],
        ],
        'auth' => [
            'type' => 'bearer',
            'token' => '{{secret.CRM_API_KEY}}',
        ],
        'bodyType' => 'json',
        'bodyJson' => '{"active":true}',
        'responseType' => 'auto',
    ])->assertOk();

    Http::assertSent(function (ClientRequest $req): bool {
        return $req->method() === 'POST'
            && $req->url() === 'https://api.example.com/v1/users/u_55?expand=orders'
            && $req->hasHeader('Authorization', 'Bearer secret-crm-key-xyz')
            && $req->hasHeader('X-Client', 'rpa-studio')
            && $req->body() === '{"active":true}';
    });

    expect($res->json('ok'))->toBeTrue()
        ->and($res->json('output.status'))->toBe(200)
        ->and($res->json('output.data.items'))->toEqual([1, 2, 3])
        ->and($res->json('output.data.receivedAuth'))->toBe('***')
        ->and($res->json('output.headers.x-echo-secret'))->toBe('***');
});

it('soporta formUrlEncoded, responseType=binary y bloquea usuarios ajenos al workspace', function () {
    Http::fake([
        'https://files.example.com/export' => Http::response('%PDF-BINARY', 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'attachment; filename="export.pdf"',
        ]),
    ]);

    $binRes = $this->postJson("/api/v1/recipes/{$this->recipe->uuid}/http-test", [
        'method' => 'POST',
        'url' => 'https://files.example.com/export',
        'bodyType' => 'formUrlEncoded',
        'bodyForm' => [
            ['key' => 'format', 'value' => 'pdf', 'enabled' => true],
        ],
        'responseType' => 'binary',
    ])->assertOk();

    expect($binRes->json('output.responseType'))->toBe('binary')
        ->and($binRes->json('output.data.contentType'))->toBe('application/pdf')
        ->and($binRes->json('output.data.filename'))->toBe('export.pdf')
        ->and(base64_decode((string) $binRes->json('output.data.base64')))->toBe('%PDF-BINARY');

    $intruder = User::factory()->create();
    Sanctum::actingAs($intruder);

    $this->postJson("/api/v1/recipes/{$this->recipe->uuid}/http-test", [
        'method' => 'GET',
        'url' => 'https://files.example.com/export',
    ])->assertForbidden();
});
