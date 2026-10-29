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

        if (! empty($nodes)) {
            if (! is_string($entry) || ! isset($nodes[$entry])) {
                $errors[] = "entry: El nodo inicial '{$entry}' no existe en la lista de nodos";
            }
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
                } else {
                    $next = is_string($node['next'] ?? null) ? $node['next'] : null;
                    $chain = $this->collectNextChain($nodes, $bodyEntry, $next, $nodeId);

                    if ($chain['cycle']) {
                        $errors[] = "nodes.{$nodeId}.params.bodyEntryNodeId: El cuerpo del bucle contiene un ciclo de 'next'; debe terminar en la continuación del loop o en null";
                    }

                    if ($chain['reentersBlock']) {
                        $errors[] = "nodes.{$nodeId}.params.bodyEntryNodeId: El cuerpo del bucle vuelve a entrar en el nodo loop";
                    }

                    if ($next !== null && $next === $bodyEntry) {
                        $errors[] = "nodes.{$nodeId}.next: La continuación del loop no puede coincidir con el inicio de su cuerpo";
                    }
                }
            }

            if ($type === 'tryCatch') {
                $branchReferences = [
                    'tryEntryNodeId' => $params['tryEntryNodeId'] ?? null,
                    'catchEntryNodeId' => $params['catchEntryNodeId'] ?? null,
                    'finallyEntryNodeId' => $params['finallyEntryNodeId'] ?? null,
                ];
                $next = is_string($node['next'] ?? null) ? $node['next'] : null;
                $branchIds = [];

                foreach ($branchReferences as $field => $reference) {
                    if ($reference === null || $reference === '') {
                        continue;
                    }

                    if (! is_string($reference) || ! isset($nodes[$reference])) {
                        $errors[] = "nodes.{$nodeId}.params.{$field}: El nodo referenciado '{$reference}' no existe";

                        continue;
                    }

                    $branchIds[] = $reference;

                    if ($reference === $nodeId) {
                        $errors[] = "nodes.{$nodeId}.params.{$field}: El bloque no puede empezar en el propio nodo tryCatch";

                        continue;
                    }

                    $chain = $this->collectNextChain($nodes, $reference, $next, $nodeId);

                    if ($chain['cycle']) {
                        $errors[] = "nodes.{$nodeId}.params.{$field}: El bloque contiene un ciclo de 'next'; debe terminar en la continuación del tryCatch o en null";
                    }

                    if ($chain['reentersBlock']) {
                        $errors[] = "nodes.{$nodeId}.params.{$field}: El bloque vuelve a entrar en el nodo tryCatch";
                    }
                }

                if ($next !== null && in_array($next, $branchIds, true)) {
                    $errors[] = "nodes.{$nodeId}.next: La continuación del tryCatch no puede coincidir con el inicio de una de sus ramas";
                }
            }

            if ($type === 'condition') {
                $branchReferences = [
                    'thenNodeId' => $params['thenNodeId'] ?? null,
                    'elseNodeId' => $params['elseNodeId'] ?? null,
                ];
                $next = is_string($node['next'] ?? null) ? $node['next'] : null;

                foreach ($branchReferences as $field => $reference) {
                    if ($reference === null || $reference === '') {
                        continue;
                    }

                    if (! is_string($reference) || ! isset($nodes[$reference])) {
                        $errors[] = "nodes.{$nodeId}.params.{$field}: El nodo referenciado '{$reference}' no existe";

                        continue;
                    }

                    if ($reference === $nodeId) {
                        $errors[] = "nodes.{$nodeId}.params.{$field}: El bloque no puede empezar en el propio nodo condition";

                        continue;
                    }

                    $chain = $this->collectNextChain($nodes, $reference, $next, $nodeId);

                    if ($chain['cycle']) {
                        $errors[] = "nodes.{$nodeId}.params.{$field}: El bloque contiene un ciclo de 'next'; debe terminar en la continuación de la condición o en null";
                    }

                    if ($chain['reentersBlock']) {
                        $errors[] = "nodes.{$nodeId}.params.{$field}: El bloque vuelve a entrar en el nodo condition";
                    }
                }
            }

            if (isset($node['next']) && is_string($node['next']) && ! isset($nodes[$node['next']])) {
                $errors[] = "nodes.{$nodeId}.next: El nodo referenciado '{$node['next']}' no existe";
            }
        }

        return $errors;
    }

    /**
     * Recorre el alcance de un bloque desde $startId hasta $stopAt (exclusivo) o null.
     * Incluye las ramas de bloques anidados (condition/loop/tryCatch), ya que también
     * forman parte del mismo alcance. Detecta ciclos y el reingreso al bloque dueño.
     *
     * @param  array<string,mixed>  $nodes
     * @return array{ids: list<string>, cycle: bool, reentersBlock: bool}
     */
    private function collectNextChain(array $nodes, string $startId, ?string $stopAt, string $blockNodeId): array
    {
        $ids = [];
        $collected = [];
        $path = [];
        $cycle = false;
        $reentersBlock = false;

        $visit = function (?string $nodeId) use (
            &$visit,
            &$ids,
            &$collected,
            &$path,
            &$cycle,
            &$reentersBlock,
            $nodes,
            $stopAt,
            $blockNodeId
        ): void {
            if ($nodeId === null || $nodeId === '' || $nodeId === $stopAt || $cycle || $reentersBlock) {
                return;
            }

            if ($nodeId === $blockNodeId) {
                $reentersBlock = true;

                return;
            }

            if (isset($path[$nodeId])) {
                $cycle = true;

                return;
            }

            // Nodo ya recolectado por otra rama (reconvergencia, no ciclo).
            if (isset($collected[$nodeId])) {
                return;
            }

            $collected[$nodeId] = true;
            $ids[] = $nodeId;
            $path[$nodeId] = true;

            $node = $nodes[$nodeId] ?? null;

            if (is_array($node)) {
                $params = is_array($node['params'] ?? null) ? $node['params'] : [];

                if (($node['type'] ?? null) === 'tryCatch') {
                    foreach (['tryEntryNodeId', 'catchEntryNodeId', 'finallyEntryNodeId'] as $field) {
                        $visit(is_string($params[$field] ?? null) ? $params[$field] : null);
                    }
                } elseif (($node['type'] ?? null) === 'loop') {
                    $visit(is_string($params['bodyEntryNodeId'] ?? null) ? $params['bodyEntryNodeId'] : null);
                } elseif (($node['type'] ?? null) === 'condition') {
                    foreach (['thenNodeId', 'elseNodeId'] as $field) {
                        $visit(is_string($params[$field] ?? null) ? $params[$field] : null);
                    }
                }

                $visit(is_string($node['next'] ?? null) ? $node['next'] : null);
            }

            unset($path[$nodeId]);
        };

        $visit($startId);

        return ['ids' => $ids, 'cycle' => $cycle, 'reentersBlock' => $reentersBlock];
    }
}
