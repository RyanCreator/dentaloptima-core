import {
  Building2,
  Clock,
  CalendarClock,
  MessageSquare,
  Wrench,
  KeyRound,
  Scale,
} from "lucide-react";

// Shared source of truth for the Settings nav. Imported by:
//   - SettingsPage (renders the mobile card list + desktop welcome state)
//   - SettingsShell (renders the left rail on the detail pages)
//
// Grouped so the rail can render "Practice" / "Personal" headers without
// each consumer reinventing the categorisation.

export interface SettingsItem {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

export interface SettingsGroup {
  label: string;
  items: SettingsItem[];
}

export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    label: "Practice",
    items: [
      {
        id: "clinic",
        title: "Clinic Settings",
        description: "Practice name, contact details, address, outbound mail",
        icon: Building2,
      },
      {
        id: "hours",
        title: "Hours & Closures",
        description: "Weekly opening hours and bank-holiday / training-day closures",
        icon: CalendarClock,
      },
      {
        id: "appointments",
        title: "Appointment Settings",
        description: "Default duration, booking window, reminders, notifications",
        icon: Clock,
      },
      {
        id: "templates",
        title: "Message Templates",
        description: "Confirmation, reminder, and recall email templates",
        icon: MessageSquare,
      },
      {
        id: "services",
        title: "Services Management",
        description: "Manage the services offered by the practice",
        icon: Wrench,
      },
      {
        id: "complaints",
        title: "Complaints Procedure",
        description: "Patient-facing complaints procedure (shown on your public site)",
        icon: Scale,
      },
    ],
  },
  {
    label: "Personal",
    items: [
      {
        id: "account",
        title: "My Account",
        description: "Change your password and per-account preferences",
        icon: KeyRound,
      },
    ],
  },
];

// Flat list — useful where the grouping doesn't matter (e.g. resolving a
// title by id, or mobile card-list rendering).
export const SETTINGS_ITEMS: SettingsItem[] = SETTINGS_GROUPS.flatMap(
  (g) => g.items,
);

/** Find the title for an id, or undefined. */
export function settingsTitleFor(id: string | undefined): string | undefined {
  if (!id) return undefined;
  return SETTINGS_ITEMS.find((i) => i.id === id)?.title;
}
