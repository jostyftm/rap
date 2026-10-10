<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\RecipeResource;
use App\Models\Project;
use App\Models\Recipe;
use App\Services\Audit;
use App\Services\DslValidator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Validation\ValidationException;

final class RecipeController extends Controller
{
    public function index(Project $project): AnonymousResourceCollection
    {
        return RecipeResource::collection(
            $project->recipes()->with('latestVersion')->latest()->paginate(25)
        );
    }

    public function store(Request $request, Project $project, DslValidator $validator): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:160'],
            'description' => ['nullable', 'string', 'max:2000'],
            'definition' => ['required', 'array'],
        ]);

        $errors = $validator->validate($data['definition']);
        if (! empty($errors)) {
            throw ValidationException::withMessages(['definition' => $errors]);
        }

        $recipe = $project->recipes()->create([
            'name' => $data['name'],
            'description' => $data['description'] ?? null,
            'status' => 'active',
        ]);

        $recipe->versions()->create([
            'version' => 1,
            'definition' => $data['definition'],
            'changelog' => 'Versión inicial',
            'created_by_user_id' => $request->user()?->id,
        ]);

        Audit::log('recipe.created', $request->user(), $project->workspace, $recipe);

        return (new RecipeResource($recipe->load('latestVersion')))
            ->response()
            ->setStatusCode(Response::HTTP_CREATED);
    }

    public function show(Recipe $recipe): RecipeResource
    {
        return new RecipeResource($recipe->load('latestVersion'));
    }
}
