<?php

declare(strict_types=1);

namespace App\Http\Resources\Secret;

use App\Models\WorkspaceSecret;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin WorkspaceSecret */
final class WorkspaceSecretResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->uuid,
            'key' => $this->key,
            'masked_value' => '••••••••',
            'description' => $this->description,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
