<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\v1\Recorder;

use App\Http\Controllers\Controller;
use App\Http\Requests\Recorder\RecorderStartRequest;
use App\Models\Recipe;
use App\Services\RecorderService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class RecorderController extends Controller
{
    public function __construct(
        private RecorderService $recorderService
    ) {}

    public function start(RecorderStartRequest $request, Recipe $recipe): JsonResponse
    {
        $validated = $request->validated();
        $mode = (string) ($validated['mode'] ?? 'browser');
        $initialUrl = isset($validated['initial_url']) ? (string) $validated['initial_url'] : null;
        $targetWindow = isset($validated['target_window']) ? (string) $validated['target_window'] : null;

        $sessionId = $this->recorderService->start($recipe, $initialUrl, $mode, $targetWindow);

        return response()->json([
            'session_id' => $sessionId,
            'recipe_id' => $recipe->uuid,
            'status' => 'recording',
            'mode' => $mode,
            'channel' => "recipe.{$recipe->uuid}",
        ], Response::HTTP_CREATED);
    }

    public function stop(Request $request, Recipe $recipe): JsonResponse
    {
        $sessionId = (string) $request->input('session_id', '');
        $this->recorderService->stop($recipe, $sessionId);

        return response()->json([
            'recipe_id' => $recipe->uuid,
            'status' => 'stopped',
        ]);
    }
}
