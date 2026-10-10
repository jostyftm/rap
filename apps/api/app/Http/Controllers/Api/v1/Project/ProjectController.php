<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\v1\Project;

use App\Http\Controllers\Controller;
use App\Http\Requests\Project\ProjectCreateRequest;
use App\Http\Resources\Project\ProjectResource;
use App\Models\Project;
use App\Models\Workspace;
use App\Services\ProjectService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

class ProjectController extends Controller
{
    public function __construct(
        private ProjectService $projectService
    ) {}

    /**
     * List workspace projects
     */
    public function index(Workspace $workspace): AnonymousResourceCollection
    {
        $this->authorize('view', $workspace);

        $projects = $this->projectService->list($workspace);

        return ProjectResource::collection($projects);
    }

    /**
     * Create a new project in workspace
     */
    public function store(ProjectCreateRequest $request, Workspace $workspace): JsonResponse
    {
        $this->authorize('createProject', $workspace);

        $project = $this->projectService->save($request, $workspace);

        return (new ProjectResource($project))
            ->response()
            ->setStatusCode(Response::HTTP_CREATED);
    }

    /**
     * Delete project from workspace
     */
    public function destroy(Workspace $workspace, Project $project): Response
    {
        $this->authorize('deleteProject', [$workspace, $project]);

        $this->projectService->delete($workspace, $project);

        return response()->noContent();
    }
}
