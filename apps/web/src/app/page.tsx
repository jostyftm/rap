"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Bot,
  Play,
  Layers,
  Wrench,
  ShieldCheck,
  Zap,
  Globe,
  Database,
  Terminal,
  LogOut,
  LogIn,
} from "lucide-react";
import { useAuth } from "../context/auth-context";

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<"overview" | "architecture">("overview");
  const { user, isAuthenticated, logout } = useAuth();

  return (
    <main className="min-h-screen flex flex-col bg-slate-950 text-slate-100 selection:bg-indigo-500 selection:text-white">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-tr from-indigo-500 to-cyan-400 flex items-center justify-center font-bold text-slate-950 shadow-lg shadow-indigo-500/20">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold tracking-tight text-white text-lg">
                RPA Studio
              </span>
              <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono">
                v0.1.0-alpha
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isAuthenticated && user ? (
              <div className="flex items-center gap-3">
                <Link
                  href="/recipes"
                  className="text-xs font-medium text-slate-200 hover:text-white px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 transition"
                >
                  Mis Recetas
                </Link>
                <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  <span className="text-slate-300 font-medium max-w-[120px] truncate">
                    {user.name}
                  </span>
                  <button
                    onClick={() => logout()}
                    title="Cerrar Sesión"
                    className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-rose-400 transition"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <Link
                href="/login"
                className="flex items-center gap-1.5 text-xs font-semibold text-white px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 shadow-md shadow-indigo-600/20 transition"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Iniciar Sesión</span>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative px-6 pt-16 pb-12 max-w-7xl mx-auto w-full">
        <div className="flex flex-col items-center text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-medium">
            <Zap className="w-3.5 h-3.5" />
            La IA crea y repara — La ejecución es determinista y sin costo de LLM
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white leading-tight">
            Automatización Web Inteligente con{" "}
            <span className="bg-gradient-to-r from-indigo-400 via-sky-300 to-emerald-400 bg-clip-text text-transparent">
              Playwright y LLMs
            </span>
          </h1>
          <p className="text-slate-400 text-base sm:text-lg leading-relaxed">
            Diseña recetas de RPA a partir de lenguaje natural, ejecútalas en un
            runner aislado y recupera fallos de selectores automáticamente con
            auto-reparación inteligente.
          </p>

          <div className="flex flex-wrap justify-center gap-3 pt-4">
            <a
              href="/recipes"
              className="px-5 py-2.5 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30 transition flex items-center gap-2"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Abrir Editor Low-Code</span>
            </a>
            <button
              onClick={() => setActiveTab("overview")}
              className={`px-4 py-2.5 rounded-lg text-sm font-semibold transition ${
                activeTab === "overview"
                  ? "bg-slate-700 text-white"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              Componentes del Sistema
            </button>
            <button
              onClick={() => setActiveTab("architecture")}
              className={`px-4 py-2.5 rounded-lg text-sm font-semibold transition ${
                activeTab === "architecture"
                  ? "bg-slate-700 text-white"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              Arquitectura & Flujos
            </button>
          </div>
        </div>
      </section>

      {/* Grid Features / Architecture */}
      <section className="max-w-7xl mx-auto px-6 pb-20 w-full flex-1">
        {activeTab === "overview" ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition flex flex-col justify-between">
              <div>
                <div className="h-10 w-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mb-4">
                  <Play className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-lg text-white mb-2">
                  1. Creación por Agente
                </h3>
                <p className="text-slate-400 text-sm leading-relaxed mb-4">
                  El <code>BrowserAgent</code> observa la página real en Playwright,
                  decide la siguiente acción y graba el árbol de accesibilidad
                  con identificadores estables y respaldos semánticos.
                </p>
              </div>
              <div className="text-xs text-indigo-400 font-mono">
                laravel/ai → Gemini 2.5 Flash
              </div>
            </div>

            <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition flex flex-col justify-between">
              <div>
                <div className="h-10 w-10 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center mb-4">
                  <Layers className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-lg text-white mb-2">
                  2. Receta Determinista (DSL)
                </h3>
                <p className="text-slate-400 text-sm leading-relaxed mb-4">
                  El <code>CompilerAgent</code> compacta las acciones en un grafo
                  dirigido versionado (DSL) validado por JSON Schema. La ejecución
                  normal corre a 0 cost de LLM con auto-wait nativo.
                </p>
              </div>
              <div className="text-xs text-sky-400 font-mono">
                packages/dsl → JSON Schema + Zod
              </div>
            </div>

            <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition flex flex-col justify-between">
              <div>
                <div className="h-10 w-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mb-4">
                  <Wrench className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-lg text-white mb-2">
                  3. Auto-Reparación Inteligente
                </h3>
                <p className="text-slate-400 text-sm leading-relaxed mb-4">
                  Si un selector falla en producción, se activan los localizadores
                  de respaldo, la huella semántica y finalmente el{" "}
                  <code>HealerAgent</code> propone un parche para aprobación humana.
                </p>
              </div>
              <div className="text-xs text-emerald-400 font-mono">
                HealerAgent + Human-in-the-loop
              </div>
            </div>

            <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition flex flex-col justify-between">
              <div>
                <div className="h-10 w-10 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center mb-4">
                  <Globe className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-lg text-white mb-2">
                  Runner Aislado Node + Playwright
                </h3>
                <p className="text-slate-400 text-sm leading-relaxed mb-4">
                  Laravel orquesta al runner a través de Redis Streams. Cada flujo
                  se ejecuta en un contexto de navegador efímero sin privilegios y
                  con protección SSRF estricta.
                </p>
              </div>
              <div className="text-xs text-purple-400 font-mono">
                apps/runner → Playwright TS
              </div>
            </div>

            <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition flex flex-col justify-between">
              <div>
                <div className="h-10 w-10 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mb-4">
                  <Database className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-lg text-white mb-2">
                  Vault Cifrado & Seguridad
                </h3>
                <p className="text-slate-400 text-sm leading-relaxed mb-4">
                  Los secretos nunca viajan al LLM. El agente solo conoce
                  placeholders <code>{`{{secret.password}}`}</code> que el runner
                  resuelve en memoria y enmascara en logs y capturas.
                </p>
              </div>
              <div className="text-xs text-amber-400 font-mono">
                XChaCha20 + MinIO Artifacts
              </div>
            </div>

            <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition flex flex-col justify-between">
              <div>
                <div className="h-10 w-10 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mb-4">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-lg text-white mb-2">
                  Multi-Workspace & Auditoría
                </h3>
                <p className="text-slate-400 text-sm leading-relaxed mb-4">
                  Espacios de trabajo aislados con roles (Owner, Admin, Editor,
                  Viewer), límites duros de costo mensual, cuotas de tokens y
                  registro estructurado de auditoría.
                </p>
              </div>
              <div className="text-xs text-rose-400 font-mono">
                PostgreSQL + Sanctum SPA
              </div>
            </div>
          </div>
        ) : (
          <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800 font-mono text-sm space-y-4">
            <div className="flex items-center gap-2 text-indigo-400 font-semibold">
              <Terminal className="w-4 h-4" /> Topología de Comunicación & Microservicios
            </div>
            <pre className="p-4 rounded-lg bg-slate-950 text-slate-300 overflow-x-auto text-xs leading-relaxed">
{`[Next.js App Router] ──HTTP/WS──> [Laravel 13 API + Reverb]
                                      │  ├─ Agentes IA (laravel/ai → Gemini 2.5)
                                      │  ├─ PostgreSQL (Multi-tenant, UUID, SoftDeletes)
                                      │  └─ Redis (Horizon Queues, Streams, RateLimit)
                                      │
                               Redis Streams (rpa:cmd / rpa:evt)
                                      │
                             [Node Runner + Playwright]
                                      │
                                  MinIO/S3 (Screenshots, Videos, Traces)`}
            </pre>
            <div className="text-xs text-slate-400 space-y-1">
              <p>• <strong>Frontend:</strong> Next.js (App Router), Tailwind CSS, TanStack Query, React Flow, Zustand.</p>
              <p>• <strong>API & Orquestador:</strong> Laravel 13, Laravel Boost, laravel/ai, Laravel Reverb (WebSockets), Horizon.</p>
              <p>• <strong>Runner de Automatización:</strong> Node.js con Playwright sobre navegadores aislados en contenedores.</p>
              <p>• <strong>Almacenamiento:</strong> PostgreSQL 16 (datos relacionales), Redis 7 (mensajería y estado), MinIO (S3).</p>
            </div>
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-900 py-6 px-6 text-center text-xs text-slate-500">
        RPA Studio © 2026 — Plataforma Generadora de RPA para Automatización de Navegación Web
      </footer>
    </main>
  );
}
