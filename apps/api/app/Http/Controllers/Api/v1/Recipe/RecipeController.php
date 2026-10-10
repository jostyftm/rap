<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\v1\Recipe;

use App\Http\Controllers\Controller;
use App\Http\Requests\Recipe\RecipeCreateRequest;
use App\Http\Requests\Recipe\RecipeUpdateRequest;
use App\Http\Resources\Recipe\RecipeResource;
use App\Models\Project;
use App\Models\Recipe;
use App\Services\RecipeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

class RecipeController extends Controller
{
    public function __construct(
        private RecipeService $recipeService
    ) {}

    /**
     * List project recipes
     */
    public function index(Project $project): AnonymousResourceCollection
    {
        $recipes = $this->recipeService->list($project);

        return RecipeResource::collection($recipes);
    }

    /**
     * Create a new recipe and its initial version (v1)
     */
    public function store(RecipeCreateRequest $request, Project $project): JsonResponse
    {
        $recipe = $this->recipeService->save($request, $project);

        return (new RecipeResource($recipe))
            ->response()
            ->setStatusCode(Response::HTTP_CREATED);
    }

    /**
     * Get recipe details with latest version
     */
    public function show(Recipe $recipe): RecipeResource
    {
        $result = $this->recipeService->get($recipe);

        return new RecipeResource($result);
    }

    /**
     * Update recipe and optionally create a new version
     */
    public function update(RecipeUpdateRequest $request, Recipe $recipe): RecipeResource
    {
        $result = $this->recipeService->update($request, $recipe);

        return new RecipeResource($result);
    }
}
