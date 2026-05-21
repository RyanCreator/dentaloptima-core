import { AlertOctagon } from "lucide-react";
import { Button } from "@/components/ui/button";

// Generic bail-out for anything that isn't an expected runtime state —
// network blip during the practice lookup, RPC error, etc. Show the literal
// error so logs the user sends to support actually contain the cause.
export default function BootFailed({ error }: { error: Error }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md text-center space-y-4">
        <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-950/40">
          <AlertOctagon className="h-6 w-6 text-red-600 dark:text-red-400" />
        </div>
        <h1 className="text-xl font-semibold">Couldn't start the booking app</h1>
        <p className="text-sm text-muted-foreground">
          Something went wrong while looking up this hostname. This is usually
          a temporary problem.
        </p>
        <pre className="text-xs text-left bg-muted/40 border rounded p-3 whitespace-pre-wrap break-words">
          {error.message}
        </pre>
        <Button onClick={() => window.location.reload()}>Try again</Button>
      </div>
    </div>
  );
}
