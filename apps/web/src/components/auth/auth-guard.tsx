"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/auth-context";
import { Loader2 } from "lucide-react";
import { StudioLogo } from "../studio-logo";

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex flex-col items-center justify-center space-y-4">
        <div className="h-8 w-8 rounded-md bg-zinc-800 border border-zinc-700/60 flex items-center justify-center text-zinc-100">
          <StudioLogo className="w-4 h-4" />
        </div>
        <div className="flex items-center space-x-2 text-xs font-mono text-zinc-400">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />
          <span>Verificando credenciales...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
