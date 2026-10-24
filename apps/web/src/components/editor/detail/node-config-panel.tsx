"use client";

import React, { useState } from "react";
import {
  Globe,
  SlidersHorizontal,
  BookOpen,
  Copy,
  Trash2,
  Power,
  Play,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Plus,
  X,
  Star,
} from "lucide-react";
import { useRecipeStore } from "@/stores/use-recipe-store";
import { nodeRegistry } from "../nodes";
import type { NodeDefinition } from "../nodes/types";
import { RetryPolicyFields } from "../nodes/retry-policy-fields";
import type { RecipeNode, LocatorStrategy, LocatorCandidate } from "@rpa/dsl";
import { calculateLocatorScore } from "@rpa/locator";
import {
  Badge,
  Button,
  Field,
  IconButton,
  SectionCard,
  Select,
  TextInput,
} from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

interface NodeConfigPanelProps {
  node: RecipeNode;
  onExecuteNode: () => Promise<void>;
  isExecuting: boolean;
  className?: string;
}

const STRATEGY_OPTIONS: LocatorStrategy[] = [
  "testid",
  "role",
  "label",
  "text",
  "css",
  "xpath",
];

type ConfigTab = "params" | "settings" | "docs";

const TABS: Array<{ id: ConfigTab; label: string }> = [
  { id: "params", label: "Parámetros" },
  { id: "settings", label: "Ajustes" },
  { id: "docs", label: "Documentación" },
];

