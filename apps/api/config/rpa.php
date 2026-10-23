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

    /*
    | Endpoint interno que el Runner usa para resolver secretos en tiempo de
    | ejecución. Laravel nunca envía valores por Redis, solo referencias.
    */
    'internal' => [
        'secret' => env('RPA_INTERNAL_SECRET'),
        'signature_ttl' => (int) env('RPA_INTERNAL_SIGNATURE_TTL', 60),
    ],

    /*
    | Keyring de cifrado de secretos. El identificador activo debe existir en
    | "keys"; si el mapa está vacío se deriva una clave de APP_KEY.
    */
    'secrets' => [
        'active_key' => env('RPA_SECRET_ACTIVE_KEY', 'app'),
        'keys' => json_decode((string) env('RPA_SECRET_KEYS', '{}'), true) ?: [],
    ],

    'live' => [
        'url' => env('RUNNER_LIVE_URL', 'http://host.docker.internal:8085'),
        'token' => env('RUNNER_LIVE_TOKEN', 'local-live-token'),
    ],
];
