<?php

declare(strict_types=1);

use App\Models\Recipe;
use App\Models\RecipeVersion;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('recipes', function (Blueprint $table): void {
            $table->foreignId('published_version_id')
                ->nullable()
                ->after('status')
                ->constrained('recipe_versions')
                ->nullOnDelete();
            $table->timestamp('published_at')->nullable()->after('published_version_id');
        });

        Schema::table('recipe_versions', function (Blueprint $table): void {
            $table->foreignId('restored_from_version_id')
                ->nullable()
                ->after('changelog')
                ->constrained('recipe_versions')
                ->nullOnDelete();
        });

        // Backfill no destructivo:
        // Para cada receta existente, establecer como publicada su versión más alta actual
        // y crear la versión 0 (el borrador) con esa misma definición para no perder cambios.
        $recipes = DB::table('recipes')->get();
        foreach ($recipes as $recipe) {
            $latestVersion = DB::table('recipe_versions')
                ->where('recipe_id', $recipe->id)
                ->where('version', '>', 0)
                ->orderByDesc('version')
                ->first();

            if ($latestVersion) {
                DB::table('recipes')
                    ->where('id', $recipe->id)
                    ->update([
                        'published_version_id' => $latestVersion->id,
                        'published_at' => $latestVersion->created_at ?? now(),
                    ]);

                // Crear borrador (v0) si aún no existe
                $existingDraft = DB::table('recipe_versions')
                    ->where('recipe_id', $recipe->id)
                    ->where('version', 0)
                    ->first();

                if (! $existingDraft) {
                    DB::table('recipe_versions')->insert([
                        'uuid' => (string) Str::uuid(),
                        'recipe_id' => $recipe->id,
                        'version' => 0,
                        'definition' => $latestVersion->definition,
                        'changelog' => 'Borrador inicial migrado',
                        'created_by_user_id' => $latestVersion->created_by_user_id,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                }
            }
        }
    }

    public function down(): void
    {
        // Limpiar versiones 0 antes de quitar las relaciones si fuera necesario
        DB::table('recipe_versions')->where('version', 0)->delete();

        Schema::table('recipe_versions', function (Blueprint $table): void {
            $table->dropForeign(['restored_from_version_id']);
            $table->dropColumn('restored_from_version_id');
        });

        Schema::table('recipes', function (Blueprint $table): void {
            $table->dropForeign(['published_version_id']);
            $table->dropColumn(['published_version_id', 'published_at']);
        });
    }
};
