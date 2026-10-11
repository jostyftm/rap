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

            /**
             * Opciones de visualización y ejecución en el navegador
             */
            'options' => ['nullable', 'array'],
            'options.display' => ['nullable', 'string', 'in:headless,headed,live'],
            'options.slow_mo_ms' => ['nullable', 'integer', 'min:0', 'max:5000'],
            'options.highlight' => ['nullable', 'boolean'],
            'options.keep_open_ms' => ['nullable', 'integer', 'min:0', 'max:30000'],
        ];
    }
}
