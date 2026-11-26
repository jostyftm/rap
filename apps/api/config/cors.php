<?php

declare(strict_types=1);

$isProduction = env('APP_ENV', 'production') === 'production';

$extraOrigins = array_values(array_filter(array_map(
    static fn (string $origin): string => trim($origin),
    explode(',', (string) env('CORS_ALLOWED_ORIGINS', ''))
)));

$localOrigins = $isProduction ? [] : [
    'http://localhost:3090',
    'http://127.0.0.1:3090',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost',
];

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    |
    | Here you may configure your settings for cross-origin resource sharing
    | or "CORS". This determines what cross-origin operations may execute
    | in web browsers. You are free to adjust these settings as needed.
    |
    | To learn more: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
    |
    */

    'paths' => [
        'api/*',
        'sanctum/csrf-cookie',
        'broadcasting/auth',
    ],

    'allowed_methods' => ['*'],

    'allowed_origins' => array_values(array_unique(array_filter([
        ...$localOrigins,
        env('FRONTEND_URL'),
        env('APP_URL'),
        ...$extraOrigins,
    ]))),

    'allowed_origins_patterns' => $isProduction ? [] : [
        '#^https?://localhost(:\d+)?$#',
        '#^https?://127\.0\.0\.1(:\d+)?$#',
    ],

    'allowed_headers' => ['*'],

    'exposed_headers' => ['*'],

    'max_age' => 0,

    'supports_credentials' => true,

];
