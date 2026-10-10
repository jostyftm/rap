<?php

declare(strict_types=1);

namespace App\Support;

use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Throwable;

/** Respuestas de error uniformes según RFC 9457 (application/problem+json). */
final class ProblemDetails
{
    public static function render(Throwable $e, Request $request): JsonResponse
    {
        $errors = null;
        if ($e instanceof ValidationException) {
            [$status, $title, $errors] = [422, 'Validation failed', $e->errors()];
        } elseif ($e instanceof AuthenticationException) {
            [$status, $title] = [401, 'Unauthenticated'];
        } elseif ($e instanceof AuthorizationException) {
            [$status, $title] = [403, 'Forbidden'];
        } elseif ($e instanceof ModelNotFoundException || $e instanceof NotFoundHttpException) {
            [$status, $title] = [404, 'Not found'];
        } elseif ($e instanceof HttpExceptionInterface) {
            [$status, $title] = [$e->getStatusCode(), Response::$statusTexts[$e->getStatusCode()] ?? 'Error'];
        } else {
            [$status, $title] = [500, 'Internal server error'];
        }

        $body = [
            'type' => 'about:blank',
            'title' => $title,
            'status' => $status,
            'detail' => $status >= 500 && ! config('app.debug') ? 'An unexpected error occurred.' : $e->getMessage(),
            'instance' => $request->path(),
        ];
        if ($errors !== null) {
            $body['errors'] = $errors;
        }

        return response()->json($body, $status, ['Content-Type' => 'application/problem+json']);
    }
}
