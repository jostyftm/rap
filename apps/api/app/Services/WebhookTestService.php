<?php

declare(strict_types=1);

namespace App\Services;

use App\Events\WebhookTestReceived;
use App\Models\Recipe;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

class WebhookTestService
{
    private const TTL_SECONDS = 120;

    /**
     * Inicia una sesión de escucha efímera para un nodo webhook.
     *
     * @return array{listen_id: string, url: string, channel: string, expires_at: int}
     */
    public function listen(
        Recipe $recipe,
        string $nodeId,
        string $path,
        string $httpMethod,
        int $responseCode,
        ?string $responseBody
    ): array {
        $normalizedPath = $this->normalizePath($path);

        $pathKey = "webhook_test:path:{$normalizedPath}";
        $existing = Cache::get($pathKey);

        if ($existing && ($existing['recipe_uuid'] ?? null) !== $recipe->uuid) {
            throw new ConflictHttpException("La ruta '{$normalizedPath}' ya está siendo escuchada por otra receta.");
        }

        $listenId = Str::random(40);
        $expiresAt = now()->addSeconds(self::TTL_SECONDS)->timestamp;

        $sessionData = [
            'listen_id' => $listenId,
            'recipe_uuid' => $recipe->uuid,
            'node_id' => $nodeId,
            'path' => $normalizedPath,
            'http_method' => strtoupper($httpMethod),
            'response_code' => $responseCode,
            'response_body' => $responseBody ?? '{"ok":true}',
            'expires_at' => $expiresAt,
        ];

        Cache::put($pathKey, $sessionData, self::TTL_SECONDS);
        Cache::put("webhook_test:listen:{$listenId}", $normalizedPath, self::TTL_SECONDS);

        $url = url($normalizedPath);
        $channel = "webhook-test.{$listenId}";

        return [
            'listen_id' => $listenId,
            'url' => $url,
            'channel' => $channel,
            'expires_at' => $expiresAt,
        ];
    }

    /**
     * Detiene una sesión de escucha activa.
     */
    public function stop(Recipe $recipe, string $listenId): void
    {
        $listenKey = "webhook_test:listen:{$listenId}";
        $path = Cache::get($listenKey);

        if ($path) {
            $pathKey = "webhook_test:path:{$path}";
            $existing = Cache::get($pathKey);
            if ($existing && ($existing['recipe_uuid'] ?? null) === $recipe->uuid) {
                Cache::forget($pathKey);
            }
            Cache::forget($listenKey);
        }
    }

    /**
     * Intenta capturar una petición HTTP si existe una sesión de escucha activa para la ruta.
     * Retorna array con datos de respuesta o null si no hay sesión.
     *
     * @return array{response_code: int, response_body: string, method_match: bool}|null
     */
    public function capture(Request $request, string $rawPath): ?array
    {
        $normalizedPath = $this->normalizePath($rawPath);
        $pathKey = "webhook_test:path:{$normalizedPath}";

        $session = Cache::get($pathKey);
        if (! $session) {
            return null;
        }

        $expectedMethod = $session['http_method'] ?? 'POST';
        $requestMethod = strtoupper($request->method());

        if ($expectedMethod !== 'ANY' && $expectedMethod !== $requestMethod) {
            return [
                'response_code' => 405,
                'response_body' => json_encode(['error' => "Método no permitido. Se esperaba {$expectedMethod}."], JSON_UNESCAPED_SLASHES),
                'method_match' => false,
            ];
        }

        // Consumir la sesión (un solo uso)
        Cache::forget($pathKey);
        if (isset($session['listen_id'])) {
            Cache::forget("webhook_test:listen:{$session['listen_id']}");
        }

        $headers = collect($request->headers->all())->map(function ($value) {
            return is_array($value) && count($value) === 1 ? $value[0] : $value;
        })->all();

        $body = $request->isJson() ? $request->json()->all() : ($request->all() ?: $request->getContent());

        $payload = [
            'method' => $requestMethod,
            'path' => $normalizedPath,
            'headers' => $headers,
            'params' => [],
            'query' => $request->query(),
            'body' => $body,
            'timestamp' => now()->toIso8601String(),
        ];

        event(new WebhookTestReceived(
            listenId: $session['listen_id'],
            recipeUuid: $session['recipe_uuid'],
            nodeId: $session['node_id'],
            payload: $payload
        ));

        return [
            'response_code' => (int) ($session['response_code'] ?? 200),
            'response_body' => (string) ($session['response_body'] ?? '{"ok":true}'),
            'method_match' => true,
        ];
    }

    private function normalizePath(string $path): string
    {
        $clean = trim($path);
        if (! str_starts_with($clean, '/')) {
            $clean = '/'.$clean;
        }

        return rtrim($clean, '/');
    }
}