export function NodeConfigPanel({
  node,
  onExecuteNode,
  isExecuting,
  className = "",
}: NodeConfigPanelProps) {
  const [activeTab, setActiveTab] = useState<ConfigTab>("params");
  const [newStrategy, setNewStrategy] = useState<LocatorStrategy>("css");
  const [newValue, setNewValue] = useState("");
  const [copiedToken, setCopiedToken] = useState(false);

  const definition = useRecipeStore((s) => s.definition);
  const updateNode = useRecipeStore((s) => s.updateNode);
  const deleteNode = useRecipeStore((s) => s.deleteNode);
  const duplicateNode = useRecipeStore((s) => s.duplicateNode);
  const toggleNodeDisabled = useRecipeStore((s) => s.toggleNodeDisabled);
  const disabledNodeIds = useRecipeStore((s) => s.disabledNodeIds);
  const setEntryNode = useRecipeStore((s) => s.setEntryNode);
  const nodeExecStatuses = useRecipeStore((s) => s.nodeExecStatuses);
  const nodeExecDurations = useRecipeStore((s) => s.nodeExecDurations);
  const nodeExecErrors = useRecipeStore((s) => s.nodeExecErrors);

  const isDisabled = disabledNodeIds.includes(node.id);
  const isEntry = definition.entry === node.id;
  const execStatus = nodeExecStatuses[node.id];
  const execDuration = nodeExecDurations[node.id];
  const execError = nodeExecErrors[node.id];

  const nodeDef = nodeRegistry.get(node.type) as NodeDefinition | undefined;
  const Icon = nodeDef?.icon || Globe;

  const handleParamChange = (key: string, val: unknown) => {
    updateNode(node.id, {
      params: {
        ...node.params,
        [key]: val,
      },
    } as Partial<RecipeNode>);
  };

  const handlePrimaryLocatorChange = (strategy: LocatorStrategy, value: string) => {
    if (!("locator" in node) || !node.locator) return;
    const score = calculateLocatorScore(strategy, value);
    updateNode(node.id, {
      locator: {
        ...node.locator,
        primary: { strategy, value, score },
      },
    } as Partial<RecipeNode>);
  };

  const handleAddFallback = () => {
    if (!newValue.trim() || !("locator" in node) || !node.locator) return;
    const score = calculateLocatorScore(newStrategy, newValue.trim());
    const newCandidate: LocatorCandidate = {
      strategy: newStrategy,
      value: newValue.trim(),
      score,
    };
    updateNode(node.id, {
      locator: {
        ...node.locator,
        fallbacks: [...(node.locator.fallbacks || []), newCandidate],
      },
    } as Partial<RecipeNode>);
    setNewValue("");
  };

  const handleRemoveFallback = (index: number) => {
    if (!("locator" in node) || !node.locator) return;
    const fallbacks = [...(node.locator.fallbacks || [])];
    fallbacks.splice(index, 1);
    updateNode(node.id, {
      locator: {
        ...node.locator,
        fallbacks,
      },
    } as Partial<RecipeNode>);
  };

  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    const currentIndex = TABS.findIndex((tab) => tab.id === activeTab);
    let nextIndex: number | null = null;

    if (e.key === "ArrowRight") nextIndex = (currentIndex + 1) % TABS.length;
    else if (e.key === "ArrowLeft") nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") nextIndex = 0;
    else if (e.key === "End") nextIndex = TABS.length - 1;

    if (nextIndex === null) return;
    e.preventDefault();
    const nextTab = TABS[nextIndex];
    setActiveTab(nextTab.id);
    document.getElementById(`node-config-tab-${nextTab.id}`)?.focus();
  };

  const copyOutputToken = () => {
    navigator.clipboard.writeText(`{{steps.${node.id}.output}}`);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 1500);
  };

  const locator = "locator" in node ? node.locator : undefined;
  const score = locator?.primary?.score ?? 0;
  const scoreTone = score >= 80 ? "success" : score >= 60 ? "warning" : "danger";
  const fallbacks = locator?.fallbacks || [];

  return (
    <div className={cn("flex h-full flex-col bg-raised text-fg transition-colors", className)}>
      {/* Encabezado */}
      <header className="sticky top-0 z-10 shrink-0 border-b border-line bg-raised">
        <div className="flex items-start gap-3 px-5 pt-4">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-accent-soft text-accent-text ring-1 ring-inset ring-accent-line">
            <Icon className="h-[18px] w-[18px]" />
          </div>

          <div className="min-w-0 flex-1">
            <input
              type="text"
              value={node.description || ""}
              onChange={(e) => updateNode(node.id, { description: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              placeholder="Nombre o descripción del paso…"
              aria-label="Nombre del paso"
              className="-mx-1 w-full truncate rounded-md bg-transparent px-1 text-[15px] font-semibold leading-6 text-fg outline-none transition-colors placeholder:text-fg-subtle hover:bg-hover focus:bg-input focus:ring-2 focus:ring-accent/30"
            />

            <div className="mt-1 flex flex-wrap items-center gap-2 text-[10.5px]">
              <span className="rounded-md border border-line bg-card px-1.5 py-0.5 font-mono uppercase tracking-wide text-fg-muted">
                {node.type}
              </span>
              <span className="max-w-[180px] truncate font-mono text-fg-subtle">#{node.id}</span>
              {nodeDef?.isInitializer && (
                <Badge tone="accent" className="h-5 px-2 text-[9.5px]">
                  <Star className="h-2.5 w-2.5 fill-current" />
                  {isEntry ? "Trigger principal" : "Trigger secundario"}
                </Badge>
              )}
              {isDisabled && (
                <Badge tone="warning" className="h-5 px-2 text-[9.5px]">
                  Desactivado
                </Badge>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            <IconButton label="Duplicar este paso" onClick={() => duplicateNode(node.id)}>
              <Copy className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton
              label={isDisabled ? "Activar paso" : "Desactivar paso temporalmente"}
              onClick={() => toggleNodeDisabled(node.id)}
              className={isDisabled ? "bg-warning-soft text-warning-text" : undefined}
            >
              <Power className="h-3.5 w-3.5" />
            </IconButton>
            <span className="mx-1 h-4 w-px bg-line" />
            <IconButton tone="danger" label="Eliminar este paso" onClick={() => deleteNode(node.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </IconButton>
          </div>
        </div>

        {/* Pestañas */}
        <nav
          role="tablist"
          aria-label="Configuración del nodo"
          onKeyDown={handleTabKeyDown}
          className="mt-3 flex gap-1 px-5"
        >
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`node-config-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`node-config-panel-${tab.id}`}
                tabIndex={active ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "relative -mb-px flex h-9 items-center gap-1.5 px-3 text-[12.5px] font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                  "after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:origin-center after:rounded-full after:bg-accent after:transition-transform after:duration-200",
                  active
                    ? "text-fg after:scale-x-100"
                    : "text-fg-muted after:scale-x-0 hover:text-fg"
                )}
              >
                {tab.label}
                {tab.id === "settings" && node.onError && node.onError !== "fail" && (
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </nav>
      </header>

      {/* Cuerpo */}
      <div className="flex-1 overflow-y-auto">
        <div
          key={activeTab}
          id={`node-config-panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`node-config-tab-${activeTab}`}
          className="rpa-tab-panel mx-auto w-full max-w-[680px] space-y-5 px-5 py-5"
        >
          {/* PARÁMETROS */}
          {activeTab === "params" && (
            <>
              {nodeDef?.InspectorForm ? (
                <nodeDef.InspectorForm
                  node={node}
                  updateParam={handleParamChange}
                  updateNode={(updates) => updateNode(node.id, updates)}
                />
              ) : (
                <p className="text-[12px] text-fg-subtle">
                  Este nodo no tiene parámetros configurables.
                </p>
              )}
            </>
          )}

          {/* AJUSTES */}
          {activeTab === "settings" && (
            <div className="space-y-3">
              <SectionCard
                title="Ejecución"
                description="Inicio del flujo y tiempo máximo de espera del paso."
                icon={<Play className="h-4 w-4" />}
                storageKey={`rpa:node-detail:section:execution`}
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <Play
                        className={cn(
                          "h-3.5 w-3.5 shrink-0",
                          isEntry ? "text-accent-text" : "text-fg-subtle"
                        )}
                      />
                      <div className="min-w-0">
                        <p className="text-[12px] font-medium text-fg">
                          {nodeDef?.isInitializer ? "Trigger / inicio del flujo" : "Paso de entrada"}
                        </p>
                        <p className="text-[11px] leading-relaxed text-fg-subtle">
                          Punto donde comienza la ejecución de la receta.
                        </p>
                      </div>
                    </div>
                    {isEntry ? (
                      <Badge tone="accent" className="shrink-0">
                        Activo
                      </Badge>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={() => setEntryNode(node.id)}>
                        Hacer principal
                      </Button>
                    )}
                  </div>

                  <Field
                    label="Timeout"
                    htmlFor="node-timeout"
                    hint="Tiempo máximo que el runner esperará este paso antes de fallar."
                  >
                    <div className="relative">
                      <TextInput
                        id="node-timeout"
                        type="number"
                        min={0}
                        step={100}
                        value={node.timeout ?? 10000}
                        onChange={(e) => updateNode(node.id, { timeout: Number(e.target.value) })}
                        className="pr-10 font-mono"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-mono text-fg-subtle">
                        ms
                      </span>
                    </div>
                  </Field>
                </div>
              </SectionCard>

              <SectionCard
                title="Manejo de errores"
                description="Qué debe hacer el runner si este paso falla."
                icon={<AlertTriangle className="h-4 w-4" />}
                storageKey="rpa:node-detail:section:errors"
              >
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Acción en caso de error">
                    {[
                      { value: "fail", label: "Detener", hint: "Corta el flujo" },
                      { value: "continue", label: "Continuar", hint: "Ignora el error" },
                      { value: "retry", label: "Reintentar", hint: "Con política" },
                    ].map((option) => {
                      const selected = (node.onError || "fail") === option.value;
                      return (
                        <label
                          key={option.value}
                          className={cn(
                            "flex cursor-pointer flex-col gap-0.5 rounded-[10px] border p-3 transition-colors",
                            "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40",
                            selected
                              ? "border-accent-line bg-accent-soft text-fg"
                              : "border-line bg-card text-fg-muted hover:border-line-strong hover:bg-hover"
                          )}
                        >
                          <input
                            type="radio"
                            name={`on-error-${node.id}`}
                            value={option.value}
                            checked={selected}
                            onChange={() =>
                              updateNode(node.id, {
                                onError: option.value as RecipeNode["onError"],
                              })
                            }
                            className="sr-only"
                          />
                          <span className="text-[12px] font-medium">{option.label}</span>
                          <span className="text-[10.5px] text-fg-subtle">{option.hint}</span>
                        </label>
                      );
                    })}
                  </div>

                  {node.onError === "retry" && (
                    <div className="border-t border-line pt-3">
                      <RetryPolicyFields
                        node={node}
                        updateNode={(updates) => updateNode(node.id, updates)}
                      />
                    </div>
                  )}
                </div>
              </SectionCard>

              {nodeDef?.AdvancedOptionsForm && (
                <SectionCard
                  title="Opciones avanzadas"
                  description={`Ajustes específicos del nodo ${nodeDef.label}.`}
                  icon={<SlidersHorizontal className="h-4 w-4" />}
                  defaultOpen={false}
                  storageKey="rpa:node-detail:section:advanced"
                >
                  <nodeDef.AdvancedOptionsForm
                    node={node}
                    updateParam={handleParamChange}
                    updateNode={(updates) => updateNode(node.id, updates)}
                  />
                </SectionCard>
              )}

              {locator && (
                <SectionCard
                  title="Localizadores"
                  description="Selector principal y alternativas de respaldo."
                  icon={<ShieldCheck className="h-4 w-4" />}
                  storageKey="rpa:node-detail:section:locators"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] font-medium text-fg">Localizador principal</span>
                      <Badge tone={scoreTone}>
                        <ShieldCheck className="h-3 w-3" />
                        Score {score}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-[120px_1fr] gap-2">
                      <Select
                        aria-label="Estrategia del localizador principal"
                        value={locator.primary.strategy}
                        onChange={(e) =>
                          handlePrimaryLocatorChange(
                            e.target.value as LocatorStrategy,
                            locator.primary.value
                          )
                        }
                        className="font-mono text-[12px]"
                      >
                        {STRATEGY_OPTIONS.map((strategy) => (
                          <option key={strategy} value={strategy}>
                            {strategy}
                          </option>
                        ))}
                      </Select>
                      <TextInput
                        aria-label="Valor del localizador principal"
                        value={locator.primary.value}
                        onChange={(e) =>
                          handlePrimaryLocatorChange(locator.primary.strategy, e.target.value)
                        }
                        placeholder="Selector, rol, texto o testid…"
                        className="font-mono text-[12px]"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11.5px] font-medium text-fg-muted">
                          Fallbacks
                        </span>
                        <span className="text-[10.5px] text-fg-subtle">
                          {fallbacks.length} configurado{fallbacks.length === 1 ? "" : "s"}
                        </span>
                      </div>

                      {fallbacks.length > 0 && (
                        <ul className="space-y-1.5">
                          {fallbacks.map((fallback, index) => (
                            <li
                              key={`${fallback.strategy}-${index}`}
                              className="flex items-center justify-between gap-2 rounded-control border border-line bg-panel px-2.5 py-1.5"
                            >
                              <span className="min-w-0 truncate font-mono text-[11px] text-fg-muted">
                                <span className="text-fg-subtle">[{fallback.strategy}]</span>{" "}
                                {fallback.value}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleRemoveFallback(index)}
                                aria-label={`Eliminar fallback ${index + 1}`}
                                className="shrink-0 rounded p-1 text-fg-subtle transition-colors hover:bg-danger-soft hover:text-danger-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/30"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}

                      <div className="flex items-center gap-2 pt-1">
                        <Select
                          aria-label="Estrategia del nuevo fallback"
                          value={newStrategy}
                          onChange={(e) => setNewStrategy(e.target.value as LocatorStrategy)}
                          className="h-8 w-[104px] font-mono text-[11px]"
                        >
                          {STRATEGY_OPTIONS.map((strategy) => (
                            <option key={strategy} value={strategy}>
                              {strategy}
                            </option>
                          ))}
                        </Select>
                        <TextInput
                          aria-label="Valor del nuevo fallback"
                          value={newValue}
                          onChange={(e) => setNewValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleAddFallback();
                          }}
                          placeholder="Añadir selector de respaldo…"
                          className="h-8 flex-1 font-mono text-[11px]"
                        />
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={handleAddFallback}
                          disabled={!newValue.trim()}
                          className="shrink-0"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Añadir
                        </Button>
                      </div>
                    </div>
                  </div>
                </SectionCard>
              )}
            </div>
          )}

          {/* DOCUMENTACIÓN */}
          {activeTab === "docs" && (
            <div className="space-y-3 text-[12px] leading-relaxed">
              <SectionCard
                title={`Acerca de ${nodeDef?.label || node.type}`}
                icon={<BookOpen className="h-4 w-4" />}
              >
                <p className="text-[11.5px] leading-relaxed text-fg-muted">
                  {nodeDef?.description || "Sin documentación disponible."}
                </p>
              </SectionCard>

              <SectionCard
                title="Variables de salida"
                description="Datos accesibles desde los nodos posteriores."
                icon={<BracesIcon />}
              >
                <div className="space-y-2">
                  <p className="text-[11.5px] text-fg-muted">
                    Al ejecutarse, este nodo expone su resultado con:
                  </p>
                  <div className="flex items-center gap-2 rounded-control border border-line bg-panel px-2.5 py-2">
                    <code className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-accent-text">
                      {`{{steps.${node.id}.output}}`}
                    </code>
                    <button
                      type="button"
                      onClick={copyOutputToken}
                      aria-label="Copiar token de salida"
                      className="shrink-0 rounded p-1 text-fg-subtle transition-colors hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                    >
                      {copiedToken ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-success-text" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </SectionCard>

              <SectionCard
                title="Comportamiento en Playwright"
                icon={<ShieldCheck className="h-4 w-4" />}
              >
                <p className="text-[11.5px] leading-relaxed text-fg-muted">
                  Este paso se compila de forma determinista sin depender de modelos de IA durante
                  la ejecución en el motor runner.
                </p>
              </SectionCard>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="relative flex h-16 shrink-0 items-center justify-between gap-3 border-t border-line bg-raised px-5">
        {isExecuting && (
          <span className="rpa-progress absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-accent/10" />
        )}

        <div aria-live="polite" className="min-w-0">
          {execStatus === "success" && (
            <span className="rpa-pop inline-flex h-7 items-center gap-1.5 rounded-full border border-success/25 bg-success-soft px-2.5 text-[11px] font-medium text-success-text">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Éxito · {execDuration ?? 0} ms
            </span>
          )}
          {execStatus === "error" && (
            <span
              className="rpa-pop inline-flex h-7 max-w-[280px] items-center gap-1.5 rounded-full border border-danger/25 bg-danger-soft px-2.5 text-[11px] font-medium text-danger-text"
              title={execError || "Error en la ejecución"}
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{execError ? `Falló: ${execError}` : "Falló"}</span>
            </span>
          )}
          {execStatus === "running" && (
            <span className="rpa-pop inline-flex h-7 items-center gap-1.5 rounded-full border border-info/25 bg-info-soft px-2.5 text-[11px] font-medium text-info-text">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Ejecutando…
            </span>
          )}
          {(!execStatus || execStatus === "idle") && (
            <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-card px-2.5 text-[11px] text-fg-subtle">
              <span className="h-1.5 w-1.5 rounded-full bg-fg-subtle/50" />
              Sin ejecutar
            </span>
          )}
        </div>

        <Button
          variant="primary"
          onClick={onExecuteNode}
          disabled={isExecuting}
          aria-busy={isExecuting}
          title="Ejecutar nodo (Ctrl + Enter)"
          className="h-9 px-4"
        >
          {isExecuting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Ejecutando…</span>
            </>
          ) : (
            <>
              <Play className="h-4 w-4 fill-current" />
              <span>Ejecutar nodo</span>
              <kbd className="ml-1 hidden rounded bg-black/10 px-1.5 py-0.5 font-mono text-[10px] font-medium sm:inline">
                Ctrl ↵
              </kbd>
            </>
          )}
        </Button>
      </footer>
    </div>
  );
}

function BracesIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1" />
      <path d="M16 3h1a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2 2 2 0 0 0-2 2v5a2 2 0 0 1-2 2h-1" />
    </svg>
  );
}
