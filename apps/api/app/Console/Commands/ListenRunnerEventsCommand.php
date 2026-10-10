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
                $messages = Redis::xread([$stream => $lastId], 10, 2000);

                if (! empty($messages) && isset($messages[$stream])) {
                    foreach ($messages[$stream] as $id => $payload) {
                        $lastId = $id;
                        $processor->process($payload);
                    }
                }
            } catch (\Throwable $e) {
                $this->error("Error al leer stream: {$e->getMessage()}");
                sleep(1);
            }
        }
    }
}
