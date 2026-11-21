<?php

declare(strict_types=1);

namespace App\Http\Resources\Recipe;

use App\Models\Recipe;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Recipe */
final class RecipeResource extends JsonResource
{
    /** @return array<string,mixed> */
    public function toArray(Request $request): array
    {
        $draft = $this->draft;
        $published = $this->publishedVersion;

        return [
            'id' => $this->uuid,
            'name' => $this->name,
            'description' => $this->description,
            'status' => $this->status,
            'allowed_domains' => $this->allowed_domains,
            'has_unpublished_changes' => $this->hasUnpublishedChanges(),
            'published_at' => $this->published_at?->toIso8601String(),
            'draft' => $draft ? [
                'id' => $draft->uuid,
                'version' => 0,
                'definition' => $draft->definition,
                'changelog' => $draft->changelog,
                'updated_at' => $draft->updated_at?->toIso8601String(),
            ] : null,
            'published_version' => $published ? [
                'id' => $published->uuid,
                'version' => $published->version,
                'definition' => $published->definition,
                'changelog' => $published->changelog,
                'published_at' => $this->published_at?->toIso8601String() ?? $published->created_at?->toIso8601String(),
            ] : null,
            'latest_version' => $this->latestVersion ? [
                'id' => $this->latestVersion->uuid,
                'version' => $this->latestVersion->version,
                'definition' => $this->latestVersion->definition,
                'changelog' => $this->latestVersion->changelog,
            ] : ($draft ? [
                'id' => $draft->uuid,
                'version' => $draft->version,
                'definition' => $draft->definition,
                'changelog' => $draft->changelog,
            ] : null),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
