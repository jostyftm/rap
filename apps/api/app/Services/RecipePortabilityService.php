<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Project;
use App\Models\Recipe;
use App\Models\RecipeVersion;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class RecipePortabilityService
{
    public const FORMAT = 'rpa-studio.recipe';
    public const CURRENT_FORMAT_VERSION = 1;

    public function __construct(
        private DslValidator $dslValidator
    ) {}

    /**
     * Exporta una receta (borrador o versión fija) en formato portable JSON.
     *
     * @return array<string, mixed>
     */
    public function export(Recipe $recipe, ?int $versionNumber = null): array
    {
        $version = $versionNumber !== null
            ? $recipe->allVersions()->where('version', $versionNumber)->first()
            : ($recipe->draft ?? $recipe->publishedVersion ?? $recipe->latestVersion);

        if (! $version instanceof RecipeVersion) {
            throw new NotFoundHttpException("No se encontró la versión solicitada para la receta {$recipe->uuid}");
        }

        return [
            'format' => self::FORMAT,
            'format_version' => self::CURRENT_FORMAT_VERSION,
            'exported_at' => now()->toIso8601String(),
            'source' => [
                'recipe_id' => $recipe->uuid,
                'recipe_name' => $recipe->name,
                'version' => $version->isDraft() ? null : $version->version,
                'is_draft' => $version->isDraft(),
            ],
            'recipe' => [
                'name' => $recipe->name,
                'description' => $recipe->description,
                'allowed_domains' => $recipe->allowed_domains ?? [],
            ],
            'definition' => $version->definition,
        ];
    }

    /**
     * Valida el formato importado y su DSL.
     *
     * @param  array<string, mixed>  $data
     * @return array{recipe: array<string, mixed>, definition: array<string, mixed>, referenced_secrets: list<string>}
     */
    public function parseAndValidate(array $data): array
    {
        if (($data['format'] ?? null) !== self::FORMAT) {
            throw ValidationException::withMessages([
                'file' => 'El archivo no tiene el formato de receta válido (se esperaba "'.self::FORMAT.'").',
            ]);
        }

        $formatVersion = (int) ($data['format_version'] ?? 0);
        if ($formatVersion < 1 || $formatVersion > self::CURRENT_FORMAT_VERSION) {
            throw ValidationException::withMessages([
                'file' => "Versión de formato no soportada ({$formatVersion}). La versión máxima admitida es ".self::CURRENT_FORMAT_VERSION.'.',
            ]);
        }

        $definition = $data['definition'] ?? null;
        if (! is_array($definition)) {
            throw ValidationException::withMessages([
                'definition' => 'El archivo no contiene una definición DSL de receta válida.',
            ]);
        }

        $errors = $this->dslValidator->validate($definition);
        if (! empty($errors)) {
            throw ValidationException::withMessages([
                'definition' => $errors,
            ]);
        }

        $referencedSecrets = $this->extractReferencedSecrets($definition);

        return [
            'recipe' => (array) ($data['recipe'] ?? []),
            'definition' => $definition,
            'referenced_secrets' => $referencedSecrets,
        ];
    }

    /**
     * Importa una receta como una nueva automatización en el proyecto dado.
     *
     * @param  array<string, mixed>  $data
     * @return array{recipe: Recipe, missing_secrets: list<string>}
     */
    public function importAsNew(Project $project, array $data, ?User $user): array
    {
        $parsed = $this->parseAndValidate($data);
        $project->loadMissing('workspace.secrets');

        $workspaceSecrets = $project->workspace?->secrets->pluck('key')->all() ?? [];
        $missingSecrets = array_values(array_diff($parsed['referenced_secrets'], $workspaceSecrets));

        $recipe = DB::transaction(function () use ($project, $parsed, $user): Recipe {
            $name = ! empty($parsed['recipe']['name'])
                ? (string) $parsed['recipe']['name']
                : 'Receta importada';

            $newRecipe = $project->recipes()->create([
                'name' => $name,
                'description' => $parsed['recipe']['description'] ?? null,
                'allowed_domains' => $parsed['recipe']['allowed_domains'] ?? null,
                'status' => 'active',
            ]);

            // Se crea inicialmente solo como borrador v0
            $newRecipe->allVersions()->create([
                'version' => 0,
                'definition' => $parsed['definition'],
                'changelog' => 'Importada desde archivo',
                'created_by_user_id' => $user?->id,
            ]);

            Audit::log('recipe.imported', $user, $project->workspace, $newRecipe, [
                'as_new' => true,
            ]);

            return $newRecipe->load(['draft', 'publishedVersion', 'latestVersion']);
        });

        return [
            'recipe' => $recipe,
            'missing_secrets' => $missingSecrets,
        ];
    }

    /**
     * Importa y reemplaza el borrador de una receta existente.
     *
     * @param  array<string, mixed>  $data
     * @return array{recipe: Recipe, missing_secrets: list<string>}
     */
    public function importIntoDraft(Recipe $recipe, array $data, ?User $user): array
    {
        $parsed = $this->parseAndValidate($data);
        $recipe->loadMissing('project.workspace.secrets');

        $workspaceSecrets = $recipe->project?->workspace?->secrets->pluck('key')->all() ?? [];
        $missingSecrets = array_values(array_diff($parsed['referenced_secrets'], $workspaceSecrets));

        $updatedRecipe = DB::transaction(function () use ($recipe, $parsed, $user): Recipe {
            $draft = $recipe->draft;
            if ($draft) {
                $draft->update([
                    'definition' => $parsed['definition'],
                    'changelog' => 'Borrador reemplazado por importación',
                ]);
            } else {
                $recipe->allVersions()->create([
                    'version' => 0,
                    'definition' => $parsed['definition'],
                    'changelog' => 'Borrador creado por importación',
                    'created_by_user_id' => $user?->id,
                ]);
            }

            Audit::log('recipe.imported_into_draft', $user, $recipe->project->workspace, $recipe);

            return $recipe->load(['draft', 'publishedVersion', 'latestVersion']);
        });

        return [
            'recipe' => $updatedRecipe,
            'missing_secrets' => $missingSecrets,
        ];
    }

    /**
     * Extrae nombres de secretos referenciados como {{secrets.MI_SECRETO}} en la definición.
     *
     * @param  array<string, mixed>  $definition
     * @return list<string>
     */
    public function extractReferencedSecrets(array $definition): array
    {
        $json = (string) json_encode($definition);
        preg_match_all('/\{\{\s*secrets\.([a-zA-Z0-9_-]+)\s*\}\}/', $json, $matches);

        if (empty($matches[1])) {
            return [];
        }

        return array_values(array_unique($matches[1]));
    }
}
