<?php

declare(strict_types=1);

namespace App\Http\Requests\Recipe;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\ValidationException;

class RecipeImportRequest extends FormRequest
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
             * Archivo JSON de exportación de RPA Studio (.json)
             */
            'file' => ['required_without:data', 'nullable', 'file', 'max:5120'],

            /**
             * Alternativamente, el objeto JSON enviado directamente en el cuerpo
             */
            'data' => ['required_without:file', 'nullable', 'array'],
        ];
    }

    /**
     * Obtiene el payload decodificado a importar ya sea desde archivo subido o body json.
     *
     * @return array<string, mixed>
     */
    public function getImportData(): array
    {
        if ($this->hasFile('file')) {
            $content = (string) file_get_contents($this->file('file')->getRealPath());
            $decoded = json_decode($content, true);

            if (! is_array($decoded)) {
                throw ValidationException::withMessages([
                    'file' => 'El archivo subido no contiene un JSON válido.',
                ]);
            }

            return $decoded;
        }

        $data = $this->input('data');
        if (is_array($data)) {
            return $data;
        }

        throw ValidationException::withMessages([
            'data' => 'No se proporcionaron datos de importación válidos.',
        ]);
    }
}
