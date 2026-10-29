<?php

declare(strict_types=1);

use App\Http\Controllers\Api\v1\Auth\AuthController;
use App\Http\Controllers\Api\v1\Live\LiveSessionController;
use App\Http\Controllers\Api\v1\Project\ProjectController;
use App\Http\Controllers\Api\v1\Recipe\RecipeController;
use App\Http\Controllers\Api\v1\Recipe\RecipeExportController;
use App\Http\Controllers\Api\v1\Recorder\RecorderController;
use App\Http\Controllers\Api\v1\Run\RunControlController;
use App\Http\Controllers\Api\v1\Run\RunController;
use App\Http\Controllers\Api\v1\Run\RunLogController;
use App\Http\Controllers\Api\v1\Schedule\RecipeScheduleController;
use App\Http\Controllers\Api\v1\Secret\WorkspaceSecretController;
use App\Http\Controllers\Api\v1\Webhook\WebhookTestController;
use App\Http\Controllers\Api\v1\Webhook\WebhookTriggerController;
use App\Http\Controllers\Api\v1\Workspace\WorkspaceController;
use Illuminate\Support\Facades\Route;

// Rutas públicas de autenticación con rate limiting estricto
Route::middleware('throttle:10,1')->group(function (): void {
    Route::post('auth/register', [AuthController::class, 'register']);
    Route::post('auth/login', [AuthController::class, 'login']);
});

// Ruta pública de trigger vía Webhook
Route::post('webhooks/recipes/{token}/trigger', [WebhookTriggerController::class, 'trigger'])
    ->middleware('throttle:30,1');

// Captura de peticiones de prueba enviadas a la URL del webhook en diseño
Route::match(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], 'webhooks/{path}', [WebhookTestController::class, 'capture'])
    ->where('path', '^(?!recipes/).+')
    ->middleware('throttle:60,1');

// Rutas protegidas por Sanctum SPA
Route::middleware(['auth:sanctum', 'throttle:120,1'])->group(function (): void {
    // Sesión
    Route::post('auth/logout', [AuthController::class, 'logout']);
    Route::get('auth/me', [AuthController::class, 'me']);

    // Workspaces
    Route::get('workspaces', [WorkspaceController::class, 'index']);
    Route::get('workspaces/{workspace}', [WorkspaceController::class, 'show']);
    Route::patch('workspaces/{workspace}', [WorkspaceController::class, 'update']);

    // Secretos del Workspace (cifrado AES-256)
    Route::get('workspaces/{workspace}/secrets', [WorkspaceSecretController::class, 'index']);
    Route::post('workspaces/{workspace}/secrets', [WorkspaceSecretController::class, 'store']);
    Route::delete('workspaces/{workspace}/secrets/{secret}', [WorkspaceSecretController::class, 'destroy']);

    // Proyectos
    Route::get('workspaces/{workspace}/projects', [ProjectController::class, 'index']);
    Route::post('workspaces/{workspace}/projects', [ProjectController::class, 'store']);
    Route::delete('workspaces/{workspace}/projects/{project}', [ProjectController::class, 'destroy']);

    // Recetas
    Route::get('projects/{project}/recipes', [RecipeController::class, 'index']);
    Route::post('projects/{project}/recipes', [RecipeController::class, 'store']);
    Route::get('recipes/{recipe}', [RecipeController::class, 'show']);
    Route::put('recipes/{recipe}', [RecipeController::class, 'update']);
    Route::get('recipes/{recipe}/export/playwright', [RecipeExportController::class, 'export']);

    // Programación de Recetas (Cron Schedules)
    Route::get('recipes/{recipe}/schedules', [RecipeScheduleController::class, 'index']);
    Route::post('recipes/{recipe}/schedules', [RecipeScheduleController::class, 'store']);
    Route::patch('schedules/{schedule}', [RecipeScheduleController::class, 'update']);
    Route::delete('schedules/{schedule}', [RecipeScheduleController::class, 'destroy']);
    Route::post('schedules/{schedule}/toggle', [RecipeScheduleController::class, 'toggle']);

    // Webhooks de Recetas (Configuración de token)
    Route::post('recipes/{recipe}/webhook/toggle', [WebhookTriggerController::class, 'toggle']);
    Route::post('recipes/{recipe}/webhook-test/listen', [WebhookTestController::class, 'listen']);
    Route::delete('recipes/{recipe}/webhook-test/{listenId}', [WebhookTestController::class, 'stop']);

    // Grabador de Acciones en Vivo (Recorder)
    Route::post('recipes/{recipe}/recorder/start', [RecorderController::class, 'start']);
    Route::post('recipes/{recipe}/recorder/stop', [RecorderController::class, 'stop']);

    // Sitio en Vivo (proxy embebido / Chromium externo)
    Route::post('recipes/{recipe}/live/start', [LiveSessionController::class, 'start']);
    Route::post('recipes/{recipe}/live/external', [LiveSessionController::class, 'external']);
    Route::post('recipes/{recipe}/live/command', [LiveSessionController::class, 'command']);
    Route::post('recipes/{recipe}/live/stop', [LiveSessionController::class, 'stop']);

    // Ejecuciones (Runs)
    Route::post('recipes/{recipe}/runs', [RunController::class, 'store']);
    Route::get('runs/{run}', [RunController::class, 'show']);
    Route::post('runs/{run}/control', [RunControlController::class, 'control']);
    Route::get('runs/{run}/logs', [RunLogController::class, 'index']);
});
