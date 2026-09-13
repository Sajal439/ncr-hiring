"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type Option = { value: string; label: string; count?: number };

/**
 * A filter dropdown that takes more than one answer.
 *
 * Not a native `<select multiple>`: that renders as a scrolling list box that
 * takes permanent vertical space, needs ctrl-click to add a second value, and
 * is close to unusable on a phone. A button that opens a panel of checkboxes
 * is the shape people already know from every other filter on the web.
 *
 * The panel is portalled to the body and positioned fixed rather than absolute
 * inside this component. It used to be absolute, and the day the filter row
 * became a horizontal scroller on phones it stopped working entirely: setting
 * `overflow-x: auto` computes `overflow-y` to `auto` as well, so a 40px-tall
 * row clipped a 320px panel to nothing. The button appeared dead — it opened
 * something invisible.
 *
 * A portal has no clipping ancestor by construction, so this cannot happen
 * again the next time something upstream grows an overflow.
 */
export function MultiSelect({
  label,
  allLabel,
  options,
  selected,
  onChange,
}: {
  /** Shown when nothing is picked — phrased as a question. */
  label: string;
  /** Shown on the reset row inside the panel. */
  allLabel: string;
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<{ left: number; top: number; width: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    /**
     * Anchor the panel under the button, in viewport coordinates.
     *
     * Clamped to the screen: on a 375px phone a 260px panel opened under a
     * chip near the right edge would otherwise hang off it, and the chip can
     * be anywhere because the row scrolls.
     */
    const place = () => {
      const b = button.current?.getBoundingClientRect();
      if (!b) return;
      const width = Math.min(260, window.innerWidth - 16);
      setAt({
        left: Math.max(8, Math.min(b.left, window.innerWidth - width - 8)),
        top: b.bottom + 6,
        width,
      });
    };
    place();

    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!root.current?.contains(t) && !panel.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    // Capture, so the panel follows the chip when the filter row itself is
    // scrolled sideways, not only when the page moves.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);

  // One choice reads better as itself than as "1 selected"; past that the
  // names stop fitting and a count is the honest summary.
  const summary =
    selected.length === 0
      ? label
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? selected[0])
        : `${selected.length} selected`;

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={label}
        className={`flex h-9 items-center gap-2 rounded-lg border px-3 text-sm transition ${
          selected.length
            ? "border-indigo-300 bg-indigo-50 font-medium text-indigo-700"
            : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
        }`}
      >
        <span className="max-w-[190px] truncate">{summary}</span>
        <span aria-hidden className={selected.length ? "text-indigo-400" : "text-neutral-400"}>
          ▾
        </span>
      </button>

      {open && at
        ? createPortal(
        <div
          ref={panel}
          style={{ left: at.left, top: at.top, width: at.width }}
          className="fixed z-[900] max-h-[320px] overflow-auto rounded-xl border border-neutral-200 bg-white p-1 shadow-lg"
        >
          <button
            type="button"
            onClick={() => onChange([])}
            className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-neutral-50 ${
              selected.length ? "text-neutral-600" : "font-medium text-neutral-900"
            }`}
          >
            {allLabel}
            {selected.length ? <span className="text-xs text-neutral-400">Clear</span> : null}
          </button>

          <div className="my-1 h-px bg-neutral-100" />

          {options.map((o) => {
            const on = selected.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => toggle(o.value)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-neutral-50"
              >
                <span
                  aria-hidden
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold ${
                    on ? "border-indigo-600 bg-indigo-600 text-white" : "border-neutral-300"
                  }`}
                >
                  {on ? "✓" : ""}
                </span>
                <span className="min-w-0 flex-1 truncate text-neutral-700">{o.label}</span>
                {o.count !== undefined ? (
                  <span className="shrink-0 text-xs text-neutral-400">{o.count}</span>
                ) : null}
              </button>
            );
          })}
        </div>,
        document.body,
      )
        : null}
    </div>
  );
}
