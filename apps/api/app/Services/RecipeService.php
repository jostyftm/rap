<?php

declare(strict_types=1);

namespace App\Services;

use App\Http\Requests\Recipe\RecipeCreateRequest;
use App\Http\Requests\Recipe\RecipeUpdateRequest;
use App\Models\Project;
use App\Models\Recipe;
use App\Models\RecipeVersion;
use App\Models\User;
use App\Support\WebhookPath;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

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
            ->with(['draft', 'publishedVersion', 'latestVersion'])
            ->latest()
            ->paginate(25);
    }

    public function get(Recipe $recipe): Recipe
    {
        return $recipe->load(['draft', 'publishedVersion', 'latestVersion']);
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

            // Versión inicial publicada (versión 1)
            $v1 = $recipe->allVersions()->create([
                'version' => 1,
                'definition' => $data['definition'],
                'changelog' => 'Versión inicial',
                'created_by_user_id' => $request->user()?->id,
            ]);

            // Borrador inicial sincronizado (versión 0)
            $recipe->allVersions()->create([
                'version' => 0,
                'definition' => $data['definition'],
                'changelog' => 'Borrador inicial',
                'created_by_user_id' => $request->user()?->id,
            ]);

            $recipe->update([
                'published_version_id' => $v1->id,
                'published_at' => now(),
            ]);

            $this->syncPublishedWebhook($recipe, (array) $data['definition']);

            Audit::log('recipe.created', $request->user(), $project->workspace, $recipe);

            return $recipe->load(['draft', 'publishedVersion', 'latestVersion']);
        });
    }

    public function update(RecipeUpdateRequest $request, Recipe $recipe): Recipe
    {
        $data = $request->validated();

        if (isset($data['definition'])) {
            $errors = $this->dslValidator->validate($data['definition']);
            if (! empty($errors)) {
                throw ValidationException::withMessages([
                    'definition' => $errors,
                ]);
            }
        }

        return DB::transaction(function () use ($data, $recipe, $request): Recipe {
            $updateData = [];
            if (isset($data['name'])) {
                $updateData['name'] = $data['name'];
            }
            if (array_key_exists('description', $data)) {
                $updateData['description'] = $data['description'];
            }
            if (! empty($updateData)) {
                $recipe->update($updateData);
            }

            if (isset($data['definition'])) {
                // Actualiza o crea el borrador (versión 0), no crea nuevas versiones
                $draft = $recipe->draft;
                if ($draft) {
                    $draft->update([
                        'definition' => $data['definition'],
                        'changelog' => $data['changelog'] ?? $draft->changelog,
                    ]);
                } else {
                    $recipe->allVersions()->create([
                        'version' => 0,
                        'definition' => $data['definition'],
                        'changelog' => $data['changelog'] ?? 'Borrador',
                        'created_by_user_id' => $request->user()?->id,
                    ]);
                }
            }

            Audit::log('recipe.updated', $request->user(), $recipe->project->workspace, $recipe);

            return $recipe->load(['draft', 'publishedVersion', 'latestVersion']);
        });
    }

    public function publish(Recipe $recipe, ?string $changelog, ?User $user): Recipe
    {
        $recipe->loadMissing(['draft', 'publishedVersion']);
        $draft = $recipe->draft;

        if (! $draft || empty($draft->definition)) {
            throw ValidationException::withMessages([
                'recipe' => 'La receta no posee un borrador para publicar.',
            ]);
        }

        $errors = $this->dslValidator->validate($draft->definition);
        if (! empty($errors)) {
            throw ValidationException::withMessages([
                'definition' => $errors,
            ]);
        }

        if ($recipe->publishedVersion && $recipe->publishedVersion->definition === $draft->definition) {
            throw ValidationException::withMessages([
                'recipe' => 'No hay cambios en el borrador para publicar.',
            ]);
        }

        return DB::transaction(function () use ($recipe, $draft, $changelog, $user): Recipe {
            $nextVersion = ((int) $recipe->allVersions()->where('version', '>', 0)->max('version')) + 1;

            $newVersion = $recipe->allVersions()->create([
                'version' => $nextVersion,
                'definition' => $draft->definition,
                'changelog' => $changelog ?: "Versión {$nextVersion}",
                'created_by_user_id' => $user?->id,
            ]);

            $recipe->update([
                'published_version_id' => $newVersion->id,
                'published_at' => now(),
            ]);

            $this->syncPublishedWebhook($recipe, (array) $draft->definition);

            Audit::log('recipe.published', $user, $recipe->project->workspace, $recipe, [
                'version' => $nextVersion,
            ]);

            return $recipe->load(['draft', 'publishedVersion', 'latestVersion']);
        });
    }

    public function restore(Recipe $recipe, int $versionNumber, ?User $user): Recipe
    {
        $targetVersion = $recipe->allVersions()
            ->where('version', $versionNumber)
            ->where('version', '>', 0)
            ->first();

        if (! $targetVersion) {
            throw new NotFoundHttpException("La versión {$versionNumber} no existe para esta receta.");
        }

        return DB::transaction(function () use ($recipe, $targetVersion, $versionNumber, $user): Recipe {
            $nextVersion = ((int) $recipe->allVersions()->where('version', '>', 0)->max('version')) + 1;

            $newVersion = $recipe->allVersions()->create([
                'version' => $nextVersion,
                'definition' => $targetVersion->definition,
                'changelog' => "Restaurada desde versión {$versionNumber}",
                'restored_from_version_id' => $targetVersion->id,
                'created_by_user_id' => $user?->id,
            ]);

            $recipe->update([
                'published_version_id' => $newVersion->id,
                'published_at' => now(),
            ]);

            $this->syncPublishedWebhook($recipe, (array) $targetVersion->definition);

            // Reemplazar también el borrador v0 con la definición restaurada
            $draft = $recipe->draft;
            if ($draft) {
                $draft->update([
                    'definition' => $targetVersion->definition,
                    'changelog' => "Restaurado desde versión {$versionNumber}",
                ]);
            } else {
                $recipe->allVersions()->create([
                    'version' => 0,
                    'definition' => $targetVersion->definition,
                    'changelog' => "Restaurado desde versión {$versionNumber}",
                    'created_by_user_id' => $user?->id,
                ]);
            }

            Audit::log('recipe.restored', $user, $recipe->project->workspace, $recipe, [
                'from_version' => $versionNumber,
                'new_version' => $nextVersion,
            ]);

            return $recipe->load(['draft', 'publishedVersion', 'latestVersion']);
        });
    }

    /**
     * @return LengthAwarePaginator<RecipeVersion>
     */
    public function listVersions(Recipe $recipe): LengthAwarePaginator
    {
        return $recipe->versions()
            ->with(['creator', 'restoredFrom'])
            ->paginate(20);
    }

    public function getVersion(Recipe $recipe, int $versionNumber): RecipeVersion
    {
        $version = $recipe->allVersions()
            ->where('version', $versionNumber)
            ->with(['creator', 'restoredFrom'])
            ->first();

        if (! $version) {
            throw new NotFoundHttpException("La versión {$versionNumber} no existe.");
        }

        return $version;
    }

    /**
     * Sincroniza la ruta de webhook siempre-activa de una receta según su versión publicada.
     * Los cambios en el borrador (v0) nunca deben sobrescribir este registro hasta publicar.
     *
     * @param  array<string, mixed>|null  $publishedDefinition
     */
    public function syncPublishedWebhook(Recipe $recipe, ?array $publishedDefinition): void
    {
        $node = is_array($publishedDefinition)
            ? WebhookRunDelivery::entryWebhookNode($publishedDefinition)
            : null;

        if ($node === null || $recipe->status !== 'active') {
            $recipe->update([
                'published_webhook_path' => null,
                'published_webhook_method' => null,
            ]);

            return;
        }

        $rawPath = (string) ($node['params']['path'] ?? $node['id'] ?? 'webhook');
        $fallback = (string) ($node['id'] ?? 'webhook');
        $slug = WebhookPath::slug($rawPath, $fallback);

        if (WebhookPath::isReservedSlug($slug)) {
            throw ValidationException::withMessages([
                'definition' => "El prefijo 'recipes/' está reservado para triggers por token. Elige otra ruta para el nodo webhook.",
            ]);
        }

        $prodPath = WebhookPath::productionPath($slug, $fallback);
        $method = strtoupper((string) ($node['params']['httpMethod'] ?? 'POST'));

        $conflicts = Recipe::query()
            ->where('id', '!=', $recipe->id)
            ->where('status', 'active')
            ->whereNotNull('published_version_id')
            ->where('published_webhook_path', $prodPath)
            ->get();

        foreach ($conflicts as $other) {
            $otherMethod = strtoupper((string) ($other->published_webhook_method ?? 'POST'));
            if ($otherMethod === 'ANY' || $method === 'ANY' || $otherMethod === $method) {
                throw ValidationException::withMessages([
                    'definition' => "La ruta de webhook '{$prodPath}' ({$method}) ya está publicada y activa en otra automatización ('{$other->name}'). Usa una ruta distinta antes de publicar.",
                ]);
            }
        }

        $recipe->update([
            'published_webhook_path' => $prodPath,
            'published_webhook_method' => $method,
        ]);
    }
}
