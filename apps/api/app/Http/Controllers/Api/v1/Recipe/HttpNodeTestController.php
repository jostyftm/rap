<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\v1\Recipe;

use App\Http\Controllers\Controller;
use App\Http\Requests\Recipe\HttpNodeTestRequest;
use App\Models\Recipe;
use App\Services\SecretRedactor;
use App\Services\WorkspaceSecretService;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Http;
use Symfony\Component\HttpFoundation\Response;

class HttpNodeTestController extends Controller
{
    private const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

    public function __construct(
        private WorkspaceSecretService $secretService
    ) {}

    public function test(HttpNodeTestRequest $request, Recipe $recipe): JsonResponse
    {
        $recipe->loadMissing('project.workspace');
        $workspace = $recipe->project?->workspace;
        if (! $workspace) {
            abort(Response::HTTP_NOT_FOUND, 'Receta sin workspace asociado.');
        }

        $this->authorize('view', $workspace);

        $validated = $request->validated();
        $secrets = $this->secretService->getDecryptedForWorkspace($workspace);
        $redactor = new SecretRedactor($secrets);

        $interpolate = static function (?string $value) use ($secrets): string {
            if ($value === null || $value === '') {
                return '';
            }

            return (string) preg_replace_callback(
                '/\{\{\s*secret\.([A-Za-z0-9_]+)\s*\}\}/',
                static fn (array $m): string => $secrets[$m[1]] ?? $m[0],
                $value
            );
        };

        $method = strtoupper((string) $validated['method']);
        $resolvedUrl = trim($interpolate((string) $validated['url']));

        foreach ((array) ($validated['pathParams'] ?? []) as $pair) {
            if (($pair['enabled'] ?? true) === false) {
                continue;
            }
            $key = trim((string) ($pair['key'] ?? ''));
            if ($key === '') {
                continue;
            }
            $val = rawurlencode($interpolate((string) ($pair['value'] ?? '')));
            $resolvedUrl = str_replace([":{$key}", "{{$key}}"], [$val, $val], $resolvedUrl);
        }

        $parts = parse_url($resolvedUrl);
        $scheme = strtolower((string) ($parts['scheme'] ?? ''));
        $host = (string) ($parts['host'] ?? '');

        if (! in_array($scheme, ['http', 'https'], true) || $host === '') {
            return response()->json([
                'ok' => false,
                'error' => 'La URL debe ser válida y comenzar por http:// o https://.',
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $allowPrivate = filter_var(
            config('rpa.http.allow_private_networks', env('RPA_HTTP_ALLOW_PRIVATE_NETWORKS', true)),
            FILTER_VALIDATE_BOOLEAN
        );

        if (! $allowPrivate && $this->isPrivateHost($host)) {
            return response()->json([
                'ok' => false,
                'error' => "Acceso bloqueado a host privado o local ({$host}) por política de seguridad.",
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $queryItems = [];
        foreach ((array) ($validated['queryParams'] ?? []) as $q) {
            if (($q['enabled'] ?? true) === false) {
                continue;
            }
            $key = trim((string) ($q['key'] ?? ''));
            if ($key !== '') {
                $queryItems[] = [$key, $interpolate((string) ($q['value'] ?? ''))];
            }
        }

        $headers = [];
        foreach ((array) ($validated['headers'] ?? []) as $h) {
            if (($h['enabled'] ?? true) === false) {
                continue;
            }
            $key = trim((string) ($h['key'] ?? ''));
            if ($key !== '') {
                $headers[$key] = $interpolate((string) ($h['value'] ?? ''));
            }
        }

        $auth = is_array($validated['auth'] ?? null) ? $validated['auth'] : ['type' => 'none'];
        $authType = (string) ($auth['type'] ?? 'none');
        if ($authType === 'bearer') {
            $this->setHeaderIfAbsent($headers, 'Authorization', 'Bearer '.$interpolate((string) ($auth['token'] ?? '')));
        } elseif ($authType === 'basic') {
            $user = $interpolate((string) ($auth['username'] ?? ''));
            $pass = $interpolate((string) ($auth['password'] ?? ''));
            $this->setHeaderIfAbsent($headers, 'Authorization', 'Basic '.base64_encode("{$user}:{$pass}"));
        } elseif ($authType === 'apiKey') {
            $keyName = trim($interpolate((string) ($auth['keyName'] ?? '')));
            $keyVal = $interpolate((string) ($auth['keyValue'] ?? ''));
            if ($keyName !== '') {
                if (($auth['in'] ?? 'header') === 'query') {
                    $queryItems[] = [$keyName, $keyVal];
                } else {
                    $this->setHeaderIfAbsent($headers, $keyName, $keyVal);
                }
            }
        }

        if ($queryItems !== []) {
            $sep = str_contains($resolvedUrl, '?') ? '&' : '?';
            $encodedPairs = array_map(
                static fn (array $item): string => rawurlencode($item[0]).'='.rawurlencode($item[1]),
                $queryItems
            );
            $resolvedUrl .= $sep.implode('&', $encodedPairs);
        }

        $timeoutSeconds = max(1, (int) ceil(((int) ($validated['timeoutMs'] ?? 30_000)) / 1000));
        $followRedirects = (bool) ($validated['followRedirects'] ?? true);
        $failOnHttpError = (bool) ($validated['failOnHttpError'] ?? true);
        $bodyType = (string) ($validated['bodyType'] ?? 'none');
        $allowsBody = ! in_array($method, ['GET', 'HEAD'], true);

        $startedAt = microtime(true);

        try {
            $pending = Http::withHeaders($headers)
                ->timeout($timeoutSeconds)
                ->connectTimeout(min(10, $timeoutSeconds));

            if (! $followRedirects) {
                $pending = $pending->withoutRedirecting();
            }

            if ($allowsBody && $bodyType === 'json') {
                $jsonBody = $interpolate((string) ($validated['bodyJson'] ?? '{}'));
                $pending = $pending->withBody($jsonBody, $this->findHeaderValue($headers, 'content-type') ?? 'application/json');
                $httpResponse = $pending->send($method, $resolvedUrl);
            } elseif ($allowsBody && $bodyType === 'formUrlEncoded') {
                $formParams = [];
                foreach ((array) ($validated['bodyForm'] ?? []) as $item) {
                    if (($item['enabled'] ?? true) === false) {
                        continue;
                    }
                    $k = trim((string) ($item['key'] ?? ''));
                    if ($k !== '') {
                        $formParams[$k] = $interpolate((string) ($item['value'] ?? ''));
                    }
                }
                $httpResponse = $pending->asForm()->send($method, $resolvedUrl, ['form_params' => $formParams]);
            } elseif ($allowsBody && $bodyType === 'multipart') {
                $pending = $pending->asMultipart();
                foreach ((array) ($validated['bodyMultipart'] ?? []) as $field) {
                    if (($field['enabled'] ?? true) === false) {
                        continue;
                    }
                    $k = trim((string) ($field['key'] ?? ''));
                    if ($k === '') {
                        continue;
                    }
                    if (($field['fieldType'] ?? 'text') === 'fileBase64') {
                        $rawB64 = trim($interpolate((string) ($field['value'] ?? '')));
                        $rawB64 = preg_replace('/^data:[^;]+;base64,/', '', $rawB64) ?? $rawB64;
                        $decoded = base64_decode($rawB64, true);
                        $bytes = $decoded !== false ? $decoded : $rawB64;
                        $filename = trim((string) ($field['filename'] ?? 'file.bin')) ?: 'file.bin';
                        $mime = trim((string) ($field['contentType'] ?? '')) ?: 'application/octet-stream';
                        $pending = $pending->attach($k, $bytes, $filename, ['Content-Type' => $mime]);
                    } else {
                        $pending = $pending->attach($k, $interpolate((string) ($field['value'] ?? '')));
                    }
                }
                $httpResponse = $pending->send($method, $resolvedUrl);
            } elseif ($allowsBody && $bodyType === 'raw') {
                $rawBody = $interpolate((string) ($validated['bodyRaw'] ?? ''));
                $rawCt = trim((string) ($validated['rawContentType'] ?? '')) ?: 'text/plain; charset=utf-8';
                $httpResponse = $pending->withBody($rawBody, $rawCt)->send($method, $resolvedUrl);
            } elseif ($allowsBody && $bodyType === 'binary') {
                $rawB64 = trim($interpolate((string) ($validated['bodyBinaryBase64'] ?? '')));
                $rawB64 = preg_replace('/^data:[^;]+;base64,/', '', $rawB64) ?? $rawB64;
                $decoded = base64_decode($rawB64, true);
                $bytes = $decoded !== false ? $decoded : '';
                $binCt = trim((string) ($validated['binaryContentType'] ?? '')) ?: 'application/octet-stream';
                $httpResponse = $pending->withBody($bytes, $binCt)->send($method, $resolvedUrl);
            } else {
                $httpResponse = $pending->send($method, $resolvedUrl);
            }
        } catch (ConnectionException $e) {
            return response()->json([
                'ok' => false,
                'error' => (string) $redactor->redact('Error de conexión HTTP: '.$e->getMessage()),
            ], Response::HTTP_BAD_GATEWAY);
        }

        $durationMs = (int) round((microtime(true) - $startedAt) * 1000);

        $resHeaders = [];
        foreach ($httpResponse->headers() as $hKey => $hValues) {
            $joined = implode(', ', (array) $hValues);
            $resHeaders[strtolower((string) $hKey)] = (string) $redactor->redact($joined);
        }

        $contentType = $resHeaders['content-type'] ?? '';
        $configuredType = (string) ($validated['responseType'] ?? 'auto');
        $resolvedType = $configuredType === 'auto'
            ? $this->detectAutoType($contentType)
            : $configuredType;

        $rawBody = (string) $httpResponse->body();
        if (strlen($rawBody) > self::MAX_RESPONSE_BYTES) {
            return response()->json([
                'ok' => false,
                'error' => 'La respuesta HTTP excedió el tamaño máximo permitido (10 MB).',
            ], Response::HTTP_BAD_GATEWAY);
        }

        $data = null;
        if ($resolvedType === 'binary') {
            $data = [
                'base64' => base64_encode($rawBody),
                'contentType' => $contentType !== '' ? $contentType : 'application/octet-stream',
                'sizeBytes' => strlen($rawBody),
                'filename' => $this->extractFilename($resHeaders['content-disposition'] ?? null),
            ];
        } elseif ($resolvedType === 'headersOnly') {
            $data = null;
        } elseif ($resolvedType === 'json') {
            $safeText = (string) $redactor->redact($rawBody);
            if (trim($safeText) === '') {
                $data = null;
            } else {
                $decoded = json_decode($safeText, true);
                $data = json_last_error() === JSON_ERROR_NONE ? $decoded : $safeText;
            }
        } else {
            $data = (string) $redactor->redact($rawBody);
        }

        $status = $httpResponse->status();
        $isHttpOk = $httpResponse->successful();
        $output = [
            'status' => $status,
            'statusText' => Response::$statusTexts[$status] ?? '',
            'ok' => $isHttpOk,
            'url' => (string) $redactor->redact($resolvedUrl),
            'headers' => $resHeaders,
            'contentType' => $contentType,
            'responseType' => $resolvedType,
            'data' => $data,
            'durationMs' => $durationMs,
        ];

        $passed = $isHttpOk || ! $failOnHttpError;

        return response()->json([
            'ok' => $passed,
            'error' => $passed ? null : "Petición HTTP {$method} respondió con estado {$status}",
            'output' => $output,
        ]);
    }

    private function findHeaderValue(array $headers, string $target): ?string
    {
        $lower = strtolower($target);
        foreach ($headers as $k => $v) {
            if (strtolower((string) $k) === $lower) {
                return (string) $v;
            }
        }

        return null;
    }

    /** @param array<string, string> $headers */
    private function setHeaderIfAbsent(array &$headers, string $key, string $value): void
    {
        if ($this->findHeaderValue($headers, $key) === null) {
            $headers[$key] = $value;
        }
    }

    private function detectAutoType(string $contentType): string
    {
        $lower = strtolower($contentType);
        if (str_contains($lower, 'application/json') || str_contains($lower, '+json')) {
            return 'json';
        }
        if (str_contains($lower, 'application/xml') || str_contains($lower, 'text/xml') || str_contains($lower, '+xml')) {
            return 'xml';
        }
        if (
            str_starts_with($lower, 'text/') ||
            str_contains($lower, 'application/javascript') ||
            str_contains($lower, 'application/x-www-form-urlencoded')
        ) {
            return 'text';
        }

        return 'binary';
    }

    private function extractFilename(?string $disposition): ?string
    {
        if ($disposition === null || $disposition === '') {
            return null;
        }
        if (preg_match('/filename\*=UTF-8\'\'([^;]+)/i', $disposition, $m) === 1) {
            return rawurldecode(trim($m[1], " \t\"'"));
        }
        if (preg_match('/filename="?([^";]+)"?/i', $disposition, $m) === 1) {
            return trim($m[1]);
        }

        return null;
    }

    private function isPrivateHost(string $host): bool
    {
        $clean = strtolower(trim($host, '[]'));
        if (
            $clean === 'localhost' ||
            str_ends_with($clean, '.localhost') ||
            str_ends_with($clean, '.local') ||
            str_ends_with($clean, '.internal')
        ) {
            return true;
        }

        if (filter_var($clean, FILTER_VALIDATE_IP) !== false) {
            return filter_var(
                $clean,
                FILTER_VALIDATE_IP,
                FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE
            ) === false;
        }

        return false;
    }
}
