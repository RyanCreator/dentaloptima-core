import { Fragment, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Keyboard } from "lucide-react";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { KEYBOARD_SHORTCUTS } from "@/lib/keyboardShortcuts";

// Global "?" shortcut → opens this reference dialog from anywhere in the
// authed app. Mounted once in Layout, like the command palette. Reuses
// useKeyboardShortcuts so the input-focus guard (don't fire while typing
// in a field) and modifier handling are shared with the page-level
// shortcuts. The "?" key already encodes the Shift press, so matching
// event.key === "?" is layout-agnostic.

export function KeyboardShortcutsDialog() {
  const [open, setOpen] = useState(false);

  useKeyboardShortcuts(
    {
      "?": () => setOpen(true),
    },
    // Always enabled; the hook itself no-ops while focus is in an input.
    { enabled: true },
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-4 w-4" />
            Keyboard shortcuts
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {KEYBOARD_SHORTCUTS.map((group) => (
            <div key={group.area}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                {group.area}
              </h3>
              <ul className="space-y-2">
                {group.shortcuts.map((s, i) => (
                  <li key={i} className="flex items-start justify-between gap-3">
                    <span className="text-sm text-muted-foreground flex-1 min-w-0">
                      {s.label}
                    </span>
                    <span className="flex items-center gap-1 shrink-0">
                      {s.keys.map((k, ki) => (
                        <Fragment key={ki}>
                          {ki > 0 && (
                            <span className="text-[10px] text-muted-foreground">or</span>
                          )}
                          <kbd className="inline-flex items-center rounded border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-foreground shadow-sm">
                            {k}
                          </kbd>
                        </Fragment>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
