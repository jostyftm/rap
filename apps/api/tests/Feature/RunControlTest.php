<?php

declare(strict_types=1);

use App\Models\Run;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Support\Facades\Redis;
use Laravel\Sanctum\Sanctum;

beforeEach(function () {
    $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
});

function controlFixture(string $status = 'paused'): Run
{
    $user = User::factory()->create();
    $workspace = Workspace::create(['name' => 'W', 'slug' => 'w-'.uniqid()]);
    $workspace->members()->attach($user->id, ['role' => 'owner']);
    $project = $workspace->projects()->create(['name' => 'P']);
    $recipe = $project->recipes()->create(['name' => 'R', 'status' => 'active']);
    $v1 = $recipe->versions()->create([
        'version' => 1,
        'definition' => [
            'schema' => 'rpa/v1',
            'entry' => 'n1',
            'nodes' => [
                'n1' => [
                    'id' => 'n1',
                    'type' => 'navigate',
                    'params' => ['url' => 'https://example.test'],
                ],
            ],
        ],
    ]);
    $recipe->update(['published_version_id' => $v1->id]);

    Sanctum::actingAs($user);

    /** @var Run $run */
    $run = Run::create([
        'recipe_version_id' => $v1->id,
        'status' => $status,
        'trigger' => 'manual',
    ]);

    return $run;
}

it('solo permite avanzar un paso cuando la ejecución está pausada', function () {
    $run = controlFixture('running');

    $this->postJson("/api/v1/runs/{$run->uuid}/control", ['action' => 'step'])
        ->assertStatus(422);
});

it('envía el comando step al runner cuando la ejecución está pausada', function () {
    $run = controlFixture('paused');

    Redis::shouldReceive('setex')
        ->once()
        ->with("rpa:run:{$run->uuid}:control", 3600, 'step')
        ->andReturn(true);

    $this->postJson("/api/v1/runs/{$run->uuid}/control", ['action' => 'step'])
        ->assertOk()
        ->assertJsonPath('action', 'step');
});
