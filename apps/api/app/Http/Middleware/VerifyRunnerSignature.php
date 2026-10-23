<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Symfony\Component\HttpFoundation\Response;

/**
 * Verifica la firma HMAC que el Runner envía a los endpoints internos.
 *
 * Canonical string: "{run_id}|{timestamp}|{nonce}". La firma usa
 * RPA_INTERNAL_SECRET, tiene una ventana corta y protege contra replay con un
 * nonce de un solo uso.
 */
final class VerifyRunnerSignature
{
    public function handle(Request $request, Closure $next): Response
    {
        $secret = (string) config('rpa.internal.secret');

        if ($secret === '') {
            abort(503, 'El secreto interno del Runner no está configurado.');
        }

        $runId = $this->resolveRunId($request);
        $timestamp = (string) $request->header('X-RPA-Timestamp', '');
        $nonce = (string) $request->header('X-RPA-Nonce', '');
        $signature = (string) $request->header('X-RPA-Signature', '');

        if ($runId === '' || $timestamp === '' || $nonce === '' || $signature === '') {
            abort(401, 'Firma del Runner incompleta.');
        }

        $ttl = max(1, (int) config('rpa.internal.signature_ttl', 60));
        if (! ctype_digit($timestamp) || abs(time() - (int) $timestamp) > $ttl) {
            abort(401, 'La firma del Runner ha expirado.');
        }

        $expected = hash_hmac('sha256', "{$runId}|{$timestamp}|{$nonce}", $secret);

        if (! hash_equals($expected, $signature)) {
            abort(401, 'Firma del Runner inválida.');
        }

        if (! Cache::add("rpa:internal:nonce:{$nonce}", true, $ttl * 2)) {
            abort(401, 'La firma del Runner ya fue utilizada.');
        }

        return $next($request);
    }

    private function resolveRunId(Request $request): string
    {
        $parameter = $request->route()?->parameter('run');

        if (is_object($parameter) && isset($parameter->uuid)) {
            return (string) $parameter->uuid;
        }

        return is_string($parameter) ? $parameter : '';
    }
}
