<?php

declare(strict_types=1);

use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\WorkspaceController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function (): void {
    Route::middleware('throttle:10,1')->group(function (): void {
        Route::post('auth/register', [AuthController::class, 'register']);
        Route::post('auth/login', [AuthController::class, 'login']);
    });

    Route::middleware(['auth:sanctum', 'throttle:120,1'])->group(function (): void {
        Route::post('auth/logout', [AuthController::class, 'logout']);
        Route::get('auth/me', [AuthController::class, 'me']);

        Route::get('workspaces', [WorkspaceController::class, 'index']);
        Route::get('workspaces/{workspace}', [WorkspaceController::class, 'show']);
        Route::patch('workspaces/{workspace}', [WorkspaceController::class, 'update']);
        Route::get('workspaces/{workspace}/projects', [WorkspaceController::class, 'projects']);
        Route::post('workspaces/{workspace}/projects', [WorkspaceController::class, 'storeProject']);
        Route::delete('workspaces/{workspace}/projects/{project}', [WorkspaceController::class, 'destroyProject']);
    });
});
