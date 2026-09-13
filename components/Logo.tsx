"use client";

import { useState } from "react";

/** Deterministic colour so a company keeps the same fallback tile everywhere. */
const COLORS = [
  "#e11d48", "#db2777", "#9333ea", "#4f46e5", "#2563eb",
  "#0891b2", "#059669", "#65a30d", "#ea580c", "#dc2626",
];

function colorFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return COLORS[Math.abs(h) % COLORS.length];
}

export function Logo({
  name,
  domain,
  size = 40,
  rounded = "rounded-lg",
}: {
  name: string;
  domain?: string;
  size?: number;
  rounded?: string;
}) {
  const [failed, setFailed] = useState(false);
  const letter = name.replace(/[^A-Za-z0-9]/g, "").charAt(0).toUpperCase() || "?";

  if (!domain || failed) {
    return (
      <div
        className={`${rounded} flex shrink-0 items-center justify-center font-semibold text-white`}
        style={{ width: size, height: size, background: colorFor(name), fontSize: size * 0.45 }}
        aria-hidden
      >
        {letter}
      </div>
    );
  }

  return (
    // Google's favicon service covers almost every company without us hosting
    // files. next/image would proxy 268 third-party favicons through the
    // optimizer for no benefit, so a plain <img> is the right call here.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://www.google.com/s2/favicons?domain=${domain}&sz=128`}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`${rounded} shrink-0 bg-white object-contain ring-1 ring-black/5`}
      style={{ width: size, height: size }}
    />
  );
}
