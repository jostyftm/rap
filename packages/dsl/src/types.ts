export type LocatorStrategy =
  | "testid"
  | "role"
  | "label"
  | "text"
  | "css"
  | "xpath"
  | "vision";

export interface LocatorCandidate {
  strategy: LocatorStrategy;
  value: string;
  score: number;
}

export interface SemanticFingerprint {
  role?: string;
  accessibleName?: string;
  tag?: string;
  text?: string;
  classes?: string[];
  attributes?: Record<string, string>;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface LocatorGroup {
  primary: LocatorCandidate;
  fallbacks: LocatorCandidate[];
  fingerprint?: SemanticFingerprint;
}

export type OnErrorBehavior = "fail" | "continue" | "retry";
export type ScreenshotPolicy = "never" | "onError" | "always";
export type RetryBackoff = "fixed" | "exponential";

export interface RetryPolicy {
  /** Número total de intentos, incluido el primero (1-10) */
  maxAttempts: number;
  /** Espera base entre intentos en milisegundos */
  delayMs: number;
  /** fixed: espera constante; exponential: delayMs * 2^(intento-1) */
  backoff: RetryBackoff;
}

export interface BaseNode {
  id: string;
  description: string;
  timeout?: number;
  onError?: OnErrorBehavior;
  retry?: RetryPolicy;
  screenshot?: ScreenshotPolicy;
  next?: string;
  isInitializer?: boolean;
  position?: {
    x: number;
    y: number;
  };
}

export interface NavigateNode extends BaseNode {
  type: "navigate";
  params: {
    url: string;
    waitUntil?: "load" | "domcontentloaded" | "networkidle";
  };
}

export interface ClickNode extends BaseNode {
  type: "click";
  locator: LocatorGroup;
  params: {
    button?: "left" | "right" | "middle";
    clickCount?: number;
    delay?: number;
  };
}

export interface TypeNode extends BaseNode {
  type: "type";
  locator: LocatorGroup;
  params: {
    text: string;
    clear?: boolean;
    delay?: number;
    sensitive?: boolean;
  };
}

export interface SelectNode extends BaseNode {
  type: "select";
  locator: LocatorGroup;
  params: {
    value: string;
  };
}

export interface WaitForNode extends BaseNode {
  type: "waitFor";
  locator?: LocatorGroup;
  params: {
    strategy: "selector" | "networkIdle" | "url" | "text" | "timeout";
    value?: string | number;
  };
}

export interface ExtractNode extends BaseNode {
  type: "extract";
  locator: LocatorGroup;
  params: {
    extractType: "text" | "attribute" | "list";
    attributeName?: string;
    variable: string;
  };
}

export interface ScreenshotNode extends BaseNode {
  type: "screenshot";
  locator?: LocatorGroup;
  params: {
    fullPage?: boolean;
    name?: string;
  };
}

export interface SetVariableNode extends BaseNode {
  type: "setVariable";
  params: {
    name: string;
    expression: string;
  };
}

export type ConditionDataType =
  | "string"
  | "number"
  | "boolean"
  | "array"
  | "exists"
  | "custom";

export type ConditionOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "regex_match"
  | "greater_than"
  | "greater_than_or_equal"
  | "less_than"
  | "less_than_or_equal"
  | "is_true"
  | "is_false"
  | "array_contains"
  | "array_is_empty"
  | "array_not_empty"
  | "is_null_or_empty"
  | "is_not_null_or_empty";

export interface ConditionNode extends BaseNode {
  type: "condition";
  params: {
    expression: string;
    thenNodeId: string;
    elseNodeId?: string;
    dataType?: ConditionDataType;
    leftOperand?: string;
    operator?: ConditionOperator;
    rightOperand?: string;
  };
}

export interface LoopNode extends BaseNode {
  type: "loop";
  params: {
    collectionExpression: string;
    itemVariable: string;
    bodyEntryNodeId: string;
    maxIterations: number;
  };
}

export interface ScrollNode extends BaseNode {
  type: "scroll";
  locator?: LocatorGroup;
  params: {
    mode: "element" | "coordinates" | "top" | "bottom";
    x?: number;
    y?: number;
    behavior?: "smooth" | "auto";
  };
}

export type WebhookHttpMethod =
  | "ANY"
  | "GET"
  | "POST"
  | "PUT"
  | "DELETE"
  | "PATCH";

export interface WebhookNode extends BaseNode {
  type: "webhook";
  params: {
    httpMethod: WebhookHttpMethod;
    path?: string;
    outputVariable?: string;
    responseCode?: number;
    responseBody?: string;
  };
}

/**
 * Bloque try / catch / finally.
 *
 * El alcance de cada rama es la cadena que comienza en su nodo de entrada y
 * avanza por `next` hasta alcanzar la continuación del bloque (el `next` de
 * este nodo) o el final del grafo. El validador comprueba que las tres ramas
 * no se solapen ni contengan ciclos.
 */
export interface TryCatchNode extends BaseNode {
  type: "tryCatch";
  params: {
    tryEntryNodeId: string;
    catchEntryNodeId: string;
    finallyEntryNodeId?: string;
    /** Variable donde se expone { message, nodeId, type } del error capturado */
    errorVariable?: string;
    /** Si es true, el error se propaga después de ejecutar catch y finally */
    rethrow?: boolean;
  };
}

export type RecipeNode =
  | NavigateNode
  | ClickNode
  | TypeNode
  | SelectNode
  | WaitForNode
  | ExtractNode
  | ScreenshotNode
  | SetVariableNode
  | ConditionNode
  | LoopNode
  | ScrollNode
  | WebhookNode
  | TryCatchNode;

/**
 * Lista canónica de tipos de nodo del sistema. Es la fuente única que deben
 * consumir la UI, los tests de paridad y la documentación.
 */
export const SYSTEM_NODE_TYPES = [
  "navigate",
  "click",
  "type",
  "select",
  "waitFor",
  "extract",
  "screenshot",
  "setVariable",
  "condition",
  "loop",
  "scroll",
  "webhook",
  "tryCatch",
] as const;

export type SystemNodeType = (typeof SYSTEM_NODE_TYPES)[number];

export interface RecipeEdge {
  from: string;
  to: string;
  label?: string;
  condition?: string;
}

export interface RecipeVariable {
  name: string;
  type: "string" | "number" | "boolean" | "array" | "object";
  defaultValue?: unknown;
  description?: string;
}

export interface RecipeDsl {
  schema: "rpa/v1";
  name?: string;
  description?: string;
  variables?: RecipeVariable[];
  secrets?: string[];
  entry: string;
  nodes: Record<string, RecipeNode>;
  edges: RecipeEdge[];
}

export const INITIALIZER_NODE_TYPES = ["navigate", "webhook"] as const;
export type InitializerNodeType = (typeof INITIALIZER_NODE_TYPES)[number];

export function isInitializerNodeType(type: string): type is InitializerNodeType {
  return (INITIALIZER_NODE_TYPES as readonly string[]).includes(type);
}
