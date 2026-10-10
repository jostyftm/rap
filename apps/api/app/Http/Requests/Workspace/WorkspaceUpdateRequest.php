<?php

declare(strict_types=1);

namespace App\Http\Requests\Workspace;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class WorkspaceUpdateRequest extends FormRequest
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
             * Nombre del workspace
             *
             * @example Equipo de Automatización
             */
            'name' => ['sometimes', 'string', 'max:120'],

            /**
             * Dominios permitidos para navegación segura
             *
             * @example ["example.com", "*.miempresa.com"]
             */
            'settings.allowed_domains' => ['sometimes', 'array', 'max:100'],
            'settings.allowed_domains.*' => ['string', 'max:253', 'regex:/^(\*\.)?[a-z0-9.-]+$/i'],

            /**
             * Límite de gasto mensual en USD para LLMs
             *
             * @example 50.00
             */
            'settings.cost_limit_usd_monthly' => ['sometimes', 'numeric', 'min:0', 'max:100000'],

            /**
             * Días de retención para capturas y artefactos
             *
             * @example 30
             */
            'settings.artifact_retention_days' => ['sometimes', 'integer', 'min:1', 'max:3650'],
        ];
    }
}
