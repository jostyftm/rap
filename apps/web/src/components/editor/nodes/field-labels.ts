export const FIELD_LABELS: Record<string, string> = {
  "locator.primary.value": "Selector del elemento",
  "locator.primary.strategy": "Tipo de selector",
  "params.url": "URL de navegación",
  "params.text": "Texto a escribir",
  "params.pressEnter": "Presionar Enter al finalizar",
  "params.value": "Valor o parámetro del paso",
  "params.variable": "Nombre de la variable",
  "params.name": "Nombre de la variable",
  "params.expression": "Expresión de la condición",
  "params.maxIterations": "Límite de iteraciones",
  "params.collectionExpression": "Colección a recorrer",
  "params.itemVariable": "Variable de cada elemento",
  "params.thenNodeId": "Paso de condición verdadera",
  "params.elseNodeId": "Paso de condición falsa",
  "params.tryEntryNodeId": "Inicio del bloque try",
  "params.catchEntryNodeId": "Inicio del bloque catch",
  "params.finallyEntryNodeId": "Inicio del bloque finally",
  "params.errorVariable": "Variable donde guardar el error",
  "params.rethrow": "Relanzar el error tras catch y finally",
  "params.bodyEntryNodeId": "Inicio del cuerpo del bucle",
  "retry.maxAttempts": "Intentos máximos",
  "retry.delayMs": "Espera base entre intentos (ms)",
  "retry.backoff": "Tipo de espera entre intentos",
  "params.y": "Desplazamiento vertical (Y)",
  "params.x": "Desplazamiento horizontal (X)",
};

export function getFieldLabel(field: string): string {
  if (FIELD_LABELS[field]) {
    return FIELD_LABELS[field];
  }
  const parts = field.split(".");
  const last = parts[parts.length - 1];
  return last ? last.charAt(0).toUpperCase() + last.slice(1) : field;
}
