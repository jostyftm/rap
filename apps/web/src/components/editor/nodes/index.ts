import { nodeRegistry } from "./registry";
import { navigateDefinition } from "./definitions/navigate";
import { clickDefinition } from "./definitions/click";
import { typeDefinition } from "./definitions/type";
import { selectDefinition } from "./definitions/select";
import { scrollDefinition } from "./definitions/scroll";
import { waitForDefinition } from "./definitions/wait-for";
import { extractDefinition } from "./definitions/extract";
import { screenshotDefinition } from "./definitions/screenshot";
import { setVariableDefinition } from "./definitions/set-variable";
import { conditionDefinition } from "./definitions/condition";
import { loopDefinition } from "./definitions/loop";
import { webhookDefinition } from "./definitions/webhook";
import { tryCatchDefinition } from "./definitions/try-catch";
import type { NodeDefinition } from "./types";

export const ALL_BLOCK_DEFINITIONS: NodeDefinition<any>[] = [
  webhookDefinition,
  navigateDefinition,
  clickDefinition,
  typeDefinition,
  selectDefinition,
  scrollDefinition,
  waitForDefinition,
  extractDefinition,
  screenshotDefinition,
  setVariableDefinition,
  conditionDefinition,
  loopDefinition,
  tryCatchDefinition,
];

// Registrar todos los nodos en el Registry
ALL_BLOCK_DEFINITIONS.forEach((def) => nodeRegistry.register(def));

export { nodeRegistry };
export * from "./types";
