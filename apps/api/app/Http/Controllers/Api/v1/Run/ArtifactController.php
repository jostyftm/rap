<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\v1\Run;

use App\Http\Controllers\Controller;
use App\Models\Artifact;
use App\Support\ArtifactUrl;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Storage;

class ArtifactController extends Controller
{
    public function show(Artifact $artifact): Response
    {
        $disk = Storage::disk('s3');

        if (! $disk->exists($artifact->s3_key)) {
            abort(Response::HTTP_NOT_FOUND, 'Artefacto no encontrado.');
        }

        $contents = $disk->get($artifact->s3_key);
        if (! is_string($contents)) {
            abort(Response::HTTP_NOT_FOUND, 'Artefacto no disponible.');
        }

        $mimeType = $artifact->mime_type ?: ArtifactUrl::mimeFromPath($artifact->s3_key);

        return response($contents, Response::HTTP_OK, [
            'Content-Type' => $mimeType,
            'Cache-Control' => 'private, max-age=3600',
        ]);
    }
}
