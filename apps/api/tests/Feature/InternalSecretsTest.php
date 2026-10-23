<?php

declare(strict_types=1);

use App\Models\Recipe;
use App\Models\Run;
use App\Models\User;
use App\Models\Workspace;
use App\Models\WorkspaceSecret;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;

/**
 * @param  list<string>  $declaredSecrets
 * @param  array<string,string>  $secretValues
 * @return array{run:Run,workspace:Workspace}
 */
function internalSecretFixture(array $declaredSecrets = ['PORTAL_PASSWORD'], array $secretValues = ['PORTAL_PASSWORD' => 'Sup3rS3cret!'], string $status = 'queued'): array
{
    $user = User::factory()->create();
    $workspace = Workspace::create(['name' => 'W', 'slug' => 'w-'.uniqid()]);
    $workspace->members()->attach($user->id, ['role' => 'owner']);
    $project = $workspace->projects()->create(['name' => 'P']);

    /** @var Recipe $recipe */
    $recipe = $project->recipes()->create(['name' => 'R', 'status' => 'active']);
    $recipe->versions()->create([
        'version' => 1,
        'definition' => [
            'schema' => 'rpa/v1',
            'secrets' => $declaredSecrets,
            'entry' => 'n1',
            'nodes' => [
                'n1' => [
                    'id' => 'n1',
                    'type' => 'navigate',
                    'params' => ['url' => 'https://example.test/{{secret.PORTAL_PASSWORD}}'],
                ],
            ],
        ],
    ]);

    /** @var Run $run */
    $run = Run::create([
        'recipe_version_id' => $recipe->latestVersion->id,
        'status' => $status,
        'trigger' => 'manual',
    ]);

    foreach ($secretValues as $key => $value) {
        WorkspaceSecret::create([
            'workspace_id' => $workspace->id,
            'key' => $key,
            'value' => $value,
        ]);
    }

    return ['run' => $run, 'workspace' => $workspace];
}

/**
 * @return array<string,string>
 */
function runnerSignatureHeaders(string $runUuid, ?int $timestamp = null, ?string $nonce = null, string $secret = 'test-internal-secret'): array
{
    $timestamp ??= time();
    $nonce ??= bin2hex(random_bytes(8));

    return [
        'X-RPA-Timestamp' => (string) $timestamp,
        'X-RPA-Nonce' => $nonce,
        'X-RPA-Signature' => hash_hmac('sha256', "{$runUuid}|{$timestamp}|{$nonce}", $secret),
    ];
}

beforeEach(function () {
    config(['rpa.internal.secret' => 'test-internal-secret']);
});

it('entrega solo los secretos declarados y solicitados', function () {
    ['run' => $run] = internalSecretFixture(
        ['PORTAL_PASSWORD'],
        ['PORTAL_PASSWORD' => 'Sup3rS3cret!', 'OTRO' => 'no-debe-salir']
    );

    $response = $this->withHeaders(runnerSignatureHeaders($run->uuid))
        ->postJson("/api/internal/v1/runs/{$run->uuid}/secrets", ['refs' => ['PORTAL_PASSWORD']]);

    $response->assertOk()
        ->assertExactJson(['secrets' => ['PORTAL_PASSWORD' => 'Sup3rS3cret!']]);

    expect($response->headers->get('Cache-Control'))->toContain('no-store');

    $this->assertDatabaseHas('audit_logs', [
        'action' => 'secret.access',
        'subject_type' => $run->getMorphClass(),
        'subject_id' => $run->getKey(),
    ]);
});

it('rechaza una firma inválida', function () {
    ['run' => $run] = internalSecretFixture();

    $this->withHeaders(runnerSignatureHeaders($run->uuid, secret: 'otro-secreto'))
        ->postJson("/api/internal/v1/runs/{$run->uuid}/secrets", ['refs' => ['PORTAL_PASSWORD']])
        ->assertUnauthorized();
});

it('rechaza una firma expirada', function () {
    ['run' => $run] = internalSecretFixture();

    $this->withHeaders(runnerSignatureHeaders($run->uuid, timestamp: time() - 120))
        ->postJson("/api/internal/v1/runs/{$run->uuid}/secrets", ['refs' => ['PORTAL_PASSWORD']])
        ->assertUnauthorized();
});

it('rechaza la reutilización del nonce', function () {
    ['run' => $run] = internalSecretFixture();
    $headers = runnerSignatureHeaders($run->uuid, nonce: 'nonce-repetido');

    $this->withHeaders($headers)
        ->postJson("/api/internal/v1/runs/{$run->uuid}/secrets", ['refs' => ['PORTAL_PASSWORD']])
        ->assertOk();

    $this->withHeaders($headers)
        ->postJson("/api/internal/v1/runs/{$run->uuid}/secrets", ['refs' => ['PORTAL_PASSWORD']])
        ->assertUnauthorized();
});

it('rechaza secretos que la receta no declara', function () {
    ['run' => $run] = internalSecretFixture(['PORTAL_PASSWORD'], ['PORTAL_PASSWORD' => 'x-value', 'OTRO' => 'y-value']);

    $this->withHeaders(runnerSignatureHeaders($run->uuid))
        ->postJson("/api/internal/v1/runs/{$run->uuid}/secrets", ['refs' => ['OTRO']])
        ->assertStatus(422);
});

it('rechaza cuando falta un secreto en el workspace', function () {
    ['run' => $run] = internalSecretFixture(['PORTAL_PASSWORD'], []);

    $this->withHeaders(runnerSignatureHeaders($run->uuid))
        ->postJson("/api/internal/v1/runs/{$run->uuid}/secrets", ['refs' => ['PORTAL_PASSWORD']])
        ->assertStatus(422);
});

it('rechaza resolver secretos de una ejecución finalizada', function () {
    ['run' => $run] = internalSecretFixture(status: 'completed');

    $this->withHeaders(runnerSignatureHeaders($run->uuid))
        ->postJson("/api/internal/v1/runs/{$run->uuid}/secrets", ['refs' => ['PORTAL_PASSWORD']])
        ->assertStatus(409);
});

it('falla cerrado si no hay secreto interno configurado', function () {
    ['run' => $run] = internalSecretFixture();
    config(['rpa.internal.secret' => '']);

    $this->withHeaders(runnerSignatureHeaders($run->uuid))
        ->postJson("/api/internal/v1/runs/{$run->uuid}/secrets", ['refs' => ['PORTAL_PASSWORD']])
        ->assertStatus(503);
});

it('cifra los secretos nuevos con xchacha20 y migra los heredados al leerlos', function () {
    ['workspace' => $workspace] = internalSecretFixture(['PORTAL_PASSWORD'], []);

    $secret = WorkspaceSecret::create([
        'workspace_id' => $workspace->id,
        'key' => 'LEGACY',
        'value' => 'valor-legacy',
    ]);

    expect(DB::table('workspace_secrets')->where('id', $secret->id)->value('value'))
        ->toStartWith('app:');

    // Simula un secreto cifrado con la implementación anterior (AES-256 vía Crypt).
    DB::table('workspace_secrets')->where('id', $secret->id)->update([
        'value' => Crypt::encryptString('valor-legacy'),
    ]);

    $secret->refresh();

    expect($secret->getDecryptedValue())->toBe('valor-legacy')
        ->and(DB::table('workspace_secrets')->where('id', $secret->id)->value('value'))
        ->toStartWith('app:');
});
