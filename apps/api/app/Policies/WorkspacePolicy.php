<?php

declare(strict_types=1);

namespace App\Policies;

use App\Enums\Role;
use App\Models\Project;
use App\Models\User;
use App\Models\Workspace;

final class WorkspacePolicy
{
    public function view(User $user, Workspace $workspace): bool
    {
        return $workspace->roleOf($user) !== null;
    }

    public function update(User $user, Workspace $workspace): bool
    {
        return $workspace->roleOf($user)?->atLeast(Role::Admin) ?? false;
    }

    public function delete(User $user, Workspace $workspace): bool
    {
        return $workspace->roleOf($user) === Role::Owner;
    }

    public function createProject(User $user, Workspace $workspace): bool
    {
        return $workspace->roleOf($user)?->atLeast(Role::Editor) ?? false;
    }

    public function deleteProject(User $user, Workspace $workspace, Project $project): bool
    {
        return $project->workspace_id === $workspace->id
            && ($workspace->roleOf($user)?->atLeast(Role::Admin) ?? false);
    }
}
