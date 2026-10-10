<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\ProjectResource;
use App\Http\Resources\WorkspaceResource;
use App\Models\Project;
use App\Models\User;
use App\Models\Workspace;
use App\Services\Audit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

final class WorkspaceController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        /** @var User $user */
        $user = $request->user();

        return WorkspaceResource::collection($user->workspaces()->orderBy('workspaces.name')->get());
    }

    public function show(Workspace $workspace): WorkspaceResource
    {
        $this->authorize('view', $workspace);

        return new WorkspaceResource($workspace);
    }

    public function update(Request $request, Workspace $workspace): WorkspaceResource
    {
        $this->authorize('update', $workspace);
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:120'],
            'settings.allowed_domains' => ['sometimes', 'array', 'max:100'],
            'settings.allowed_domains.*' => ['string', 'max:253', 'regex:/^(\*\.)?[a-z0-9.-]+$/i'],
            'settings.cost_limit_usd_monthly' => ['sometimes', 'numeric', 'min:0', 'max:100000'],
            'settings.artifact_retention_days' => ['sometimes', 'integer', 'min:1', 'max:3650'],
        ]);

        if (isset($data['settings'])) {
            $data['settings'] = array_replace_recursive($workspace->settings ?? [], $data['settings']);
        }
        $workspace->update($data);
        Audit::log('workspace.updated', $request->user(), $workspace, $workspace);

        return new WorkspaceResource($workspace);
    }

    public function projects(Workspace $workspace): AnonymousResourceCollection
    {
        $this->authorize('view', $workspace);

        return ProjectResource::collection($workspace->projects()->latest()->paginate(25));
    }

    public function storeProject(Request $request, Workspace $workspace): JsonResponse
    {
        $this->authorize('createProject', $workspace);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'description' => ['nullable', 'string', 'max:2000'],
        ]);
        $project = $workspace->projects()->create($data);
        Audit::log('project.created', $request->user(), $workspace, $project);

        return (new ProjectResource($project))->response()->setStatusCode(Response::HTTP_CREATED);
    }

    public function destroyProject(Request $request, Workspace $workspace, Project $project): Response
    {
        $this->authorize('deleteProject', [$workspace, $project]);
        $project->delete();
        Audit::log('project.deleted', $request->user(), $workspace, $project);

        return response()->noContent();
    }
}
