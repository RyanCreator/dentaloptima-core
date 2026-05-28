import { NavLink, useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  FileText,
  Calendar,
  Users,
  ListChecks,
  XCircle,
  RotateCcw,
  Receipt,
  UserCog,
  ShieldCheck,
  Settings,
  LogOut,
  X,
  LifeBuoy,
  BookOpen,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useTheme } from "next-themes";
import logoLight from "@/assets/logo-light.webp";
import logoDark from "@/assets/logo-dark.webp";
import { useNewEnquiriesCount } from "@/hooks/useNewEnquiriesCount";
import { useNhsPendingRequestCount } from "@/hooks/useNhsPerformerRequests";
import { useUnacknowledgedDocumentCount } from "@/hooks/useAssignedDocuments";
import { useAuth } from "@/hooks/useAuth";

const menuItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Enquiries", url: "/enquiries", icon: FileText },
  { title: "Calendar", url: "/calendar", icon: Calendar },
  { title: "Patients", url: "/patients", icon: Users },
  { title: "Waiting List", url: "/waiting-list", icon: ListChecks },
  { title: "Recalls", url: "/recalls", icon: RotateCcw },
  { title: "Cancellations", url: "/cancellations", icon: XCircle },
  { title: "NHS Claims", url: "/claims", icon: Receipt },
  { title: "Staff", url: "/staff", icon: UserCog },
  { title: "Governance", url: "/governance", icon: ShieldCheck },
  { title: "Documents", url: "/documents", icon: BookOpen },
  { title: "Settings", url: "/settings", icon: Settings },
];

export const AppSidebar = () => {
  const navigate = useNavigate();
  const { isMobile, state, setOpenMobile } = useSidebar();
  const { resolvedTheme } = useTheme();
  const location = useLocation();
  const { count: newEnquiriesCount } = useNewEnquiriesCount();
  const auth = useAuth();
  // Pending NHS performer requests — only meaningful for OWNER/ADMIN
  // (clinicians have no queue to manage). RLS would scope it for them too,
  // but skipping the query saves a round-trip on every sidebar render.
  const callerRole = auth.member?.role;
  const isAdmin = callerRole === "OWNER" || callerRole === "ADMIN";
  const { count: nhsRequestCount } = useNhsPendingRequestCount();
  const showNhsBadge = isAdmin && nhsRequestCount > 0;
  // Unacknowledged practice docs — visible to all members. The badge
  // nudges practices to read what Dentaloptima has shared with them.
  const { count: unackedDocCount } = useUnacknowledgedDocumentCount();
  const showDocsBadge = unackedDocCount > 0;

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Failed to log out");
    } else {
      navigate("/login");
    }
  };

  const isCollapsed = state === "collapsed";
  const shouldShowIconOnly = !isMobile && isCollapsed; // Only show icon-only mode on desktop
  const isActive = (url: string) => location.pathname === url || location.pathname.startsWith(url + "/");

  return (
    <Sidebar 
      className="border-r md:w-64 w-full" 
      collapsible={isMobile ? "offcanvas" : "icon"}
    >
      <SidebarHeader className={`h-14 border-b px-4 ${isMobile ? 'flex flex-row items-center justify-between' : 'flex items-center justify-center'}`}>
        <img 
          src={resolvedTheme === "dark" ? logoLight : logoDark}
          alt="Dental Optima"
          className="h-8"
          style={{ 
            opacity: shouldShowIconOnly ? 0 : 1,
            transition: shouldShowIconOnly 
              ? 'opacity 0.15s ease-out' 
              : 'opacity 0.6s ease-in-out 0.3s',
            width: 'auto'
          }}
        />
        {isMobile && (
          <button 
            onClick={() => setOpenMobile(false)}
            className="p-2 hover:bg-sidebar-accent rounded-md transition-colors shrink-0"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </SidebarHeader>
      <SidebarContent className="pt-4">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                const enquiriesBadge = item.title === "Enquiries" && newEnquiriesCount > 0;
                const staffBadge = item.title === "Staff" && showNhsBadge;
                const docsBadge = item.title === "Documents" && showDocsBadge;
                const showBadge = enquiriesBadge || staffBadge || docsBadge;
                const badgeCount = enquiriesBadge
                  ? newEnquiriesCount
                  : staffBadge
                    ? nhsRequestCount
                    : docsBadge
                      ? unackedDocCount
                      : 0;

                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      tooltip={shouldShowIconOnly ? item.title : undefined}
                      size="lg"
                      isActive={isActive(item.url)}
                      className={`text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[active=true]:font-semibold ${shouldShowIconOnly ? 'justify-center px-0' : ''}`}
                    >
                      <NavLink to={item.url} end={item.url === "/"} className="relative">
                        <item.icon className={`shrink-0 text-inherit ${shouldShowIconOnly ? 'h-6 w-6' : 'h-5 w-5'}`} />
                        {!shouldShowIconOnly && (
                          <span className="text-base truncate text-inherit flex items-center gap-2">
                            {item.title}
                            {showBadge && (
                              <span
                                className={`inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 text-xs font-semibold text-white rounded-full ${
                                  enquiriesBadge ? "bg-green-500" : "bg-amber-500"
                                }`}
                              >
                                {badgeCount}
                              </span>
                            )}
                          </span>
                        )}
                        {shouldShowIconOnly && showBadge && (
                          <span className="absolute -top-1 -right-1 flex h-3 w-3">
                            <span
                              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                                enquiriesBadge ? "bg-green-400" : "bg-amber-400"
                              }`}
                            ></span>
                            <span
                              className={`relative inline-flex rounded-full h-3 w-3 ${
                                enquiriesBadge ? "bg-green-500" : "bg-amber-500"
                              }`}
                            ></span>
                          </span>
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t p-2 space-y-2">
        <NavLink
          to="/support"
          title={shouldShowIconOnly ? "Get support" : undefined}
          className={({ isActive }) =>
            `flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary/50 transition-colors ${
              shouldShowIconOnly ? 'justify-center h-10 w-10 mx-auto' : 'px-3 py-2'
            } ${isActive ? 'bg-primary/15 border-primary/50' : ''}`
          }
        >
          <LifeBuoy className={`shrink-0 text-primary ${shouldShowIconOnly ? 'h-5 w-5' : 'h-4 w-4'}`} />
          {!shouldShowIconOnly && (
            <span className="text-sm font-medium text-primary">Get support</span>
          )}
        </NavLink>
        <div className="flex items-center gap-2 px-2">
          <SidebarMenu className="flex-1">
            <SidebarMenuItem>
              <SidebarMenuButton onClick={handleLogout} tooltip={shouldShowIconOnly ? "Logout" : undefined} size="lg" className={`w-full ${shouldShowIconOnly ? 'justify-center px-0' : ''}`}>
                <LogOut className={`shrink-0 ${shouldShowIconOnly ? 'h-6 w-6' : 'h-5 w-5'}`} />
                {!shouldShowIconOnly && <span className="text-base">Logout</span>}
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          {!shouldShowIconOnly && <ThemeToggle />}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
};