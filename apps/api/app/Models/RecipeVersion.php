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
