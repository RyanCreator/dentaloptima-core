import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { TimezoneProvider } from "@/contexts/TimezoneContext";
import { PracticeBootstrap } from "@/contexts/PracticeContext";
import { RequireAuth } from "@/components/RequireAuth";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import AuthCallback from "./pages/AuthCallback";
import Enquiries from "./pages/Enquiries";
import EnquiryDetail from "./pages/EnquiryDetail";
import Calendar from "./pages/Calendar";
import Patients from "./pages/Patients";
import PatientDetail from "./pages/PatientDetail";
import WaitingListPage from "./pages/WaitingListPage";
import CancellationsPage from "./pages/CancellationsPage";
import StaffManagement from "./pages/StaffManagement";
import StaffDetail from "./pages/StaffDetail";
import SettingsPage from "./pages/SettingsPage";
import SettingDetail from "./pages/SettingDetail";
import ServiceDetail from "./pages/ServiceDetail";
import RecallsPage from "./pages/RecallsPage";
import NHSClaims from "./pages/NHSClaims";
import Governance from "./pages/Governance";
import IncidentDetail from "./pages/governance/IncidentDetail";
import ComplaintDetail from "./pages/governance/ComplaintDetail";
import PolicyDetail from "./pages/governance/PolicyDetail";
import SafeguardingDetail from "./pages/governance/SafeguardingDetail";
import ClaimSlot from "./pages/ClaimSlot";
import Portal, { PortalAuthEntry } from "./pages/Portal";
import TreatmentPlanAccept from "./pages/TreatmentPlanAccept";
import Support from "./pages/Support";
import HelpIndex from "./pages/HelpIndex";
import Glossary from "./pages/Glossary";
import KioskConsents from "./pages/KioskConsents";
import NotFound from "./pages/NotFound";
import DomainNotConfigured from "./pages/status/DomainNotConfigured";
import PracticeUnavailable from "./pages/status/PracticeUnavailable";
import BootFailed from "./pages/status/BootFailed";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TimezoneProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <PracticeBootstrap
            renderNotConfigured={(hostname) => <DomainNotConfigured hostname={hostname} />}
            renderUnavailable={(_hostname, practice) => (
              <PracticeUnavailable practiceName={practice.name} status={practice.status} />
            )}
            renderError={(error) => <BootFailed error={error} />}
          >
            <Routes>
              {/* Public — login + token-credentialled landing pages.
                  These still require a resolved practice (they were sent
                  for a specific tenant), but no logged-in member. */}
              <Route path="/login" element={<Login />} />
              {/* Landing pad for Supabase email-auth flows (invite, password
                  recovery, magic link). Token comes in URL hash; supabase-js
                  picks it up automatically and AuthCallback shows the right UI. */}
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/claim-slot/:token" element={<ClaimSlot />} />
              <Route path="/portal" element={<Portal />} />
              <Route path="/portal/auth/:token" element={<PortalAuthEntry />} />
              <Route path="/treatment-plan/:token" element={<TreatmentPlanAccept />} />

              {/* Protected — practice_member of this hostname's practice. */}
              <Route path="/" element={<RequireAuth><Dashboard /></RequireAuth>} />
              <Route path="/enquiries" element={<RequireAuth><Enquiries /></RequireAuth>} />
              <Route path="/enquiries/:id" element={<RequireAuth><EnquiryDetail /></RequireAuth>} />
              <Route path="/calendar" element={<RequireAuth><Calendar /></RequireAuth>} />
              <Route path="/patients" element={<RequireAuth><Patients /></RequireAuth>} />
              <Route path="/patients/:id" element={<RequireAuth><PatientDetail /></RequireAuth>} />
              <Route path="/waiting-list" element={<RequireAuth><WaitingListPage /></RequireAuth>} />
              <Route path="/cancellations" element={<RequireAuth><CancellationsPage /></RequireAuth>} />
              <Route path="/recalls" element={<RequireAuth><RecallsPage /></RequireAuth>} />
              <Route path="/claims" element={<RequireAuth><NHSClaims /></RequireAuth>} />
              <Route path="/staff" element={<RequireAuth><StaffManagement /></RequireAuth>} />
              <Route path="/staff/:id" element={<RequireAuth><StaffDetail /></RequireAuth>} />
              <Route path="/governance" element={<RequireAuth><Governance /></RequireAuth>} />
              <Route path="/governance/incidents/:id" element={<RequireAuth><IncidentDetail /></RequireAuth>} />
              <Route path="/governance/complaints/:id" element={<RequireAuth><ComplaintDetail /></RequireAuth>} />
              <Route path="/governance/policies/:id" element={<RequireAuth><PolicyDetail /></RequireAuth>} />
              <Route path="/governance/safeguarding/:id" element={<RequireAuth><SafeguardingDetail /></RequireAuth>} />
              <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
              {/* Service create/edit live as their own routes so the form has
                  full-page room. Must be declared BEFORE /settings/:id so
                  React Router prefers the more-specific path. */}
              <Route path="/settings/services/new" element={<RequireAuth><ServiceDetail /></RequireAuth>} />
              <Route path="/settings/services/:serviceId" element={<RequireAuth><ServiceDetail /></RequireAuth>} />
              <Route path="/settings/:id" element={<RequireAuth><SettingDetail /></RequireAuth>} />
              <Route path="/support" element={<RequireAuth><Support /></RequireAuth>} />
              <Route path="/help" element={<RequireAuth><HelpIndex /></RequireAuth>} />
              <Route path="/glossary" element={<RequireAuth><Glossary /></RequireAuth>} />
              {/* Kiosk route — auth-gated to staff (RequireAuth), but
                  rendered without the Layout chrome so the patient holding
                  the iPad doesn't see the staff sidebar. */}
              <Route path="/kiosk/consents/:patientId" element={<RequireAuth><KioskConsents /></RequireAuth>} />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </PracticeBootstrap>
        </BrowserRouter>
      </TooltipProvider>
    </TimezoneProvider>
  </QueryClientProvider>
);

export default App;
