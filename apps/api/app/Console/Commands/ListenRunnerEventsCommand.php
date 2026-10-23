<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\RunnerEventIngestor;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Redis;

final class ListenRunnerEventsCommand extends Command
{
    private const RECLAIM_AFTER_MS = 60000;

    private const RECLAIM_EVERY_LOOPS = 15;

    protected $signature = 'rpa:listen-events
                            {--stream=rpa:evt}
                            {--group=rpa:api}
                            {--consumer=}';

    protected $description = 'Escucha eventos del runner con consumer group y confirmación XACK';

    public function handle(RunnerEventIngestor $ingestor): int
    {
        $stream = (string) $this->option('stream');
        $group = (string) $this->option('group');
        $consumer = (string) ($this->option('consumer') ?: gethostname().'-'.getmypid());

        $this->ensureGroupExists($stream, $group);
        $this->info("Escuchando eventos en {$stream} (grupo {$group}, consumidor {$consumer})...");

        $running = true;
        $this->registerSignalHandlers($running);

        $loop = 0;

        while ($running) {
            try {
                if ($loop % self::RECLAIM_EVERY_LOOPS === 0) {
                    $this->reclaimPending($stream, $group, $consumer, $ingestor);
                }
                $loop++;

                $raw = Redis::executeRaw([
                    'XREADGROUP',
                    'GROUP',
                    $group,
                    $consumer,
                    'COUNT',
                    '10',
                    'BLOCK',
                    '2000',
                    'STREAMS',
                    $stream,
                    '>',
                ]);

                $this->consumeBatch($raw, $stream, $group, $ingestor);
            } catch (\Throwable $e) {
                if (! $running) {
                    break;
                }

                $this->error("Error al leer stream: {$e->getMessage()}");
                sleep(1);
            }
        }

        $this->info('Listener de eventos detenido.');

        return self::SUCCESS;
    }

    private function ensureGroupExists(string $stream, string $group): void
    {
        try {
            Redis::executeRaw(['XGROUP', 'CREATE', $stream, $group, '$', 'MKSTREAM']);
        } catch (\Throwable $e) {
            if (! str_contains($e->getMessage(), 'BUSYGROUP')) {
                throw $e;
            }
        }
    }

    /**
     * Recupera mensajes que quedaron pendientes en consumidores caídos.
     */
    private function reclaimPending(string $stream, string $group, string $consumer, RunnerEventIngestor $ingestor): void
    {
        $cursor = '0-0';

        do {
            $raw = Redis::executeRaw([
                'XAUTOCLAIM',
                $stream,
                $group,
                $consumer,
                (string) self::RECLAIM_AFTER_MS,
                $cursor,
                'COUNT',
                '10',
            ]);

            if (! is_array($raw) || count($raw) < 2) {
                return;
            }

            $cursor = (string) ($raw[0] ?? '0-0');
            $messages = is_array($raw[1] ?? null) ? $raw[1] : [];

            foreach ($messages as $message) {
                $this->processMessage($message, $stream, $group, $ingestor);
            }
        } while ($cursor !== '0-0');
    }

    private function consumeBatch(mixed $raw, string $stream, string $group, RunnerEventIngestor $ingestor): void
    {
        if (! is_array($raw) || $raw === []) {
            return;
        }

        foreach ($raw as $streamData) {
            $messages = is_array($streamData) ? ($streamData[1] ?? []) : [];

            foreach ((array) $messages as $message) {
                $this->processMessage($message, $stream, $group, $ingestor);
            }
        }
    }

    private function processMessage(mixed $message, string $stream, string $group, RunnerEventIngestor $ingestor): void
    {
        if (! is_array($message)) {
            return;
        }

        $id = (string) ($message[0] ?? '');
        $fields = $message[1] ?? [];

        if ($id === '' || ! is_array($fields)) {
            return;
        }

        $payload = $this->parseFields($fields);

        try {
            $ingestor->ingest($payload);
        } catch (\Throwable $e) {
            // No confirmar el mensaje: quedará pendiente para reintento.
            report($e);
            $this->error("Error procesando evento {$id}: {$e->getMessage()}");

            return;
        }

        Redis::executeRaw(['XACK', $stream, $group, $id]);
    }

    /**
     * @param  array<int|string,mixed>  $fields
     * @return array<string,mixed>
     */
    private function parseFields(array $fields): array
    {
        $payload = [];

        if (array_is_list($fields)) {
            for ($i = 0; $i < count($fields); $i += 2) {
                if (isset($fields[$i])) {
                    $payload[(string) $fields[$i]] = $fields[$i + 1] ?? null;
                }
            }

            return $payload;
        }

        foreach ($fields as $key => $value) {
            $payload[(string) $key] = $value;
        }

        return $payload;
    }

    private function registerSignalHandlers(bool &$running): void
    {
        if (! function_exists('pcntl_async_signals')) {
            return;
        }

        pcntl_async_signals(true);

        foreach ([SIGTERM, SIGINT] as $signal) {
            pcntl_signal($signal, function () use (&$running): void {
                $running = false;
            });
        }
    }
}
