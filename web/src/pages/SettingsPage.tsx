import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { useRequireAuth } from "@/hooks/useAuth";
import { 
  Settings as SettingsIcon, 
  Building2, 
  Clock, 
  MessageSquare,
  Wrench 
} from "lucide-react";
import { ChevronRight } from "lucide-react";

const settingsItems = [
  {
    id: "clinic",
    title: "Clinic Settings",
    description: "Clinic name, timezone, operating hours and closures",
    icon: Building2,
  },
  {
    id: "appointments",
    title: "Appointment Settings",
    description: "Default duration, scheduling preferences and reminders",
    icon: Clock,
  },
  {
    id: "templates",
    title: "Message Templates",
    description: "Confirmation and notification templates",
    icon: MessageSquare,
  },
  {
    id: "services",
    title: "Services Management",
    description: "Manage services offered by the clinic",
    icon: Wrench,
  },
];

export default function SettingsPage() {
  const { loading } = useRequireAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <Layout title="Settings">
        <div>Loading...</div>
      </Layout>
    );
  }

  return (
    <Layout title="Settings">
      <div className="space-y-4">
        <p className="text-muted-foreground">
          Configure clinic settings and preferences
        </p>

        <div className="divide-y bg-card rounded-lg border">
          {settingsItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => navigate(`/settings/${item.id}`)}
                className="w-full flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors text-left"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium">{item.title}</h3>
                  <p className="text-sm text-muted-foreground truncate">
                    {item.description}
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
              </button>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}