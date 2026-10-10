<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Enums\Role;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $user = User::firstOrCreate(
            ['email' => 'admin@rpa.studio'],
            [
                'name' => 'Admin RPA',
                'password' => Hash::make('secret123'),
            ]
        );

        $workspace = Workspace::firstOrCreate(
            ['slug' => 'workspace-demo'],
            [
                'name' => 'Workspace Principal',
            ]
        );

        if (! $workspace->members()->where('user_id', $user->id)->exists()) {
            $workspace->members()->attach($user->id, ['role' => Role::Owner->value]);
        }

        $project = $workspace->projects()->firstOrCreate(
            ['name' => 'Automatizaciones Web'],
            [
                'description' => 'Flujos de interacción y extracción con Playwright',
            ]
        );

        $recipe = $project->recipes()->firstOrCreate(
            ['name' => 'Login y Extracción Determinista'],
            [
                'description' => 'Navega a pantalla de login, ingresa credenciales, verifica dashboard y extrae datos.',
                'status' => 'active',
            ]
        );

        if ($recipe->versions()->count() === 0) {
            $recipe->versions()->create([
                'version' => 1,
                'changelog' => 'Versión inicial generada para pruebas locales',
                'created_by_user_id' => $user->id,
                'definition' => [
                    'schema' => 'rpa/v1',
                    'name' => 'Login y Extracción Determinista',
                    'description' => 'Flujo de prueba de login y extracción en testsite',
                    'entry' => 'step_navigate',
                    'variables' => [
                        ['name' => 'extractedTitle', 'type' => 'string'],
                    ],
                    'nodes' => [
                        'step_navigate' => [
                            'id' => 'step_navigate',
                            'type' => 'navigate',
                            'description' => 'Navegar a la pantalla de login',
                            'params' => [
                                'url' => 'http://localhost:8099/index.html',
                                'waitUntil' => 'domcontentloaded',
                            ],
                            'next' => 'step_type_user',
                        ],
                        'step_type_user' => [
                            'id' => 'step_type_user',
                            'type' => 'type',
                            'description' => 'Ingresar usuario',
                            'locator' => [
                                'primary' => ['strategy' => 'testid', 'value' => 'username-input', 'score' => 95],
                                'fallbacks' => [
                                    ['strategy' => 'css', 'value' => '#username', 'score' => 70],
                                ],
                            ],
                            'params' => [
                                'text' => 'admin_test',
                                'clear' => true,
                            ],
                            'next' => 'step_type_pass',
                        ],
                        'step_type_pass' => [
                            'id' => 'step_type_pass',
                            'type' => 'type',
                            'description' => 'Ingresar contraseña',
                            'locator' => [
                                'primary' => ['strategy' => 'testid', 'value' => 'password-input', 'score' => 95],
                                'fallbacks' => [
                                    ['strategy' => 'css', 'value' => '#password', 'score' => 70],
                                ],
                            ],
                            'params' => [
                                'text' => 'secret123',
                                'clear' => true,
                            ],
                            'next' => 'step_click_login',
                        ],
                        'step_click_login' => [
                            'id' => 'step_click_login',
                            'type' => 'click',
                            'description' => 'Hacer clic en Iniciar Sesión',
                            'locator' => [
                                'primary' => ['strategy' => 'testid', 'value' => 'login-submit-btn', 'score' => 95],
                                'fallbacks' => [
                                    ['strategy' => 'role', 'value' => "button[name='Iniciar Sesión']", 'score' => 90],
                                ],
                            ],
                            'params' => [
                                'button' => 'left',
                            ],
                            'next' => 'step_wait_dash',
                        ],
                        'step_wait_dash' => [
                            'id' => 'step_wait_dash',
                            'type' => 'waitFor',
                            'description' => 'Esperar carga de dashboard',
                            'params' => [
                                'strategy' => 'selector',
                                'value' => 'dashboard-title',
                            ],
                            'locator' => [
                                'primary' => ['strategy' => 'testid', 'value' => 'dashboard-title', 'score' => 95],
                                'fallbacks' => [],
                            ],
                            'next' => 'step_extract_title',
                        ],
                        'step_extract_title' => [
                            'id' => 'step_extract_title',
                            'type' => 'extract',
                            'description' => 'Extraer título de bienvenida',
                            'locator' => [
                                'primary' => ['strategy' => 'testid', 'value' => 'dashboard-title', 'score' => 95],
                                'fallbacks' => [],
                            ],
                            'params' => [
                                'extractType' => 'text',
                                'variable' => 'extractedTitle',
                            ],
                            'next' => 'step_screenshot',
                        ],
                        'step_screenshot' => [
                            'id' => 'step_screenshot',
                            'type' => 'screenshot',
                            'description' => 'Tomar captura del dashboard',
                            'params' => [
                                'fullPage' => true,
                                'name' => 'dashboard_completo',
                            ],
                        ],
                    ],
                    'edges' => [
                        ['from' => 'step_navigate', 'to' => 'step_type_user'],
                        ['from' => 'step_type_user', 'to' => 'step_type_pass'],
                        ['from' => 'step_type_pass', 'to' => 'step_click_login'],
                        ['from' => 'step_click_login', 'to' => 'step_wait_dash'],
                        ['from' => 'step_wait_dash', 'to' => 'step_extract_title'],
                        ['from' => 'step_extract_title', 'to' => 'step_screenshot'],
                    ],
                ],
            ]);
        }
    }
}
