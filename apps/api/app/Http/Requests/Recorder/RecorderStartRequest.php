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
             * Modo de grabación: browser (navegador web) o desktop (macros de escritorio)
             *
             * @example browser
             */
            'mode' => ['nullable', 'string', 'in:browser,desktop'],

            /**
             * URL inicial donde arrancará la sesión de grabación del navegador
             *
             * @example http://localhost:8099/index.html
             */
            'initial_url' => ['required_if:mode,browser', 'nullable', 'url', 'max:500'],

            /**
             * Título o nombre de la ventana/aplicación objetivo para grabación de escritorio
             *
             * @example Calculadora
             */
            'target_window' => ['nullable', 'string', 'max:255'],

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
