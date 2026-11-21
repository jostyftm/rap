<?php

declare(strict_types=1);

use App\Models\Recipe;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request as HttpClientRequest;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;

beforeEach(function () {
    $this->user = User::factory()->create();
    $this->workspace = Workspace::create(['name' => 'WS Screencast', 'slug' => 'ws-sc-'.uniqid()]);
    $this->workspace->members()->attach($this->user->id, ['role' => 'owner']);
    $this->project = $this->workspace->projects()->create(['name' => 'Project']);
    $this->recipe = $this->project->recipes()->create(['name' => 'Recipe YouTube']);
});

it('inicia sesión screencast en el runner reenviando url, recipe_id y dimensiones de viewport', function () {
    Sanctum::actingAs($this->user);

    Http::fake([
        '*/live/screencast' => Http::response([
            'session_id' => 'sc_abc123def456',
            'ws_token' => 'tok_123456',
            'ws_path' => '/live/ws/sc_abc123def456?token=tok_123456',
            'ws_port' => 8085,
            'ws_url' => 'ws://localhost:8085/live/ws/sc_abc123def456?token=tok_123456',
            'origin' => 'https://www.youtube.com',
            'viewport' => ['width' => 1280, 'height' => 800],
        ], 201),
    ]);

    $response = $this->postJson("/api/v1/recipes/{$this->recipe->uuid}/live/screencast", [
        'url' => 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        'width' => 1280,
        'height' => 800,
    ]);

    $response->assertCreated()
        ->assertJson([
            'session_id' => 'sc_abc123def456',
            'ws_token' => 'tok_123456',
            'ws_path' => '/live/ws/sc_abc123def456?token=tok_123456',
            'ws_port' => 8085,
            'origin' => 'https://www.youtube.com',
            'viewport' => ['width' => 1280, 'height' => 800],
        ]);

    Http::assertSent(function (HttpClientRequest $req) {
        return str_ends_with($req->url(), '/live/screencast')
            && $req->hasHeader('x-rpa-live-token', (string) config('rpa.live.token'))
            && $req['url'] === 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
            && $req['recipe_id'] === $this->recipe->uuid
            && $req['width'] === 1280
            && $req['height'] === 800;
    });
});

it('valida URL y dimensiones fuera de rango con HTTP 422', function () {
    Sanctum::actingAs($this->user);

    $this->postJson("/api/v1/recipes/{$this->recipe->uuid}/live/screencast", [
        'url' => 'not-a-valid-url',
    ])->assertStatus(422)->assertJsonValidationErrors(['url']);

    $this->postJson("/api/v1/recipes/{$this->recipe->uuid}/live/screencast", [
        'url' => 'https://www.youtube.com',
        'width' => 100,
        'height' => 9999,
    ])->assertStatus(422)->assertJsonValidationErrors(['width', 'height']);
});

it('devuelve 503 Problem Details si el runner de screencast no está disponible', function () {
    Sanctum::actingAs($this->user);

    Http::fake(function () {
        throw new ConnectionException('Connection refused');
    });

    $response = $this->postJson("/api/v1/recipes/{$this->recipe->uuid}/live/screencast", [
        'url' => 'https://www.youtube.com',
    ]);

    $response->assertStatus(503)
        ->assertJson([
            'type' => 'about:blank',
            'title' => 'Runner no disponible',
            'status' => 503,
        ]);
});

it('detiene la sesión screencast mediante live/stop', function () {
    Sanctum::actingAs($this->user);

    Http::fake([
        '*/live/sessions/sc_abc123def456' => Http::response(['ok' => true], 200),
    ]);

    $response = $this->postJson("/api/v1/recipes/{$this->recipe->uuid}/live/stop", [
        'session_id' => 'sc_abc123def456',
    ]);

    $response->assertOk()->assertJson(['status' => 'stopped']);

    Http::assertSent(function (HttpClientRequest $req) {
        return $req->method() === 'DELETE'
            && str_ends_with($req->url(), '/live/sessions/sc_abc123def456');
    });
});
