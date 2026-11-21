<?php

declare(strict_types=1);

namespace App\Http\Resources\Run;

use App\Models\Run;
use App\Support\ArtifactUrl;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Run */
final class RunResource extends JsonResource
{
    /** @return array<string,mixed> */
    public function toArray(Request $request): array
    {
        $version = $this->relationLoaded('recipeVersion') ? $this->recipeVersion : null;
        $recipeUuid = $version && $version->relationLoaded('recipe') ? $version->recipe?->uuid : null;

        $artifactsLoaded = $this->relationLoaded('artifacts');
        $latestScreenshot = $artifactsLoaded
            ? $this->artifacts->where('type', 'screenshot')->last()
            : null;
        $previewUrl = $latestScreenshot ? ArtifactUrl::forArtifact($latestScreenshot) : null;

        return [
            'id' => $this->uuid,
            'recipe_id' => $recipeUuid,
            'recipe_version' => $version?->version,
            'is_draft' => $version !== null ? $version->version === 0 : false,
            'status' => $this->status,
            'trigger' => $this->trigger,
            'parameters' => $this->parameters,
            'result' => $this->result,
            'started_at' => $this->started_at?->toIso8601String(),
            'finished_at' => $this->finished_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
            'duration_ms' => $this->duration_ms,
            'error_message' => $this->error_message,
            'steps_count' => $this->whenCounted('steps'),
            'logs_count' => $this->whenCounted('logs'),
            'preview_url' => $previewUrl,
            'steps' => $this->whenLoaded('steps', function () {
                $this->steps->each(fn ($step) => $step->setRelation('run', $this->resource));

                return RunStepResource::collection($this->steps);
            }),
            'artifacts' => $this->whenLoaded('artifacts', fn () => $this->artifacts->map(fn ($a) => [
                'id' => $a->uuid,
                'type' => $a->type,
                's3_key' => $a->s3_key,
                'mime_type' => $a->mime_type,
                'metadata' => $a->metadata,
                'url' => ArtifactUrl::forArtifact($a),
            ])->values()),
        ];
    }
}
