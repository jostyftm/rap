<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('recipe_schedules', function (Blueprint $table): void {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('recipe_id')->constrained()->cascadeOnDelete();
            $table->foreignId('workspace_id')->constrained()->cascadeOnDelete();
            $table->string('name', 100);
            $table->string('cron_expression', 50);
            $table->boolean('is_active')->default(true);
            $table->json('parameters')->nullable();
            $table->timestamp('last_run_at')->nullable();
            $table->timestamp('next_run_at')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['workspace_id', 'is_active']);
            $table->index(['recipe_id', 'is_active']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('recipe_schedules');
    }
};
