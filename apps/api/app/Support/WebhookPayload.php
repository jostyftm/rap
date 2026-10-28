<?php

declare(strict_types=1);

namespace App\Support;

use Illuminate\Http\Request;

final class WebhookPayload
{
    /**
     * Normaliza una petición HTTP al payload que consumen los nodos webhook del
     * runner y la escucha de prueba del editor.
     *
     * @return array{
     *     method: string,
     *     path: string,
     *     headers: array<string, mixed>,
     *     params: array<string, mixed>,
     *     query: array<string, mixed>,
     *     body: mixed,
     *     timestamp: string
     * }
     */
    public static function fromRequest(Request $request, ?string $path = null): array
    {
        $headers = collect($request->headers->all())
            ->map(function ($value) {
                return is_array($value) && count($value) === 1 ? $value[0] : $value;
            })
            ->all();

        $body = $request->isJson()
            ? $request->json()->all()
            : ($request->all() ?: $request->getContent());

        return [
            'method' => strtoupper($request->method()),
            'path' => self::normalizePath($path ?? $request->path()),
            'headers' => $headers,
            'params' => [],
            'query' => $request->query(),
            'body' => $body,
            'timestamp' => now()->toIso8601String(),
        ];
    }

    public static function normalizePath(string $path): string
    {
        $clean = trim($path);

        if (! str_starts_with($clean, '/')) {
            $clean = '/'.$clean;
        }

        return rtrim($clean, '/');
    }
}
