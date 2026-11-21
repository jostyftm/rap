import type { Page } from "playwright";
import type { RecipeNode, RespondType } from "@rpa/dsl";
import type { ResolvedLocator } from "../locator-resolver.js";

export interface AutomationResponse {
  kind?: "respond" | "lastNode" | "error";
  responseType: RespondType;
  statusCode: number;
  contentType: string;
  headers: Record<string, string>;
  body: string;
  isBase64: boolean;
  filename?: string;
  redirectUrl?: string;
  nodeId?: string;
}

export interface ExecutionContext {
  runId: string;
  variables: Record<string, unknown>;
  secrets: Record<string, string>;
  stepResults: Record<string, unknown>;
  /** Parámetros crudos recibidos al iniciar la ejecución (payload de webhook, API, etc.). */
  parameters?: Record<string, unknown>;
  /** Respuesta explícita publicada durante la ejecución. */
  response?: AutomationResponse;
  /** Publica una respuesta inmediata hacia el canal Redis del webhook/run. */
  emitResponse?: (response: AutomationResponse) => Promise<void>;
  /** Registra un aviso en el log de la ejecución sin interrumpirla. */
  warn?: (message: string, context?: Record<string, unknown>) => void;
  /** Registra un mensaje de log en la ejecución sin interrumpirla. */
  log?: (
    level: "info" | "warn" | "error" | "success",
    message: string,
    context?: Record<string, unknown>
  ) => void;
}

export interface ActionResult {
  success: boolean;
  resolvedLocator?: ResolvedLocator;
  screenshotPath?: string;
  nextNodeId?: string;
  output?: unknown;
  /** Si es true, el executor concluye el flujo con éxito tras este paso. */
  terminateFlow?: boolean;
}

export interface NodeActionHandler<TNode extends RecipeNode = RecipeNode> {
  readonly type: TNode["type"];
  execute(page: Page, node: TNode, ctx: ExecutionContext): Promise<ActionResult>;
}
