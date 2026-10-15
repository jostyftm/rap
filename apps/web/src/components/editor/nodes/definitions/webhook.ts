import { Webhook } from "lucide-react";
import type { WebhookNode } from "@rpa/dsl";
import type { NodeDefinition } from "../types";
import { WebhookInspectorForm } from "../inspectors/webhook-inspector";

export const webhookDefinition: NodeDefinition<WebhookNode> = {
  type: "webhook",
  label: "Webhook (HTTP Trigger)",
  category: "triggers",
  description: "Recibe peticiones HTTP (GET, POST, etc.)",
  isInitializer: true,
  keywords: ["webhook", "http", "api", "trigger", "post", "get", "rest", "payload"],
  icon: Webhook,
  color: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  hasTarget: false,
  createDefault: (id: string): WebhookNode => ({
    id,
    type: "webhook",
    description: "Recepción de webhook HTTP",
    params: {
      httpMethod: "POST",
      path: `/api/v1/webhooks/${id}`,
      outputVariable: "webhook",
      responseCode: 200,
      responseBody: '{"ok":true}',
    },
  }),
  getHighlight: (node: WebhookNode) =>
    `${node.params.httpMethod || "POST"} ${node.params.path || "/api/webhook"}`,
  InspectorForm: WebhookInspectorForm,
};
