<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\v1\Secret;

use App\Http\Controllers\Controller;
use App\Http\Requests\Secret\WorkspaceSecretCreateRequest;
use App\Http\Resources\Secret\WorkspaceSecretResource;
use App\Models\Workspace;
use App\Models\WorkspaceSecret;
use App\Services\WorkspaceSecretService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

class WorkspaceSecretController extends Controller
{
    public function __construct(
        private WorkspaceSecretService $secretService
    ) {}

    public function index(Workspace $workspace): AnonymousResourceCollection
    {
        $secrets = $this->secretService->list($workspace);

        return WorkspaceSecretResource::collection($secrets);
    }

    public function store(WorkspaceSecretCreateRequest $request, Workspace $workspace): JsonResponse
    {
        $secret = $this->secretService->set($request, $workspace);

        return (new WorkspaceSecretResource($secret))
            ->response()
            ->setStatusCode(Response::HTTP_CREATED);
    }

    public function destroy(Workspace $workspace, WorkspaceSecret $secret): Response
    {
        $this->secretService->delete($workspace, $secret);

        return response()->noContent();
    }
}
