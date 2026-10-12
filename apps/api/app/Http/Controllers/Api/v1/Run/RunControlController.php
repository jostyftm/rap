<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\v1\Run;

use App\Http\Controllers\Controller;
use App\Models\Run;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Redis;

class RunControlController extends Controller
{
    /**
     * Pausar, reanudar o detener una ejecución en vivo
     */
    public function control(Request $request, Run $run): JsonResponse
    {
        $validated = $request->validate([
            'action' => ['required', 'string', 'in:pause,resume,stop'],
        ]);

        $action = $validated['action'];
        $controlKey = "rpa:run:{$run->uuid}:control";

        try {
            Redis::setex($controlKey, 3600, $action);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'type' => 'about:blank',
                'title' => 'Error de control de ejecución',
                'status' => 500,
                'detail' => 'No se pudo comunicar el comando de control a Redis.',
            ], 500);
        }

        return response()->json([
            'status' => 'ok',
            'run_id' => $run->uuid,
            'action' => $action,
        ]);
    }
}
