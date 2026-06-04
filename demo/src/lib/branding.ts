import { practice } from "@/config/practice.config";

/** Push the practice's colour tokens into CSS custom properties at runtime.
 *  Tailwind's `rgb(var(--brand) / <alpha-value>)` pattern then picks them up,
 *  so a single config switch rebrands the entire site. */
export function applyBranding() {
  const root = document.documentElement;
  const b = practice.branding;
  root.style.setProperty("--brand", b.primaryRgb);
  root.style.setProperty("--brand-fg", b.primaryFgRgb);
  root.style.setProperty("--brand-soft", b.primarySoftRgb);
  root.style.setProperty("--accent", b.accentRgb);
  root.style.setProperty("--accent-fg", b.accentFgRgb);

  // Favicon + theme-color too
  const [r, g, bl] = b.primaryRgb.split(" ").map(Number);
  const hex =
    "#" +
    [r, g, bl]
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("");
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) themeMeta.setAttribute("content", hex);

  if (b.faviconUrl) {
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = b.faviconUrl;
  }
}
