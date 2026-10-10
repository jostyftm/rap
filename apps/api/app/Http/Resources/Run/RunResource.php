<?php

declare(strict_types=1);

namespace App\Http\Resources\Run;

use App\Models\Run;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Run */
final class RunResource extends JsonResource
{
    /** @return array<string,mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->uuid,
            'status' => $this->status,
            'trigger' => $this->trigger,
            'started_at' => $this->started_at?->toIso8601String(),
            'finished_at' => $this->finished_at?->toIso8601String(),
            'duration_ms' => $this->duration_ms,
            'error_message' => $this->error_message,
            'steps' => RunStepResource::collection($this->whenLoaded('steps')),
            'artifacts' => $this->whenLoaded('artifacts', fn () => $this->artifacts->map(fn ($a) => [
                'id' => $a->uuid,
                'type' => $a->type,
                's3_key' => $a->s3_key,
                'mime_type' => $a->mime_type,
            ])),
        ];
    }
}
