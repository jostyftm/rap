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
    const branchLabels = new Set(["try", "catch", "finally", "body"]);
    const directEdge = edges.find(
      (e) =>
        e.from === node.id &&
        !e.condition &&
        (!e.label || !branchLabels.has(e.label))
    );
    return directEdge?.to;
  }

  function generateNodeCode(nodeId: string, indent: string, stopAt?: string): void {
    if (!nodeId || nodeId === stopAt) {
      return;
    }

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

    if (node.type === "tryCatch") {
      const errorVariable = node.params.errorVariable || "error";

      lines.push(`${indent}try {`);
      if (node.params.tryEntryNodeId) {
        generateNodeCode(node.params.tryEntryNodeId, `${indent}  `, node.next);
      }
      lines.push(`${indent}} catch (err) {`);
      lines.push(
        `${indent}  variables[${JSON.stringify(errorVariable)}] = { message: err instanceof Error ? err.message : String(err), nodeId: "try", type: err instanceof Error ? err.name : "Error" };`
      );
      if (node.params.catchEntryNodeId) {
        generateNodeCode(node.params.catchEntryNodeId, `${indent}  `, node.next);
      }
      if (node.params.rethrow) {
        lines.push(`${indent}  throw err;`);
      }
      if (node.params.finallyEntryNodeId) {
        lines.push(`${indent}} finally {`);
        generateNodeCode(node.params.finallyEntryNodeId, `${indent}  `, node.next);
        lines.push(`${indent}}`);
      } else {
        lines.push(`${indent}}`);
      }

      lines.push("");
      const nextId = getNextId(node, recipe.edges || []);
      if (nextId) {
        generateNodeCode(nextId, indent, stopAt);
      }
      return;
    }

    if (node.type === "condition") {
      lines.push(`${indent}if (Boolean(${node.params.expression})) {`);
      if (node.params.thenNodeId) {
        generateNodeCode(node.params.thenNodeId, `${indent}  `, stopAt);
      }
      if (node.params.elseNodeId) {
        lines.push(`${indent}} else {`);
        generateNodeCode(node.params.elseNodeId, `${indent}  `, stopAt);
      }
      lines.push(`${indent}}`);
      lines.push("");
      return;
    }

    if (node.type === "loop") {
      const collExpr = node.params.collectionExpression;
      const maxIter = node.params.maxIterations || 100;
      const continuation = getNextId(node, recipe.edges || []);

      lines.push(`${indent}let iterCount_${node.id} = 0;`);
      lines.push(`${indent}for (const item of (Array.isArray(${collExpr}) ? ${collExpr} : [])) {`);
      lines.push(`${indent}  if (iterCount_${node.id} >= ${maxIter}) break;`);
      lines.push(`${indent}  iterCount_${node.id}++;`);
      lines.push(`${indent}  variables[${JSON.stringify(node.params.itemVariable)}] = item;`);
      if (node.params.bodyEntryNodeId) {
        generateNodeCode(node.params.bodyEntryNodeId, `${indent}  `, continuation ?? stopAt);
      }
      lines.push(`${indent}}`);
      lines.push("");

      if (continuation) {
        generateNodeCode(continuation, indent, stopAt);
      }
      return;
    }

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
        if (node.params.targetScope === "desktop") {
          const coords = node.params.coordinates
            ? `({ x: ${node.params.coordinates.x}, y: ${node.params.coordinates.y} })`
            : "";
          nodeLines.push(
            `// Macro de escritorio: Clic en coordenadas ${coords} - Ventana: ${JSON.stringify(node.params.windowTitle || "Activa")}`
          );
          if (node.params.coordinates) {
            nodeLines.push(`await page.mouse.click(${node.params.coordinates.x}, ${node.params.coordinates.y});`);
          }
          break;
        }
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
        if (node.params.targetScope === "desktop") {
          nodeLines.push(
            `// Macro de escritorio: Escribir texto - Ventana: ${JSON.stringify(node.params.windowTitle || "Activa")}`
          );
          nodeLines.push(`await page.keyboard.type(${JSON.stringify(node.params.text)});`);
          if (node.params.pressEnter) {
            nodeLines.push(`await page.keyboard.press("Enter");`);
          }
          break;
        }
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
        if (node.params.pressEnter) {
          nodeLines.push(`await loc_${node.id}.press('Enter');`);
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

      case "webhook": {
        const varName = node.params.outputVariable || "webhook";
        nodeLines.push(`// Webhook trigger payload`);
        nodeLines.push(`variables[${JSON.stringify(varName)}] = variables[${JSON.stringify(varName)}] || {};`);
        break;
      }
    }

    // Manejo de onError
    if (node.onError === "retry") {
      const retry = node.retry ?? { maxAttempts: 3, delayMs: 1000, backoff: "exponential" as const };
      const delayExpr =
        retry.backoff === "exponential"
          ? `${retry.delayMs} * 2 ** (attempt_${node.id} - 1)`
          : `${retry.delayMs}`;

      lines.push(`${indent}let attempt_${node.id} = 0;`);
      lines.push(`${indent}const maxAttempts_${node.id} = ${retry.maxAttempts};`);
      lines.push(`${indent}while (true) {`);
      lines.push(`${indent}  attempt_${node.id}++;`);
      lines.push(`${indent}  try {`);
      for (const nl of nodeLines) {
        lines.push(`${indent}    ${nl}`);
      }
      lines.push(`${indent}    break;`);
      lines.push(`${indent}  } catch (err) {`);
      lines.push(`${indent}    if (attempt_${node.id} >= maxAttempts_${node.id}) throw err;`);
      lines.push(`${indent}    await page.waitForTimeout(${delayExpr});`);
      lines.push(`${indent}  }`);
      lines.push(`${indent}}`);
    } else if (node.onError === "continue") {
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

    // Continuar con el siguiente nodo (a menos que una rama ya lo haya hecho)
    const nextId = getNextId(node, recipe.edges || []);
    if (nextId) {
      generateNodeCode(nextId, indent, stopAt);
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
