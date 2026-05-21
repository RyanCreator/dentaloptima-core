import { useEffect } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Layout } from "@/components/Layout";
import Home from "@/pages/Home";
import Services from "@/pages/Services";
import ServiceDetail from "@/pages/ServiceDetail";
import About from "@/pages/About";
import Contact from "@/pages/Contact";
import Book from "@/pages/Book";
import Privacy from "@/pages/Privacy";
import Cookies from "@/pages/Cookies";
import Complaints from "@/pages/Complaints";
import Glossary from "@/pages/Glossary";
import NotFound from "@/pages/NotFound";
import { installSiteWideJsonLd } from "@/lib/seo";
import { applyBranding } from "@/lib/branding";
import { practice } from "@/config/practice.config";
import { assertConfigSane } from "@/config/schema";
import { PracticeBootstrap } from "@/contexts/PracticeContext";

// Validate the static marketing-config (the bits that don't come from the DB
// at runtime — services long-form copy, team, testimonials, hero) once at
// module load. In dev this logs precise field paths to the console. In prod
// the zod schema is still shipped but validation failures just log warnings
// — we never want to crash a live site over a content typo.
assertConfigSane(practice);

export default function App() {
  useEffect(() => {
    applyBranding();
    installSiteWideJsonLd();
  }, []);

  return (
    <BrowserRouter>
      <PracticeBootstrap
        renderNotConfigured={(hostname) => <DomainNotConfigured hostname={hostname} />}
        renderUnavailable={(_hostname, practice) => (
          <PracticeUnavailable practiceName={practice.name} status={practice.status} />
        )}
        renderSiteDisabled={(_hostname, practice) => (
          <SiteComingSoon practiceName={practice.name} />
        )}
        renderError={(error) => <BootFailed error={error} />}
      >
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/services" element={<Services />} />
            <Route path="/services/:slug" element={<ServiceDetail />} />
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/book" element={<Book />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/cookies" element={<Cookies />} />
            <Route path="/complaints" element={<Complaints />} />
            <Route path="/glossary" element={<Glossary />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </PracticeBootstrap>
    </BrowserRouter>
  );
}

// Minimal status pages. Inlined here so the app doesn't need a separate
// page bundle for what should be rare states.

// Domain points at our marketing host but isn't yet attached to a
// practice in the database. From a visitor's perspective this is a
// pre-launch "coming soon" — they don't know or care about the wiring
// underneath. Dentaloptima credit + link doubles as a soft marketing
// channel for anyone who stumbles across an in-progress client domain.
function DomainNotConfigured({ hostname: _hostname }: { hostname: string }) {
  return (
    <StatusPage title="Coming soon">
      <p>This website is being built and will be live shortly.</p>
      <PoweredByDentaloptima />
    </StatusPage>
  );
}

function PracticeUnavailable({
  practiceName,
  status,
}: {
  practiceName: string;
  status: string;
}) {
  return (
    <StatusPage title="Site temporarily unavailable">
      <p>
        <strong>{practiceName}</strong>'s online booking is currently
        {status === "SUSPENDED" ? " suspended" : " offline"}. Please contact the
        practice directly.
      </p>
    </StatusPage>
  );
}

// Toggled-off state — the practice is operating normally but hasn't
// published their public site yet. Friendlier copy than "unavailable" so
// it doesn't alarm visitors.
function SiteComingSoon({ practiceName }: { practiceName: string }) {
  return (
    <StatusPage title="Coming soon">
      <p>
        <strong>{practiceName}</strong>'s website is on its way. To book an
        appointment in the meantime, please contact the practice directly.
      </p>
      <PoweredByDentaloptima />
    </StatusPage>
  );
}

function BootFailed({ error }: { error: Error }) {
  return (
    <StatusPage title="We couldn't load this site">
      <p>Something went wrong on our end. Please try again in a few moments.</p>
      {import.meta.env.DEV && (
        <pre className="mt-4 text-xs text-red-600 bg-red-50 border border-red-100 rounded p-3 overflow-auto">
          {error.message}
        </pre>
      )}
    </StatusPage>
  );
}

function StatusPage({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen flex items-center justify-center px-6 bg-white">
      <div className="max-w-xl text-center space-y-5">
        <h1 className="font-display text-4xl sm:text-5xl text-ink">{title}</h1>
        <div className="text-lg text-ink/70 leading-relaxed space-y-4">
          {children}
        </div>
      </div>
    </main>
  );
}

// Soft attribution shown on every status page. Doubles as a marketing
// channel — if a visitor stumbles onto a pre-launch client domain, they
// see who built it and can click through.
function PoweredByDentaloptima() {
  return (
    <p className="pt-6 text-sm text-ink/50">
      Built with{" "}
      <a
        href="https://dentaloptima.co.uk"
        className="font-medium text-ink/70 hover:text-ink underline underline-offset-2"
      >
        Dentaloptima
      </a>
      {" "}— Practice Software Reimagined.
    </p>
  );
}
