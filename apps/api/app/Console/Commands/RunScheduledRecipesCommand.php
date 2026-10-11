<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\RecipeScheduleService;
use Illuminate\Console\Command;

final class RunScheduledRecipesCommand extends Command
{
    protected $signature = 'rpa:schedule-run';

    protected $description = 'Evalúa las recetas programadas activas y despacha las que correspondan según su expresión cron';

    public function handle(RecipeScheduleService $service): int
    {
        $this->info('Evaluando programaciones de recetas...');

        $dispatched = $service->dispatchDue();

        if ($dispatched > 0) {
            $this->info("✓ Se despacharon {$dispatched} ejecuciones programadas.");
        } else {
            $this->info('No hay ejecuciones programadas pendientes en este minuto.');
        }

        return self::SUCCESS;
    }
}
