<?php

declare(strict_types=1);

namespace App\Http\Requests\Recipe;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class RecipeUpdateRequest extends FormRequest
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
             * @example Login y Extracción de Reporte (Actualizado)
             */
            'name' => ['sometimes', 'string', 'max:160'],

            /**
             * Descripción del objetivo del flujo
             *
             * @example Ingresa credenciales y exporta datos
             */
            'description' => ['nullable', 'string', 'max:2000'],

            /**
             * Definición formal del grafo en DSL (JSON Schema rpa/v1)
             */
            'definition' => ['sometimes', 'array'],

            /**
             * Resumen de cambios efectuados en esta versión
             *
             * @example Se ajustó el selector de botón de envío
             */
            'changelog' => ['nullable', 'string', 'max:1000'],
        ];
    }
}
