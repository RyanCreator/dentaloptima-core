import { useCallback, useEffect, useRef, useState } from "react";

// Thin wrapper around the browser's built-in Web Speech API (the same engine a
// phone uses for dictation). No audio leaves the device beyond what the browser
// itself does, no API key, no cost. Best support is Chrome/Edge; Safari works;
// Firefox is unsupported (we surface `supported: false` so the UI can fall back
// to manual typing).
//
// Long meetings: Chrome ends a recognition session on silence/timeouts, so we
// auto-restart while the user still wants to be listening, accumulating the
// finalised transcript across restarts.

// --- Minimal typings (the Web Speech API isn't in the standard DOM lib) ------
interface SRAlternative {
  readonly transcript: string;
  readonly confidence: number;
}
interface SRResult {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: SRAlternative;
}
interface SRResultList {
  readonly length: number;
  readonly [index: number]: SRResult;
}
interface SREvent extends Event {
  readonly resultIndex: number;
  readonly results: SRResultList;
}
interface SRErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}
interface SRInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: SRErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}
type SRCtor = new () => SRInstance;

function getCtor(): SRCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SRCtor;
    webkitSpeechRecognition?: SRCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface UseSpeechRecognition {
  /** Whether the browser supports the Web Speech API at all. */
  supported: boolean;
  listening: boolean;
  /** Finalised transcript accumulated across the session (trailing space). */
  transcript: string;
  /** The in-progress phrase not yet finalised. */
  interim: string;
  error: string | null;
  start: () => void;
  stop: () => void;
  /** Clear the accumulated transcript (e.g. to re-record). */
  reset: () => void;
}

export function useSpeechRecognition(lang = "en-GB"): UseSpeechRecognition {
  const ctorRef = useRef<SRCtor | null | undefined>(undefined);
  if (ctorRef.current === undefined) ctorRef.current = getCtor();
  const supported = ctorRef.current !== null;

  const recogRef = useRef<SRInstance | null>(null);
  const shouldListenRef = useRef(false);
  const finalRef = useRef("");

  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const ensure = useCallback((): SRInstance | null => {
    if (recogRef.current) return recogRef.current;
    if (!ctorRef.current) return null;
    const r = new ctorRef.current();
    r.continuous = true;
    r.interimResults = true;
    r.lang = lang;
    r.maxAlternatives = 1;

    r.onstart = () => setListening(true);
    r.onresult = (e) => {
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const text = res[0]?.transcript ?? "";
        if (res.isFinal) {
          finalRef.current = `${(finalRef.current + " " + text).trim()} `;
        } else {
          interimText += text;
        }
      }
      setTranscript(finalRef.current);
      setInterim(interimText);
    };
    r.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return; // transient
      shouldListenRef.current = false;
      setListening(false);
      switch (e.error) {
        case "not-allowed":
          setError("Microphone access is blocked. Click the camera/padlock icon in the address bar, allow the microphone, reload, then try again.");
          break;
        case "service-not-allowed":
          // Mic is allowed but the browser's speech service refused — typically
          // Brave / Firefox / ungoogled-Chromium. Chrome or Edge work.
          setError("This browser's speech service isn't available. Live transcription works in Chrome or Edge — you can still type the notes below.");
          break;
        case "audio-capture":
          setError("No microphone was found. Connect one (or check your system sound settings) and try again.");
          break;
        case "network":
          setError("Couldn't reach the speech service. Check your internet connection and try again.");
          break;
        default:
          setError(`Speech recognition error: ${e.error}`);
      }
    };
    r.onend = () => {
      // Restart while we still want to listen (Chrome stops on silence).
      if (shouldListenRef.current) {
        try {
          r.start();
        } catch {
          /* already starting — ignore */
        }
      } else {
        setListening(false);
      }
    };

    recogRef.current = r;
    return r;
  }, [lang]);

  // Starts the recognition service. The caller (RecordMeetingSheet) handles the
  // microphone permission + level meter separately via getUserMedia, so by the
  // time this runs the mic is already granted — any error here is the speech
  // *service* (service-not-allowed / network), not the mic.
  const start = useCallback(() => {
    const r = ensure();
    if (!r) return;
    setError(null);
    shouldListenRef.current = true;
    try {
      r.start();
    } catch {
      /* already running — ignore */
    }
  }, [ensure]);

  const stop = useCallback(() => {
    shouldListenRef.current = false;
    setInterim("");
    try {
      recogRef.current?.stop();
    } catch {
      /* not running — ignore */
    }
    setListening(false);
  }, []);

  const reset = useCallback(() => {
    finalRef.current = "";
    setTranscript("");
    setInterim("");
  }, []);

  // Stop + tear down on unmount so the mic indicator clears.
  useEffect(
    () => () => {
      shouldListenRef.current = false;
      try {
        recogRef.current?.abort();
      } catch {
        /* noop */
      }
    },
    [],
  );

  return { supported, listening, transcript, interim, error, start, stop, reset };
}
