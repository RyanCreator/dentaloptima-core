import { createRoot } from "react-dom/client";
import { ThemeProvider } from "next-themes";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import App from "./App.tsx";
import "./index.css";

// Single-DB bootstrap. dentaloptima-core has one Supabase project shared by
// all practices, with RLS scoping by practice_member. No tenant resolution
// required — the Supabase client is initialised at module load from env vars.

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <App />
    </ThemeProvider>
  </ErrorBoundary>
);
