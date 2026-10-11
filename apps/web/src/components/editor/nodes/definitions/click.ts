import { MousePointer } from "lucide-react";
import type { ClickNode } from "@rpa/dsl";
import type { NodeDefinition } from "../types";
import {
  ClickInspectorForm,
  ClickAdvancedForm,
} from "../inspectors/click-inspector";

export const clickDefinition: NodeDefinition<ClickNode> = {
  type: "click",
  label: "Clic",
  category: "interaction",
  description: "Hacer clic en un botón, enlace o elemento",
  icon: MousePointer,
  color: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20",
  hasTarget: true,
  createDefault: (id: string): ClickNode => ({
    id,
    type: "click",
    description: "Hacer clic en elemento",
    locator: {
      primary: { strategy: "testid", value: "action-button", score: 95 },
      fallbacks: [],
    },
    params: { button: "left" },
  }),
  InspectorForm: ClickInspectorForm,
  AdvancedOptionsForm: ClickAdvancedForm,
};
