<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Artifact extends Model
{
    use HasUuids;

    protected $fillable = [
        'run_id',
        'type',
        's3_key',
        'mime_type',
        'size_bytes',
        'metadata',
    ];

    protected function casts(): array
    {
        return [
            'size_bytes' => 'integer',
            'metadata' => 'array',
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
