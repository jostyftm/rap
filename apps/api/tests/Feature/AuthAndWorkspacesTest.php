<?php

declare(strict_types=1);

use App\Enums\Role;
use App\Models\User;
use App\Models\Workspace;
use Laravel\Sanctum\Sanctum;

beforeEach(fn () => $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class));

function registerPayload(array $override = []): array
{
    return array_merge([
        'name' => 'Ana Pérez',
        'email' => 'ana@example.com',
        'password' => 'correct-horse-battery',
        'password_confirmation' => 'correct-horse-battery',
    ], $override);
}

it('registers a user with a personal workspace as owner', function () {
    $this->postJson('/api/v1/auth/register', registerPayload())
        ->assertCreated()
        ->assertJsonPath('data.email', 'ana@example.com');

    $user = User::firstOrFail();
    expect($user->workspaces)->toHaveCount(1)
        ->and($user->workspaces->first()->pivot->role)->toBe('owner')
        ->and($user->uuid)->toBeString();
    $this->assertDatabaseHas('audit_logs', ['action' => 'user.registered']);
});

it('rejects weak passwords with RFC 9457 problem details', function () {
    $this->postJson('/api/v1/auth/register', registerPayload(['password' => 'short', 'password_confirmation' => 'short']))
        ->assertStatus(422)
        ->assertHeader('Content-Type', 'application/problem+json')
        ->assertJsonStructure(['type', 'title', 'status', 'errors' => ['password']]);
});

it('logs in and rejects bad credentials', function () {
    User::factory()->create(['email' => 'a@b.co', 'password' => 'secret-password-1']);

    $this->postJson('/api/v1/auth/login', ['email' => 'a@b.co', 'password' => 'nope'])->assertStatus(422);
    $this->postJson('/api/v1/auth/login', ['email' => 'a@b.co', 'password' => 'secret-password-1'])->assertOk();
});

it('requires authentication', function () {
    $this->getJson('/api/v1/workspaces')->assertUnauthorized()
        ->assertHeader('Content-Type', 'application/problem+json');
});

it('only lets members see a workspace and enforces roles', function () {
    $owner = User::factory()->create();
    $viewer = User::factory()->create();
    $outsider = User::factory()->create();
    $ws = Workspace::create(['name' => 'W', 'slug' => 'w']);
    $ws->members()->attach($owner->id, ['role' => Role::Owner->value]);
    $ws->members()->attach($viewer->id, ['role' => Role::Viewer->value]);

    Sanctum::actingAs($outsider);
    $this->getJson("/api/v1/workspaces/{$ws->uuid}")->assertForbidden();

    Sanctum::actingAs($viewer);
    $this->getJson("/api/v1/workspaces/{$ws->uuid}")->assertOk();
    $this->postJson("/api/v1/workspaces/{$ws->uuid}/projects", ['name' => 'P'])->assertForbidden();
    $this->patchJson("/api/v1/workspaces/{$ws->uuid}", ['name' => 'X'])->assertForbidden();

    Sanctum::actingAs($owner);
    $this->postJson("/api/v1/workspaces/{$ws->uuid}/projects", ['name' => 'P'])->assertCreated();
    $this->patchJson("/api/v1/workspaces/{$ws->uuid}", ['settings' => ['allowed_domains' => ['example.com']]])
        ->assertOk()->assertJsonPath('data.settings.allowed_domains.0', 'example.com');
    $this->getJson("/api/v1/workspaces/{$ws->uuid}/projects")->assertOk()->assertJsonCount(1, 'data');
});

it('sends security headers', function () {
    $this->getJson('/up')->assertHeader('X-Content-Type-Options', 'nosniff');
});
