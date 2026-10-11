"use client";

import React, { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface FlowErrorBoundaryProps {
  children: ReactNode;
}

interface FlowErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class FlowErrorBoundary extends Component<
  FlowErrorBoundaryProps,
  FlowErrorBoundaryState
> {
  constructor(props: FlowErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: "",
    };
  }

  static getDerivedStateFromError(error: unknown): FlowErrorBoundaryState {
    const message =
      error instanceof Error ? error.message : "Error inesperado en el lienzo";
    return {
      hasError: true,
      errorMessage: message,
    };
  }

  componentDidCatch(error: unknown, errorInfo: unknown): void {
    console.error("Error capturado por FlowErrorBoundary:", error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, errorMessage: "" });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-neutral-950 text-neutral-300 p-6 select-none">
          <div className="max-w-md w-full bg-neutral-900 border border-neutral-800 rounded-xl p-5 shadow-2xl flex flex-col items-center text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-neutral-100">
                Error al renderizar el lienzo de automatización
              </h3>
              <p className="text-xs text-neutral-400 mt-1 font-mono break-all bg-neutral-950 p-2.5 rounded-lg border border-neutral-800/80">
                {this.state.errorMessage}
              </p>
            </div>
            <button
              onClick={this.handleReset}
              className="inline-flex items-center space-x-2 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors shadow-sm"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reintentar lienzo</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
