<?php

declare(strict_types=1);

namespace App\Http\Resources\Run;

use App\Models\RunStep;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin RunStep */
final class RunStepResource extends JsonResource
{
    /** @return array<string,mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->uuid,
            'node_id' => $this->node_id,
            'status' => $this->status,
            'locator_strategy' => $this->locator_strategy_used,
            'duration_ms' => $this->duration_ms,
            'screenshot_path' => $this->screenshot_path,
            'error_message' => $this->error_message,
        ];
    }
}
