import { useEffect, useState } from "react";

// Single global instance of the command-palette open/close state, with the
// Cmd/Ctrl-K binding wired up. Returns { open, setOpen } so the consumer
// can also open it programmatically (e.g. a "/" key hint or a header
// button) without re-binding the keyboard listener.

export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // ⌘+K on Mac, Ctrl+K everywhere else. We deliberately ignore the
      // shift state so Shift+Cmd+K (some browsers' "clear history") still
      // works as normal — but plain Cmd+K opens the palette.
      const isCmdK = e.key === "k" && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey;
      if (isCmdK) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return { open, setOpen };
}
