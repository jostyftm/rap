"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Play,
  ArrowRight,
  Shield,
  Layers,
  Cpu,
  Terminal,
  LogOut,
  LogIn,
  CheckCircle2,
  ExternalLink,
  GitBranch,
} from "lucide-react";
import { useAuth } from "../context/auth-context";
import { StudioLogo } from "../components/studio-logo";
import { ThemeToggle } from "../components/theme-toggle";

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<"dsl" | "playwright" | "runner">("dsl");
  const { user, isAuthenticated, logout } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-[#09090b] text-zinc-100 selection:bg-zinc-800 selection:text-white">
      {/* Top Navigation */}
      <header className="border-b border-zinc-800/80 bg-[#09090b]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-7 w-7 rounded-md bg-zinc-100 text-zinc-950 flex items-center justify-center">
              <StudioLogo className="w-4 h-4" />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium tracking-tight text-zinc-100 text-sm">
                RPA Studio
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-900 text-zinc-400 border border-zinc-800 font-mono">
                v0.1
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle variant="button" />

            {isAuthenticated && user ? (
              <div className="flex items-center gap-3">
                <Link
                  href="/recipes"
                  className="text-xs font-medium text-zinc-300 hover:text-white px-3 py-1.5 rounded-md hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition-colors"
                >
                  Recetas
                </Link>
                <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-xs">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <span className="text-zinc-300 font-mono text-[11px] max-w-[140px] truncate">
                    {user.name}
                  </span>
                  <button
                    onClick={() => logout()}
                    title="Cerrar Sesión"
                    className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
                  >
                    <LogOut className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ) : (
              <Link
                href="/login"
                className="flex items-center gap-1.5 text-xs font-medium text-zinc-950 px-3 py-1.5 rounded-md bg-zinc-100 hover:bg-white transition-colors"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Acceder</span>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="px-6 pt-20 pb-16 max-w-4xl mx-auto w-full text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 text-xs font-mono mb-6">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          <span>Playwright 1.48 · Heuristic Engine · Isolated Runner</span>
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-medium tracking-tight text-zinc-100 leading-[1.12] mb-6">
          Automatización web con <br className="hidden sm:inline" />
          precisión determinista.
        </h1>

        <p className="text-zinc-400 text-base sm:text-lg leading-relaxed max-w-2xl mx-auto mb-8 font-normal">
          Diseña flujos sobre Playwright, auto-repara selectores ante cambios en el
          DOM y orquesta ejecuciones aisladas con cero coste de LLM en tiempo de ejecución.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/recipes"
            className="px-5 py-2.5 rounded-lg text-sm font-medium bg-zinc-100 hover:bg-white text-zinc-950 transition-colors flex items-center gap-2 shadow-sm"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Abrir Estudio</span>
          </Link>
          <a
            href="#architecture"
            className="px-4 py-2.5 rounded-lg text-sm font-medium bg-zinc-900 hover:bg-zinc-850 text-zinc-300 hover:text-white border border-zinc-800 transition-colors flex items-center gap-1.5"
          >
            <span>Ver Especificación</span>
            <ArrowRight className="w-3.5 h-3.5 text-zinc-500" />
          </a>
        </div>
      </section>

      {/* Interactive Architecture Preview / Spec Console */}
      <section className="max-w-5xl mx-auto px-6 pb-20 w-full" id="architecture">
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl overflow-hidden">
          {/* Editor Header Bar */}
          <div className="flex items-center justify-between border-b border-zinc-800/80 px-4 h-11 bg-zinc-900/60">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setActiveTab("dsl")}
                className={`px-3 py-1.5 rounded-md text-xs font-mono transition-colors ${
                  activeTab === "dsl"
                    ? "bg-zinc-800 text-zinc-100 font-medium"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                recipe.dsl.json
              </button>
              <button
                onClick={() => setActiveTab("playwright")}
                className={`px-3 py-1.5 rounded-md text-xs font-mono transition-colors ${
                  activeTab === "playwright"
                    ? "bg-zinc-800 text-zinc-100 font-medium"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                playwright-runner.ts
              </button>
              <button
                onClick={() => setActiveTab("runner")}
                className={`px-3 py-1.5 rounded-md text-xs font-mono transition-colors ${
                  activeTab === "runner"
                    ? "bg-zinc-800 text-zinc-100 font-medium"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                topology.spec
              </button>
            </div>

            <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-500">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>valid</span>
            </div>
          </div>

          {/* Code Body */}
          <div className="p-5 font-mono text-xs leading-relaxed overflow-x-auto text-zinc-300 bg-[#0c0c0e]">
            {activeTab === "dsl" && (
              <pre>{`{
  "$schema": "https://rpa.studio/schemas/recipe-v1.json",
  "name": "Extracción Facturas Proveedores",
  "version": 1,
  "entry": "nav_portal",
  "nodes": {
    "nav_portal": {
      "type": "navigate",
      "params": { "url": "https://proveedores.interno/login", "waitUntil": "domcontentloaded" },
      "next": "fill_user"
    },
    "fill_user": {
      "type": "type",
      "locator": {
        "primary": { "strategy": "testid", "value": "input-username", "score": 100 },
        "fallbacks": [{ "strategy": "css", "value": "#user-field", "score": 75 }]
      },
      "params": { "text": "{{secret.portal_user}}" },
      "next": "click_submit"
    }
  }
}`}</pre>
            )}

            {activeTab === "playwright" && (
              <pre>{`import { test, expect } from '@playwright/test';
import { executeRecipe, resolveVaultSecrets } from '@rpa/runner';

export async function runAutomation(page: Page, context: BrowserContext) {
  // Inicialización en contexto aislado sin privilegios
  const secrets = await resolveVaultSecrets(['portal_user', 'portal_password']);

  // Paso 1: Navegación con auto-wait determinista
  await page.goto('https://proveedores.interno/login', { waitUntil: 'domcontentloaded' });

  // Paso 2: Resolución heurística con respaldo multi-selector
  const userLocator = await locateWithFallbacks(page, [
    { strategy: 'testid', value: 'input-username' },
    { strategy: 'css', value: '#user-field' }
  ]);
  await userLocator.fill(secrets.portal_user);
}`}</pre>
            )}

            {activeTab === "runner" && (
              <pre>{`[Frontend Web Studio] ──HTTP/WS──> [Laravel API + Reverb]
                                      │
                               Redis Streams (rpa:cmd / rpa:evt)
                                      │
                             [Node Runner + Playwright]
                                      │
                                      ├─ Localizadores heurísticos (@rpa/locator)
                                      ├─ Ejecución determinista 0 LLM (@rpa/dsl)
                                      └─ Vault seguro (XChaCha20 en memoria)`}</pre>
            )}
          </div>
        </div>
      </section>

      {/* Technical Specifications Grid */}
      <section className="max-w-5xl mx-auto px-6 pb-24 w-full">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-6 rounded-xl bg-zinc-900/30 border border-zinc-800/80 hover:border-zinc-700/80 transition-colors flex flex-col justify-between">
            <div>
              <div className="h-8 w-8 rounded-md bg-zinc-800/80 text-zinc-200 flex items-center justify-center mb-4 border border-zinc-700/60">
                <Layers className="w-4 h-4" />
              </div>
              <h3 className="font-medium text-sm text-zinc-100 mb-2">
                Grafo Determinista (DSL)
              </h3>
              <p className="text-zinc-400 text-xs leading-relaxed mb-4">
                Flujos representados en un grafo dirigido versionado y validado
                por Zod. La ejecución normal no consume LLMs y se ejecuta con
                tiempos de respuesta nativos en Playwright.
              </p>
            </div>
            <div className="text-[11px] font-mono text-zinc-500">
              @rpa/dsl · Schema Parity
            </div>
          </div>

          <div className="p-6 rounded-xl bg-zinc-900/30 border border-zinc-800/80 hover:border-zinc-700/80 transition-colors flex flex-col justify-between">
            <div>
              <div className="h-8 w-8 rounded-md bg-zinc-800/80 text-zinc-200 flex items-center justify-center mb-4 border border-zinc-700/60">
                <Cpu className="w-4 h-4" />
              </div>
              <h3 className="font-medium text-sm text-zinc-100 mb-2">
                Puntuación de Selectores
              </h3>
              <p className="text-zinc-400 text-xs leading-relaxed mb-4">
                Motor heurístico que califica cada estrategia de selección (testid,
                role, css, text). Mantiene localizadores de respaldo y registra
                métricas de estabilidad en producción.
              </p>
            </div>
            <div className="text-[11px] font-mono text-zinc-500">
              @rpa/locator · Heuristic Score
            </div>
          </div>

          <div className="p-6 rounded-xl bg-zinc-900/30 border border-zinc-800/80 hover:border-zinc-700/80 transition-colors flex flex-col justify-between">
            <div>
              <div className="h-8 w-8 rounded-md bg-zinc-800/80 text-zinc-200 flex items-center justify-center mb-4 border border-zinc-700/60">
                <Shield className="w-4 h-4" />
              </div>
              <h3 className="font-medium text-sm text-zinc-100 mb-2">
                Aislamiento y Vault
              </h3>
              <p className="text-zinc-400 text-xs leading-relaxed mb-4">
                Las credenciales se almacenan cifradas en reposo y se resuelven
                exclusivamente en la memoria del runner, enmascarándose en logs
                y capturas forenses de error.
              </p>
            </div>
            <div className="text-[11px] font-mono text-zinc-500">
              apps/runner · XChaCha20
            </div>
          </div>
        </div>
      </section>

      {/* Minimalist Footer */}
      <footer className="border-t border-zinc-900 py-8 px-6 text-xs text-zinc-500 font-mono mt-auto">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <StudioLogo className="w-3.5 h-3.5 text-zinc-400" />
            <span className="text-zinc-400 font-sans font-medium">RPA Studio</span>
            <span>— Automatización determinista de navegación web</span>
          </div>
          <div>
            <span>Playwright TypeScript Workspace</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
