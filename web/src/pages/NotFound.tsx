import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { useRequireAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { PageLoading } from "@/components/PageLoading";
import { Home, ArrowLeft, Search } from "lucide-react";

export default function NotFound() {
  const { loading } = useRequireAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <Layout title="Page Not Found">
        <PageLoading />
      </Layout>
    );
  }

  return (
    <Layout title="Page Not Found">
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-6 max-w-md">
          {/* 404 Graphic */}
          <div className="relative">
            <div className="text-9xl font-bold text-primary/10">404</div>
            <div className="absolute inset-0 flex items-center justify-center">
              <Search className="h-16 w-16 text-muted-foreground/40" />
            </div>
          </div>

          {/* Message */}
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">Page Not Found</h1>
            <p className="text-muted-foreground">
              Sorry, we couldn't find the page you're looking for. It may have been moved or deleted.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
            <Button
              onClick={() => navigate(-1)}
              variant="outline"
              className="w-full sm:w-auto"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Go Back
            </Button>
            <Button
              onClick={() => navigate("/")}
              className="w-full sm:w-auto"
            >
              <Home className="h-4 w-4 mr-2" />
              Go to Dashboard
            </Button>
          </div>

          {/* Quick Links */}
          <div className="pt-8 border-t">
            <p className="text-sm text-muted-foreground mb-3">Quick Links</p>
            <div className="flex flex-wrap gap-2 justify-center">
              <button
                onClick={() => navigate("/calendar")}
                className="text-sm text-primary hover:underline"
              >
                Calendar
              </button>
              <span className="text-muted-foreground">•</span>
              <button
                onClick={() => navigate("/enquiries")}
                className="text-sm text-primary hover:underline"
              >
                Enquiries
              </button>
              <span className="text-muted-foreground">•</span>
              <button
                onClick={() => navigate("/patients")}
                className="text-sm text-primary hover:underline"
              >
                Patients
              </button>
              <span className="text-muted-foreground">•</span>
              <button
                onClick={() => navigate("/staff")}
                className="text-sm text-primary hover:underline"
              >
                Staff
              </button>
              <span className="text-muted-foreground">•</span>
              <button
                onClick={() => navigate("/settings")}
                className="text-sm text-primary hover:underline"
              >
                Settings
              </button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
