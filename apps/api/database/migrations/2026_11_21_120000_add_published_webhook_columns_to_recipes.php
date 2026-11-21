<?php

declare(strict_types=1);

use App\Services\WebhookRunDelivery;
use App\Support\WebhookPath;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('recipes', function (Blueprint $table): void {
            $table->string('published_webhook_path', 255)->nullable()->after('webhook_enabled')->index();
            $table->string('published_webhook_method', 16)->nullable()->after('published_webhook_path');
        });

        // Backfill no destructivo para recetas activas publicadas cuyo nodo inicial es webhook
        $claimed = [];
        $recipes = DB::table('recipes')
            ->where('status', 'active')
            ->whereNull('deleted_at')
            ->whereNotNull('published_version_id')
            ->orderBy('id')
            ->get(['id', 'published_version_id']);

        foreach ($recipes as $recipe) {
            $version = DB::table('recipe_versions')
                ->where('id', $recipe->published_version_id)
                ->first(['definition']);

            if (! $version || ! is_string($version->definition)) {
                continue;
            }

            $definition = json_decode($version->definition, true);
            if (! is_array($definition)) {
                continue;
            }

            $node = WebhookRunDelivery::entryWebhookNode($definition);
            if ($node === null) {
                continue;
            }

            $rawPath = (string) ($node['params']['path'] ?? $node['id'] ?? 'webhook');
            $fallback = (string) ($node['id'] ?? 'webhook');
            $slug = WebhookPath::slug($rawPath, $fallback);
            if (WebhookPath::isReservedSlug($slug)) {
                continue;
            }

            $prodPath = WebhookPath::productionPath($slug, $fallback);
            $method = strtoupper((string) ($node['params']['httpMethod'] ?? 'POST'));

            $existingMethods = $claimed[$prodPath] ?? [];
            $hasConflict = in_array('ANY', $existingMethods, true)
                || ($method === 'ANY' && $existingMethods !== [])
                || in_array($method, $existingMethods, true);

            if ($hasConflict) {
                continue;
            }

            $claimed[$prodPath][] = $method;

            DB::table('recipes')
                ->where('id', $recipe->id)
                ->update([
                    'published_webhook_path' => $prodPath,
                    'published_webhook_method' => $method,
                ]);
        }
    }

    public function down(): void
    {
        Schema::table('recipes', function (Blueprint $table): void {
            $table->dropIndex(['published_webhook_path']);
            $table->dropColumn(['published_webhook_path', 'published_webhook_method']);
        });
    }
};
