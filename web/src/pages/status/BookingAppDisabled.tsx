import { Lock, LogOut, LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { usePractice } from "@/contexts/PracticeContext";

// Wall page shown post-sign-in when the practice is on the website-only
// plan (practice.booking_app_enabled = false). Sign-in still happened —
// the user successfully authenticated against this hostname's practice —
// so the operator can see in audit logs who tried to use the app.
//
// We don't gate at /login because that would make troubleshooting harder
// ("the login isn't working" vs "I logged in but can't see the app").
export default function BookingAppDisabled() {
  const tenant = usePractice();
  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-lg text-center space-y-5">
        <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-muted">
          <Lock className="h-7 w-7 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Booking app not enabled</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            <span className="font-medium text-foreground">
              {tenant.practice.name}
            </span>
            's plan is on website-only at the moment. The booking app — calendar,
            patient records, claims and the rest — isn't part of this plan.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Want to add it? Get in touch with the Dentaloptima team and we'll
            switch it on.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
          <Button asChild variant="default">
            <a href="mailto:support@dentaloptima.co.uk">
              <LifeBuoy className="h-4 w-4 mr-1.5" />
              Contact support
            </a>
          </Button>
          <Button variant="outline" onClick={handleSignOut}>
            <LogOut className="h-4 w-4 mr-1.5" />
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
