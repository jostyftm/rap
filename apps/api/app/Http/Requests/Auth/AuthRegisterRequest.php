<?php

declare(strict_types=1);

namespace App\Http\Requests\Auth;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

class AuthRegisterRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            /**
             * Nombre completo del usuario
             *
             * @example Ana Pérez
             */
            'name' => ['required', 'string', 'max:120'],

            /**
             * Correo electrónico único
             *
             * @example ana@example.com
             */
            'email' => ['required', 'email:rfc', 'max:255', 'unique:users,email'],

            /**
             * Contraseña segura (mínimo 10 caracteres)
             *
             * @example correct-horse-battery
             */
            'password' => ['required', 'confirmed', Password::min(10)],
        ];
    }
}
