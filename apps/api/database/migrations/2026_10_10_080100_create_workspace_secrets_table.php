<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('workspace_secrets', function (Blueprint $table): void {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('workspace_id')->constrained()->cascadeOnDelete();
            $table->string('key', 80);
            $table->text('value'); // Cifrado simétrico AES-256 vía Crypt::encryptString
            $table->string('description', 255)->nullable();
            $table->timestamps();

            $table->unique(['workspace_id', 'key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('workspace_secrets');
    }
};
