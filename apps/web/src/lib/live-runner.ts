import type { RecipeDsl, RecipeNode } from "@rpa/dsl";
import { useRecipeStore } from "../stores/use-recipe-store";
import { useLiveStore } from "../stores/use-live-store";
import { useLayoutStore } from "../stores/use-layout-store";

let isSimulationPaused = false;
let isSimulationStopped = false;

export function pauseLiveSimulation(): void {
  isSimulationPaused = true;
  useRecipeStore.getState().addLog({
    level: "warn",
    message: "[Simulación en Panel] Pausada por el usuario.",
  });
}

export function resumeLiveSimulation(): void {
  isSimulationPaused = false;
  useRecipeStore.getState().addLog({
    level: "info",
    message: "[Simulación en Panel] Reanudada.",
  });
}

export function stopLiveSimulation(): void {
  isSimulationStopped = true;
  isSimulationPaused = false;
  useRecipeStore.getState().addLog({
    level: "warn",
    message: "[Simulación en Panel] Detenida por el usuario.",
  });
  useRecipeStore.getState().finishRun("failed");
  useRecipeStore.getState().setRunningNodeId(null);
}

export async function runRecipeInLivePanel(
  recipe: RecipeDsl,
  slowMoMs = 500
): Promise<void> {
  const recipeStore = useRecipeStore.getState();
  const liveStore = useLiveStore.getState();
  const layoutStore = useLayoutStore.getState();

  isSimulationPaused = false;
  isSimulationStopped = false;

  // Asegurar que el panel esté abierto en modo split o full_site
  if (!liveStore.isOpen) {
    liveStore.open();
  }
  if (layoutStore.mode === "flow") {
    layoutStore.setMode("split");
  }

  const mockRunId = `sim_${Date.now()}`;
  recipeStore.startRun(mockRunId);
  recipeStore.addLog({
    level: "info",
    message: "Iniciando simulación paso a paso en el panel interactivo...",
  });

  let currentNodeId: string | undefined = recipe.entry;
  const visited = new Set<string>();
  let count = 0;
  const maxSteps = 100;

  try {
    while (currentNodeId && count < maxSteps) {
      if (isSimulationStopped) {
        throw new Error("Simulación detenida por el usuario");
      }

      // Manejar estado pausado
      while (isSimulationPaused) {
        if (isSimulationStopped) throw new Error("Simulación detenida");
        await new Promise((r) => setTimeout(r, 400));
      }

      count++;
      const node: RecipeNode | undefined = recipe.nodes[currentNodeId];
      if (!node) {
        throw new Error(`Nodo [${currentNodeId}] no encontrado`);
      }

      recipeStore.setRunningNodeId(node.id);
      recipeStore.addLog({
        level: "info",
        message: `Paso [${node.id}] (${node.type}): ${node.description || "Iniciando acción"}`,
        nodeId: node.id,
      });

      const startTime = Date.now();

      // Ejecutar según el tipo de nodo
      if (node.type === "navigate") {
        const targetUrl = (node as any).params?.url;
        if (targetUrl) {
          const recId = recipeStore.recipeId || "current";
          await liveStore.startEmbedded(recId, targetUrl);
          // Esperar un momento a que el frame cargue
          await new Promise((r) => setTimeout(r, 1200));
        }
      } else {
        const result = await liveStore.exec(node);
        const duration = Date.now() - startTime;

        if (!result.ok) {
          throw new Error(result.error || "Fallo ejecutando acción en el sitio");
        }

        recipeStore.addLog({
          level: "success",
          message: `Paso [${node.id}] completado en ${duration}ms (usó ${result.strategy || "acción"})`,
          nodeId: node.id,
        });
      }

      // Pausa configurable entre pasos (slowMo) para ver la animación
      if (slowMoMs > 0) {
        await new Promise((r) => setTimeout(r, slowMoMs));
      }

      visited.add(node.id);
      currentNodeId = node.next;
    }

    recipeStore.setRunningNodeId(null);
    recipeStore.finishRun("success");
    recipeStore.addLog({
      level: "success",
      message: `Simulación en el panel completada exitosamente (${count} pasos).`,
    });
  } catch (err: any) {
    recipeStore.setRunningNodeId(null);
    recipeStore.finishRun("failed");
    recipeStore.addLog({
      level: "error",
      message: `Simulación finalizada con error: ${err.message || err}`,
    });
  }
}
