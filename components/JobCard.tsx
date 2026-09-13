import { Logo } from "./Logo";
import type { BoardJob } from "@/lib/data";
import { daysAgo } from "@/lib/dates";

const FN_TINT: Record<string, string> = {
  Engineering: "bg-blue-50 text-blue-700",
  Product: "bg-violet-50 text-violet-700",
  Design: "bg-pink-50 text-pink-700",
  Data: "bg-indigo-50 text-indigo-700",
  Content: "bg-orange-50 text-orange-700",
  Strategy: "bg-emerald-50 text-emerald-700",
  "Sales & Marketing": "bg-rose-50 text-rose-700",
  Operations: "bg-amber-50 text-amber-700",
  Finance: "bg-teal-50 text-teal-700",
  People: "bg-fuchsia-50 text-fuchsia-700",
  Support: "bg-sky-50 text-sky-700",
  Other: "bg-neutral-100 text-neutral-600",
};

const SOURCE_LABEL: Record<string, string> = {
  careers: "company site",
  internshala: "Internshala",
  adzuna: "Adzuna",
  linkedin: "LinkedIn",
  "linkedin-post": "a LinkedIn post",
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

/** "2026-09-02" -> "2d ago". `now` is the viewer's clock, never the build's. */
function age(date: string | undefined, now: number) {
  if (!date) return "";
  const d = daysAgo(date, now);
  if (d <= 0) return "today";
  if (d === 1) return "1d ago";
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

export function JobCard({
  job,
  domain,
  now,
  isStartup,
}: {
  job: BoardJob;
  domain?: string;
  now: number;
  /** Employer is startup-tier. Marked, not shouted — see the note below. */
  isStartup?: boolean;
}) {
  // Two Delhi days, not 48 elapsed hours — otherwise the badge disagrees with
  // the age printed beside it for part of every night.
  const fresh = job.postedAt ? daysAgo(job.postedAt, now) < 2 : false;

  return (
    <a
      href={job.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex h-full flex-col rounded-2xl border border-neutral-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-md"
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
            FN_TINT[job.fn ?? "Other"] ?? FN_TINT.Other
          }`}
        >
          {job.specialty ?? job.fn ?? "Other"}
        </span>
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-neutral-400">
          {job.remote ? (
            <span className="rounded-full bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">
              REMOTE
            </span>
          ) : null}
          {fresh ? (
            <span className="rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
              NEW
            </span>
          ) : null}
          {age(job.postedAt, now)}
        </span>
      </div>

      <div className="mt-3.5 flex items-start gap-3">
        <Logo name={job.company} domain={domain} size={44} rounded="rounded-xl" />
        <div className="min-w-0 flex-1">
          {/* Two lines fixed: role titles vary wildly in length and a one-line
              title would pull the panel up and misalign the row. */}
          <h2 className="line-clamp-2 min-h-[2.5em] text-[15px] font-bold leading-tight text-neutral-900 decoration-neutral-300 group-hover:underline">
            {job.title}
          </h2>
          {/* A quiet mark rather than a badge. Startup-tier is a fifth of the
              board; anything louder would turn every other card into a
              negative statement about the company on it. */}
          <p className="mt-1 flex items-center gap-1 truncate text-[12px] font-medium text-neutral-500">
            <span className="truncate">{job.company}</span>
            {isStartup ? (
              <span title="Startup-shaped: privately held, small enough, founded recently" aria-label="startup">
                🚀
              </span>
            ) : null}
          </p>
        </div>
      </div>

      <div className="mt-3.5 flex-1 space-y-1.5 rounded-xl bg-neutral-50 px-3 py-2.5">
        <Row icon="📍">{job.location || "Delhi NCR"}</Row>
        <Row icon="🎯">
          {[job.level, job.type].filter(Boolean).join(" · ") || "Level not stated"}
        </Row>
        {/* Pay is on 5% of the board, so when it is there it is the most
            valuable line on the card and gets the only colour. */}
        <Row icon="💰">
          {job.salary ? (
            <span className="font-semibold text-emerald-700">{job.salary}</span>
          ) : (
            <span className="text-neutral-400">Not disclosed</span>
          )}
        </Row>
        <Row icon="🔗">via {SOURCE_LABEL[job.source ?? ""] ?? job.source}</Row>
      </div>

      <span className="mt-3.5 block rounded-xl border border-indigo-200 bg-indigo-50 py-2 text-center text-[13px] font-semibold text-indigo-700 transition group-hover:border-indigo-300 group-hover:bg-indigo-100">
        Apply ↗
      </span>
    </a>
  );
}
