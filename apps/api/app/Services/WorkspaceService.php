<?php

declare(strict_types=1);

namespace App\Services;

use App\Http\Requests\Workspace\WorkspaceUpdateRequest;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\Request;

class WorkspaceService
{
    /**
     * @return Collection<int, Workspace>
     */
    public function list(Request $request): Collection
    {
        /** @var User $user */
        $user = $request->user();

        return $user->workspaces()->orderBy('workspaces.name')->get();
    }

    public function get(Workspace $workspace): Workspace
    {
        return $workspace;
    }

    public function update(WorkspaceUpdateRequest $request, Workspace $workspace): Workspace
    {
        $data = $request->validated();

        if (isset($data['settings'])) {
            $data['settings'] = array_replace_recursive($workspace->settings ?? [], $data['settings']);
        }

        $workspace->update($data);

        Audit::log('workspace.updated', $request->user(), $workspace, $workspace);

        return $workspace;
    }
}
