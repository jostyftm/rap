<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\RunnerEventProcessor;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Redis;

final class ListenRunnerEventsCommand extends Command
{
    protected $signature = 'rpa:listen-events {--stream=rpa:evt}';

    protected $description = 'Escucha eventos del runner emitidos en Redis Streams';

    public function handle(RunnerEventProcessor $processor): int
    {
        $stream = (string) $this->option('stream');
        $this->info("Escuchando eventos en el stream {$stream}...");

        $lastId = '$';

        while (true) {
            try {
                // Bloquea por 2 segundos esperando nuevos mensajes
                $raw = Redis::executeRaw(['XREAD', 'COUNT', '10', 'BLOCK', '2000', 'STREAMS', $stream, $lastId]);

                if (! empty($raw) && is_array($raw)) {
                    foreach ($raw as $streamData) {
                        $messages = $streamData[1] ?? [];
                        foreach ($messages as $msg) {
                            $id = $msg[0];
                            $fields = $msg[1] ?? [];
                            $lastId = (string) $id;

                            $payload = [];
                            if (is_array($fields)) {
                                for ($i = 0; $i < count($fields); $i += 2) {
                                    if (isset($fields[$i])) {
                                        $payload[$fields[$i]] = $fields[$i + 1] ?? null;
                                    }
                                }
                            }

                            $processor->process($payload);
                        }
                    }
                }
            } catch (\Throwable $e) {
                $this->error("Error al leer stream: {$e->getMessage()}");
                sleep(1);
            }
        }
    }
}
