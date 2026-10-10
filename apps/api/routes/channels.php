<?php

declare(strict_types=1);

use App\Models\User;
use App\Models\Workspace;
use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('App.Models.User.{id}', fn (User $user, string $id) => $user->uuid === $id);

// Canal privado por workspace: cualquier miembro puede escuchar.
Broadcast::channel('workspace.{uuid}', function (User $user, string $uuid): bool {
    $workspace = Workspace::where('uuid', $uuid)->first();

    return $workspace !== null && $workspace->roleOf($user) !== null;
});
