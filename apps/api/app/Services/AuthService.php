<?php

declare(strict_types=1);

namespace App\Services;

use App\Enums\Role;
use App\Http\Requests\Auth\AuthLoginRequest;
use App\Http\Requests\Auth\AuthRegisterRequest;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AuthService
{
    /**
     * Registra un usuario y su workspace personal de forma atómica.
     */
    public function register(AuthRegisterRequest $request): User
    {
        $validated = $request->validated();

        $user = DB::transaction(function () use ($validated): User {
            $user = User::create([
                'name' => $validated['name'],
                'email' => $validated['email'],
                'password' => $validated['password'],
            ]);

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

        Auth::guard('web')->login($user);
        if ($request->hasSession()) {
            $request->session()->regenerate();
        }

        Audit::log('user.registered', $user);

        return $user;
    }

    /**
     * Autentica al usuario mediante credenciales web.
     */
    public function login(AuthLoginRequest $request): User
    {
        $credentials = $request->validated();

        if (! Auth::guard('web')->attempt($credentials)) {
            throw ValidationException::withMessages([
                'email' => [__('auth.failed')],
            ]);
        }

        if ($request->hasSession()) {
            $request->session()->regenerate();
        }

        /** @var User $user */
        $user = Auth::guard('web')->user();
        Audit::log('user.login', $user);

        return $user;
    }

    /**
     * Cierra la sesión activa del usuario.
     */
    public function logout(Request $request): void
    {
        Auth::guard('web')->logout();

        if ($request->hasSession()) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }
    }

    /**
     * Obtiene el usuario autenticado con sus workspaces asociados.
     */
    public function me(Request $request): User
    {
        /** @var User $user */
        $user = $request->user();

        return $user->load('workspaces');
    }
}
