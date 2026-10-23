<?php

declare(strict_types=1);

namespace App\Services;

use Opis\JsonSchema\Errors\ErrorFormatter;
use Opis\JsonSchema\Validator;
use RuntimeException;

final class DslValidator
{
    private Validator $validator;

    private string $schemaPath;

    public function __construct()
    {
        $this->validator = new Validator;
        $this->schemaPath = base_path('../../packages/dsl/schema/recipe.json');
        if (! file_exists($this->schemaPath)) {
            // Ruta alternativa relativa al proyecto si está aislado
            $this->schemaPath = base_path('schema/recipe.json');
        }
    }

    /**
     * @param  array<string,mixed>  $definition
     * @return list<string> Lista de errores, vacía si es válido
     */
    public function validate(array $definition): array
    {
        $errors = [];

        // 1. Validación de JSON Schema
        if (file_exists($this->schemaPath)) {
            $schemaContent = file_get_contents($this->schemaPath);
            if ($schemaContent === false) {
                throw new RuntimeException("No se pudo leer el archivo de esquema en {$this->schemaPath}");
            }
            $schema = json_decode($schemaContent);
            $data = json_decode((string) json_encode($definition));

            $result = $this->validator->validate($data, $schema);
            if (! $result->isValid() && $result->error() !== null) {
                $formatter = new ErrorFormatter;
                $formatted = $formatter->format($result->error());
                foreach ($formatted as $field => $messages) {
                    foreach ((array) $messages as $message) {
                        $errors[] = "{$field}: {$message}";
                    }
                }
            }
        }

        // 2. Validaciones semánticas adicionales de grafo
        $entry = $definition['entry'] ?? null;
        $nodes = $definition['nodes'] ?? [];

        if (! is_string($entry) || ! isset($nodes[$entry])) {
            $errors[] = "entry: El nodo inicial '{$entry}' no existe en la lista de nodos";
        }

        foreach ($nodes as $nodeId => $node) {
            if (! is_array($node)) {
                continue;
            }
            $type = $node['type'] ?? '';
            $params = $node['params'] ?? [];

            if ($type === 'loop') {
                $maxIterations = $params['maxIterations'] ?? null;
                if (! is_int($maxIterations) || $maxIterations < 1) {
                    $errors[] = "nodes.{$nodeId}.params.maxIterations: Debe ser un entero positivo obligatorio";
                }

                $bodyEntry = $params['bodyEntryNodeId'] ?? null;
                if (! is_string($bodyEntry) || $bodyEntry === '' || ! isset($nodes[$bodyEntry])) {
                    $errors[] = "nodes.{$nodeId}.params.bodyEntryNodeId: El nodo referenciado '{$bodyEntry}' no existe";
                } elseif ($bodyEntry === $nodeId) {
                    $errors[] = "nodes.{$nodeId}.params.bodyEntryNodeId: El cuerpo del bucle no puede empezar en el propio nodo loop";
                }
            }

            if ($type === 'tryCatch') {
                $branchReferences = [
                    'tryEntryNodeId' => $params['tryEntryNodeId'] ?? null,
                    'catchEntryNodeId' => $params['catchEntryNodeId'] ?? null,
                    'finallyEntryNodeId' => $params['finallyEntryNodeId'] ?? null,
                ];

                foreach ($branchReferences as $field => $reference) {
                    if ($reference === null || $reference === '') {
                        continue;
                    }

                    if (! is_string($reference) || ! isset($nodes[$reference])) {
                        $errors[] = "nodes.{$nodeId}.params.{$field}: El nodo referenciado '{$reference}' no existe";

                        continue;
                    }

                    if ($reference === $nodeId) {
                        $errors[] = "nodes.{$nodeId}.params.{$field}: El bloque no puede empezar en el propio nodo tryCatch";
                    }
                }
            }

            if (isset($node['next']) && is_string($node['next']) && ! isset($nodes[$node['next']])) {
                $errors[] = "nodes.{$nodeId}.next: El nodo referenciado '{$node['next']}' no existe";
            }
        }

        return $errors;
    }
}
