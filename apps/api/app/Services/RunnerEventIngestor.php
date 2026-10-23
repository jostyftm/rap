<?php

declare(strict_types=1);

namespace App\Services;

use Illuminate\Support\Facades\Cache;

/**
 * Punto único de entrada de eventos del Runner.
 *
 * Garantiza entrega al menos una vez con deduplicación por id ULID: si el
 * consumidor cae después de procesar y antes de confirmar (XACK), el mensaje
 * reclamado se ignora en lugar de duplicar logs o transiciones de estado.
 */
final class RunnerEventIngestor
{
    private const TTL_DAYS = 7;

    public function __construct(
        private RunnerEventProcessor $processor
    ) {}

    /**
     * @param  array<string,mixed>  $payload
     * @return bool true si el evento se procesó, false si era duplicado
     */
    public function ingest(array $payload): bool
    {
        $eventId = $payload['id'] ?? null;

        if (! is_string($eventId) || $eventId === '') {
            $this->processor->process($payload);

            return true;
        }

        $cacheKey = "rpa:evt:processed:{$eventId}";

        if (Cache::has($cacheKey)) {
            return false;
        }

        $this->processor->process($payload);
        Cache::put($cacheKey, true, now()->addDays(self::TTL_DAYS));

        return true;
    }
}
