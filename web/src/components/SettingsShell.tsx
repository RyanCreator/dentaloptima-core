import { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { SETTINGS_GROUPS } from "@/lib/settingsItems";

// Left-rail layout for the Settings detail pages. Two-pane on md+, the
// rail hides on smaller viewports (the mobile flow stays drill-down via
// the SettingsPage card list, exactly as it works on GitHub / Stripe /
// Linear — see the pattern discussion in the conversation).
//
// Consumers (each SettingDetail branch) pass:
//   - activeId: which rail item to highlight
//   - children: the section content (the form / editor / etc.)
//
// The rail itself is sourced from SETTINGS_GROUPS so categories stay in
// one place. The "active" link gets a tinted background + a subtle left
// border — same style language as the main app sidebar's active state,
// for visual cohesion inside the Settings hub.

interface SettingsShellProps {
  activeId: string;
  children: ReactNode;
}

export function SettingsShell({ activeId, children }: SettingsShellProps) {
  return (
    <div className="grid gap-6 md:grid-cols-[220px,1fr] lg:grid-cols-[240px,1fr]">
      {/* Rail — hidden on phones (the SettingDetail page already has the
          Layout's back-arrow so the user can return to the card-list). */}
      <aside className="hidden md:block">
        <nav className="space-y-5 sticky top-4 self-start">
          {SETTINGS_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground px-2 mb-1.5">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeId === item.id;
                  return (
                    <li key={item.id}>
                      <NavLink
                        to={`/settings/${item.id}`}
                        className={cn(
                          "flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors",
                          "border-l-2",
                          isActive
                            ? "bg-accent text-accent-foreground font-medium border-primary"
                            : "text-muted-foreground border-transparent hover:bg-muted/50 hover:text-foreground",
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{item.title}</span>
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      {/* Content — fills the remaining width. min-h pins the area at
          ~viewport height so sections with their own inner-loading state
          (Hours & Closures, Services Management) don't briefly collapse
          the page from 700px → 80px when their data is in flight. The
          rail then stays put visually instead of appearing to "jump" as
          the content underneath grows + shrinks. Children still render
          their own card/border so the shell stays minimal. */}
      <div className="min-w-0 min-h-[calc(100vh-9rem)]">{children}</div>
    </div>
  );
}
