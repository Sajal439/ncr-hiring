"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import type { BoardJob } from "@/lib/data";
import { SITE } from "@/lib/site";
// Imported rather than restated — this list had already drifted two roles
// behind the classifier.
import { FUNCTIONS, SENIORITIES } from "@/lib/classify";
import { daysAgo, istDay } from "@/lib/dates";

const LEVELS = SENIORITIES;
const AGES = [
  ["Today", 1],
  ["3 days", 3],
  ["This week", 7],
  ["This month", 30],
] as const;

const SOURCE_STYLE: Record<string, string> = {
  careers: "bg-emerald-50 text-emerald-700",
  internshala: "bg-violet-50 text-violet-700",
  adzuna: "bg-orange-50 text-orange-700",
  linkedin: "bg-sky-50 text-sky-700",
};

/**
 * The viewer's clock, read through an external store.
 *
 * Time-relative output must not be computed during server render: the page is
 * statically generated and the build-time answer would differ from the
 * viewer's, which fails hydration and silently kills every filter on the page.
 * The server snapshot is 0, so the first client render matches the server HTML;
 * React reads the real snapshot right after subscribing and re-renders.
 */
let clientNow = 0;
const clockListeners = new Set<() => void>();

function subscribeClock(onStoreChange: () => void) {
  if (clientNow === 0) {
    clientNow = Date.now();
    for (const listener of clockListeners) listener();
  }
  clockListeners.add(onStoreChange);
  return () => {
    clockListeners.delete(onStoreChange);
  };
}

const getClientNow = () => clientNow;
const getServerNow = () => 0;

function useClientNow() {
  return useSyncExternalStore(subscribeClock, getClientNow, getServerNow);
}

/** "2026-09-02" -> "2d", relative to `now` (0 before hydration). */
function age(date: string | undefined, now: number) {
  if (!date || !now) return "";
  const d = daysAgo(date, now);
  if (d <= 0) return "today";
  if (d === 1) return "1d";
  if (d < 30) return `${d}d`;
  return `${Math.floor(d / 30)}mo`;
}

function Chip({
  label, count, active, onClick,
}: { label: string; count?: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-sm transition ${
        active
          ? "border-indigo-300 bg-indigo-50 font-medium text-indigo-700"
          : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300"
      }`}
    >
      {label}
      {count !== undefined ? (
        <span className={active ? "ml-1.5 text-white/60" : "ml-1.5 text-neutral-400"}>{count}</span>
      ) : null}
    </button>
  );
}

export function JobsBoard({ jobs }: { jobs: BoardJob[] }) {
  const [q, setQ] = useState("");
  const [fn, setFn] = useState<string | null>(null);
  const [level, setLevel] = useState<string | null>(null);
  const [maxAge, setMaxAge] = useState<number | null>(null);
  const [salaryOnly, setSalaryOnly] = useState(false);
  const [limit, setLimit] = useState(60);
  // 0 until hydration, so time-relative output is gated on it.
  const now = useClientNow();

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const re = needle
      ? new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i")
      : null;
    const oldestDay = maxAge && now ? istDay(now) - maxAge + 1 : null;

    return jobs.filter((j) => {
      if (fn && j.fn !== fn) return false;
      if (level && j.level !== level) return false;
      if (salaryOnly && !j.salary) return false;
      if (oldestDay !== null && (!j.postedAt || istDay(Date.parse(j.postedAt)) < oldestDay))
        return false;
      if (!re) return true;
      return re.test(j.title) || re.test(j.company) || re.test(j.location ?? "");
    });
  }, [jobs, q, fn, level, maxAge, salaryOnly, now]);

  return (
    <>
      <div className="sticky top-0 z-10 border-b border-neutral-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/" className="text-sm font-semibold text-neutral-900">
              📍 <span className="hidden sm:inline">{SITE.name}</span>
            </Link>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search roles, companies, areas…"
              className="h-9 min-w-[200px] flex-1 rounded-lg border border-neutral-200 px-3 text-sm outline-none focus:ring-2 focus:ring-neutral-900/10"
            />
            <Link
              href="/"
              className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
            >
              Map
            </Link>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
              Field
            </span>
            {FUNCTIONS.map((f) => (
              <Chip
                key={f}
                label={f}
                count={jobs.filter((j) => j.fn === f).length}
                active={fn === f}
                onClick={() => setFn(fn === f ? null : f)}
              />
            ))}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
              Level
            </span>
            {LEVELS.map((l) => (
              <Chip
                key={l}
                label={l}
                count={jobs.filter((j) => j.level === l).length}
                active={level === l}
                onClick={() => setLevel(level === l ? null : l)}
              />
            ))}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
              Posted
            </span>
            {AGES.map(([label, days]) => (
              <Chip
                key={label}
                label={label}
                active={maxAge === days}
                onClick={() => setMaxAge(maxAge === days ? null : days)}
              />
            ))}
            <Chip
              label="💰 With salary"
              count={jobs.filter((j) => j.salary).length}
              active={salaryOnly}
              onClick={() => setSalaryOnly((v) => !v)}
            />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-4">
        <p className="text-sm text-neutral-500">
          <span className="font-semibold text-neutral-900">{filtered.length.toLocaleString("en-IN")}</span>{" "}
          open {filtered.length === 1 ? "role" : "roles"} in Delhi NCR
        </p>

        <ul className="mt-3 divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200">
          {filtered.slice(0, limit).map((j) => (
            // The job link stretches over the whole row (`after:inset-0`) so the
            // row stays clickable, while the company Link sits above it on its
            // own stacking level. Nesting the two anchors instead is invalid
            // HTML and breaks hydration.
            <li
              key={j.url}
              className="relative flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 transition hover:bg-neutral-50"
            >
              <span className="min-w-0 flex-1">
                <a
                  href={j.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block font-medium text-neutral-900 after:absolute after:inset-0 after:content-['']"
                >
                  {j.title}
                </a>
                <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
                  {j.companySlug ? (
                    <Link
                      href={`/company/${j.companySlug}`}
                      className="relative z-10 font-medium text-neutral-700 hover:underline"
                    >
                      {j.company}
                    </Link>
                  ) : (
                    <span className="font-medium text-neutral-700">{j.company}</span>
                  )}
                  {j.fn ? (
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-neutral-600">{j.fn}</span>
                  ) : null}
                  {j.level ? <span>{j.level}</span> : null}
                  <span>·</span>
                  <span>{j.location}</span>
                  {j.salary ? (
                    <span className="rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-800">
                      {j.salary}
                    </span>
                  ) : null}
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      SOURCE_STYLE[j.source ?? "linkedin"]
                    }`}
                  >
                    {j.source ?? "linkedin"}
                  </span>
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-3 text-xs text-neutral-400">
                {age(j.postedAt, now)}
                <span className="font-medium text-neutral-900">Apply ↗</span>
              </span>
            </li>
          ))}
        </ul>

        {filtered.length > limit ? (
          <button
            onClick={() => setLimit((n) => n + 60)}
            className="mx-auto mt-4 block rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Load {Math.min(60, filtered.length - limit)} more
          </button>
        ) : null}

        {filtered.length === 0 ? (
          <p className="py-16 text-center text-sm text-neutral-500">
            No roles match these filters.
          </p>
        ) : null}
      </div>
    </>
  );
}
