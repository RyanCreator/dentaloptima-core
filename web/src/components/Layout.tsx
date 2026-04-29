import { ReactNode, useEffect, useState } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { TopBar } from "@/components/TopBar";
import { PlatformAnnouncementBanner } from "@/components/PlatformAnnouncementBanner";

interface LayoutProps {
  children: ReactNode;
  title: string;
  onBack?: () => void;
}

export const Layout = ({ children, title, onBack }: LayoutProps) => {
  const [defaultOpen, setDefaultOpen] = useState(true);

  useEffect(() => {
    // Only open by default on desktop (1024px and above)
    const checkMobile = () => {
      setDefaultOpen(window.innerWidth >= 1024);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <div className="min-h-screen flex w-full overflow-hidden">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <TopBar title={title} onBack={onBack} />
          <PlatformAnnouncementBanner />
          <main className="flex-1 p-4 md:p-6 overflow-auto bg-muted/20">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};