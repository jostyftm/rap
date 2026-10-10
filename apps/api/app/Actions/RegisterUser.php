<?php

declare(strict_types=1);

namespace App\Actions;

use App\Enums\Role;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class RegisterUser
{
    /**
     * Crea el usuario y su workspace personal (owner) en una transacción.
     *
     * @param  array{name:string,email:string,password:string}  $data
     */
    public function __invoke(array $data): User
    {
        return DB::transaction(function () use ($data): User {
            $user = User::create($data);

            $workspace = Workspace::create([
                'name' => "Espacio de {$user->name}",
                'slug' => Str::slug($user->name).'-'.Str::lower(Str::random(6)),
                'settings' => [
                    'allowed_domains' => [],
                    'cost_limit_usd_monthly' => 20,
                    'llm' => ['provider' => config('ai.default'), 'model' => null],
                    'artifact_retention_days' => 30,
                ],
            ]);
            $workspace->members()->attach($user->id, ['role' => Role::Owner->value]);

            return $user;
        });
    }
}
