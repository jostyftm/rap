<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('run_logs', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('run_id')->constrained('runs')->cascadeOnDelete();
            $table->string('level', 16)->default('info');
            $table->string('source', 32)->default('runner');
            $table->string('node_id', 64)->nullable();
            $table->text('message');
            $table->json('context')->nullable();
            $table->timestamp('logged_at')->useCurrent();

            $table->index(['run_id', 'id']);
            $table->index(['run_id', 'level']);
            $table->index(['run_id', 'source']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('run_logs');
    }
};
