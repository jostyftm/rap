<?php

declare(strict_types=1);

namespace App\Http\Requests\Recorder;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class RecorderStartRequest extends FormRequest
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
             * URL inicial donde arrancará la sesión de grabación del navegador
             *
             * @example http://localhost:8099/index.html
             */
            'initial_url' => ['required', 'url', 'max:500'],
        ];
    }
}
