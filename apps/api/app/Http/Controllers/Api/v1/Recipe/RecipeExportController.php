<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\v1\Recipe;

use App\Http\Controllers\Controller;
use App\Models\Recipe;
use App\Services\RecipeExportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

class RecipeExportController extends Controller
{
    public function __construct(
        private RecipeExportService $recipeExportService
    ) {}

    /**
     * Export recipe to Playwright TypeScript
     */
    public function export(Request $request, Recipe $recipe): JsonResponse|StreamedResponse
    {
        $version = $request->query('version') ? (int) $request->query('version') : null;
        $script = $this->recipeExportService->export($recipe, $version);

        if ($request->query('download') === 'true') {
            $filename = str($recipe->name)->slug().'.spec.ts';

            return response()->streamDownload(function () use ($script): void {
                echo $script;
            }, $filename, [
                'Content-Type' => 'text/typescript',
            ]);
        }

        return response()->json([
            'recipe_id' => $recipe->id,
            'recipe_name' => $recipe->name,
            'format' => 'playwright-test',
            'code' => $script,
        ]);
    }
}
