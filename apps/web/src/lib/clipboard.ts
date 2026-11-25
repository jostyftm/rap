/**
 * Copia texto al portapapeles de forma segura tanto en contextos HTTPS/localhost
 * (Clipboard API) como en contextos HTTP por IP (fallback con textarea + execCommand).
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Continuar al fallback si el navegador bloquea la Clipboard API
  }

  if (typeof document === "undefined" || !document.body) {
    return false;
  }

  const activeEl = document.activeElement as HTMLElement | null;
  const container =
    (activeEl?.closest?.('[role="dialog"]') as HTMLElement | null) ||
    document.body;

  const selection = document.getSelection();
  const savedRange =
    selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.setAttribute("aria-hidden", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";

  let copied = false;
  try {
    container.appendChild(textarea);
    textarea.focus({ preventScroll: true });
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    copied =
      typeof document.execCommand === "function" &&
      document.execCommand("copy");
  } catch {
    copied = false;
  } finally {
    textarea.remove();
    if (selection) {
      selection.removeAllRanges();
      if (savedRange) {
        selection.addRange(savedRange);
      }
    }
    if (activeEl && typeof activeEl.focus === "function") {
      try {
        activeEl.focus({ preventScroll: true });
      } catch {
        // Ignorar si el elemento ya no es enfocable
      }
    }
  }

  return copied;
}
