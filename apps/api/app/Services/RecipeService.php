<?php

declare(strict_types=1);

namespace App\Services;

use App\Http\Requests\Recipe\RecipeCreateRequest;
use App\Models\Project;
use App\Models\Recipe;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class RecipeService
{
    public function __construct(
        private DslValidator $dslValidator
    ) {}

    /**
     * @return LengthAwarePaginator<Recipe>
     */
    public function list(Project $project): LengthAwarePaginator
    {
        return $project->recipes()
            ->with('latestVersion')
            ->latest()
            ->paginate(25);
    }

    public function get(Recipe $recipe): Recipe
    {
        return $recipe->load('latestVersion');
    }

    public function save(RecipeCreateRequest $request, Project $project): Recipe
    {
        $data = $request->validated();

        $errors = $this->dslValidator->validate($data['definition']);
        if (! empty($errors)) {
            throw ValidationException::withMessages([
                'definition' => $errors,
            ]);
        }

        return DB::transaction(function () use ($data, $project, $request): Recipe {
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

            return $recipe->load('latestVersion');
        });
    }
}
