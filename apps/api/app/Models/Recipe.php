<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

class Recipe extends Model
{
    use HasUuids, SoftDeletes;

    protected $fillable = [
        'project_id',
        'name',
        'description',
        'status',
        'allowed_domains',
    ];

    protected function casts(): array
    {
        return [
            'allowed_domains' => 'array',
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

    /** @return BelongsTo<Project, $this> */
    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    /** @return HasMany<RecipeVersion, $this> */
    public function versions(): HasMany
    {
        return $this->hasMany(RecipeVersion::class)->orderByDesc('version');
    }

    /** @return HasOne<RecipeVersion, $this> */
    public function latestVersion(): HasOne
    {
        return $this->hasOne(RecipeVersion::class)->latestOfMany('version');
    }
}
