<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class RecipeVersion extends Model
{
    use HasUuids;

    protected $fillable = [
        'recipe_id',
        'version',
        'definition',
        'changelog',
        'restored_from_version_id',
        'created_by_user_id',
    ];

    protected function casts(): array
    {
        return [
            'version' => 'integer',
            'definition' => 'array',
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

    /** @return BelongsTo<RecipeVersion, $this> */
    public function restoredFrom(): BelongsTo
    {
        return $this->belongsTo(RecipeVersion::class, 'restored_from_version_id');
    }

    public function isDraft(): bool
    {
        return $this->version === 0;
    }

    /** @return BelongsTo<User, $this> */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    /** @return HasMany<Run, $this> */
    public function runs(): HasMany
    {
        return $this->hasMany(Run::class);
    }
}
