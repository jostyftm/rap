<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\v1\Webhook;

use App\Http\Controllers\Controller;
use App\Http\Resources\Run\RunResource;
use App\Models\Recipe;
use App\Models\Run;
use App\Services\RunService;
use App\Services\WebhookResponseWaiter;
use App\Services\WebhookRunDelivery;
use App\Support\WebhookPath;
use App\Support\WebhookPayload;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response as SymfonyResponse;

class WebhookTriggerController extends Controller
{
    public function __construct(
        private RunService $runService,
        private WebhookRunDelivery $webhookRuns,
        private WebhookResponseWaiter $responseWaiter
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

        $payload = WebhookPayload::fromRequest($request);
        $body = is_array($payload['body']) ? $payload['body'] : [];

        // Si hay una ejecución esperando este webhook, la petición la alimenta
        // en lugar de crear un run nuevo (evita ejecutar el flujo dos veces).
        $waitingRunIds = $this->webhookRuns->deliverToRecipe($recipe, $payload);
        if ($waitingRunIds !== []) {
            $waitingRun = Run::query()->where('uuid', $waitingRunIds[0])->first();

            if ($waitingRun !== null) {
                return (new RunResource($waitingRun))
                    ->response()
                    ->setStatusCode(Response::HTTP_ACCEPTED);
            }
        }

        // El envelope `webhook` es la fuente principal del contexto; el cuerpo
        // también se expone en la raíz por retrocompatibilidad con {{campo}}.
        $parameters = ['webhook' => $payload] + $body;

        $run = $this->runService->dispatchDirect(
            recipe: $recipe,
            parameters: $parameters,
            trigger: 'webhook'
        );

        return (new RunResource($run))
            ->response()
            ->setStatusCode(Response::HTTP_ACCEPTED);
    }

    /**
     * Endpoint público siempre activo para recetas publicadas cuyo nodo inicial es un webhook (/api/v1/webhooks/{path}).
     */
    public function triggerByPath(Request $request, string $path): SymfonyResponse
    {
        $prodPath = WebhookPath::productionPath($path);
        $requestMethod = strtoupper($request->method());

        $candidates = Recipe::query()
            ->with(['publishedVersion', 'project'])
            ->where('status', 'active')
            ->whereNotNull('published_version_id')
            ->where('published_webhook_path', $prodPath)
            ->get();

        if ($candidates->isEmpty()) {
            $deliveredRunIds = $this->webhookRuns->deliverByPath($prodPath, $request, false);
            if ($deliveredRunIds !== []) {
                return response()->json([
                    'ok' => true,
                    'message' => 'Petición entregada a la ejecución en espera.',
                    'delivered_to_runs' => $deliveredRunIds,
                ]);
            }

            return response()->json([
                'type' => 'about:blank',
                'title' => 'Webhook no encontrado',
                'status' => Response::HTTP_NOT_FOUND,
                'detail' => 'No existe ninguna automatización publicada escuchando en esta ruta de webhook.',
            ], Response::HTTP_NOT_FOUND);
        }

        /** @var Recipe|null $recipe */
        $recipe = $candidates->first(function (Recipe $r) use ($requestMethod): bool {
            $expected = strtoupper((string) ($r->published_webhook_method ?? 'POST'));

            return $expected === 'ANY' || $expected === $requestMethod;
        });

        if (! $recipe) {
            $allowed = $candidates
                ->pluck('published_webhook_method')
                ->filter()
                ->map(fn ($m) => strtoupper((string) $m))
                ->unique()
                ->implode(', ');

            return response()->json([
                'error' => "Método no permitido. Se esperaba {$allowed}.",
            ], Response::HTTP_METHOD_NOT_ALLOWED, ['Allow' => $allowed]);
        }

        $payload = WebhookPayload::fromRequest($request, $prodPath);
        $body = is_array($payload['body']) ? $payload['body'] : [];
        $node = WebhookRunDelivery::entryWebhookNode((array) $recipe->publishedVersion?->definition);

        // Si ya hay un run de producción esperando este webhook, alimentarlo directamente
        $waitingRunIds = $this->webhookRuns->deliverToRecipe($recipe, $payload, [
            'method' => $requestMethod,
            'is_draft' => false,
        ]);

        if ($waitingRunIds !== []) {
            $runUuid = $waitingRunIds[0];
        } else {
            $outputVar = trim((string) ($node['params']['outputVariable'] ?? 'webhook')) ?: 'webhook';
            $parameters = ['webhook' => $payload]
                + ($outputVar !== 'webhook' ? [$outputVar => $payload] : [])
                + $body;

            $run = $this->runService->dispatchDirect(
                recipe: $recipe,
                parameters: $parameters,
                trigger: 'webhook',
                useDraft: false
            );
            $runUuid = $run->uuid;
        }

        $baseHeaders = [
            'X-RPA-Run-Id' => $runUuid,
            'X-RPA-Recipe-Version' => (string) ($recipe->publishedVersion?->version ?? ''),
        ];

        $responseMode = (string) ($node['params']['responseMode'] ?? 'immediate');
        $responseTimeoutMs = (int) ($node['params']['responseTimeoutMs'] ?? 30_000);

        if ($responseMode === 'lastNode' || $responseMode === 'respondNode') {
            return $this->responseWaiter->waitAndBuildResponse(
                runUuid: $runUuid,
                timeoutMs: $responseTimeoutMs,
                baseHeaders: $baseHeaders,
                workspaceId: $recipe->project?->workspace_id
            );
        }

        $rawCode = (int) ($node['params']['responseCode'] ?? 200);
        $statusCode = max(100, min(599, $rawCode));
        $rawBody = isset($node['params']['responseBody']) ? trim((string) $node['params']['responseBody']) : '';
        $responseBody = $rawBody !== ''
            ? $rawBody
            : (string) json_encode([
                'ok' => true,
                'run_id' => $runUuid,
                'status' => 'queued',
            ], JSON_UNESCAPED_SLASHES);

        $headers = [];
        $configuredHeaders = is_array($node['params']['responseHeaders'] ?? null)
            ? $node['params']['responseHeaders']
            : [];
        foreach ($configuredHeaders as $pair) {
            if (! is_array($pair) || ($pair['enabled'] ?? true) === false) {
                continue;
            }
            $hKey = trim((string) ($pair['key'] ?? ''));
            if ($hKey !== '') {
                $headers[$hKey] = (string) ($pair['value'] ?? '');
            }
        }
        $headers = array_merge($headers, $baseHeaders);

        if (json_validate($responseBody)) {
            $headers['Content-Type'] = 'application/json';
        }

        return response($responseBody, $statusCode, $headers);
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
