<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Recipe;
use App\Models\RecipeVersion;
use InvalidArgumentException;

class RecipeExportService
{
    private const JSON_FLAGS = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES;

    /**
     * @param  array<string, mixed>|null  $definition
     */
    public function export(Recipe $recipe, ?int $versionNumber = null): string
    {
        $version = $versionNumber !== null
            ? $recipe->versions()->where('version', $versionNumber)->first()
            : $recipe->latestVersion;

        if (! $version instanceof RecipeVersion) {
            throw new InvalidArgumentException("No se encontró la versión solicitada para la receta {$recipe->id}");
        }

        /** @var array<string, mixed> $definition */
        $definition = $version->definition;

        return $this->compileToPlaywright($recipe->name, $definition);
    }

    /**
     * @param  array<string, mixed>  $definition
     */
    public function compileToPlaywright(string $recipeName, array $definition): string
    {
        $lines = [];
        $lines[] = "import { test, expect, type Page, type Locator } from '@playwright/test';";
        $lines[] = '';
        $lines[] = '// Helper para resolver localizador con fallbacks automáticos';
        $lines[] = 'async function resolveLocator(';
        $lines[] = '  page: Page,';
        $lines[] = '  candidates: Array<{ strategy: string; value: string }>,';
        $lines[] = '  timeoutMs = 5000';
        $lines[] = '): Promise<Locator> {';
        $lines[] = '  for (const candidate of candidates) {';
        $lines[] = '    try {';
        $lines[] = '      let loc: Locator;';
        $lines[] = '      switch (candidate.strategy) {';
        $lines[] = "        case 'testid':";
        $lines[] = '          loc = page.getByTestId(candidate.value);';
        $lines[] = '          break;';
        $lines[] = "        case 'text':";
        $lines[] = '          loc = page.getByText(candidate.value, { exact: false });';
        $lines[] = '          break;';
        $lines[] = "        case 'label':";
        $lines[] = '          loc = page.getByLabel(candidate.value);';
        $lines[] = '          break;';
        $lines[] = "        case 'role': {";
        $lines[] = '          const match = candidate.value.match(/^([a-z]+)(\\[name=[\'"](.*)[\'"]\\])?$/i);';
        $lines[] = '          loc = match && match[3]';
        $lines[] = '            ? page.getByRole(match[1] as any, { name: match[3] })';
        $lines[] = '            : page.getByRole((match ? match[1] : candidate.value) as any);';
        $lines[] = '          break;';
        $lines[] = '        }';
        $lines[] = "        case 'css':";
        $lines[] = "        case 'xpath':";
        $lines[] = '        default:';
        $lines[] = '          loc = page.locator(candidate.value);';
        $lines[] = '          break;';
        $lines[] = '      }';
        $lines[] = "      await loc.first().waitFor({ state: 'visible', timeout: Math.min(timeoutMs, 2500) });";
        $lines[] = '      return loc.first();';
        $lines[] = '    } catch {';
        $lines[] = '      // Probar siguiente fallback';
        $lines[] = '    }';
        $lines[] = '  }';
        $lines[] = '  return page.locator(candidates[0].value).first();';
        $lines[] = '}';
        $lines[] = '';
        $testName = json_encode($recipeName, self::JSON_FLAGS);
        $lines[] = "test({$testName}, async ({ page }) => {";
        $lines[] = '  test.setTimeout(30000);';
        $lines[] = '';
        $lines[] = '  // Variables de la receta';
        $lines[] = '  const variables: Record<string, any> = {';

        $variables = $definition['variables'] ?? [];
        if (is_array($variables)) {
            foreach ($variables as $v) {
                if (is_array($v) && isset($v['name'])) {
                    $val = isset($v['defaultValue']) ? json_encode($v['defaultValue'], self::JSON_FLAGS) : 'undefined';
                    $varName = json_encode($v['name'], self::JSON_FLAGS);
                    $lines[] = "    {$varName}: {$val},";
                }
            }
        }
        $lines[] = '  };';
        $lines[] = '';

        $nodes = $definition['nodes'] ?? [];
        $edges = $definition['edges'] ?? [];
        $entry = $definition['entry'] ?? null;
        $visited = [];

        $compileNode = function (string $nodeId, string $indent) use (&$compileNode, &$lines, &$visited, $nodes, $edges): void {
            if (isset($visited[$nodeId])) {
                $lines[] = "{$indent}// Ciclo detectado o nodo ya visitado: {$nodeId}";

                return;
            }
            $visited[$nodeId] = true;

            $node = $nodes[$nodeId] ?? null;
            if (! is_array($node)) {
                $lines[] = "{$indent}// ERROR: Nodo {$nodeId} no encontrado";

                return;
            }

            $type = $node['type'] ?? 'unknown';
            $desc = $node['description'] ?? $nodeId;
            $lines[] = "{$indent}// [".strtoupper($type)."] {$desc}";

            $nodeLines = [];
            $params = $node['params'] ?? [];
            $locator = $node['locator'] ?? null;

            $getCandidates = function (?array $locGroup): string {
                if (! $locGroup) {
                    return '[]';
                }
                $candidates = [];
                if (isset($locGroup['primary'])) {
                    $candidates[] = $locGroup['primary'];
                }
                if (isset($locGroup['fallbacks']) && is_array($locGroup['fallbacks'])) {
                    foreach ($locGroup['fallbacks'] as $fb) {
                        $candidates[] = $fb;
                    }
                }

                return (string) json_encode(array_map(fn ($c) => [
                    'strategy' => $c['strategy'] ?? 'css',
                    'value' => $c['value'] ?? '',
                ], $candidates), self::JSON_FLAGS);
            };

            switch ($type) {
                case 'navigate':
                    $url = json_encode($params['url'] ?? '', self::JSON_FLAGS);
                    $waitUntil = json_encode($params['waitUntil'] ?? 'domcontentloaded', self::JSON_FLAGS);
                    $timeout = (int) ($node['timeout'] ?? 30000);
                    $nodeLines[] = "await page.goto({$url}, { waitUntil: {$waitUntil}, timeout: {$timeout} });";
                    break;

                case 'click':
                    $cands = $getCandidates($locator);
                    $timeout = (int) ($node['timeout'] ?? 5000);
                    $nodeLines[] = "const loc_{$nodeId} = await resolveLocator(page, {$cands}, {$timeout});";
                    $nodeLines[] = "await loc_{$nodeId}.click();";
                    break;

                case 'type':
                    $cands = $getCandidates($locator);
                    $timeout = (int) ($node['timeout'] ?? 5000);
                    $nodeLines[] = "const loc_{$nodeId} = await resolveLocator(page, {$cands}, {$timeout});";
                    if (! empty($params['clear'])) {
                        $nodeLines[] = "await loc_{$nodeId}.fill('');";
                    }
                    $text = json_encode($params['text'] ?? '', self::JSON_FLAGS);
                    $nodeLines[] = "await loc_{$nodeId}.fill({$text});";
                    break;

                case 'waitFor':
                    $strategy = $params['strategy'] ?? 'selector';
                    $timeout = (int) ($node['timeout'] ?? 10000);
                    if ($strategy === 'networkIdle') {
                        $nodeLines[] = "await page.waitForLoadState('networkidle', { timeout: {$timeout} });";
                    } elseif ($strategy === 'timeout') {
                        $val = (int) ($params['value'] ?? 1000);
                        $nodeLines[] = "await page.waitForTimeout({$val});";
                    } else {
                        if ($locator) {
                            $cands = $getCandidates($locator);
                            $nodeLines[] = "const loc_{$nodeId} = await resolveLocator(page, {$cands}, {$timeout});";
                            $nodeLines[] = "await loc_{$nodeId}.waitFor({ state: 'visible', timeout: {$timeout} });";
                        }
                    }
                    break;

                case 'extract':
                    $cands = $getCandidates($locator);
                    $timeout = (int) ($node['timeout'] ?? 5000);
                    $var = json_encode($params['variable'] ?? 'extracted', self::JSON_FLAGS);
                    $nodeLines[] = "const loc_{$nodeId} = await resolveLocator(page, {$cands}, {$timeout});";
                    $nodeLines[] = "variables[{$var}] = (await loc_{$nodeId}.innerText()).trim();";
                    break;

                case 'screenshot':
                    $name = json_encode(($params['name'] ?? $nodeId).'.png', self::JSON_FLAGS);
                    $full = ! empty($params['fullPage']) ? 'true' : 'false';
                    $nodeLines[] = "await page.screenshot({ path: {$name}, fullPage: {$full} });";
                    break;
            }

            if (($node['onError'] ?? '') === 'continue') {
                $lines[] = "{$indent}try {";
                foreach ($nodeLines as $nl) {
                    $lines[] = "{$indent}  {$nl}";
                }
                $lines[] = "{$indent}} catch (err) {";
                $lines[] = "{$indent}  console.warn(\"Paso {$nodeId} falló con onError='continue':\", err);";
                $lines[] = "{$indent}}";
            } else {
                foreach ($nodeLines as $nl) {
                    $lines[] = "{$indent}{$nl}";
                }
            }

            $lines[] = '';

            // Próximo nodo
            $nextId = $node['next'] ?? null;
            if (! $nextId && is_array($edges)) {
                foreach ($edges as $e) {
                    if (is_array($e) && ($e['from'] ?? '') === $nodeId && empty($e['condition'])) {
                        $nextId = $e['to'] ?? null;
                        break;
                    }
                }
            }

            if ($nextId && is_string($nextId)) {
                $compileNode($nextId, $indent);
            }
        };

        if (is_string($entry)) {
            $compileNode($entry, '  ');
        }

        $lines[] = '});';
        $lines[] = '';

        return implode("\n", $lines);
    }
}
