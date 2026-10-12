"use client";

import React from "react";
import { Mail, Lock, ArrowRight, Loader2, AlertCircle, KeyRound } from "lucide-react";
import { useLoginForm } from "../hooks/use-login-form";
import { StudioLogo } from "../../../components/studio-logo";

export function LoginCard() {
  const {
    email,
    setEmail,
    password,
    setPassword,
    isSubmitting,
    error,
    handleSubmit,
    handleQuickDemoLogin,
  } = useLoginForm();

  return (
    <div className="w-full max-w-sm p-7 rounded-xl bg-zinc-900/40 border border-zinc-800 shadow-xl backdrop-blur-md">
      <div className="flex flex-col items-center text-center mb-6">
        <div className="w-8 h-8 rounded-md bg-zinc-800 border border-zinc-700/60 flex items-center justify-center text-zinc-100 mb-3">
          <StudioLogo className="w-4 h-4" />
        </div>
        <h1 className="text-lg font-medium tracking-tight text-zinc-100">
          RPA Studio
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          Inicia sesión para acceder al entorno de desarrollo
        </p>
      </div>

      {error && (
        <div className="mb-5 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        className="space-y-3.5"
      >
        <div>
          <label className="block text-xs font-medium text-zinc-300 mb-1">
            Correo electrónico
          </label>
          <div className="relative">
            <Mail className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-2.5" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@rpa.studio"
              required
              className="w-full bg-zinc-950/70 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500 transition-colors"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-300 mb-1">
            Contraseña
          </label>
          <div className="relative">
            <Lock className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-2.5" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full bg-zinc-950/70 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500 transition-colors"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full mt-2 py-2 px-4 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 font-medium text-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Iniciando sesión...</span>
            </>
          ) : (
            <>
              <span>Entrar</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      </form>

      {/* Demo Credentials Box */}
      <div className="mt-6 pt-5 border-t border-zinc-800/80">
        <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-2">
          <span>Acceso rápido local</span>
          <span className="font-mono text-[10px] text-zinc-500">dev</span>
        </div>
        <button
          type="button"
          onClick={handleQuickDemoLogin}
          className="w-full py-1.5 px-2.5 rounded-md bg-zinc-900 hover:bg-zinc-850 text-zinc-300 hover:text-white border border-zinc-800 text-[11px] font-mono flex items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          <KeyRound className="w-3 h-3 text-zinc-400" />
          <span>admin@rpa.studio / secret123</span>
        </button>
      </div>
    </div>
  );
}
