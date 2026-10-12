import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RPA Studio — Automatización de Navegación Web",
  description:
    "Diseño, grabación y ejecución determinista de flujos de navegación sobre Playwright con auto-reparación de selectores.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full dark antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#09090b] text-zinc-100 font-sans selection:bg-zinc-800 selection:text-white">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
