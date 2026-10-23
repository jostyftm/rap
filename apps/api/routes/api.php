<?php

declare(strict_types=1);

use App\Http\Controllers\Internal\RunSecretsController;
use App\Http\Middleware\VerifyRunnerSignature;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(base_path('routes/api/v1.php'));

/*
| Endpoints internos consumidos por el Runner. No usan Sanctum: se autentican
| con firma HMAC de corta duración (RPA_INTERNAL_SECRET).
*/
Route::prefix('internal/v1')
    ->middleware([VerifyRunnerSignature::class, 'throttle:120,1'])
    ->group(function (): void {
        Route::post('runs/{run}/secrets', [RunSecretsController::class, 'show']);
    });
