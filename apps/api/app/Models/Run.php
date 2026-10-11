<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Run extends Model
{
    use HasUuids;

    protected $fillable = [
        'recipe_version_id',
        'user_id',
        'status',
        'trigger',
        'parameters',
        'started_at',
        'finished_at',
        'duration_ms',
        'error_message',
    ];

    protected function casts(): array
    {
        return [
            'parameters' => 'array',
            'started_at' => 'datetime',
            'finished_at' => 'datetime',
            'duration_ms' => 'integer',
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

    /** @return BelongsTo<RecipeVersion, $this> */
    public function recipeVersion(): BelongsTo
    {
        return $this->belongsTo(RecipeVersion::class);
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return HasMany<RunStep, $this> */
    public function steps(): HasMany
    {
        return $this->hasMany(RunStep::class)->orderBy('id');
    }

    /** @return HasMany<Artifact, $this> */
    public function artifacts(): HasMany
    {
        return $this->hasMany(Artifact::class);
    }

    /** @return HasMany<RunLog, $this> */
    public function logs(): HasMany
    {
        return $this->hasMany(RunLog::class)->orderBy('id');
    }
}
