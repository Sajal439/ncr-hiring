import Link from "next/link";
import { Logo } from "./Logo";
import type { Company } from "@/lib/types";

/** Colour per sector, so the eye learns the categories without reading them. */
const SECTOR_TINT: Record<string, string> = {
  AI: "bg-violet-50 text-violet-700",
  Consumer: "bg-rose-50 text-rose-700",
  D2C: "bg-pink-50 text-pink-700",
  Deeptech: "bg-indigo-50 text-indigo-700",
  Edtech: "bg-sky-50 text-sky-700",
  Fintech: "bg-emerald-50 text-emerald-700",
  Gaming: "bg-fuchsia-50 text-fuchsia-700",
  Healthtech: "bg-teal-50 text-teal-700",
  Logistics: "bg-amber-50 text-amber-700",
  SaaS: "bg-blue-50 text-blue-700",
  Other: "bg-neutral-100 text-neutral-600",
};

function Row({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[13px] text-neutral-600">
      <span aria-hidden className="w-4 shrink-0 text-center text-neutral-400">
        {icon}
      </span>
      <span className="min-w-0 truncate">{children}</span>
    </div>
  );
}

/**
 * One company, as a card.
 *
 * The facts are stacked in a fixed order inside their own panel — place,
 * roles, money, age — so the same line means the same thing on every card and
 * you can compare two of them by looking at one row. That is the part worth
 * borrowing from job boards; the loose paragraph of metadata the previous
 * cards used made every card a small reading exercise.
 */
export function CompanyCard({ company: c, funding }: { company: Company; funding?: string }) {
  return (
    <Link
      href={`/company/${c.slug}`}
      className="group flex h-full flex-col rounded-2xl border border-neutral-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-md"
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
            SECTOR_TINT[c.sector] ?? SECTOR_TINT.Other
          }`}
        >
          {c.sector}
        </span>
        {c.hiring ? (
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white">
            <span className="h-1.5 w-1.5 rounded-full bg-white/80" />
            {c.openJobs} hiring
          </span>
        ) : (
          <span className="text-[11px] font-medium text-neutral-300">not hiring</span>
        )}
      </div>

      <div className="mt-3.5 flex items-start gap-3">
        <Logo name={c.name} domain={c.domain} size={44} rounded="rounded-xl" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-bold leading-tight text-neutral-900 group-hover:underline">
            {c.name}
          </h2>
          <p className="mt-1 text-[11px] font-medium text-neutral-400">
            {c.stage !== "Unknown" ? c.stage : "Stage unknown"}
            {c.tier === "company" ? " · not a startup" : ""}
          </p>
        </div>
      </div>

      {/* Fixed at two lines: a one-line tagline would otherwise pull the
          whole panel up and leave the cards in a row misaligned. */}
      <p className="mt-2.5 line-clamp-2 min-h-[2.6em] text-[13px] leading-relaxed text-neutral-600">
        {c.tagline}
      </p>

      <div className="mt-3.5 flex-1 space-y-1.5 rounded-xl bg-neutral-50 px-3 py-2.5">
        <Row icon="📍">
          {c.area}
          {c.approx ? <span title="City-level guess, not a verified address">~</span> : null}
        </Row>
        <Row icon="💼">
          {c.hiring ? `${c.openJobs} open ${c.openJobs === 1 ? "role" : "roles"}` : "No open roles"}
        </Row>
        {funding ? <Row icon="💰">{funding} raised</Row> : null}
        {c.founded ? <Row icon="📅">Founded {c.founded}</Row> : null}
      </div>

      <span className="mt-3.5 block rounded-xl border border-indigo-200 bg-indigo-50 py-2 text-center text-[13px] font-semibold text-indigo-700 transition group-hover:border-indigo-300 group-hover:bg-indigo-100">
        {c.hiring ? `See ${c.openJobs} ${c.openJobs === 1 ? "role" : "roles"}` : "View company"} →
      </span>
    </Link>
  );
}
