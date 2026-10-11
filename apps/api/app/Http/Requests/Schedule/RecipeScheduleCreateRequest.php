<?php

declare(strict_types=1);

namespace App\Http\Requests\Schedule;

use Cron\CronExpression;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class RecipeScheduleCreateRequest extends FormRequest
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
             * @example Extracción Diaria de Reportes
             */
            'name' => ['required', 'string', 'max:100'],

            /**
             * Expresión Cron estándar de 5 campos (minuto hora día-mes mes día-semana)
             *
             * @example 0 8 * * 1-5
             */
            'cron_expression' => [
                'required',
                'string',
                'max:50',
                function (string $attribute, mixed $value, \Closure $fail): void {
                    if (! is_string($value) || ! CronExpression::isValidExpression($value)) {
                        $fail("La expresión Cron '{$value}' no es válida.");
                    }
                },
            ],

            /**
             * Indica si la programación está activa
             *
             * @example true
             */
            'is_active' => ['sometimes', 'boolean'],

            /**
             * Parámetros JSON dinámicos inyectados a la receta al ejecutarse
             *
             * @example {"modo": "automatico", "limite": 50}
             */
            'parameters' => ['sometimes', 'array'],
        ];
    }
}
