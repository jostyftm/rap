<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Workspace;
use Illuminate\Support\Facades\Redis;
use Symfony\Component\HttpFoundation\Response;

final class WebhookResponseWaiter
{
    private const MIN_TIMEOUT_MS = 1_000;

    private const MAX_TIMEOUT_MS = 120_000;

    private const FORBIDDEN_HEADERS = [
        'host',
        'content-length',
        'transfer-encoding',
        'connection',
        'keep-alive',
        'upgrade',
    ];

    public function __construct(
        private WorkspaceSecretService $secretService
    ) {}

    /**
     * Espera el resultado publicado por el runner para `$runUuid` en Redis y
     * construye la respuesta HTTP exacta hacia el cliente.
     *
     * @param  array<string, string>  $baseHeaders
     */
    public function waitAndBuildResponse(
        string $runUuid,
        int $timeoutMs = 30_000,
        array $baseHeaders = [],
        ?int $workspaceId = null
    ): Response {
        $envelope = $this->waitForEnvelope($runUuid, $timeoutMs);

        if ($envelope === null) {
            return response()->json([
                'ok' => false,
                'error' => 'Tiempo de espera agotado esperando la respuesta de la automatización.',
                'run_id' => $runUuid,
            ], Response::HTTP_GATEWAY_TIMEOUT, $baseHeaders);
        }

        return $this->buildHttpResponse($envelope, $baseHeaders, $workspaceId);
    }

    /**
     * Espera hasta `$timeoutMs` ms por el sobre JSON en `rpa:run:{runUuid}:response`.
     *
     * @return array<string, mixed>|null
     */
    public function waitForEnvelope(string $runUuid, int $timeoutMs = 30_000): ?array
    {
        $clampedMs = max(self::MIN_TIMEOUT_MS, min(self::MAX_TIMEOUT_MS, $timeoutMs));
        $deadline = microtime(true) + ($clampedMs / 1000.0);
        $key = $this->responseKey($runUuid);

        while (true) {
            $remaining = $deadline - microtime(true);
            if ($remaining <= 0) {
                return null;
            }

            $chunkSeconds = max(1, min(2, (int) ceil($remaining)));

            try {
                $res = Redis::blpop([$key], $chunkSeconds);
            } catch (\Throwable $e) {
                report($e);

                return null;
            }

            $raw = null;
            if (is_array($res)) {
                if (isset($res[1]) && is_string($res[1])) {
                    $raw = $res[1];
                } elseif (isset($res[$key]) && is_string($res[$key])) {
                    $raw = $res[$key];
                }
            } elseif (is_string($res) && $res !== '') {
                $raw = $res;
            }

            if (is_string($raw) && $raw !== '') {
                $decoded = json_decode($raw, true);
                if (is_array($decoded)) {
                    return $decoded;
                }
            }

            if (microtime(true) >= $deadline) {
                return null;
            }
        }
    }

    /**
     * @param  array<string, mixed>  $envelope
     * @param  array<string, string>  $baseHeaders
     */
    public function buildHttpResponse(
        array $envelope,
        array $baseHeaders = [],
        ?int $workspaceId = null
    ): Response {
        $redactor = $this->buildRedactor($workspaceId);

        $responseType = (string) ($envelope['responseType'] ?? 'json');
        $rawStatus = (int) ($envelope['statusCode'] ?? ($responseType === 'empty' ? 204 : ($responseType === 'redirect' ? 302 : 200)));
        $statusCode = max(100, min(599, $rawStatus));
        $isBase64 = (bool) ($envelope['isBase64'] ?? false);
        $contentType = isset($envelope['contentType']) ? trim((string) $envelope['contentType']) : '';
        $filename = isset($envelope['filename']) ? trim((string) $envelope['filename']) : '';
        $redirectUrl = isset($envelope['redirectUrl']) ? trim((string) $envelope['redirectUrl']) : '';
        $body = (string) ($envelope['body'] ?? '');

        $headers = [];
        $rawHeaders = is_array($envelope['headers'] ?? null) ? $envelope['headers'] : [];
        foreach ($rawHeaders as $headerKey => $headerVal) {
            if (! is_string($headerKey) || $headerKey === '' || is_array($headerVal)) {
                continue;
            }
            if (in_array(strtolower($headerKey), self::FORBIDDEN_HEADERS, true)) {
                continue;
            }
            $val = (string) $headerVal;
            $headers[$headerKey] = $redactor !== null ? (string) $redactor->redact($val) : $val;
        }

        foreach ($baseHeaders as $k => $v) {
            $headers[$k] = $v;
        }

        if ($responseType === 'redirect' && $redirectUrl !== '') {
            $safeUrl = $redactor !== null ? (string) $redactor->redact($redirectUrl) : $redirectUrl;
            $headers['Location'] = $safeUrl;

            return response('', $statusCode >= 300 && $statusCode <= 399 ? $statusCode : 302, $headers);
        }

        if ($responseType === 'empty') {
            return response('', $statusCode, $headers);
        }

        if ($isBase64 || $responseType === 'binary') {
            $decoded = base64_decode($body, true);
            $bytes = $decoded !== false ? $decoded : $body;
            $headers['Content-Type'] = $contentType !== '' ? $contentType : 'application/octet-stream';

            if ($filename !== '') {
                $cleanName = str_replace(['"', "\r", "\n", '\\'], '', $redactor !== null ? (string) $redactor->redact($filename) : $filename);
                if ($cleanName !== '') {
                    $headers['Content-Disposition'] = "attachment; filename=\"{$cleanName}\"";
                }
            }

            return response($bytes, $statusCode, $headers);
        }

        $safeBody = $redactor !== null ? (string) $redactor->redact($body) : $body;

        if ($contentType !== '') {
            $headers['Content-Type'] = $contentType;
        } elseif ($responseType === 'json' || json_validate($safeBody)) {
            $headers['Content-Type'] = 'application/json; charset=utf-8';
        } elseif ($responseType === 'html') {
            $headers['Content-Type'] = 'text/html; charset=utf-8';
        } elseif ($responseType === 'xml') {
            $headers['Content-Type'] = 'application/xml; charset=utf-8';
        } else {
            $headers['Content-Type'] = 'text/plain; charset=utf-8';
        }

        return response($safeBody, $statusCode, $headers);
    }

    public function responseKey(string $runUuid): string
    {
        return "rpa:run:{$runUuid}:response";
    }

    private function buildRedactor(?int $workspaceId): ?SecretRedactor
    {
        if ($workspaceId === null) {
            return null;
        }

        $workspace = Workspace::find($workspaceId);
        if (! $workspace) {
            return null;
        }

        $secrets = $this->secretService->getDecryptedForWorkspace($workspace);

        return $secrets !== [] ? new SecretRedactor($secrets) : null;
    }
}
