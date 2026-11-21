<?php

declare(strict_types=1);

namespace App\Http\Resources\Run;

use App\Models\RunStep;
use App\Support\ArtifactUrl;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin RunStep */
final class RunStepResource extends JsonResource
{
    /** @return array<string,mixed> */
    public function toArray(Request $request): array
    {
        $screenshotUrl = null;
        if ($this->screenshot_path && $this->relationLoaded('run') && $this->run?->relationLoaded('artifacts')) {
            $artifact = $this->run->artifacts->firstWhere('s3_key', $this->screenshot_path);
            if ($artifact) {
                $screenshotUrl = ArtifactUrl::forArtifact($artifact);
            }
        }

        return [
            'id' => $this->uuid,
            'node_id' => $this->node_id,
            'status' => $this->status,
            'locator_strategy' => $this->locator_strategy_used,
            'locator_value' => $this->locator_value_used,
            'duration_ms' => $this->duration_ms,
            'output' => $this->output,
            'screenshot_path' => $this->screenshot_path,
            'screenshot_url' => $screenshotUrl,
            'error_message' => $this->error_message,
        ];
    }
}
