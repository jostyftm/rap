<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\AuditLog;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Database\Eloquent\Model;

final class Audit
{
    /** @param array<string,mixed> $metadata */
    public static function log(string $action, ?User $user, ?Workspace $workspace = null, ?Model $subject = null, array $metadata = []): void
    {
        AuditLog::create([
            'action' => $action,
            'user_id' => $user?->id,
            'workspace_id' => $workspace?->id,
            'subject_type' => $subject?->getMorphClass(),
            'subject_id' => $subject?->getKey(),
            'metadata' => $metadata,
            'ip' => request()->ip(),
        ]);
    }
}
