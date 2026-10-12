import React from "react";
import { LoginCard } from "./components/login-card";

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-[#09090b] text-zinc-100 selection:bg-zinc-800 selection:text-white">
      <LoginCard />
    </main>
  );
}
