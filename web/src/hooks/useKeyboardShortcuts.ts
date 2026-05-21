import { useEffect } from "react";

// Page-scoped keyboard shortcuts. Mounts a single window-level keydown
// listener that's a no-op when:
//   - The user is typing in an input / textarea / contenteditable
//   - A modifier is held (Cmd/Ctrl/Alt) — those belong to global shortcuts
//     like Cmd+K
//   - The event has already been default-prevented (something else owns it)
//
// `shortcuts` is a {key: handler} map. Keys are matched against `event.key`
// directly so shifted variants need their own entry (e.g. "/" vs "?").

export type ShortcutMap = Record<string, () => void>;

interface UseKeyboardShortcutsOptions {
  /** Set to false to suspend bindings (e.g. while a sheet is open). */
  enabled?: boolean;
}

export function useKeyboardShortcuts(
  shortcuts: ShortcutMap,
  { enabled = true }: UseKeyboardShortcutsOptions = {},
) {
  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      // Modifier-held shortcuts go to other handlers (Cmd+K, browser, etc.)
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.defaultPrevented) return;

      // Skip when focus is in something that takes text input. We test
      // `isContentEditable` separately because contenteditable divs are
      // not <input>/<textarea>.
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName?.toLowerCase();
        if (tag === "input" || tag === "textarea" || tag === "select") return;
        if (target.isContentEditable) return;
      }

      const fn = shortcuts[e.key];
      if (fn) {
        e.preventDefault();
        fn();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shortcuts, enabled]);
}
