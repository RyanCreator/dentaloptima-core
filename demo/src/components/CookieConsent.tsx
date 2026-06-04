import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/Button";

const STORAGE_KEY = "cookie-consent-v1";

type Decision = "accept" | "reject" | null;

function read(): Decision {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "accept" || v === "reject" ? v : null;
  } catch {
    return null;
  }
}

function write(v: Decision) {
  try {
    if (v) localStorage.setItem(STORAGE_KEY, v);
  } catch {
    // ignore
  }
}

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Defer showing the banner by a frame so it doesn't block initial paint.
    const id = window.setTimeout(() => {
      if (read() === null) setVisible(true);
    }, 400);
    return () => window.clearTimeout(id);
  }, []);

  if (!visible) return null;

  const decide = (choice: Exclude<Decision, null>) => {
    write(choice);
    setVisible(false);
    // Future hook: fire analytics loaders only when choice === "accept".
  };

  return (
    <div
      role="dialog"
      aria-label="Cookie preferences"
      className="fixed inset-x-4 bottom-4 md:inset-x-auto md:right-6 md:bottom-6 md:max-w-md z-50 rounded-2xl bg-white shadow-card border border-ink/10 p-5 animate-fade-up"
    >
      <p className="text-sm text-ink/80 leading-relaxed">
        We use essential cookies to make the site work, plus optional analytics
        cookies to understand how visitors use it. You can change your mind any
        time in our{" "}
        <Link to="/cookies" className="underline hover:text-brand">
          cookie policy
        </Link>
        .
      </p>
      <div className="flex gap-2 mt-4">
        <Button size="md" onClick={() => decide("accept")} className="flex-1">
          Accept all
        </Button>
        <Button
          size="md"
          variant="secondary"
          onClick={() => decide("reject")}
          className="flex-1"
        >
          Essential only
        </Button>
      </div>
    </div>
  );
}
