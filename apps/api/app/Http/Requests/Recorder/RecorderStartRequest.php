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
              * Modo de grabación: browser (navegador web)
              *
              * @example browser
              */
            'mode' => ['nullable', 'string', 'in:browser'],

            /**
              * URL inicial donde arrancará la sesión de grabación del navegador
              *
              * @example http://localhost:8099/index.html
              */
            'initial_url' => ['required', 'url', 'max:500'],

            /**
              * Tiempo de debounce en ms para agrupar pulsaciones de teclas
              *
              * @example 1000
              */
            'type_debounce_ms' => ['nullable', 'integer', 'min:200', 'max:5000'],

            /**
              * Habilitar o deshabilitar captura de eventos de desplazamiento (scroll)
              *
              * @example true
              */
            'capture_scroll' => ['nullable', 'boolean'],
        ];
    }
}
