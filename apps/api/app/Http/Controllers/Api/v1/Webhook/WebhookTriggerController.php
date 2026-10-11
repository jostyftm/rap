<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\v1\Webhook;

use App\Http\Controllers\Controller;
use App\Http\Resources\Run\RunResource;
use App\Models\Recipe;
use App\Services\RunService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Str;

class WebhookTriggerController extends Controller
{
    public function __construct(
        private RunService $runService
    ) {}

    /**
     * Endpoint público para disparar la ejecución de una receta vía webhook HTTP
     */
    public function trigger(Request $request, string $token): JsonResponse
    {
        /** @var Recipe $recipe */
        $recipe = Recipe::where('webhook_token', $token)
            ->where('webhook_enabled', true)
            ->first();

        if (! $recipe) {
            abort(Response::HTTP_NOT_FOUND, 'Token de webhook inválido o webhook deshabilitado.');
        }

        $parameters = $request->isJson() ? $request->json()->all() : $request->all();

        $run = $this->runService->dispatchDirect(
            recipe: $recipe,
            parameters: is_array($parameters) ? $parameters : [],
            trigger: 'webhook'
        );

        return (new RunResource($run))
            ->response()
            ->setStatusCode(Response::HTTP_ACCEPTED);
    }

    /**
     * Regenera el token de webhook o activa/desactiva el webhook de una receta
     */
    public function toggle(Request $request, Recipe $recipe): JsonResponse
    {
        $enabled = (bool) $request->input('enabled', true);
        $token = $recipe->webhook_token;

        if ($enabled && empty($token)) {
            $token = Str::random(48);
        }

        if (! empty($request->input('regenerate'))) {
            $token = Str::random(48);
        }

        $recipe->update([
            'webhook_token' => $token,
            'webhook_enabled' => $enabled,
        ]);

        return response()->json([
            'webhook_token' => $recipe->webhook_token,
            'webhook_enabled' => $recipe->webhook_enabled,
            'trigger_url' => url("/api/v1/webhooks/recipes/{$recipe->webhook_token}/trigger"),
        ]);
    }
}
