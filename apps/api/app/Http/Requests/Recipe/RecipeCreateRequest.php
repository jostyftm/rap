<?php

declare(strict_types=1);

namespace App\Http\Requests\Recipe;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class RecipeCreateRequest extends FormRequest
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
             * Nombre de la receta RPA
             *
             * @example Login y Extracción de Reporte
             */
            'name' => ['required', 'string', 'max:160'],

            /**
             * Descripción del objetivo del flujo
             *
             * @example Ingresa credenciales de acceso y descarga la tabla de transacciones
             */
            'description' => ['nullable', 'string', 'max:2000'],

            /**
             * Definición formal del grafo en DSL (JSON Schema rpa/v1)
             */
            'definition' => ['required', 'array'],
        ];
    }
}
