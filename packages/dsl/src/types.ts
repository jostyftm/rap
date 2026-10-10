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

export interface BaseNode {
  id: string;
  description: string;
  timeout?: number;
  onError?: OnErrorBehavior;
  screenshot?: ScreenshotPolicy;
  next?: string;
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

export interface ConditionNode extends BaseNode {
  type: "condition";
  params: {
    expression: string;
    thenNodeId: string;
    elseNodeId?: string;
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
  | LoopNode;

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
