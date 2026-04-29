import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useSendTestEmail, type TestTemplateKey } from "@/hooks/useSendTestEmail";
import { toast } from "sonner";

interface SendTestEmailRowProps {
  templateKey: TestTemplateKey;
  // Optional unsaved template text. If provided, we warn the admin that the
  // test send uses whatever is currently saved in the DB — their unsaved edits
  // won't appear in the email. Surfaced here so they don't get confused by a
  // test that looks nothing like what's on screen.
  hasUnsavedChanges?: boolean;
  // Label variations — "Send test" in a sheet, "Send test email" in settings panel.
  buttonLabel?: string;
  // Short blurb shown above the row to explain what the test does.
  helperText?: string;
}

export function SendTestEmailRow({
  templateKey,
  hasUnsavedChanges = false,
  buttonLabel = "Send test",
  helperText,
}: SendTestEmailRowProps) {
  const { user } = useAuth();
  const { send, sending } = useSendTestEmail();
  const [recipient, setRecipient] = useState(user?.email ?? "");

  const handleSend = async () => {
    const trimmed = recipient.trim();
    if (!trimmed) {
      toast.error("Enter a recipient email");
      return;
    }
    if (hasUnsavedChanges) {
      toast.info("Save your template first — the test uses the saved copy");
      return;
    }
    const result = await send({ to: trimmed, templateKey });
    if (result.success) {
      toast.success(`Test email sent to ${result.to}`);
    } else {
      toast.error(result.error);
    }
  };

  return (
    <div className="space-y-2">
      {helperText && <p className="text-xs text-muted-foreground">{helperText}</p>}
      <div className="flex items-end gap-2">
        <div className="space-y-1 flex-1">
          <Label htmlFor={`test-to-${templateKey}`} className="text-xs text-muted-foreground">
            Send test to
          </Label>
          <Input
            id={`test-to-${templateKey}`}
            type="email"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="you@example.com"
            className="h-9"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleSend}
          disabled={sending}
          className="h-9 shrink-0"
        >
          <Send className="h-3.5 w-3.5 mr-1.5" />
          {sending ? "Sending…" : buttonLabel}
        </Button>
      </div>
    </div>
  );
}
