"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Clock,
  Webhook,
  Plus,
  Trash2,
  RefreshCw,
  Copy,
  Check,
  CheckCircle,
  AlertCircle,
  Loader2,
  Power,
} from "lucide-react";
import { apiFetch } from "../../lib/api-client";

interface TriggersModalProps {
  recipeId: string;
  isOpen: boolean;
  onClose: () => void;
}

interface ScheduleItem {
  id: string;
  name: string;
  cron_expression: string;
  is_active: boolean;
  last_run_at?: string;
  next_run_at?: string;
}

export function TriggersModal({ recipeId, isOpen, onClose }: TriggersModalProps) {
  const [activeTab, setActiveTab] = useState<"cron" | "webhook">("cron");
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [isLoadingSchedules, setIsLoadingSchedules] = useState(false);

  // Formulario nuevo schedule
  const [newName, setNewName] = useState("");
  const [newCron, setNewCron] = useState("0 8 * * 1-5");
  const [isCreatingSchedule, setIsCreatingSchedule] = useState(false);

  // Webhook
  const [webhookToken, setWebhookToken] = useState<string>("");
  const [webhookEnabled, setWebhookEnabled] = useState<boolean>(false);
  const [isTogglingWebhook, setIsTogglingWebhook] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  useEffect(() => {
    if (!isOpen || !recipeId) return;

    // Cargar Schedules
    setIsLoadingSchedules(true);
    apiFetch<{ data: ScheduleItem[] }>(`/api/v1/recipes/${recipeId}/schedules`)
      .then((res) => {
        setSchedules(res.data || []);
      })
      .catch((err) => {
        console.warn("Error cargando schedules:", err);
      })
      .finally(() => {
        setIsLoadingSchedules(false);
      });

    // Cargar estado de Webhook desde la receta
    apiFetch<{ data: { webhook_token?: string; webhook_enabled?: boolean } }>(
      `/api/v1/recipes/${recipeId}`
    )
      .then((res) => {
        if (res.data) {
          setWebhookToken(res.data.webhook_token || "");
          setWebhookEnabled(Boolean(res.data.webhook_enabled));
        }
      })
      .catch((err) => {
        console.warn("Error cargando estado de webhook:", err);
      });
  }, [isOpen, recipeId]);

  if (!isOpen) return null;

  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newCron.trim()) return;

    setIsCreatingSchedule(true);
    try {
      const res = await apiFetch<{ data: ScheduleItem }>(
        `/api/v1/recipes/${recipeId}/schedules`,
        {
          method: "POST",
          body: JSON.stringify({
            name: newName.trim(),
            cron_expression: newCron.trim(),
            is_active: true,
          }),
        }
      );
      if (res.data) {
        setSchedules((prev) => [...prev, res.data]);
        setNewName("");
      }
    } catch (err: any) {
      alert(`Error al crear programación: ${err.message || err}`);
    } finally {
      setIsCreatingSchedule(false);
    }
  };

  const handleToggleSchedule = async (schedule: ScheduleItem) => {
    try {
      const res = await apiFetch<{ data: ScheduleItem }>(
        `/api/v1/schedules/${schedule.id}/toggle`,
        { method: "POST" }
      );
      if (res.data) {
        setSchedules((prev) =>
          prev.map((s) => (s.id === schedule.id ? res.data : s))
        );
      }
    } catch (err: any) {
      alert(`Error al alternar estado: ${err.message || err}`);
    }
  };

  const handleDeleteSchedule = async (scheduleId: string) => {
    if (!confirm("¿Deseas eliminar esta programación?")) return;
    try {
      await apiFetch(`/api/v1/schedules/${scheduleId}`, { method: "DELETE" });
      setSchedules((prev) => prev.filter((s) => s.id !== scheduleId));
    } catch (err: any) {
      alert(`Error al eliminar programación: ${err.message || err}`);
    }
  };

  const handleToggleWebhook = async (regenerate = false) => {
    setIsTogglingWebhook(true);
    try {
      const nextState = regenerate ? webhookEnabled : !webhookEnabled;
      const res = await apiFetch<{ webhook_token: string; webhook_enabled: boolean }>(
        `/api/v1/recipes/${recipeId}/webhook/toggle`,
        {
          method: "POST",
          body: JSON.stringify({
            enabled: nextState,
            regenerate,
          }),
        }
      );
      setWebhookToken(res.webhook_token || "");
      setWebhookEnabled(Boolean(res.webhook_enabled));
    } catch (err: any) {
      alert(`Error configurando webhook: ${err.message || err}`);
    } finally {
      setIsTogglingWebhook(false);
    }
  };

  const webhookUrl = webhookToken
    ? `http://localhost:8000/api/v1/webhooks/recipes/${webhookToken}/trigger`
    : "";

  return (
    <div className="fixed inset-0 bg-neutral-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/60">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-neutral-100">
                Disparadores y Programación Automática
              </h2>
              <p className="text-xs text-neutral-400">
                Configura ejecuciones periódicas desatendidas (Cron) o webhooks HTTP entrantes.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-neutral-800 bg-neutral-950/30 px-5 pt-2">
          <button
            onClick={() => setActiveTab("cron")}
            className={`flex items-center space-x-2 px-4 py-2 border-b-2 text-xs font-medium transition-colors ${
              activeTab === "cron"
                ? "border-amber-400 text-amber-400"
                : "border-transparent text-neutral-400 hover:text-neutral-200"
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Programación Periódica (Cron)</span>
          </button>
          <button
            onClick={() => setActiveTab("webhook")}
            className={`flex items-center space-x-2 px-4 py-2 border-b-2 text-xs font-medium transition-colors ${
              activeTab === "webhook"
                ? "border-amber-400 text-amber-400"
                : "border-transparent text-neutral-400 hover:text-neutral-200"
            }`}
          >
            <Webhook className="w-3.5 h-3.5" />
            <span>Webhook HTTP Entrante</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === "cron" ? (
            <div className="space-y-6">
              {/* Formulario nuevo cron */}
              <form
                onSubmit={handleCreateSchedule}
                className="p-4 rounded-lg bg-neutral-950 border border-neutral-800/80 space-y-3"
              >
                <div className="text-xs font-semibold text-neutral-200 flex items-center space-x-1.5">
                  <Plus className="w-3.5 h-3.5 text-amber-400" />
                  <span>Crear nueva programación</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-neutral-400 mb-1">
                      Nombre descriptivo
                    </label>
                    <input
                      type="text"
                      placeholder="Ej. Extracción Diaria 8:00 AM"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-1.5 text-xs text-neutral-100 placeholder:text-neutral-600 focus:border-amber-500 outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-neutral-400 mb-1">
                      Expresión Cron (min hora día mes d-sem)
                    </label>
                    <input
                      type="text"
                      value={newCron}
                      onChange={(e) => setNewCron(e.target.value)}
                      className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-1.5 text-xs font-mono text-neutral-100 focus:border-amber-500 outline-none"
                      required
                    />
                  </div>
                </div>

                {/* Botones de presets */}
                <div className="flex items-center space-x-1.5 text-[11px] text-neutral-400">
                  <span>Preajustes:</span>
                  <button
                    type="button"
                    onClick={() => setNewCron("*/15 * * * *")}
                    className="px-2 py-0.5 rounded bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-800"
                  >
                    Cada 15m
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewCron("0 * * * *")}
                    className="px-2 py-0.5 rounded bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-800"
                  >
                    Cada hora
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewCron("0 8 * * 1-5")}
                    className="px-2 py-0.5 rounded bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-800"
                  >
                    Lunes a Viernes 8am
                  </button>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={isCreatingSchedule}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
                  >
                    {isCreatingSchedule ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                    <span>Guardar Programación</span>
                  </button>
                </div>
              </form>

              {/* Lista de schedules */}
              <div className="space-y-2">
                <div className="text-xs font-medium text-neutral-400">
                  Programaciones activas ({schedules.length})
                </div>

                {isLoadingSchedules ? (
                  <div className="py-6 flex items-center justify-center text-neutral-500 text-xs">
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Cargando...
                  </div>
                ) : schedules.length === 0 ? (
                  <div className="p-6 text-center rounded-lg border border-neutral-800/60 bg-neutral-950/40 text-neutral-500 text-xs">
                    No hay programaciones definidas. Agrega una arriba para ejecutar esta receta automáticamente.
                  </div>
                ) : (
                  schedules.map((s) => (
                    <div
                      key={s.id}
                      className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 flex items-center justify-between"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-xs text-neutral-200">
                            {s.name}
                          </span>
                          <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-amber-400">
                            {s.cron_expression}
                          </span>
                          {s.is_active ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              Activa
                            </span>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-neutral-800 text-neutral-500">
                              Pausada
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-neutral-500">
                          {s.next_run_at ? (
                            <span>Próxima ejecución: {new Date(s.next_run_at).toLocaleString()}</span>
                          ) : (
                            <span>Pendiente de cálculo</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleToggleSchedule(s)}
                          className={`p-1.5 rounded transition-colors ${
                            s.is_active
                              ? "text-emerald-400 hover:bg-neutral-800"
                              : "text-neutral-500 hover:bg-neutral-800"
                          }`}
                          title={s.is_active ? "Pausar programación" : "Activar programación"}
                        >
                          <Power className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteSchedule(s.id)}
                          className="p-1.5 rounded text-neutral-500 hover:text-rose-400 hover:bg-neutral-800 transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            /* Tab Webhook */
            <div className="space-y-5">
              <div className="p-4 rounded-lg bg-neutral-950 border border-neutral-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-semibold text-neutral-200">
                      Disparador HTTP (Inbound Webhook)
                    </h3>
                    <p className="text-[11px] text-neutral-400">
                      Permite que otros sistemas (CRMs, ERPs, scripts, Zapier) ejecuten esta receta enviando un POST.
                    </p>
                  </div>

                  <button
                    onClick={() => handleToggleWebhook(false)}
                    disabled={isTogglingWebhook}
                    className={`flex items-center space-x-1.5 px-3 py-1 rounded text-xs font-semibold transition-colors ${
                      webhookEnabled
                        ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                        : "bg-neutral-800 hover:bg-neutral-700 text-neutral-300"
                    }`}
                  >
                    <Power className="w-3.5 h-3.5" />
                    <span>{webhookEnabled ? "Habilitado" : "Deshabilitado"}</span>
                  </button>
                </div>

                {webhookEnabled && webhookUrl && (
                  <div className="space-y-3 pt-2 border-t border-neutral-800/60">
                    <div>
                      <label className="block text-[11px] text-neutral-400 mb-1 font-medium">
                        URL del Endpoint Webhook
                      </label>
                      <div className="flex items-center space-x-2">
                        <input
                          type="text"
                          readOnly
                          value={webhookUrl}
                          className="flex-1 bg-neutral-900 border border-neutral-800 rounded px-3 py-1.5 text-xs font-mono text-neutral-200 select-all outline-none"
                        />
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(webhookUrl);
                            setCopiedWebhook(true);
                            setTimeout(() => setCopiedWebhook(false), 2000);
                          }}
                          className="p-2 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
                          title="Copiar URL"
                        >
                          {copiedWebhook ? (
                            <Check className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={() => handleToggleWebhook(true)}
                          disabled={isTogglingWebhook}
                          className="p-2 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
                          title="Regenerar Token Secreto"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] text-neutral-400 mb-1 font-medium">
                        Ejemplo de invocación con cURL
                      </label>
                      <pre className="p-3 rounded bg-neutral-900 border border-neutral-800 text-[11px] font-mono text-neutral-300 overflow-x-auto select-all">
{`curl -X POST "${webhookUrl}" \\
  -H "Content-Type: application/json" \\
  -d '{"parameters": {"cliente_id": "1001"}}'`}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
