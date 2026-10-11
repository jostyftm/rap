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

// Registrar todos los nodos en el Registry
nodeRegistry.register(navigateDefinition);
nodeRegistry.register(clickDefinition);
nodeRegistry.register(typeDefinition);
nodeRegistry.register(selectDefinition);
nodeRegistry.register(scrollDefinition);
nodeRegistry.register(waitForDefinition);
nodeRegistry.register(extractDefinition);
nodeRegistry.register(screenshotDefinition);
nodeRegistry.register(setVariableDefinition);
nodeRegistry.register(conditionDefinition);
nodeRegistry.register(loopDefinition);

export { nodeRegistry };
export * from "./types";
