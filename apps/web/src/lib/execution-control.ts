import { apiFetch } from "./api-client";
import { useRecipeStore } from "../stores/use-recipe-store";
import {
  pauseLiveSimulation,
  resumeLiveSimulation,
  stopLiveSimulation,
} from "./live-runner";

export type RunControlAction = "pause" | "resume" | "stop";

/**
 * Despacha un comando de control de ejecución (Pausar, Reanudar, Detener)
 * tanto para ejecuciones de Playwright (Headed/Headless) como para simulaciones en vivo.
 */
export async function dispatchRunControl(
  action: RunControlAction,
  runId: string | null
): Promise<void> {
  const store = useRecipeStore.getState();

  // 1. Actualizar estado local inmediatamente para retroalimentación instantánea en la UI
  if (action === "pause") {
    store.setRunControlState("paused");
  } else if (action === "resume") {
    store.setRunControlState("running");
  } else if (action === "stop") {
    store.setRunControlState("stopping");
  }

  if (!runId) return;

  // 2. Si es una simulación en el panel embebido
  if (runId.startsWith("sim_")) {
    if (action === "pause") {
      pauseLiveSimulation();
    } else if (action === "resume") {
      resumeLiveSimulation();
    } else if (action === "stop") {
      stopLiveSimulation();
    }
    return;
  }

  // 3. Si es una ejecución real de Playwright (Runner / Redis)
  try {
    await apiFetch(`/api/v1/runs/${runId}/control`, {
      method: "POST",
      body: JSON.stringify({ action }),
    });
  } catch (err: any) {
    console.warn("Aviso al controlar ejecución Playwright:", err?.message || err);
  }
}
