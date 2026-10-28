<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Recipe;
use App\Models\Run;
use Illuminate\Support\Facades\Redis;

/**
 * Registra y entrega peticiones a ejecuciones que están esperando un webhook.
 *
 * El runner espera la petición HTTP antes de lanzar el navegador. Para que la
 * petición llegue incluso si el runner todavía no arrancó, la API pre-registra
 * la espera en Redis al despachar el run. La entrega consiste en depositar el
 * envelope normalizado en la lista `rpa:run:{runId}:webhook`, que el runner
 * consume con `LPOP`.
 */
final class WebhookRunDelivery
{
    /** Espera por defecto en modo prueba (5 minutos). */
    private const DEFAULT_TEST_WAIT_MS = 300_000;

    /** TTL de la espera en producción; el runner lo refresca mientras espera. */
    private const PRODUCTION_TTL_SECONDS = 86_400;

    private const TEST_TTL_MARGIN_SECONDS = 60;

    /**
     * Pre-registra la espera de un run cuyo nodo principal es un webhook y que
     * no trae payload en los parámetros.
     *
     * @param  array<string, mixed>|null  $definition
     */
    public function registerWaitingRun(Run $run, ?array $definition = null): void
    {
        if (($run->parameters ?? []) !== []) {
            return;
        }

        $definition ??= (array) $run->recipeVersion?->definition;
        $node = self::entryWebhookNode($definition);

        if ($node === null) {
            return;
        }

        $recipeId = $run->recipeVersion?->recipe?->uuid;
        if (! $recipeId) {
            return;
        }

        $trigger = (string) ($run->trigger ?? 'manual');
        $timeoutMs = $this->resolveTimeoutMs($node, $trigger);
        $ttl = $this->resolveTtl($timeoutMs);

        $meta = json_encode([
            'run_id' => $run->uuid,
            'recipe_id' => $recipeId,
            'node_id' => (string) ($node['id'] ?? ''),
            'method' => strtoupper((string) ($node['params']['httpMethod'] ?? 'POST')),
            'path' => (string) ($node['params']['path'] ?? '/webhook'),
            'trigger' => $trigger,
            'created_at' => now()->toIso8601String(),
            'timeout_ms' => $timeoutMs,
        ], JSON_UNESCAPED_SLASHES);

        if ($meta === false) {
            return;
        }

        try {
            Redis::set($this->waitingKey($run->uuid), $meta, 'EX', $ttl);
            Redis::hset($this->indexKey($recipeId), $run->uuid, $meta);
            Redis::expire($this->indexKey($recipeId), $ttl);

            $norm = self::normalizePath((string) ($node['params']['path'] ?? '/webhook'));
            if ($norm !== '') {
                Redis::hset($this->pathIndexKey($norm), $run->uuid, $meta);
                Redis::expire($this->pathIndexKey($norm), $ttl);

                $alt = self::alternatePath($norm);
                if ($alt !== '' && $alt !== $norm) {
                    Redis::hset($this->pathIndexKey($alt), $run->uuid, $meta);
                    Redis::expire($this->pathIndexKey($alt), $ttl);
                }
            }
        } catch (\Throwable $e) {
            // Sin Redis la ejecución sigue su curso; el runner registrará la
            // espera por su cuenta cuando arranque.
            report($e);
        }
    }

    /**
     * Entrega un payload a todas las ejecuciones de la receta que estén
     * esperando el webhook.
     *
     * @param  array<string, mixed>  $payload
     * @param  array{node_id?: string|null, path?: string|null, method?: string|null}  $filters
     * @return list<string> UUIDs de los runs a los que se entregó el payload
     */
    public function deliverToRecipe(Recipe $recipe, array $payload, array $filters = []): array
    {
        try {
            $waiting = Redis::hgetall($this->indexKey($recipe->uuid));
        } catch (\Throwable $e) {
            report($e);

            return [];
        }

        if (! is_array($waiting) || $waiting === []) {
            return [];
        }

        $encoded = json_encode($payload, JSON_UNESCAPED_SLASHES);
        if ($encoded === false) {
            return [];
        }

        $delivered = [];

        foreach ($waiting as $runId => $rawMeta) {
            if (! is_string($runId) || $runId === '') {
                continue;
            }

            $meta = is_string($rawMeta) ? json_decode($rawMeta, true) : null;
            if (! is_array($meta)) {
                continue;
            }

            if (! $this->matches($meta, $filters)) {
                continue;
            }

            try {
                Redis::rpush($this->payloadKey($runId), $encoded);
                Redis::expire($this->payloadKey($runId), $this->resolveTtl(
                    isset($meta['timeout_ms']) && is_numeric($meta['timeout_ms'])
                        ? (int) $meta['timeout_ms']
                        : null
                ));
                $delivered[] = $runId;
            } catch (\Throwable $e) {
                report($e);
            }
        }

        return $delivered;
    }

    public function isWaiting(Run $run): bool
    {
        try {
            return (bool) Redis::exists($this->waitingKey($run->uuid));
        } catch (\Throwable) {
            return false;
        }
    }

