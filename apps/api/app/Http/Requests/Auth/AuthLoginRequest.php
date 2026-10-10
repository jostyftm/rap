<?php

declare(strict_types=1);

namespace App\Http\Requests\Auth;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class AuthLoginRequest extends FormRequest
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
             * Correo electrónico registrado
             *
             * @example ana@example.com
             */
            'email' => ['required', 'email'],

            /**
             * Contraseña del usuario
             *
             * @example correct-horse-battery
             */
            'password' => ['required', 'string'],
        ];
    }
}
