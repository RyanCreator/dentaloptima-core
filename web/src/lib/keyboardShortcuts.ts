// Single source of truth for the app's keyboard shortcuts, shown on the
// Help & guides page. Keep this in sync with where each shortcut is
// actually registered:
//   - Cmd/Ctrl+K  → useCommandPalette.ts
//   - calendar keys → Calendar.tsx useKeyboardShortcuts({...})
//
// `keys` is an array so a shortcut can show alternative presses (e.g.
// ⌘K / Ctrl K). The UI renders each as a <kbd> chip.

export interface ShortcutGroup {
  area: string;
  shortcuts: { keys: string[]; label: string }[];
}

export const KEYBOARD_SHORTCUTS: ShortcutGroup[] = [
  {
    area: "Anywhere",
    shortcuts: [
      {
        keys: ["⌘ K", "Ctrl K"],
        label: "Open the command palette — jump to any page or search patients, enquiries, staff",
      },
      {
        keys: ["?"],
        label: "Show this keyboard-shortcuts list",
      },
    ],
  },
  {
    area: "Calendar",
    shortcuts: [
      { keys: ["←"], label: "Previous day (or week / month in the overview)" },
      { keys: ["→"], label: "Next day (or week / month in the overview)" },
      { keys: ["T"], label: "Jump to today" },
      { keys: ["B"], label: "New appointment" },
      { keys: ["["], label: "Previous staff member (in single-staff focus)" },
      { keys: ["]"], label: "Next staff member (in single-staff focus)" },
    ],
  },
];
