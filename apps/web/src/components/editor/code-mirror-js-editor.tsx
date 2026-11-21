"use client";

import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { Compartment, EditorState } from "@codemirror/state";
import {
  EditorView,
  highlightActiveLine,
  keymap,
  lineNumbers,
  placeholder as cmPlaceholder,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import {
  bracketMatching,
  defaultHighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { javascript, javascriptLanguage } from "@codemirror/lang-javascript";
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
  completionStatus,
} from "@codemirror/autocomplete";
import { oneDark } from "@codemirror/theme-one-dark";
import {
  createRpaJsCompletionSource,
  type JsAutocompleteContext,
} from "@/lib/js-autocomplete";
import { cn } from "@/lib/utils";

export interface CodeMirrorJsEditorHandle {
  insertText: (snippet: string) => void;
  focus: () => void;
}

interface CodeMirrorJsEditorProps {
  value: string;
  onChange: (nextValue: string) => void;
  autocompleteContext: JsAutocompleteContext;
  readOnly?: boolean;
  placeholder?: string;
  minHeight?: string;
  ariaLabel?: string;
  className?: string;
}

const lightThemeExtension = EditorView.theme(
  {
    "&": {
      backgroundColor: "#ffffff",
      color: "#18181b",
    },
    ".cm-gutters": {
      backgroundColor: "#f4f4f5",
      color: "#71717a",
      borderRight: "1px solid #e4e4e7",
    },
    ".cm-activeLine": {
      backgroundColor: "#f4f4f580",
    },
  },
  { dark: false }
);

function buildSizingTheme(minHeight: string) {
  return EditorView.theme({
    "&": {
      minHeight,
      fontSize: "12px",
      fontFamily: "var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace",
    },
    ".cm-scroller": {
      overflow: "auto",
      maxHeight: "460px",
    },
    ".cm-content": {
      minHeight,
      padding: "8px 0",
    },
    "&.cm-focused": {
      outline: "none",
    },
  });
}

function isLightThemeActive(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.getAttribute("data-theme") === "light";
}

export const CodeMirrorJsEditor = forwardRef<
  CodeMirrorJsEditorHandle,
  CodeMirrorJsEditorProps
>(function CodeMirrorJsEditor(
  {
    value,
    onChange,
    autocompleteContext,
    readOnly = false,
    placeholder = "// Escribe tu código JavaScript...",
    minHeight = "180px",
    ariaLabel = "Editor de código JavaScript",
    className,
  },
  ref
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const contextRef = useRef(autocompleteContext);
  const themeCompartmentRef = useRef(new Compartment());
  const readOnlyCompartmentRef = useRef(new Compartment());
  const sizingCompartmentRef = useRef(new Compartment());

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    contextRef.current = autocompleteContext;
  }, [autocompleteContext]);

  useImperativeHandle(ref, () => ({
    insertText(snippet: string) {
      const view = viewRef.current;
      if (!view || view.state.readOnly) return;
      const { from, to } = view.state.selection.main;
      view.dispatch({
        changes: { from, to, insert: snippet },
        selection: { anchor: from + snippet.length },
      });
      view.focus();
    },
    focus() {
      viewRef.current?.focus();
    },
  }));

  useEffect(() => {
    const parent = hostRef.current;
    if (!parent) return;

    const rpaCompletionExtension = javascriptLanguage.data.of({
      autocomplete: createRpaJsCompletionSource(() => contextRef.current),
    });

    const initialTheme = isLightThemeActive() ? lightThemeExtension : oneDark;

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        history(),
        bracketMatching(),
        closeBrackets(),
        indentOnInput(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        javascript(),
        rpaCompletionExtension,
        autocompletion({
          activateOnTyping: true,
          closeOnBlur: true,
          maxRenderedOptions: 30,
        }),
        cmPlaceholder(placeholder),
        EditorView.contentAttributes.of({ "aria-label": ariaLabel }),
        keymap.of([
          ...closeBracketsKeymap,
          ...completionKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          indentWithTab,
        ]),
        themeCompartmentRef.current.of(initialTheme),
        readOnlyCompartmentRef.current.of([
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
        ]),
        sizingCompartmentRef.current.of(buildSizingTheme(minHeight)),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
      ],
    });

    const view = new EditorView({ state, parent });
    viewRef.current = view;

    const observer =
      typeof MutationObserver !== "undefined"
        ? new MutationObserver(() => {
            view.dispatch({
              effects: themeCompartmentRef.current.reconfigure(
                isLightThemeActive() ? lightThemeExtension : oneDark
              ),
            });
          })
        : null;

    if (observer && typeof document !== "undefined") {
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"],
      });
    }

    return () => {
      observer?.disconnect();
      view.destroy();
      viewRef.current = null;
    };
    // Montaje único del EditorView; actualizaciones posteriores usan Compartment o dispatch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sincronizar cambios externos en `value` (por ejemplo al cambiar de nodo o restaurar plantilla)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (value !== currentDoc) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: value },
      });
    }
  }, [value]);

  // Reconfigurar readOnly dinámicamente
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: readOnlyCompartmentRef.current.reconfigure([
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
      ]),
    });
  }, [readOnly]);

  // Reconfigurar altura mínima si cambia el contexto (panel lateral vs modal amplio)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: sizingCompartmentRef.current.reconfigure(buildSizingTheme(minHeight)),
    });
  }, [minHeight]);

  return (
    <div
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          return;
        }
        const view = viewRef.current;
        if (e.key === "Escape" && view && completionStatus(view.state) === null) {
          return;
        }
        e.stopPropagation();
      }}
      className={cn(
        "overflow-hidden rounded-field border border-line bg-input focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20 transition-colors",
        readOnly && "opacity-75",
        className
      )}
    >
      <div ref={hostRef} data-testid="codemirror-js-host" />
    </div>
  );
});
