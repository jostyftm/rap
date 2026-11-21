<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\v1\Recipe;

use App\Http\Controllers\Controller;
use App\Http\Requests\Recipe\RecipeImportRequest;
use App\Http\Resources\Recipe\RecipeResource;
use App\Models\Project;
use App\Models\Recipe;
use App\Services\RecipePortabilityService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RecipePortabilityController extends Controller
{
    public function __construct(
        private RecipePortabilityService $portabilityService
    ) {}

    /**
     * Exporta la receta (borrador o versión específica) como JSON
     */
    public function export(Request $request, Recipe $recipe): JsonResponse
    {
        $versionNumber = $request->has('version') ? (int) $request->input('version') : null;
        $exported = $this->portabilityService->export($recipe, $versionNumber);

        $safeName = preg_replace('/[^a-zA-Z0-9_-]+/', '-', strtolower($recipe->name)) ?: 'recipe';
        $vTag = $versionNumber !== null ? "v{$versionNumber}" : 'draft';
        $filename = "{$safeName}-{$vTag}.json";

        return response()->json($exported, headers: [
            'Content-Disposition' => "attachment; filename=\"{$filename}\"",
        ]);
    }

    /**
     * Importa una receta JSON como una nueva automatización en el proyecto
     */
    public function importNew(RecipeImportRequest $request, Project $project): JsonResponse
    {
        $data = $request->getImportData();
        $result = $this->portabilityService->importAsNew(
            project: $project,
            data: $data,
            user: $request->user()
        );

        return response()->json([
            'data' => new RecipeResource($result['recipe']),
            'missing_secrets' => $result['missing_secrets'],
        ], Response::HTTP_CREATED);
    }

    /**
     * Importa un JSON reemplazando el borrador de una automatización existente
     */
    public function importIntoDraft(RecipeImportRequest $request, Recipe $recipe): JsonResponse
    {
        $data = $request->getImportData();
        $result = $this->portabilityService->importIntoDraft(
            recipe: $recipe,
            data: $data,
            user: $request->user()
        );

        return response()->json([
            'data' => new RecipeResource($result['recipe']),
            'missing_secrets' => $result['missing_secrets'],
        ]);
    }
}
