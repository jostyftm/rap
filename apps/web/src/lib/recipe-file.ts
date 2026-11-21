/**
 * Utilidades para exportación e importación de recetas en formato JSON estándar (.json).
 */

export const RECIPE_FILE_FORMAT = "rpa-studio.recipe";
export const RECIPE_FORMAT_VERSION = 1;

export interface PortableRecipeFile {
  format: string;
  format_version: number;
  exported_at: string;
  source?: {
    recipe_id?: string;
    recipe_name?: string;
    version?: number | null;
    is_draft?: boolean;
  };
  recipe: {
    name: string;
    description?: string;
    allowed_domains?: string[];
  };
  definition: any;
}

/**
 * Descarga en el navegador un objeto como archivo JSON.
 */
export function downloadRecipeJson(data: any, suggestedName = "recipe.json"): void {
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = suggestedName.endsWith(".json") ? suggestedName : `${suggestedName}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Parsea y valida preliminarmente el contenido de un archivo de receta exportado.
 */
export function parseRecipeJson(content: string): { data?: PortableRecipeFile; error?: string } {
  try {
    const parsed = JSON.parse(content);

    if (!parsed || typeof parsed !== "object") {
      return { error: "El archivo no contiene un JSON válido." };
    }

    if (parsed.format !== RECIPE_FILE_FORMAT) {
      return {
        error: `El archivo no tiene el formato esperado (se esperaba "${RECIPE_FILE_FORMAT}").`,
      };
    }

    if (!parsed.definition || typeof parsed.definition !== "object") {
      return { error: "El archivo no contiene la definición DSL del flujo." };
    }

    return { data: parsed as PortableRecipeFile };
  } catch (err) {
    return {
      error: `Error al leer el archivo JSON: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Lee un archivo de tipo File desde un input[type=file] y lo parsea.
 */
export async function readRecipeFile(
  file: File
): Promise<{ data?: PortableRecipeFile; error?: string }> {
  try {
    const text = await file.text();
    return parseRecipeJson(text);
  } catch (err) {
    return {
      error: `No se pudo leer el archivo: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
