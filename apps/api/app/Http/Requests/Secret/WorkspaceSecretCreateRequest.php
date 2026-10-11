<?php

declare(strict_types=1);

namespace App\Http\Requests\Secret;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class WorkspaceSecretCreateRequest extends FormRequest
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
             * Clave o identificador del secreto (mayúsculas, números y guiones bajos)
             *
             * @example ERP_PASSWORD
             */
            'key' => ['required', 'string', 'max:80', 'regex:/^[A-Z0-9_]+$/'],

            /**
             * Valor confidencial en texto plano que será cifrado con AES-256
             *
             * @example SuperSecret123!
             */
            'value' => ['required', 'string'],

            /**
             * Descripción opcional del propósito del secreto
             *
             * @example Contraseña del usuario administrador para el portal de facturación
             */
            'description' => ['sometimes', 'nullable', 'string', 'max:255'],
        ];
    }
}
