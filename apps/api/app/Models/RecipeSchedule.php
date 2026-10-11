<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class RecipeSchedule extends Model
{
    use HasUuids, SoftDeletes;

    protected $fillable = [
        'recipe_id',
        'workspace_id',
        'name',
        'cron_expression',
        'is_active',
        'parameters',
        'last_run_at',
        'next_run_at',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'parameters' => 'array',
            'last_run_at' => 'datetime',
            'next_run_at' => 'datetime',
        ];
    }

    /** @return list<string> */
    public function uniqueIds(): array
    {
        return ['uuid'];
    }

    public function getRouteKeyName(): string
    {
        return 'uuid';
    }

    /** @return BelongsTo<Recipe, $this> */
    public function recipe(): BelongsTo
    {
        return $this->belongsTo(Recipe::class);
    }

    /** @return BelongsTo<Workspace, $this> */
    public function workspace(): BelongsTo
    {
        return $this->belongsTo(Workspace::class);
    }
}
