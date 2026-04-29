import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { TimezoneProvider } from "@/contexts/TimezoneContext";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
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
import RecallsPage from "./pages/RecallsPage";
import ClaimSlot from "./pages/ClaimSlot";
import Portal, { PortalAuthEntry } from "./pages/Portal";
import TreatmentPlanAccept from "./pages/TreatmentPlanAccept";
import Support from "./pages/Support";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TimezoneProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
          <Route path="/login" element={<Login />} />
          {/* Public route — accessed via the cancellation-offer email link.
              No auth required; the URL token IS the credential. */}
          <Route path="/claim-slot/:token" element={<ClaimSlot />} />
          {/* Patient self-service portal — magic-link auth, no Supabase user. */}
          <Route path="/portal" element={<Portal />} />
          <Route path="/portal/auth/:token" element={<PortalAuthEntry />} />
          {/* Public treatment plan acceptance page from the magic-link email. */}
          <Route path="/treatment-plan/:token" element={<TreatmentPlanAccept />} />
          <Route path="/" element={<Dashboard />} />
          <Route path="/enquiries" element={<Enquiries />} />
          <Route path="/enquiries/:id" element={<EnquiryDetail />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/patients" element={<Patients />} />
          <Route path="/patients/:id" element={<PatientDetail />} />
          <Route path="/waiting-list" element={<WaitingListPage />} />
          <Route path="/cancellations" element={<CancellationsPage />} />
          <Route path="/recalls" element={<RecallsPage />} />
          <Route path="/staff" element={<StaffManagement />} />
          <Route path="/staff/:id" element={<StaffDetail />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/:id" element={<SettingDetail />} />
          <Route path="/support" element={<Support />} />
          <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </TimezoneProvider>
  </QueryClientProvider>
);

export default App;
