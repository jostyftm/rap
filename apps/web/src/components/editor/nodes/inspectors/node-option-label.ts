import type { RecipeDsl, RecipeNode } from "@rpa/dsl";
import { nodeRegistry } from "../registry";

const MAX_DETAIL_LENGTH = 48;

function truncateDetail(raw: string): string {
  const normalized = raw.replace(/\s+/g, " ").trim();
  if (normalized.length <= MAX_DETAIL_LENGTH) {
    return normalized;
  }
  return `${normalized.slice(0, MAX_DETAIL_LENGTH - 1).trimEnd()}…`;
}

/**
 * Extrae un resumen legible del nodo (URL, método HTTP, variable o selector primario)
 * para distinguirlo cuando varios nodos comparten la misma descripción.
 */
export function getNodeOptionDetail(node: RecipeNode): string | undefined {
  const highlight = nodeRegistry.getHighlight(node);
  if (highlight && highlight.trim()) {
    return truncateDetail(highlight);
  }

  const primary = (
    node as { locator?: { primary?: { strategy?: string; value?: string } } }
  ).locator?.primary;

  if (primary?.value && primary.value.trim()) {
    const raw = primary.strategy
      ? `${primary.strategy}: ${primary.value}`
      : primary.value;
    return truncateDetail(raw);
  }

  return undefined;
}

/**
 * Formatea la etiqueta de opción para selectores de ramas (tryCatch / loop),
 * mostrando siempre su ID, tipo y un detalle contextual.
 */
export function formatBranchNodeOption(node: RecipeNode): string {
  const typeLabel = nodeRegistry.get(node.type)?.label || node.type;
  const rawDesc = node.description?.trim();
  const detail = getNodeOptionDetail(node);

  const header =
    rawDesc && rawDesc !== node.id && rawDesc !== typeLabel
      ? `[${node.id}] ${rawDesc} (${typeLabel})`
      : `[${node.id}] ${typeLabel}`;

  return detail ? `${header} — ${detail}` : header;
}

function getOutgoingIds(node: RecipeNode): string[] {
  const out: string[] = [];
  if (node.next) out.push(node.next);

  const params = node.params as Record<string, unknown> | undefined;
  if (!params) return out;

  for (const key of [
    "thenNodeId",
    "elseNodeId",
    "bodyEntryNodeId",
    "tryEntryNodeId",
    "catchEntryNodeId",
    "finallyEntryNodeId",
  ]) {
    const target = params[key];
    if (typeof target === "string" && target.trim()) {
      out.push(target);
    }
  }

  return out;
}

/**
 * Ordena los nodos candidatos siguiendo el recorrido BFS desde `definition.entry`
 * y deja al final (ordenados por id) los nodos desconectados.
 */
export function sortBranchCandidateNodes(
  definition: RecipeDsl,
  excludeNodeId: string
): RecipeNode[] {
  const ordered: RecipeNode[] = [];
  const visited = new Set<string>();
  const queue: string[] = [];

  if (definition.entry && definition.nodes[definition.entry]) {
    queue.push(definition.entry);
  }

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const current = definition.nodes[currentId];
    if (!current) continue;

    if (current.id !== excludeNodeId) {
      ordered.push(current);
    }

    for (const nextId of getOutgoingIds(current)) {
      if (!visited.has(nextId) && definition.nodes[nextId]) {
        queue.push(nextId);
      }
    }
  }

  const disconnected = Object.values(definition.nodes)
    .filter((candidate) => candidate.id !== excludeNodeId && !visited.has(candidate.id))
    .sort((a, b) => a.id.localeCompare(b.id, "es"));

  return [...ordered, ...disconnected];
}
