import { Camera } from "lucide-react";
import type { ScreenshotNode } from "@rpa/dsl";
import type { NodeDefinition } from "../types";
import {
  ScreenshotInspectorForm,
  ScreenshotAdvancedForm,
} from "../inspectors/screenshot-inspector";

export const screenshotDefinition: NodeDefinition<ScreenshotNode> = {
  type: "screenshot",
  label: "Captura de Pantalla",
  category: "data",
  description: "Tomar screenshot de la página o de un elemento",
  icon: Camera,
  color: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  hasTarget: false,
  createDefault: (id: string): ScreenshotNode => ({
    id,
    type: "screenshot",
    description: "Capturar pantalla completa",
    params: { fullPage: true, name: "captura" },
  }),
  getHighlight: (node: ScreenshotNode) => node.params?.name || "captura",
  InspectorForm: ScreenshotInspectorForm,
  AdvancedOptionsForm: ScreenshotAdvancedForm,
};
