<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\v1\Workspace;

use App\Http\Controllers\Controller;
use App\Http\Requests\Workspace\WorkspaceUpdateRequest;
use App\Http\Resources\Workspace\WorkspaceResource;
use App\Models\Workspace;
use App\Services\WorkspaceService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class WorkspaceController extends Controller
{
    public function __construct(
        private WorkspaceService $workspaceService
    ) {}

    /**
     * List user workspaces
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        $workspaces = $this->workspaceService->list($request);

        return WorkspaceResource::collection($workspaces);
    }

    /**
     * Get workspace details
     */
    public function show(Workspace $workspace): WorkspaceResource
    {
        $this->authorize('view', $workspace);

        $result = $this->workspaceService->get($workspace);

        return new WorkspaceResource($result);
    }

    /**
     * Update workspace settings
     */
    public function update(WorkspaceUpdateRequest $request, Workspace $workspace): WorkspaceResource
    {
        $this->authorize('update', $workspace);

        $result = $this->workspaceService->update($request, $workspace);

        return new WorkspaceResource($result);
    }
}
