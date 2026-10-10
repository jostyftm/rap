<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Recipe;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Recipe */
final class RecipeResource extends JsonResource
{
    /** @return array<string,mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->uuid,
            'name' => $this->name,
            'description' => $this->description,
            'status' => $this->status,
            'allowed_domains' => $this->allowed_domains,
            'latest_version' => $this->latestVersion ? [
                'id' => $this->latestVersion->uuid,
                'version' => $this->latestVersion->version,
                'definition' => $this->latestVersion->definition,
                'changelog' => $this->latestVersion->changelog,
            ] : null,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