    /**
     * Entrega un payload a las ejecuciones que estén esperando por una ruta específica
     * de webhook (usado por la captura de peticiones enviadas a /api/v1/webhooks/{path}).
     *
     * @return list<string> UUIDs de los runs a los que se entregó el payload
     */
    public function deliverByPath(string $rawPath, \Illuminate\Http\Request $request): array
    {
        $normalizedPath = self::normalizePath($rawPath);
        $payload = \App\Support\WebhookPayload::fromRequest($request, $normalizedPath);
        $method = strtoupper($request->method());

        $candidates = array_unique(array_filter([
            $normalizedPath,
            self::alternatePath($normalizedPath),
        ]));

        $delivered = [];

        foreach ($candidates as $cand) {
            try {
                $waiting = Redis::hgetall($this->pathIndexKey($cand));
            } catch (\Throwable $e) {
                report($e);
                continue;
            }

            if (! is_array($waiting) || $waiting === []) {
                continue;
            }

            $encoded = json_encode($payload, JSON_UNESCAPED_SLASHES);
            if ($encoded === false) {
                continue;
            }

            foreach ($waiting as $runId => $rawMeta) {
                if (! is_string($runId) || $runId === '' || in_array($runId, $delivered, true)) {
                    continue;
                }

                $meta = is_string($rawMeta) ? json_decode($rawMeta, true) : null;
                if (! is_array($meta)) {
                    continue;
                }

                if (! $this->matches($meta, ['method' => $method])) {
                    continue;
                }

                try {
                    Redis::rpush($this->payloadKey($runId), $encoded);
                    Redis::expire($this->payloadKey($runId), $this->resolveTtl(
                        isset($meta['timeout_ms']) && is_numeric($meta['timeout_ms'])
                            ? (int) $meta['timeout_ms']
                            : null
                    ));
                    $delivered[] = $runId;
                } catch (\Throwable $e) {
                    report($e);
                }
            }
        }

        return $delivered;
    }

    /**
     * @param  array<string, mixed>  $definition
     * @return array<string, mixed>|null
     */
    public static function entryWebhookNode(array $definition): ?array
    {
        $entry = $definition['entry'] ?? null;
        $nodes = $definition['nodes'] ?? null;

        if (! is_string($entry) || ! is_array($nodes) || ! isset($nodes[$entry]) || ! is_array($nodes[$entry])) {
            return null;
        }

        return ($nodes[$entry]['type'] ?? null) === 'webhook' ? $nodes[$entry] : null;
    }

    /**
     * @param  array<string, mixed>  $meta
     * @param  array{node_id?: string|null, path?: string|null, method?: string|null}  $filters
     */
    private function matches(array $meta, array $filters): bool
    {
        $nodeId = $filters['node_id'] ?? null;
        if (is_string($nodeId) && $nodeId !== '' && ($meta['node_id'] ?? null) !== $nodeId) {
            return false;
        }

        $path = $filters['path'] ?? null;
        if ($nodeId === null && is_string($path) && $path !== '') {
            if (self::normalizePath((string) ($meta['path'] ?? '')) !== self::normalizePath($path)) {
                return false;
            }
        }

        $method = $filters['method'] ?? null;
        $expected = strtoupper((string) ($meta['method'] ?? 'POST'));
        if (is_string($method) && $method !== '' && $expected !== 'ANY' && $expected !== strtoupper($method)) {
            return false;
        }

        return true;
    }

    /**
     * @param  array<string, mixed>  $node
     */
    private function resolveTimeoutMs(array $node, string $trigger): ?int
    {
        if ($trigger !== 'manual') {
            return null;
        }

        $timeout = $node['timeout'] ?? null;

        return is_numeric($timeout) && (int) $timeout > 0
            ? (int) $timeout
            : self::DEFAULT_TEST_WAIT_MS;
    }

    private function resolveTtl(?int $timeoutMs): int
    {
        if ($timeoutMs === null) {
            return self::PRODUCTION_TTL_SECONDS;
        }

        return max(60, (int) ceil($timeoutMs / 1000) + self::TEST_TTL_MARGIN_SECONDS);
    }

    private static function normalizePath(string $path): string
    {
        $clean = trim($path);

        if ($clean === '') {
            return '';
        }

        if (! str_starts_with($clean, '/')) {
            $clean = '/'.$clean;
        }

        return rtrim($clean, '/');
    }

    private function waitingKey(string $runId): string
    {
        return "rpa:run:{$runId}:waiting";
    }

    private function payloadKey(string $runId): string
    {
        return "rpa:run:{$runId}:webhook";
    }

    private function indexKey(string $recipeId): string
    {
        return "rpa:recipe:{$recipeId}:waiting";
    }

    private function pathIndexKey(string $path): string
    {
        return "rpa:webhook:path:{$path}:waiting";
    }

    private static function alternatePath(string $path): string
    {
        if (str_starts_with($path, '/api/v1/webhooks/')) {
            return '/' . substr($path, strlen('/api/v1/webhooks/'));
        }

        if (str_starts_with($path, '/api/v1/webhooks')) {
            return '/';
        }

        return '/api/v1/webhooks' . $path;
    }
}
