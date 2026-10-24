"use client";

import React, { useMemo } from "react";
import { Highlight, type PrismTheme } from "prism-react-renderer";
import { cn } from "@/lib/utils";

const jsonTheme: PrismTheme = {
  plain: {
    color: "var(--fg)",
    backgroundColor: "transparent",
  },
  styles: [
    { types: ["property"], style: { color: "var(--json-key)" } },
    { types: ["string", "char", "inserted"], style: { color: "var(--json-string)" } },
    { types: ["number"], style: { color: "var(--json-number)" } },
    { types: ["boolean"], style: { color: "var(--json-boolean)" } },
    { types: ["null"], style: { color: "var(--json-null)" } },
    { types: ["punctuation", "operator"], style: { color: "var(--json-punct)" } },
    { types: ["comment"], style: { color: "var(--fg-subtle)", fontStyle: "italic" } },
  ],
};

interface JsonViewProps {
  data: unknown;
  className?: string;
  lineNumbers?: boolean;
  wrap?: boolean;
  ariaLabel?: string;
}

export function JsonView({
  data,
  className,
  lineNumbers = true,
  wrap = false,
  ariaLabel = "Visor JSON",
}: JsonViewProps) {
  const code = useMemo(() => {
    try {
      if (typeof data === "string") return data;
      return JSON.stringify(data, null, 2) ?? "";
    } catch {
      return String(data);
    }
  }, [data]);

  return (
    <div
      role="region"
      aria-label={ariaLabel}
      className={cn("h-full overflow-auto bg-panel", className)}
    >
      <Highlight theme={jsonTheme} code={code} language="json">
        {({ tokens, getLineProps, getTokenProps }) => (
          <pre
            className={cn(
              "min-h-full p-3 font-mono text-[12px] leading-[1.65]",
              wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"
            )}
          >
            {tokens.map((line, lineIndex) => (
              <div key={lineIndex} {...getLineProps({ line })} className="table-row">
                {lineNumbers && (
                  <span
                    aria-hidden="true"
                    className="table-cell select-none pr-4 text-right align-top text-fg-subtle/50"
                  >
                    {lineIndex + 1}
                  </span>
                )}
                <span className="table-cell align-top">
                  {line.map((token, tokenIndex) => (
                    <span key={tokenIndex} {...getTokenProps({ token })} />
                  ))}
                </span>
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  );
}
