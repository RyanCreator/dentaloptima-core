import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Mic, Square, Save, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { usePractice } from "@/contexts/PracticeContext";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";

// Records a practice meeting using the browser's built-in speech recognition.
// The transcript builds live and stays fully editable; nothing is sent to a
// server until "Save". When the browser has no speech support, it degrades to
// plain typing.

const MEETING_TYPES = [
  { value: "TEAM", label: "Team meeting" },
  { value: "GOVERNANCE", label: "Governance" },
  { value: "CLINICAL", label: "Clinical governance" },
  { value: "TRAINING", label: "Training" },
  { value: "OTHER", label: "Other" },
];

function fmt(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

export function RecordMeetingSheet({ open, onOpenChange, onCreated }: Props) {
  const navigate = useNavigate();
  const practiceId = usePractice().practice.id;
  const { supported, listening, transcript, interim, error, start, stop, reset } =
    useSpeechRecognition("en-GB");

  const [title, setTitle] = useState("");
  const [meetingType, setMeetingType] = useState("TEAM");
  const [text, setText] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [saving, setSaving] = useState(false);

  // Mic permission + live level meter — owned here (separate from the recognition
  // service the hook drives) so the user can SEE the mic is working even when the
  // browser's transcription service is unavailable.
  const [micReady, setMicReady] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);

  const baseRef = useRef("");
  const timerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  const stopMic = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setMicReady(false);
    setMicLevel(0);
  }, []);

  // Request the mic + drive a live RMS level meter. Returns true once granted.
  const startMic = useCallback(async (): Promise<boolean> => {
    setMicError(null);
    if (typeof window !== "undefined" && window.isSecureContext === false) {
      setMicError("Recording needs a secure (https) connection. This page is on http.");
      return false;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicError("This browser can't access the microphone (it may need an https connection).");
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const Ctx = window.AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        const ctx = new Ctx();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (const v of data) {
            const x = (v - 128) / 128;
            sum += x * x;
          }
          setMicLevel(Math.min(1, Math.sqrt(sum / data.length) * 2.5));
          rafRef.current = requestAnimationFrame(tick);
        };
        tick();
      }
      setMicReady(true);
      return true;
    } catch (e) {
      const name = (e as DOMException)?.name;
      if (name === "NotAllowedError" || name === "SecurityError") {
        setMicError("Microphone access is blocked. Click the camera/padlock icon in the address bar, allow the microphone, reload, then try again.");
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setMicError("No microphone was found. Connect one (or check your system sound settings) and try again.");
      } else {
        setMicError("Couldn't access the microphone.");
      }
      return false;
    }
  }, []);

  // Reset everything when the sheet (re)opens; tear the mic down when it closes.
  useEffect(() => {
    if (open) {
      setTitle("");
      setMeetingType("TEAM");
      setText("");
      setSeconds(0);
      setMicError(null);
      reset();
    } else {
      stopMic();
    }
  }, [open, reset, stopMic]);

  // Always release the mic on unmount.
  useEffect(() => () => stopMic(), [stopMic]);

  // While recording, fold the live final transcript onto whatever was already
  // typed when recording started.
  useEffect(() => {
    if (!listening) return;
    const base = baseRef.current.replace(/\s+$/, "");
    setText(base ? `${base} ${transcript}` : transcript);
  }, [transcript, listening]);

  // Recording timer.
  useEffect(() => {
    if (listening) {
      timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    } else if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [listening]);

  const toggleRecord = async () => {
    if (listening) {
      stop();
      stopMic();
    } else {
      const ok = await startMic(); // confirms mic access (the prompt + meter)
      if (!ok) return;
      baseRef.current = text;
      reset();
      start();
    }
  };

  const save = async () => {
    if (!title.trim()) {
      toast.error("Give the meeting a title first");
      return;
    }
    if (listening) stop();
    stopMic();
    setSaving(true);
    const { data, error: insErr } = await supabase
      .from("meeting")
      .insert({
        practice_id: practiceId,
        title: title.trim(),
        meeting_type: meetingType,
        transcript: text.trim(),
        duration_seconds: seconds,
      })
      .select("id")
      .single();
    setSaving(false);
    if (insErr || !data) {
      logger.error("Failed to save meeting", insErr);
      toast.error("Couldn't save the meeting");
      return;
    }
    toast.success("Meeting saved");
    onOpenChange(false);
    onCreated?.();
    navigate(`/governance/meetings/${data.id}`);
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o && listening) stop(); onOpenChange(o); }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Mic className="h-4 w-4" />
            Record a meeting
          </SheetTitle>
          <SheetDescription>
            Transcribed live in your browser. Nothing is sent anywhere until you save.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="meeting-title">Title</Label>
            <Input
              id="meeting-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Monday morning huddle"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={meetingType} onValueChange={setMeetingType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MEETING_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Recorder controls */}
          {supported ? (
            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-full ${
                      listening ? "bg-red-100 text-red-600" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <Mic className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="text-sm font-medium tabular-nums">{fmt(seconds)}</div>
                    <div className="text-xs text-muted-foreground">
                      {listening ? "Listening…" : seconds > 0 ? "Paused" : "Ready"}
                    </div>
                  </div>
                </div>
                <Button
                  type="button"
                  variant={listening ? "destructive" : "default"}
                  size="sm"
                  onClick={() => void toggleRecord()}
                >
                  {listening ? (
                    <><Square className="mr-1.5 h-4 w-4" />Stop</>
                  ) : (
                    <><Mic className="mr-1.5 h-4 w-4" />{seconds > 0 ? "Resume" : "Record"}</>
                  )}
                </Button>
              </div>

              {/* Live mic level — confirms the microphone is picking up sound,
                  independent of the (separate) transcription service. */}
              {micReady && (
                <div className="mt-3">
                  <span className="flex items-center gap-1 text-xs font-medium text-green-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                    Microphone connected
                  </span>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-green-500 transition-[width] duration-75"
                      style={{ width: `${Math.round(micLevel * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {listening && interim && (
                <p className="mt-3 text-sm italic text-muted-foreground">…{interim}</p>
              )}
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Your browser doesn't support live transcription (try Chrome or Edge). You can still
                type the minutes below.
              </span>
            </div>
          )}

          {/* Mic permission problem (red — must be fixed to record). */}
          {micError && (
            <p className="flex items-start gap-1.5 text-xs text-red-600">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {micError}
            </p>
          )}
          {/* Transcription-service problem (amber — mic is fine, just type). */}
          {error && (
            <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="meeting-transcript">Transcript / notes</Label>
            <Textarea
              id="meeting-transcript"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={supported ? "Press Record, or type here…" : "Type the meeting notes…"}
              className="min-h-[180px]"
            />
            <p className="text-[11px] text-muted-foreground">
              Recognition is never perfect — edit freely before saving.
            </p>
          </div>

          <Button onClick={save} disabled={saving} className="w-full">
            <Save className="mr-1.5 h-4 w-4" />
            Save meeting
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
