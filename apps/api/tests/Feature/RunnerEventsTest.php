<?php

declare(strict_types=1);

use App\Models\Run;
use App\Models\RunLog;
use App\Models\User;
use App\Models\Workspace;
use App\Models\WorkspaceSecret;
use App\Services\RunnerEventIngestor;

/**
 * @param  array<string,string>  $secrets
 */
function eventFixture(array $secrets = []): Run
{
    $user = User::factory()->create();
    $workspace = Workspace::create(['name' => 'W', 'slug' => 'we-'.uniqid()]);
    $workspace->members()->attach($user->id, ['role' => 'owner']);
    $project = $workspace->projects()->create(['name' => 'P']);
    $recipe = $project->recipes()->create(['name' => 'R', 'status' => 'active']);
    $recipe->versions()->create([
        'version' => 1,
        'definition' => [
            'schema' => 'rpa/v1',
            'secrets' => array_keys($secrets),
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

    foreach ($secrets as $key => $value) {
        WorkspaceSecret::create([
            'workspace_id' => $workspace->id,
            'key' => $key,
            'value' => $value,
        ]);
    }

    /** @var Run $run */
    $run = Run::create([
        'recipe_version_id' => $recipe->latestVersion->id,
        'status' => 'running',
        'trigger' => 'manual',
    ]);

    return $run;
}

it('deduplica eventos por id ULID', function () {
    $run = eventFixture();
    $ingestor = app(RunnerEventIngestor::class);

    $payload = [
        'id' => '01JEVENTDEDUPE0000000001',
        'event' => 'run.log',
        'run_id' => $run->uuid,
        'level' => 'info',
        'message' => 'solo una vez',
    ];

    expect($ingestor->ingest($payload))->toBeTrue()
        ->and($ingestor->ingest($payload))->toBeFalse();

    expect(RunLog::where('run_id', $run->id)->count())->toBe(1);
});

it('redacta los secretos del workspace antes de persistir logs', function () {
    $run = eventFixture(['PORTAL_PASSWORD' => 'Sup3rS3cret!']);

    app(RunnerEventIngestor::class)->ingest([
        'id' => '01JEVENTREDACT000000000001',
        'event' => 'run.log',
        'run_id' => $run->uuid,
        'level' => 'error',
        'message' => 'falló el login con Sup3rS3cret!',
        'context' => json_encode(['value' => 'Sup3rS3cret!']),
    ]);

    $log = RunLog::where('run_id', $run->id)->firstOrFail();

    expect($log->message)->toBe('falló el login con ***')
        ->and($log->context)->toBe(['value' => '***']);
});

it('no vuelve a finalizar una ejecución ya cerrada', function () {
    $run = eventFixture();
    $ingestor = app(RunnerEventIngestor::class);

    $ingestor->ingest([
        'id' => '01JEVENTFINISH00000000001',
        'event' => 'run.finished',
        'run_id' => $run->uuid,
        'status' => 'success',
        'duration_ms' => 100,
    ]);

    $ingestor->ingest([
        'id' => '01JEVENTFINISH00000000002',
        'event' => 'run.finished',
        'run_id' => $run->uuid,
        'status' => 'failed',
        'error' => 'no debe sobreescribir',
    ]);

    $run->refresh();

    expect($run->status)->toBe('completed')
        ->and($run->error_message)->toBeNull();
});
