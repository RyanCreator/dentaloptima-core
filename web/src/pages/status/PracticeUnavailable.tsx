import { PauseCircle } from "lucide-react";

// Hostname maps to a real practice but the practice is SUSPENDED or
// OFFBOARDED. Login is blocked at the boot layer — no point letting them
// type credentials when the account would be rejected anyway.
export default function PracticeUnavailable({
  practiceName,
  status,
}: {
  practiceName: string;
  status: string;
}) {
  const message =
    status === "OFFBOARDED"
      ? `${practiceName}'s booking app has been retired.`
      : `${practiceName}'s booking app is temporarily unavailable.`;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md text-center space-y-4">
        <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-amber-100 dark:bg-amber-950/40">
          <PauseCircle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
        </div>
        <h1 className="text-xl font-semibold">Practice unavailable</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
        <p className="text-sm text-muted-foreground">
          Please contact your Dentaloptima account manager to reactivate.
        </p>
      </div>
    </div>
  );
}
