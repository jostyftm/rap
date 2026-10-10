<?php

declare(strict_types=1);

namespace App\Http\Resources\Workspace;

use App\Models\Workspace;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Workspace */
final class WorkspaceResource extends JsonResource
{
    /** @return array<string,mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->uuid,
            'name' => $this->name,
            'slug' => $this->slug,
            'role' => $this->whenPivotLoaded('workspace_members', fn () => $this->pivot->role),
            'settings' => $this->settings,
        ];
    }
}
