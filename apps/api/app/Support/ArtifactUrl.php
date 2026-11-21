<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\Artifact;
use Illuminate\Support\Facades\URL;

final class ArtifactUrl
{
    public static function forArtifact(Artifact $artifact): string
    {
        $relative = URL::temporarySignedRoute(
            'api.v1.artifacts.show',
            now()->addHours(2),
            ['artifact' => $artifact->uuid],
            absolute: false
        );

        return rtrim((string) config('app.url'), '/').$relative;
    }

    public static function mimeFromPath(string $path): string
    {
        $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));

        return match ($ext) {
            'jpg', 'jpeg' => 'image/jpeg',
            'webp' => 'image/webp',
            'zip' => 'application/zip',
            default => 'image/png',
        };
    }
}
