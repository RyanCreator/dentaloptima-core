import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { AppShell } from "@/components/AppShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Login from "@/pages/Login";
import Overview from "@/pages/Overview";
import Tenants from "@/pages/Tenants";
import TenantDetail from "@/pages/TenantDetail";
import AuditLog from "@/pages/AuditLog";
import OutreachContacts from "@/pages/OutreachContacts";
import OutreachTemplates from "@/pages/OutreachTemplates";
import OutreachCampaigns from "@/pages/OutreachCampaigns";
import OutreachCampaignDetail from "@/pages/OutreachCampaignDetail";
import Leads from "@/pages/Leads";
import Announcements from "@/pages/Announcements";
import AnnouncementDetail from "@/pages/AnnouncementDetail";
import Messaging from "@/pages/Messaging";
import Support from "@/pages/Support";
import Admins from "@/pages/Admins";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Default to 30s stale — most admin pages don't need real-time updates,
      // and the operator can refresh when they want fresh numbers.
      staleTime: 30_000,
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <AppShell>
                  <Routes>
                    <Route path="/" element={<Overview />} />
                    <Route path="/tenants" element={<Tenants />} />
                    <Route path="/tenants/:id" element={<TenantDetail />} />
                    <Route path="/audit" element={<AuditLog />} />
                    <Route path="/leads" element={<Leads />} />
                    <Route path="/leads/:id" element={<Leads />} />
                    <Route path="/announcements" element={<Announcements />} />
                    <Route path="/announcements/new" element={<AnnouncementDetail />} />
                    <Route path="/announcements/:announcementId" element={<AnnouncementDetail />} />
                    <Route path="/outreach/contacts" element={<OutreachContacts />} />
                    <Route path="/outreach/templates" element={<OutreachTemplates />} />
                    <Route path="/outreach/templates/new" element={<OutreachTemplates />} />
                    <Route path="/outreach/templates/:id" element={<OutreachTemplates />} />
                    <Route path="/outreach/campaigns" element={<OutreachCampaigns />} />
                    <Route path="/outreach/campaigns/new" element={<OutreachCampaigns />} />
                    <Route path="/outreach/campaigns/:id" element={<OutreachCampaignDetail />} />
                    <Route path="/messaging" element={<Messaging />} />
                    <Route path="/messaging/:threadId" element={<Messaging />} />
                    <Route path="/support" element={<Support />} />
                    <Route path="/support/:threadId" element={<Support />} />
                    <Route path="/admins" element={<Admins />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </AppShell>
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}
