<?php

declare(strict_types=1);

namespace App\Services;

use App\Http\Requests\Project\ProjectCreateRequest;
use App\Models\Project;
use App\Models\Workspace;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;

class ProjectService
{
    /**
     * @return LengthAwarePaginator<Project>
     */
    public function list(Workspace $workspace): LengthAwarePaginator
    {
        return $workspace->projects()->latest()->paginate(25);
    }

    public function save(ProjectCreateRequest $request, Workspace $workspace): Project
    {
        $project = $workspace->projects()->create($request->validated());

        Audit::log('project.created', $request->user(), $workspace, $project);

        return $project;
    }

    public function delete(Workspace $workspace, Project $project): void
    {
        $project->delete();

        Audit::log('project.deleted', request()->user(), $workspace, $project);
    }
}
