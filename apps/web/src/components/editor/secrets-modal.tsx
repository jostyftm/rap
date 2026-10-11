"use client";

import React, { useState, useEffect } from "react";
import { X, Lock, Plus, Trash2, Key, ShieldCheck, Loader2 } from "lucide-react";
import { apiFetch } from "../../lib/api-client";

interface SecretsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SecretItem {
  id: string;
  key: string;
  masked_value: string;
  description?: string;
  created_at: string;
}

export function SecretsModal({ isOpen, onClose }: SecretsModalProps) {
  const [secrets, setSecrets] = useState<SecretItem[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Formulario nuevo secreto
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    setIsLoading(true);
    // Obtener el primer workspace del usuario
    apiFetch<{ data: Array<{ id: string; name: string }> }>("/api/v1/workspaces")
      .then((res) => {
        const ws = res.data?.[0];
        if (ws) {
          setWorkspaceId(ws.id);
          return apiFetch<{ data: SecretItem[] }>(`/api/v1/workspaces/${ws.id}/secrets`);
        }
        return null;
      })
      .then((res) => {
        if (res?.data) {
          setSecrets(res.data);
        }
      })
      .catch((err) => {
        console.warn("Error cargando secretos:", err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspaceId || !newKey.trim() || !newValue.trim()) return;

    const formattedKey = newKey.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    setIsSaving(true);
    try {
      const res = await apiFetch<{ data: SecretItem }>(
        `/api/v1/workspaces/${workspaceId}/secrets`,
        {
          method: "POST",
          body: JSON.stringify({
            key: formattedKey,
            value: newValue,
            description: newDesc.trim() || null,
          }),
        }
      );
      if (res.data) {
        setSecrets((prev) => {
          const filtered = prev.filter((s) => s.key !== formattedKey);
          return [...filtered, res.data];
        });
        setNewKey("");
        setNewValue("");
        setNewDesc("");
      }
    } catch (err: any) {
      alert(`Error al guardar secreto: ${err.message || err}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (secretId: string) => {
    if (!workspaceId || !confirm("¿Deseas eliminar este secreto?")) return;
    try {
      await apiFetch(`/api/v1/workspaces/${workspaceId}/secrets/${secretId}`, {
        method: "DELETE",
      });
      setSecrets((prev) => prev.filter((s) => s.id !== secretId));
    } catch (err: any) {
      alert(`Error al eliminar secreto: ${err.message || err}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-neutral-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/60">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-neutral-100">
                Secretos y Credenciales Cifradas
              </h2>
              <p className="text-xs text-neutral-400">
                Almacenamiento protegido con AES-256. Úsalos en tus recetas con{" "}
                <code className="text-emerald-400 font-mono">{"{{secrets.CLAVE}}"}</code>.
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Formulario nuevo secreto */}
          <form
            onSubmit={handleCreate}
            className="p-4 rounded-lg bg-neutral-950 border border-neutral-800 space-y-3"
          >
            <div className="text-xs font-semibold text-neutral-200 flex items-center space-x-1.5">
              <Plus className="w-3.5 h-3.5 text-emerald-400" />
              <span>Guardar nuevo secreto</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-neutral-400 mb-1">
                  Clave (Ej. ERP_PASSWORD)
                </label>
                <input
                  type="text"
                  placeholder="PORTAL_PASSWORD"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-1.5 text-xs font-mono uppercase text-neutral-100 placeholder:text-neutral-600 focus:border-emerald-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] text-neutral-400 mb-1">
                  Valor confidencial
                </label>
                <input
                  type="password"
                  placeholder="••••••••••••"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-1.5 text-xs font-mono text-neutral-100 focus:border-emerald-500 outline-none"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-neutral-400 mb-1">
                Descripción (opcional)
              </label>
              <input
                type="text"
                placeholder="Contraseña del usuario administrador para el portal"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-1.5 text-xs text-neutral-100 placeholder:text-neutral-600 focus:border-emerald-500 outline-none"
              />
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
              >
                {isSaving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
                <span>Guardar Secreto</span>
              </button>
            </div>
          </form>

          {/* Lista de secretos */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-neutral-400 flex items-center justify-between">
              <span>Secretos del Workspace ({secrets.length})</span>
              <span className="text-[10px] text-neutral-500 flex items-center space-x-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Cifrado activo</span>
              </span>
            </div>

            {isLoading ? (
              <div className="py-6 flex items-center justify-center text-neutral-500 text-xs">
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Cargando...
              </div>
            ) : secrets.length === 0 ? (
              <div className="p-6 text-center rounded-lg border border-neutral-800/60 bg-neutral-950/40 text-neutral-500 text-xs">
                No hay secretos almacenados. Las contraseñas guardadas aquí no se expondrán en logs ni en capturas.
              </div>
            ) : (
              secrets.map((s) => (
                <div
                  key={s.id}
                  className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 flex items-center justify-between"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center space-x-2">
                      <Key className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="font-mono text-xs font-semibold text-neutral-200">
                        {s.key}
                      </span>
                      <span className="font-mono text-[11px] text-neutral-500">
                        {s.masked_value}
                      </span>
                    </div>
                    {s.description && (
                      <p className="text-[11px] text-neutral-400">{s.description}</p>
                    )}
                  </div>

                  <button
                    onClick={() => handleDelete(s.id)}
                    className="p-1.5 rounded text-neutral-500 hover:text-rose-400 hover:bg-neutral-800 transition-colors"
                    title="Eliminar secreto"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
