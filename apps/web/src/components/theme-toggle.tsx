"use client";

import React, { useState, useRef, useEffect } from "react";
import { Sun, Moon, Laptop, ChevronDown } from "lucide-react";
import { useTheme, type Theme } from "@/context/theme-context";

export function ThemeToggle({
  variant = "button",
  className = "",
}: {
  variant?: "button" | "dropdown";
  className?: string;
}) {
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      window.addEventListener("mousedown", handleClickOutside);
    }
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  if (variant === "button") {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        title={resolvedTheme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
        className={`p-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 transition-colors cursor-pointer ${className}`}
        aria-label="Alternar tema claro/oscuro"
      >
        {resolvedTheme === "dark" ? (
          <Sun className="w-4 h-4 text-amber-400" />
        ) : (
          <Moon className="w-4 h-4 text-blue-400" />
        )}
      </button>
    );
  }

  const options: { label: string; value: Theme; icon: typeof Sun }[] = [
    { label: "Claro", value: "light", icon: Sun },
    { label: "Oscuro", value: "dark", icon: Moon },
    { label: "Sistema", value: "system", icon: Laptop },
  ];

  return (
    <div ref={dropdownRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-1.5 p-1.5 px-2 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors text-xs font-medium cursor-pointer"
        aria-label="Seleccionar tema"
      >
        {resolvedTheme === "dark" ? (
          <Moon className="w-3.5 h-3.5 text-zinc-300" />
        ) : (
          <Sun className="w-3.5 h-3.5 text-amber-500" />
        )}
        <span className="capitalize">{theme === "system" ? "Auto" : theme === "dark" ? "Oscuro" : "Claro"}</span>
        <ChevronDown className="w-3 h-3 text-zinc-500" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1.5 w-32 bg-zinc-900 border border-zinc-800 rounded-lg p-1 shadow-2xl z-50 text-xs animate-in fade-in zoom-in-95">
          {options.map((opt) => {
            const Icon = opt.icon;
            const isSelected = theme === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setTheme(opt.value);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-md text-left transition-colors cursor-pointer ${
                  isSelected
                    ? "bg-zinc-800 text-white font-medium"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isSelected ? "text-amber-400" : "text-zinc-400"}`} />
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
