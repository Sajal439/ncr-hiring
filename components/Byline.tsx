import Image from "next/image";
import { SITE } from "@/lib/site";

/**
 * Maker credit, signed the way these city maps usually are.
 *
 * It read as a disclaimer before — grey text in a grey pill, the same weight as
 * the "1,414 companies" chip beside it. One person built this and that is worth
 * a line of type: the photo gives it an anchor, the name carries the weight,
 * and "Built by" stays quiet above it so the eye lands on the name rather than
 * the preposition.
 *
 * A face rather than initials, because the claim being made is that a person
 * stands behind the data — and "AS" in a circle is what software puts there
 * when it does not know who you are.
 */
export function Byline() {
  return (
    <a
      href={SITE.authorUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group pointer-events-auto flex items-center gap-2 rounded-full bg-white/95 py-1 pl-1 pr-3.5 shadow-sm ring-1 ring-black/5 backdrop-blur transition hover:shadow-md hover:ring-black/10"
    >
      <Image
        src="/anmol.png"
        alt=""
        width={96}
        height={96}
        // The ring is what keeps a photograph from bleeding into whichever
        // surface it lands on — the header, the map, a dark page.
        className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-black/10 transition group-hover:ring-[#0A66C2]"
      />

      <span className="flex flex-col leading-none">
        <span className="text-[9px] font-medium uppercase tracking-[0.08em] text-neutral-400">
          Built by
        </span>
        <span className="mt-0.5 text-[13px] font-semibold text-neutral-900">{SITE.author}</span>
      </span>

      {/* Sits at the end as a destination hint rather than a badge — it only
          colours in on hover, when it has become a thing you might click. */}
      <svg
        viewBox="0 0 24 24"
        className="h-3.5 w-3.5 shrink-0 fill-neutral-300 transition group-hover:fill-[#0A66C2]"
        aria-hidden
      >
        <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05a3.74 3.74 0 0 1 3.37-1.85c3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.07 2.07 0 1 1 0-4.13 2.07 2.07 0 0 1 0 4.13zM7.12 20.45H3.55V9h3.57v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z" />
      </svg>
      <span className="sr-only">LinkedIn profile</span>
    </a>
  );
}
