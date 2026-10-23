<?php

declare(strict_types=1);

namespace App\Http\Controllers\Internal;

use App\Http\Controllers\Controller;
use App\Models\Run;
use App\Services\Audit;
use App\Services\WorkspaceSecretService;
use App\Support\RecipeSecretRefs;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class RunSecretsController extends Controller
{
    public function show(Request $request, Run $run, WorkspaceSecretService $secrets): JsonResponse
    {
        $validated = $request->validate([
            'refs' => ['present', 'array', 'max:50'],
            'refs.*' => ['string', 'max:80'],
        ]);

        $run->loadMissing('recipeVersion.recipe.project.workspace');
        $workspace = $run->recipeVersion?->recipe?->project?->workspace;

        if ($workspace === null) {
            abort(422, 'La ejecución no tiene un workspace asociado.');
        }

        if (! in_array($run->status, ['queued', 'running', 'paused'], true)) {
            abort(409, 'La ejecución ya finalizó y no puede resolver secretos.');
        }

        /** @var list<string> $requested */
        $requested = array_values(array_unique($validated['refs']));

        $allowed = RecipeSecretRefs::fromDefinition((array) $run->recipeVersion->definition);
        $notAllowed = array_values(array_diff($requested, $allowed));

        if ($notAllowed !== []) {
            abort(422, 'La receta no declara los secretos solicitados.');
        }

        $resolved = $secrets->getDecryptedForWorkspace($workspace, $requested);
        $missing = array_values(array_diff($requested, array_keys($resolved)));

        if ($missing !== []) {
            abort(422, 'Faltan secretos en el workspace para ejecutar la receta.');
        }

        Audit::log('secret.access', null, $workspace, $run, ['keys' => $requested]);

        return response()
            ->json(['secrets' => (object) $resolved])
            ->header('Cache-Control', 'no-store');
    }
}
