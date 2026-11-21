<?php

declare(strict_types=1);

namespace App\Http\Requests\Recipe;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class RecipePublishRequest extends FormRequest
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
             * Resumen o notas de versión a asociar con la publicación
             *
             * @example Se ajustaron los selectores de login y tiempo de espera
             */
            'changelog' => ['nullable', 'string', 'max:1000'],
        ];
    }
}
