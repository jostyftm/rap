<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('runs', function (Blueprint $table): void {
            $table->json('result')->nullable()->after('parameters');
        });

        Schema::table('run_steps', function (Blueprint $table): void {
            $table->json('output')->nullable()->after('screenshot_path');
        });
    }

    public function down(): void
    {
        Schema::table('runs', function (Blueprint $table): void {
            if (Schema::hasColumn('runs', 'result')) {
                $table->dropColumn('result');
            }
        });

        Schema::table('run_steps', function (Blueprint $table): void {
            if (Schema::hasColumn('run_steps', 'output')) {
                $table->dropColumn('output');
            }
        });
    }
};
