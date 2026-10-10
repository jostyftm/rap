<?php

declare(strict_types=1);

return [
    /*
    | Modelos LLM por rol. El proveedor se elige con AI_DEFAULT_PROVIDER (config/ai.php);
    | los nombres de modelo se configuran aquí vía .env para poder cambiar de proveedor sin tocar código.
    */
    'llm' => [
        'fast_model' => env('RPA_LLM_FAST_MODEL', 'gemini-2.5-flash'),
        'strong_model' => env('RPA_LLM_STRONG_MODEL', 'gemini-2.5-pro'),
    ],

    'limits' => [
        'session_max_steps' => (int) env('RPA_SESSION_MAX_STEPS', 40),
        'session_max_cost_usd' => (float) env('RPA_SESSION_MAX_COST_USD', 1.0),
        'session_max_seconds' => (int) env('RPA_SESSION_MAX_SECONDS', 900),
    ],

    'runner' => [
        'command_stream' => 'rpa:cmd',
        'event_stream' => 'rpa:evt',
    ],
];
