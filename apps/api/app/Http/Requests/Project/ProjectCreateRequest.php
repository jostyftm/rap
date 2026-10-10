<?php

declare(strict_types=1);

namespace App\Http\Requests\Project;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class ProjectCreateRequest extends FormRequest
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
             * Nombre del proyecto
             *
             * @example Automatización de Facturación
             */
            'name' => ['required', 'string', 'max:120'],

            /**
             * Descripción del alcance del proyecto
             *
             * @example Flujos de RPA para extracción y conciliación de facturas
             */
            'description' => ['nullable', 'string', 'max:2000'],
        ];
    }
}
