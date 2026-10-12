import { ActionHandlerRegistry } from "./registry.js";
import { navigateHandler } from "./navigate.handler.js";
import { clickHandler } from "./click.handler.js";
import { typeHandler } from "./type.handler.js";
import { selectHandler } from "./select.handler.js";
import { waitForHandler } from "./wait-for.handler.js";
import { extractHandler } from "./extract.handler.js";
import { screenshotHandler } from "./screenshot.handler.js";
import { setVariableHandler } from "./set-variable.handler.js";
import { conditionHandler } from "./condition.handler.js";
import { loopHandler } from "./loop.handler.js";
import { scrollHandler } from "./scroll.handler.js";
import { webhookHandler } from "./webhook.handler.js";

export * from "./types.js";
export * from "./registry.js";
export { navigateHandler } from "./navigate.handler.js";
export { clickHandler } from "./click.handler.js";
export { typeHandler } from "./type.handler.js";
export { selectHandler } from "./select.handler.js";
export { waitForHandler } from "./wait-for.handler.js";
export { extractHandler } from "./extract.handler.js";
export { screenshotHandler } from "./screenshot.handler.js";
export { setVariableHandler } from "./set-variable.handler.js";
export { conditionHandler } from "./condition.handler.js";
export { loopHandler } from "./loop.handler.js";
export { scrollHandler } from "./scroll.handler.js";
export { webhookHandler } from "./webhook.handler.js";

export const defaultActionRegistry = new ActionHandlerRegistry()
  .register(navigateHandler)
  .register(clickHandler)
  .register(typeHandler)
  .register(selectHandler)
  .register(waitForHandler)
  .register(extractHandler)
  .register(screenshotHandler)
  .register(setVariableHandler)
  .register(conditionHandler)
  .register(loopHandler)
  .register(scrollHandler)
  .register(webhookHandler);
