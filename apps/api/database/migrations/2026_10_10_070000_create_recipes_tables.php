<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('recipes', function (Blueprint $table): void {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();
            $table->string('name', 160);
            $table->text('description')->nullable();
            $table->string('status', 32)->default('draft'); // draft, active, archived
            $table->json('allowed_domains')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->index(['project_id', 'created_at']);
        });

        Schema::create('recipe_versions', function (Blueprint $table): void {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('recipe_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('version')->default(1);
            $table->json('definition'); // JSON Schema DSL
            $table->text('changelog')->nullable();
            $table->foreignId('created_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['recipe_id', 'version']);
            $table->index(['recipe_id', 'created_at']);
        });

        Schema::create('runs', function (Blueprint $table): void {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('recipe_version_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('status', 32)->default('queued'); // queued, running, completed, failed, stopped
            $table->string('trigger', 32)->default('manual'); // manual, api, schedule
            $table->json('parameters')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->unsignedInteger('duration_ms')->nullable();
            $table->text('error_message')->nullable();
            $table->timestamps();
            $table->index(['recipe_version_id', 'created_at']);
            $table->index(['status', 'created_at']);
        });

        Schema::create('run_steps', function (Blueprint $table): void {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('run_id')->constrained()->cascadeOnDelete();
            $table->string('node_id', 64);
            $table->string('status', 32)->default('pending'); // pending, running, success, failed, skipped
            $table->string('locator_strategy_used', 32)->nullable();
            $table->text('locator_value_used')->nullable();
            $table->unsignedInteger('retries')->default(0);
            $table->unsignedInteger('duration_ms')->nullable();
            $table->string('screenshot_path')->nullable();
            $table->text('error_message')->nullable();
            $table->timestamps();
            $table->index(['run_id', 'node_id']);
        });

        Schema::create('artifacts', function (Blueprint $table): void {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('run_id')->constrained()->cascadeOnDelete();
            $table->string('type', 32); // screenshot, trace, video, download, log
            $table->string('s3_key');
            $table->string('mime_type', 128)->nullable();
            $table->unsignedBigInteger('size_bytes')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();
            $table->index(['run_id', 'type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('artifacts');
        Schema::dropIfExists('run_steps');
        Schema::dropIfExists('runs');
        Schema::dropIfExists('recipe_versions');
        Schema::dropIfExists('recipes');
    }
};
