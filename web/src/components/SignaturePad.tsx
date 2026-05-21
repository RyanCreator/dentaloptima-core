import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";

// Pointer-event-based signature canvas. Pointer events unify mouse + touch
// + pen, so an iPad in surgery and a desktop in reception use the same
// code path. We deliberately avoid signature libraries here — the surface
// is small enough that a 70-line component is cheaper than a dependency.
//
// The pad doesn't render any chrome (buttons, instructions) — the parent
// modal owns the patient-facing presentation. This component is just the
// drawing surface and an imperative handle for clear / serialise.

export interface SignaturePadHandle {
  /** True once the user has put a stroke on the canvas. */
  isEmpty: () => boolean;
  /** Clear the canvas to white. */
  clear: () => void;
  /** Serialise the strokes as a PNG blob. Returns null on empty. */
  toBlob: () => Promise<Blob | null>;
}

interface SignaturePadProps {
  className?: string;
}

export const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(
  function SignaturePad({ className }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawingRef = useRef(false);
    const lastPointRef = useRef<{ x: number; y: number } | null>(null);
    const [hasStroke, setHasStroke] = useState(false);

    // Resize the canvas to match its CSS size at the current devicePixelRatio.
    // Without this, drawings look blurry on retina displays. Re-running on
    // each mount + resize keeps the buffer aligned with the visible box.
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const fit = () => {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = Math.max(1, Math.floor(rect.width * dpr));
        canvas.height = Math.max(1, Math.floor(rect.height * dpr));
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.scale(dpr, dpr);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, rect.width, rect.height);
        ctx.strokeStyle = "#0f172a";  // slate-900 — readable on white
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.lineWidth = 2;
      };

      fit();
      const ro = new ResizeObserver(fit);
      ro.observe(canvas);
      return () => ro.disconnect();
    }, []);

    useImperativeHandle(ref, () => ({
      isEmpty: () => !hasStroke,
      clear: () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        const rect = canvas.getBoundingClientRect();
        if (!ctx) return;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, rect.width, rect.height);
        setHasStroke(false);
      },
      toBlob: () =>
        new Promise((resolve) => {
          const canvas = canvasRef.current;
          if (!canvas || !hasStroke) { resolve(null); return; }
          canvas.toBlob((blob) => resolve(blob), "image/png");
        }),
    }));

    const localPoint = (e: PointerEvent | React.PointerEvent): { x: number; y: number } => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      canvasRef.current?.setPointerCapture(e.pointerId);
      drawingRef.current = true;
      lastPointRef.current = localPoint(e);
    };

    const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current) return;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      const p = localPoint(e);
      const last = lastPointRef.current ?? p;
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      lastPointRef.current = p;
      if (!hasStroke) setHasStroke(true);
    };

    const onPointerEnd = (e: React.PointerEvent<HTMLCanvasElement>) => {
      drawingRef.current = false;
      lastPointRef.current = null;
      canvasRef.current?.releasePointerCapture(e.pointerId);
    };

    return (
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onPointerLeave={onPointerEnd}
        // touch-action: none disables panning/zooming while signing —
        // otherwise iOS Safari treats a drag on the canvas as a scroll.
        className={`bg-white rounded-md border touch-none cursor-crosshair w-full h-full ${className ?? ""}`}
      />
    );
  },
);
