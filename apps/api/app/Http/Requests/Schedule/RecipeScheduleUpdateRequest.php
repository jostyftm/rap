<?php

declare(strict_types=1);

namespace App\Http\Requests\Schedule;

use Cron\CronExpression;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class RecipeScheduleUpdateRequest extends FormRequest
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
             * Nombre descriptivo de la programación
             *
             * @example Extracción Diaria Actualizada
             */
            'name' => ['sometimes', 'string', 'max:100'],

            /**
             * Expresión Cron estándar de 5 campos
             *
             * @example 30 9 * * 1-5
             */
            'cron_expression' => [
                'sometimes',
                'string',
                'max:50',
                function (string $attribute, mixed $value, \Closure $fail): void {
                    if (! is_string($value) || ! CronExpression::isValidExpression($value)) {
                        $fail("La expresión Cron '{$value}' no es válida.");
                    }
                },
            ],

            /**
             * Estado activo o inactivo
             *
             * @example true
             */
            'is_active' => ['sometimes', 'boolean'],

            /**
             * Parámetros JSON dinámicos inyectados a la receta
             *
             * @example {"modo": "manual"}
             */
            'parameters' => ['sometimes', 'array'],
        ];
    }
}
