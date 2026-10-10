<?php

declare(strict_types=1);

namespace App\Http\Requests\Run;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class RunCreateRequest extends FormRequest
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
             * Parámetros dinámicos para inyectar en las variables de la receta
             *
             * @example {"startDate": "2026-01-01", "limit": 50}
             */
            'parameters' => ['nullable', 'array'],
        ];
    }
}
