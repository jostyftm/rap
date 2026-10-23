<?php

declare(strict_types=1);

namespace App\Support;

final class RecipeSecretRefs
{
    /**
     * Devuelve las claves de secreto que una receta declara o referencia
     * mediante la sintaxis {{secret.nombre}}.
     *
     * @param  array<string,mixed>  $definition
     * @return list<string>
     */
    public static function fromDefinition(array $definition): array
    {
        $declared = [];
        foreach ((array) ($definition['secrets'] ?? []) as $key) {
            if (is_string($key) && $key !== '') {
                $declared[] = $key;
            }
        }

        $referenced = [];
        $encoded = json_encode($definition);
        if (is_string($encoded) && preg_match_all('/\{\{\s*secret\.([A-Za-z0-9_]+)\s*\}\}/', $encoded, $matches) > 0) {
            $referenced = $matches[1];
        }

        return array_values(array_unique([...$declared, ...$referenced]));
    }
}
