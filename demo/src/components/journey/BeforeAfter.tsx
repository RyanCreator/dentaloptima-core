import { useRef, useState } from "react";
import { MoveHorizontal } from "lucide-react";

// Draggable before/after comparison. Until real clinical photos are dropped in,
// it renders the same image dulled (before) vs vibrant (after) so the slider
// still reads as a genuine transformation. Drag the handle or click anywhere.
export function BeforeAfter({ image, alt }: { image: string; alt?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(52);

  const move = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setPos(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
  };

  return (
    <div
      ref={ref}
      className="relative aspect-[4/3] w-full cursor-ew-resize select-none overflow-hidden rounded-3xl shadow-hero"
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        move(e.clientX);
      }}
      onPointerMove={(e) => {
        if (e.buttons === 1) move(e.clientX);
      }}
      role="slider"
      aria-label="Before and after comparison"
      aria-valuenow={Math.round(pos)}
      aria-valuemin={0}
      aria-valuemax={100}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") setPos((p) => Math.max(0, p - 4));
        if (e.key === "ArrowRight") setPos((p) => Math.min(100, p + 4));
      }}
    >
      {/* After (vibrant) — full */}
      <img
        src={image}
        alt={alt ?? ""}
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        style={{ filter: "saturate(1.18) brightness(1.05) contrast(1.03)" }}
        draggable={false}
      />
      {/* Before (dulled) — clipped to the left of the handle */}
      <img
        src={image}
        alt=""
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        style={{ filter: "grayscale(0.55) brightness(0.82) contrast(0.95)", clipPath: `inset(0 ${100 - pos}% 0 0)` }}
        draggable={false}
        aria-hidden
      />

      <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
        Before
      </span>
      <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-brand px-2.5 py-1 text-[11px] font-medium text-brand-fg">
        After
      </span>

      {/* Handle */}
      <div className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-white/90 shadow-[0_0_12px_rgba(0,0,0,0.4)]" style={{ left: `${pos}%` }}>
        <span className="absolute top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-ink shadow-lg">
          <MoveHorizontal className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}
