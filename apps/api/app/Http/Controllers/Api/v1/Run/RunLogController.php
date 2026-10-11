<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\v1\Run;

use App\Http\Controllers\Controller;
use App\Models\Run;
use App\Models\RunLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RunLogController extends Controller
{
    /**
     * Consultar logs persistidos de una ejecución para depuración
     */
    public function index(Request $request, Run $run): JsonResponse
    {
        $query = RunLog::query()->where('run_id', $run->id);

        if ($request->filled('level')) {
            $query->where('level', $request->query('level'));
        }

        if ($request->filled('source')) {
            $query->where('source', $request->query('source'));
        }

        if ($request->filled('after_id')) {
            $query->where('id', '>', (int) $request->query('after_id'));
        }

        $logs = $query->orderBy('id', 'asc')
            ->limit((int) min(1000, max(1, (int) $request->query('limit', 200))))
            ->get();

        return response()->json([
            'data' => $logs->map(fn (RunLog $log) => [
                'id' => $log->id,
                'level' => $log->level,
                'source' => $log->source,
                'node_id' => $log->node_id,
                'message' => $log->message,
                'context' => $log->context,
                'logged_at' => $log->logged_at?->toIso8601String(),
            ]),
            'meta' => [
                'total' => $logs->count(),
                'run_id' => $run->uuid,
            ],
        ]);
    }
}
