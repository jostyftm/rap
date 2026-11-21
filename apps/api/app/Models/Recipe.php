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
        'webhook_token',
        'webhook_enabled',
        'published_version_id',
        'published_at',
    ];

    protected function casts(): array
    {
        return [
            'allowed_domains' => 'array',
            'webhook_enabled' => 'boolean',
            'published_at' => 'datetime',
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

    /** @return BelongsTo<RecipeVersion, $this> */
    public function publishedVersion(): BelongsTo
    {
        return $this->belongsTo(RecipeVersion::class, 'published_version_id');
    }

    /** @return HasOne<RecipeVersion, $this> */
    public function draft(): HasOne
    {
        return $this->hasOne(RecipeVersion::class)->where('version', 0);
    }

    /** @return HasMany<RecipeVersion, $this> */
    public function allVersions(): HasMany
    {
        return $this->hasMany(RecipeVersion::class)->orderByDesc('version');
    }

    /** @return HasMany<RecipeVersion, $this> */
    public function versions(): HasMany
    {
        return $this->hasMany(RecipeVersion::class)->where('version', '>', 0)->orderByDesc('version');
    }

    /** @return HasOne<RecipeVersion, $this> */
    public function latestVersion(): HasOne
    {
        return $this->hasOne(RecipeVersion::class)->where('version', '>', 0)->latestOfMany('version');
    }

    /** @return HasMany<RecipeSchedule, $this> */
    public function schedules(): HasMany
    {
        return $this->hasMany(RecipeSchedule::class);
    }

    public function hasUnpublishedChanges(): bool
    {
        if (! $this->draft) {
            return false;
        }

        if (! $this->publishedVersion) {
            return true;
        }

        return $this->draft->definition !== $this->publishedVersion->definition;
    }
}
