<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\v1\Recipe;

use App\Http\Controllers\Controller;
use App\Http\Requests\Recipe\RecipePublishRequest;
use App\Http\Resources\Recipe\RecipeResource;
use App\Http\Resources\Recipe\RecipeVersionResource;
use App\Models\Recipe;
use App\Services\RecipeService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class RecipeVersionController extends Controller
{
    public function __construct(
        private RecipeService $recipeService
    ) {}

    /**
     * Publica el borrador actual como una nueva versión inmutable
     */
    public function publish(RecipePublishRequest $request, Recipe $recipe): RecipeResource
    {
        $result = $this->recipeService->publish(
            recipe: $recipe,
            changelog: $request->input('changelog'),
            user: $request->user()
        );

        return new RecipeResource($result);
    }

    /**
     * Lista el historial de versiones publicadas de la receta
     */
    public function index(Recipe $recipe): AnonymousResourceCollection
    {
        $versions = $this->recipeService->listVersions($recipe);

        return RecipeVersionResource::collection($versions);
    }

    /**
     * Obtiene el detalle de una versión específica de la receta
     */
    public function show(Recipe $recipe, int $version): RecipeVersionResource
    {
        $v = $this->recipeService->getVersion($recipe, $version);

        return new RecipeVersionResource($v);
    }

    /**
     * Retrocede (rollback) a una versión anterior creando una nueva versión publicada
     */
    public function restore(Request $request, Recipe $recipe, int $version): RecipeResource
    {
        $result = $this->recipeService->restore(
            recipe: $recipe,
            versionNumber: $version,
            user: $request->user()
        );

        return new RecipeResource($result);
    }
}
