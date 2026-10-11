<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('recipes', function (Blueprint $table): void {
            $table->string('webhook_token', 64)->nullable()->unique()->after('status');
            $table->boolean('webhook_enabled')->default(false)->after('webhook_token');
        });
    }

    public function down(): void
    {
        Schema::table('recipes', function (Blueprint $table): void {
            $table->dropColumn(['webhook_token', 'webhook_enabled']);
        });
    }
};
