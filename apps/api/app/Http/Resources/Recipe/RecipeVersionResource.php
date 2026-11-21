<?php

declare(strict_types=1);

namespace App\Http\Resources\Recipe;

use App\Models\RecipeVersion;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin RecipeVersion */
final class RecipeVersionResource extends JsonResource
{
    /** @return array<string,mixed> */
    public function toArray(Request $request): array
    {
        $isPublished = (int) $this->recipe?->published_version_id === (int) $this->id;

        return [
            'id' => $this->uuid,
            'version' => $this->version,
            'definition' => $this->definition,
            'changelog' => $this->changelog,
            'is_draft' => $this->isDraft(),
            'is_published' => $isPublished,
            'restored_from_version' => $this->restoredFrom ? [
                'id' => $this->restoredFrom->uuid,
                'version' => $this->restoredFrom->version,
            ] : null,
            'creator' => $this->creator ? [
                'id' => $this->creator->id,
                'name' => $this->creator->name,
                'email' => $this->creator->email,
            ] : null,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
