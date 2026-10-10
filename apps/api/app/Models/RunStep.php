<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RunStep extends Model
{
    use HasUuids;

    protected $fillable = [
        'run_id',
        'node_id',
        'status',
        'locator_strategy_used',
        'locator_value_used',
        'retries',
        'duration_ms',
        'screenshot_path',
        'error_message',
    ];

    protected function casts(): array
    {
        return [
            'retries' => 'integer',
            'duration_ms' => 'integer',
        ];
    }

    /** @return list<string> */
    public function uniqueIds(): array
    {
        return ['uuid'];
    }

    /** @return BelongsTo<Run, $this> */
    public function run(): BelongsTo
    {
        return $this->belongsTo(Run::class);
    }
}
