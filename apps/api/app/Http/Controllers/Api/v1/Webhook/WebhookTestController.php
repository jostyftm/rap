<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\v1\Webhook;

use App\Http\Controllers\Controller;
use App\Http\Requests\Webhook\WebhookTestListenRequest;
use App\Models\Recipe;
use App\Services\WebhookTestService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class WebhookTestController extends Controller
{
    public function __construct(
        private WebhookTestService $webhookTestService
    ) {}

    /**
     * Inicia una sesión de escucha efímera para probar el webhook en tiempo real
     */
    public function listen(WebhookTestListenRequest $request, Recipe $recipe): JsonResponse
    {
        $validated = $request->validated();

        $session = $this->webhookTestService->listen(
            recipe: $recipe,
            nodeId: $validated['node_id'],
            path: $validated['path'],
            httpMethod: $validated['http_method'],
            responseCode: (int) ($validated['response_code'] ?? 200),
            responseBody: $validated['response_body'] ?? null
        );

        return response()->json($session, Response::HTTP_CREATED);
    }

    /**
     * Cancela la sesión de escucha activa
     */
    public function stop(Recipe $recipe, string $listenId): Response
    {
        $this->webhookTestService->stop($recipe, $listenId);

        return response()->noContent();
    }

    /**
     * Endpoint público que recibe las peticiones de prueba enviadas a la URL del webhook
     */
    public function capture(Request $request, string $path): Response|JsonResponse
    {
        $result = $this->webhookTestService->capture($request, '/api/v1/webhooks/'.$path);

        if (! $result) {
            return response()->json([
                'type' => 'about:blank',
                'title' => 'Webhook no encontrado',
                'status' => Response::HTTP_NOT_FOUND,
                'detail' => 'No hay ninguna sesión de escucha activa para esta ruta de webhook.',
            ], Response::HTTP_NOT_FOUND);
        }

        $headers = [];
        $body = $result['response_body'];
        if (json_validate($body)) {
            $headers['Content-Type'] = 'application/json';
        }

        return response($body, $result['response_code'], $headers);
    }
}
