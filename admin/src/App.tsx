import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { Layout } from "@/components/Layout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Login from "@/pages/Login";
import Overview from "@/pages/Overview";
import Tenants from "@/pages/Tenants";
import TenantDetail from "@/pages/TenantDetail";
import AuditLog from "@/pages/AuditLog";

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
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <Layout>
                  <Routes>
                    <Route path="/" element={<Overview />} />
                    <Route path="/tenants" element={<Tenants />} />
                    <Route path="/tenants/:id" element={<TenantDetail />} />
                    <Route path="/audit" element={<AuditLog />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </Layout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}
