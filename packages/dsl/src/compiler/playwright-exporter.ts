import type { RecipeDsl, RecipeNode, RecipeEdge, LocatorGroup } from "../types.js";

export interface PlaywrightExportOptions {
  testName?: string;
  timeoutMs?: number;
}

export function exportToPlaywright(recipe: RecipeDsl, options: PlaywrightExportOptions = {}): string {
  const testName = options.testName || recipe.name || "Ejecución de Receta RPA";
  const defaultTimeout = options.timeoutMs || 30000;

  const lines: string[] = [];

  // 1. Imports
  lines.push("import { test, expect, type Page, type Locator } from '@playwright/test';");
  lines.push("");

  // 2. Helper para resolver localizadores con fallbacks
  lines.push("// Helper para resolver localizador con fallbacks automáticos");
  lines.push("async function resolveLocator(");
  lines.push("  page: Page,");
  lines.push("  candidates: Array<{ strategy: string; value: string }>,");
  lines.push("  timeoutMs = 5000");
  lines.push("): Promise<Locator> {");
  lines.push("  for (const candidate of candidates) {");
  lines.push("    try {");
  lines.push("      let loc: Locator;");
  lines.push("      switch (candidate.strategy) {");
  lines.push("        case 'testid':");
  lines.push("          loc = page.getByTestId(candidate.value);");
  lines.push("          break;");
  lines.push("        case 'text':");
  lines.push("          loc = page.getByText(candidate.value, { exact: false });");
  lines.push("          break;");
  lines.push("        case 'label':");
  lines.push("          loc = page.getByLabel(candidate.value);");
  lines.push("          break;");
  lines.push("        case 'role': {");
  lines.push("          const match = candidate.value.match(/^([a-z]+)(\\[name=['\"](.*)['\"]\\])?$/i);");
  lines.push("          loc = match && match[3]");
  lines.push("            ? page.getByRole(match[1] as any, { name: match[3] })");
  lines.push("            : page.getByRole((match ? match[1] : candidate.value) as any);");
  lines.push("          break;");
  lines.push("        }");
  lines.push("        case 'css':");
  lines.push("        case 'xpath':");
  lines.push("        default:");
  lines.push("          loc = page.locator(candidate.value);");
  lines.push("          break;");
  lines.push("      }");
  lines.push("      await loc.first().waitFor({ state: 'visible', timeout: Math.min(timeoutMs, 2500) });");
  lines.push("      return loc.first();");
  lines.push("    } catch {");
  lines.push("      // Probar siguiente fallback");
  lines.push("    }");
  lines.push("  }");
  lines.push("  // Fallback por defecto al primer selector");
  lines.push("  return page.locator(candidates[0].value).first();");
  lines.push("}");
  lines.push("");

  // 3. Inicio del test
  lines.push(`test(${JSON.stringify(testName)}, async ({ page }) => {`);
  lines.push(`  test.setTimeout(${defaultTimeout});`);
  lines.push("");

  // 4. Variables iniciales
  lines.push("  // Variables de la receta");
  lines.push("  const variables: Record<string, any> = {");
  if (recipe.variables && recipe.variables.length > 0) {
    for (const v of recipe.variables) {
      const defVal = v.defaultValue !== undefined ? JSON.stringify(v.defaultValue) : "undefined";
      lines.push(`    ${JSON.stringify(v.name)}: ${defVal},`);
    }
  }
  lines.push("  };");
  lines.push("");

  // 5. Generar pasos del grafo
  const visited = new Set<string>();

  function getCandidatesJson(group: LocatorGroup): string {
    const list = [group.primary, ...(group.fallbacks || [])].map((c) => ({
      strategy: c.strategy,
      value: c.value,
    }));
    return JSON.stringify(list);
  }

  function getNextId(node: RecipeNode, edges: RecipeEdge[]): string | undefined {
    if (node.next) return node.next;
    const directEdge = edges.find((e) => e.from === node.id && !e.condition);
    return directEdge?.to;
  }

  function generateNodeCode(nodeId: string, indent: string): void {
    if (visited.has(nodeId)) {
      lines.push(`${indent}// Ciclo detectado o nodo ya visitado: ${nodeId}`);
      return;
    }
    visited.add(nodeId);

    const node = recipe.nodes[nodeId];
    if (!node) {
      lines.push(`${indent}// ERROR: Nodo ${nodeId} no encontrado en la receta`);
      return;
    }

    lines.push(`${indent}// [${node.type.toUpperCase()}] ${node.description || node.id}`);

    const nodeLines: string[] = [];

    switch (node.type) {
      case "navigate": {
        const waitUntil = node.params.waitUntil || "domcontentloaded";
        const timeout = node.timeout || 30000;
        nodeLines.push(
          `await page.goto(${JSON.stringify(node.params.url)}, { waitUntil: ${JSON.stringify(waitUntil)}, timeout: ${timeout} });`
        );
        break;
      }

      case "click": {
        const candidates = getCandidatesJson(node.locator);
        nodeLines.push(`const loc_${node.id} = await resolveLocator(page, ${candidates}, ${node.timeout || 5000});`);
        const clickOpts: string[] = [];
        if (node.params.button && node.params.button !== "left") {
          clickOpts.push(`button: ${JSON.stringify(node.params.button)}`);
        }
        if (node.params.clickCount && node.params.clickCount > 1) {
          clickOpts.push(`clickCount: ${node.params.clickCount}`);
        }
        if (node.params.delay && node.params.delay > 0) {
          clickOpts.push(`delay: ${node.params.delay}`);
        }
        const optStr = clickOpts.length > 0 ? `{ ${clickOpts.join(", ")} }` : "";
        nodeLines.push(`await loc_${node.id}.click(${optStr});`);
        break;
      }

      case "type": {
        const candidates = getCandidatesJson(node.locator);
        nodeLines.push(`const loc_${node.id} = await resolveLocator(page, ${candidates}, ${node.timeout || 5000});`);
        if (node.params.clear) {
          nodeLines.push(`await loc_${node.id}.fill('');`);
        }
        if (node.params.delay && node.params.delay > 0) {
          nodeLines.push(
            `await loc_${node.id}.pressSequentially(${JSON.stringify(node.params.text)}, { delay: ${node.params.delay} });`
          );
        } else {
          nodeLines.push(`await loc_${node.id}.fill(${JSON.stringify(node.params.text)});`);
        }
        break;
      }

      case "select": {
        const candidates = getCandidatesJson(node.locator);
        nodeLines.push(`const loc_${node.id} = await resolveLocator(page, ${candidates}, ${node.timeout || 5000});`);
        nodeLines.push(`await loc_${node.id}.selectOption(${JSON.stringify(node.params.value)});`);
        break;
      }

      case "waitFor": {
        switch (node.params.strategy) {
          case "networkIdle":
            nodeLines.push(`await page.waitForLoadState('networkidle', { timeout: ${node.timeout || 10000} });`);
            break;
          case "timeout":
            nodeLines.push(`await page.waitForTimeout(${Number(node.params.value) || 1000});`);
            break;
          case "url":
            nodeLines.push(`await page.waitForURL(${JSON.stringify(node.params.value)}, { timeout: ${node.timeout || 10000} });`);
            break;
          case "text":
            nodeLines.push(
              `await page.getByText(${JSON.stringify(String(node.params.value))}).first().waitFor({ state: 'visible', timeout: ${node.timeout || 10000} });`
            );
            break;
          case "selector":
          default:
            if (node.locator) {
              const candidates = getCandidatesJson(node.locator);
              nodeLines.push(`const loc_${node.id} = await resolveLocator(page, ${candidates}, ${node.timeout || 10000});`);
              nodeLines.push(`await loc_${node.id}.waitFor({ state: 'visible', timeout: ${node.timeout || 10000} });`);
            } else if (node.params.value) {
              nodeLines.push(`await page.locator(${JSON.stringify(String(node.params.value))}).first().waitFor({ state: 'visible', timeout: ${node.timeout || 10000} });`);
            }
            break;
        }
        break;
      }

      case "extract": {
        const candidates = getCandidatesJson(node.locator);
        nodeLines.push(`const loc_${node.id} = await resolveLocator(page, ${candidates}, ${node.timeout || 5000});`);
        if (node.params.extractType === "attribute") {
          nodeLines.push(
            `variables[${JSON.stringify(node.params.variable)}] = await loc_${node.id}.getAttribute(${JSON.stringify(node.params.attributeName || "")});`
          );
        } else if (node.params.extractType === "list") {
          nodeLines.push(
            `variables[${JSON.stringify(node.params.variable)}] = await loc_${node.id}.allInnerTexts();`
          );
        } else {
          nodeLines.push(
            `variables[${JSON.stringify(node.params.variable)}] = (await loc_${node.id}.innerText()).trim();`
          );
        }
        break;
      }

      case "screenshot": {
        const filename = node.params.name ? `${node.params.name}.png` : `${node.id}.png`;
        if (node.locator) {
          const candidates = getCandidatesJson(node.locator);
          nodeLines.push(`const loc_${node.id} = await resolveLocator(page, ${candidates}, ${node.timeout || 5000});`);
          nodeLines.push(`await loc_${node.id}.screenshot({ path: ${JSON.stringify(filename)} });`);
        } else {
          nodeLines.push(
            `await page.screenshot({ path: ${JSON.stringify(filename)}, fullPage: ${Boolean(node.params.fullPage)} });`
          );
        }
        break;
      }

      case "setVariable": {
        nodeLines.push(`variables[${JSON.stringify(node.params.name)}] = ${node.params.expression};`);
        break;
      }

      case "condition": {
        nodeLines.push(`if (Boolean(${node.params.expression})) {`);
        if (node.params.thenNodeId) {
          generateNodeCode(node.params.thenNodeId, `${indent}  `);
        }
        if (node.params.elseNodeId) {
          nodeLines.push(`} else {`);
          generateNodeCode(node.params.elseNodeId, `${indent}  `);
        }
        nodeLines.push(`}`);
        break;
      }

      case "loop": {
        const collExpr = node.params.collectionExpression;
        const maxIter = node.params.maxIterations || 100;
        nodeLines.push(`let iterCount_${node.id} = 0;`);
        nodeLines.push(`for (const item of (Array.isArray(${collExpr}) ? ${collExpr} : [])) {`);
        nodeLines.push(`${indent}  if (iterCount_${node.id} >= ${maxIter}) break;`);
        nodeLines.push(`${indent}  iterCount_${node.id}++;`);
        nodeLines.push(`${indent}  variables[${JSON.stringify(node.params.itemVariable)}] = item;`);
        if (node.params.bodyEntryNodeId) {
          generateNodeCode(node.params.bodyEntryNodeId, `${indent}  `);
        }
        nodeLines.push(`}`);
        break;
      }

      case "scroll": {
        const mode = node.params.mode || "element";
        const behavior = node.params.behavior || "smooth";
        if (mode === "element" && node.locator) {
          const candidatesJson = getCandidatesJson(node.locator);
          nodeLines.push(
            `const loc_${node.id} = await resolveLocator(page, ${candidatesJson}, ${node.timeout || 10000});`,
            `await loc_${node.id}.scrollIntoViewIfNeeded();`
          );
        } else if (mode === "top") {
          nodeLines.push(
            `await page.evaluate(() => window.scrollTo({ top: 0, behavior: ${JSON.stringify(behavior)} }));`
          );
        } else if (mode === "bottom") {
          nodeLines.push(
            `await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: ${JSON.stringify(behavior)} }));`
          );
        } else {
          const x = node.params.x || 0;
          const y = node.params.y ?? 500;
          nodeLines.push(
            `await page.evaluate(({ left, top, behavior }) => window.scrollBy({ left, top, behavior }), { left: ${x}, top: ${y}, behavior: ${JSON.stringify(behavior)} });`
          );
        }
        break;
      }
    }

    // Manejo de onError
    if (node.onError === "continue") {
      lines.push(`${indent}try {`);
      for (const nl of nodeLines) {
        lines.push(`${indent}  ${nl}`);
      }
      lines.push(`${indent}} catch (err) {`);
      lines.push(`${indent}  console.warn("Paso ${node.id} falló con onError='continue':", err);`);
      lines.push(`${indent}}`);
    } else {
      for (const nl of nodeLines) {
        lines.push(`${indent}${nl}`);
      }
    }

    lines.push("");

    // Continuar con el siguiente nodo (a menos que sea condicional o bucle que ya anidó ramas)
    if (node.type !== "condition") {
      const nextId = getNextId(node, recipe.edges || []);
      if (nextId) {
        generateNodeCode(nextId, indent);
      }
    }
  }

  // Ejecutar desde la entrada
  if (recipe.entry) {
    generateNodeCode(recipe.entry, "  ");
  }

  lines.push("});");
  lines.push("");

  return lines.join("\n");
}
