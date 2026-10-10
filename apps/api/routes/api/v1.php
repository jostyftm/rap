<?php

declare(strict_types=1);

use App\Http\Controllers\Api\v1\Auth\AuthController;
use App\Http\Controllers\Api\v1\Project\ProjectController;
use App\Http\Controllers\Api\v1\Recipe\RecipeController;
use App\Http\Controllers\Api\v1\Run\RunController;
use App\Http\Controllers\Api\v1\Workspace\WorkspaceController;
use Illuminate\Support\Facades\Route;

// Rutas públicas de autenticación con rate limiting estricto
Route::middleware('throttle:10,1')->group(function (): void {
    Route::post('auth/register', [AuthController::class, 'register']);
    Route::post('auth/login', [AuthController::class, 'login']);
});

// Rutas protegidas por Sanctum SPA
Route::middleware(['auth:sanctum', 'throttle:120,1'])->group(function (): void {
    // Sesión
    Route::post('auth/logout', [AuthController::class, 'logout']);
    Route::get('auth/me', [AuthController::class, 'me']);

    // Workspaces
    Route::get('workspaces', [WorkspaceController::class, 'index']);
    Route::get('workspaces/{workspace}', [WorkspaceController::class, 'show']);
    Route::patch('workspaces/{workspace}', [WorkspaceController::class, 'update']);

    // Proyectos
    Route::get('workspaces/{workspace}/projects', [ProjectController::class, 'index']);
    Route::post('workspaces/{workspace}/projects', [ProjectController::class, 'store']);
    Route::delete('workspaces/{workspace}/projects/{project}', [ProjectController::class, 'destroy']);

    // Recetas
    Route::get('projects/{project}/recipes', [RecipeController::class, 'index']);
    Route::post('projects/{project}/recipes', [RecipeController::class, 'store']);
    Route::get('recipes/{recipe}', [RecipeController::class, 'show']);

    // Ejecuciones (Runs)
    Route::post('recipes/{recipe}/runs', [RunController::class, 'store']);
    Route::get('runs/{run}', [RunController::class, 'show']);
});
