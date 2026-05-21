import { Outlet } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { CookieConsent } from "@/components/CookieConsent";
import { ScrollToTop } from "@/components/ScrollToTop";

export function Layout() {
  return (
    <>
      {/* Keyboard-first skip link — hidden visually until a user tabs onto
          it, then appears in the top-left corner so screen-reader and
          keyboard users can jump past the nav straight to the main page
          content. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:bg-brand focus:text-brand-fg focus:px-4 focus:py-2 focus:rounded-lg focus:shadow-card focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand"
      >
        Skip to main content
      </a>
      <ScrollToTop />
      <Header />
      <main id="main" className="min-h-screen">
        <Outlet />
      </main>
      <Footer />
      <CookieConsent />
    </>
  );
}
