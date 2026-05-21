import { useCallback, useState } from "react";

// Tiny generic "set of selected ids" hook used by bulk-action lists. Kept
// deliberately simple — no select-by-shift-click range yet — so list pages
// can adopt it in a few lines.

export interface SelectionAPI {
  /** Currently-selected ids. */
  selected: Set<string>;
  /** Count helper — list pages display "X selected" on the action bar. */
  count: number;
  /** True if `id` is currently in the selection. */
  isSelected: (id: string) => boolean;
  /** Flip a single id's membership. */
  toggle: (id: string) => void;
  /** Set the membership of `ids` in one shot. Used by "select all visible"
   *  on filtered lists. */
  setAll: (ids: string[]) => void;
  /** Remove everything from the selection. */
  clear: () => void;
}

export function useSelection(initial: string[] = []): SelectionAPI {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initial));

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const setAll = useCallback((ids: string[]) => {
    setSelected(new Set(ids));
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  return {
    selected,
    count: selected.size,
    isSelected: (id) => selected.has(id),
    toggle,
    setAll,
    clear,
  };
}
