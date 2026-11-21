<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Normaliza rutas de nodos webhook en dos espacios de nombres aislados:
 * - Producción (siempre escuchando al publicar): /api/v1/webhooks/{slug}
 * - Prueba (solo escucha efímera / runs de borrador): /api/v1/webhooks-test/{slug}
 */
final class WebhookPath
{
    public const PRODUCTION_PREFIX = '/api/v1/webhooks';

    public const TEST_PREFIX = '/api/v1/webhooks-test';

    public static function slug(string $rawPath, string $fallback = 'webhook'): string
    {
        $clean = trim($rawPath);
        $clean = trim($clean, '/');

        // Eliminar prefijos conocidos evitando duplicaciones si el usuario pega URLs parciales
        $stripped = preg_replace(
            '#^(?:api/v1/)?(?:webhooks-test|webhooks)(?:/|$)#i',
            '',
            $clean
        );
        $slug = trim((string) ($stripped ?? $clean), '/');

        if ($slug !== '') {
            return $slug;
        }

        $fb = trim($fallback, '/');

        return $fb !== '' ? $fb : 'webhook';
    }

    public static function productionPath(string $rawPath, string $fallback = 'webhook'): string
    {
        return self::PRODUCTION_PREFIX.'/'.self::slug($rawPath, $fallback);
    }

    public static function testPath(string $rawPath, string $fallback = 'webhook'): string
    {
        return self::TEST_PREFIX.'/'.self::slug($rawPath, $fallback);
    }

    public static function isReservedSlug(string $slug): bool
    {
        $lower = strtolower(trim($slug, '/'));

        return $lower === 'recipes' || str_starts_with($lower, 'recipes/');
    }
}
