"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";

import { CardGrid } from "./CardGrid";
import { AddYoursCard } from "./AddYoursCard";
import { MultiSelect } from "./MultiSelect";
import { ThemeToggle } from "./ThemeToggle";
import { JobCard } from "./JobCard";
import type { BoardJob } from "@/lib/data";
import { FUNCTIONS, SENIORITIES, SPECIALTIES, type JobFunction } from "@/lib/classify";
import { istDay, istToday } from "@/lib/dates";

type View = "jobs" | "companies" | "map";

/**
 * Imported, not restated. These used to be copied into this file and into
 * JobsBoard, so a role added to the classifier appeared on no filter until
 * someone remembered to add it in two more places.
 */
const JOB_FUNCTIONS = FUNCTIONS;

const JOB_LEVELS = SENIORITIES;

/** And before the submit card. Far enough back that roles come first, near
 *  enough that it is still found — it was below all sixty cards, which is the
 *  same as not being there. */
const MOBILE_SUBMIT_AFTER = 6;

const JOB_AGES = [
  ["Today", 1],
  ["3 days", 3],
  ["This week", 7],
  ["This month", 30],
] as const;
import { NewsPanel } from "./NewsPanel";
import type { Company } from "@/lib/types";
import { SITE } from "@/lib/site";
import type { NewsItem } from "@/lib/data";

// Leaflet touches `window` at import time, so it can never be server-rendered.
const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-neutral-400">
      Loading map…
    </div>
  ),
});

type Props = {
  companies: Company[];
  areas: string[];
  sectors: string[];
  stages: string[];
  news: NewsItem[];
  /** slug -> lowercased text of that company's open roles, for search. */
  jobText: Record<string, string>;
  /** slug -> latest round amount, shown on the cards. */
  funding: Record<string, string>;
  /** Every open role on the board, for the Jobs tab. */
  jobs: BoardJob[];
  /** Whether the digest has somewhere to write. A button that opens a form
   *  which cannot save an address is worse than no button. */
  digest?: boolean;
};

/**
 * Like Select, but each option carries its own label — so the job filters can
 * show how many roles are behind each choice, and "Posted" can map a label to
 * a number of days.
 */
function CountSelect({
  label,
  allLabel,
  value,
  options,
  onChange,
}: {
  label: string;
  /** What the empty option reads as once something is chosen — the way back. */
  allLabel: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className={`h-9 rounded-lg border px-3 text-sm outline-none transition focus:ring-2 focus:ring-neutral-900/10 ${
        value ? "border-indigo-300 bg-indigo-50 font-medium text-indigo-700" : "border-neutral-200 bg-white text-neutral-700"
      }`}
    >
      {/* The question is a prompt, not a choice. Once a filter is on, the same
          option has to read as the way back out of it. */}
      <option value="">{value ? allLabel : label}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-white text-neutral-900">
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Explorer({ companies, areas, sectors, stages, news, jobText, funding, jobs, digest = false }: Props) {
  /**
   * The view and the filters live in the URL, not only in React state.
   *
   * Opening a company and pressing back used to drop you on the map with every
   * filter cleared, however deep into the grid you were. The page remounts on
   * that navigation, so anything held only in useState is gone. Reading the
   * initial values from the query string fixes that, and makes a filtered view
   * something you can send to someone — "Fintech, Noida, hiring now" is a link.
   */
  // Safe to read directly: ClientOnly guarantees this never renders on the server.
  const params = new URLSearchParams(window.location.search);
  const urlView = params.get("view");
  const [view, setView] = useState<View>(
    urlView === "map" ? "map" : urlView === "companies" ? "companies" : "jobs",
  );

  /* ---- Jobs tab filters. Separate from the company ones: they describe
     different things, and carrying a sector filter into a list of roles would
     silently drop most of the board. ---- */
  const list = (k: string) => (params.get(k) ?? "").split(",").filter(Boolean);
  const [fn, setFn] = useState<string[]>(list("fn"));
  const [level, setLevel] = useState<string[]>(list("level"));
  const [maxAge, setMaxAge] = useState(Number(params.get("age") ?? 0));
  const [startupsOnly, setStartupsOnly] = useState(params.get("su") === "1");
  const [specialty, setSpecialty] = useState<string[]>(list("spec"));
  const [remoteOnly, setRemoteOnly] = useState(params.get("remote") === "1");
  const [shown, setShown] = useState(60);

  /**
   * The viewer's clock, not the build's, read once when the component mounts.
   * Reading it during render would make the value change on every re-render;
   * reading it at build time would put the machine's clock in the HTML and
   * fail hydration, which is what once killed every filter on /jobs.
   */
  const [now] = useState(() => Date.now());
  const [q, setQ] = useState(params.get("q") ?? "");
  const [type, setType] = useState<string[]>(list("type"));
  const [area, setArea] = useState<string[]>(list("area"));
  const [stage, setStage] = useState<string[]>(list("stage"));
  const [sector, setSector] = useState<string[]>(list("sector"));
  const [hiringOnly, setHiringOnly] = useState(params.get("hiring") === "1");
  const [showAll, setShowAll] = useState(params.get("all") === "1");

  /**
   * The page size resets whenever the filters change. Held as a key rather than
   * an effect: narrowing 4,125 roles to 12 while "showing" 300 would otherwise
   * leave a stale window, and resetting it in an effect costs an extra render
   * of the old list first.
   */
  const filterKey = [view, q, maxAge, hiringOnly, showAll, startupsOnly, remoteOnly, ...specialty, ...fn, ...level, ...type, ...area, ...stage, ...sector].join("|");
  const [lastKey, setLastKey] = useState(filterKey);
  if (lastKey !== filterKey) {
    setLastKey(filterKey);
    setShown(60);
  }

  /**
   * Written with history.replaceState rather than router.replace: this only
   * needs the address bar to keep up, and going through the router would
   * re-render the whole tree — including the map — on every keystroke.
   */
  useEffect(() => {
    const next = new URLSearchParams();
    if (view !== "jobs") next.set("view", view);
    if (fn.length) next.set("fn", fn.join(","));
    if (level.length) next.set("level", level.join(","));
    if (maxAge) next.set("age", String(maxAge));
    if (startupsOnly) next.set("su", "1");
    if (specialty.length) next.set("spec", specialty.join(","));
    if (remoteOnly) next.set("remote", "1");
    if (q) next.set("q", q);
    if (type.length) next.set("type", type.join(","));
    if (area.length) next.set("area", area.join(","));
    if (stage.length) next.set("stage", stage.join(","));
    if (sector.length) next.set("sector", sector.join(","));
    if (hiringOnly) next.set("hiring", "1");
    if (showAll) next.set("all", "1");
    const qs = next.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [view, q, type, area, stage, sector, hiringOnly, showAll, fn, level, maxAge, startupsOnly, specialty, remoteOnly]);

  /** Same idea as jobPasses, for the company side. */
  const companyPasses = useMemo(() => {
    const needle = q.trim().toLowerCase();
    /**
     * Two strictnesses. Names, sectors and job titles allow a prefix match, so
     * "engineer" finds "Engineering". Free prose (taglines, tags) requires a
     * whole word, otherwise "intern" matches "international" and every global
     * company floods a search for internships.
     */
    const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const prefix = needle ? new RegExp(`\\b${esc}`, "i") : null;
    const exact = needle ? new RegExp(`\\b${esc}\\b`, "i") : null;
    return (c: Company, skip?: "area" | "stage" | "type" | "sector") => {
      if (!showAll && c.tier === "company") return false;
      if (hiringOnly && !c.hiring) return false;
      if (skip !== "type" && type.length && !type.includes(c.type)) return false;
      if (skip !== "area" && area.length && !area.includes(c.area)) return false;
      if (skip !== "stage" && stage.length && !stage.includes(c.stage)) return false;
      if (skip !== "sector" && sector.length && !sector.includes(c.sector)) return false;
      if (!prefix || !exact) return true;
      return (
        prefix.test(c.name) ||
        prefix.test(c.sector) ||
        prefix.test(c.area) ||
        prefix.test(jobText[c.slug] ?? "") ||
        exact.test(c.tagline) ||
        c.tags.some((t) => exact.test(t))
      );
    };
  }, [q, type, area, stage, sector, hiringOnly, showAll, jobText]);

  const filtered = useMemo(() => companies.filter((c) => companyPasses(c)), [companies, companyPasses]);

  const [areaCounts, stageCounts, sectorCounts] = useMemo(() => {
    const tally = (key: "area" | "stage" | "sector") => {
      const m = new Map<string, number>();
      for (const c of companies) if (companyPasses(c, key)) m.set(c[key], (m.get(c[key]) ?? 0) + 1);
      return m;
    };
    return [tally("area"), tally("stage"), tally("sector")] as const;
  }, [companies, companyPasses]);

  /**
   * Roles at startup-tier employers. A standalone listing has no company page
   * and therefore no tier, so it cannot be verified as a startup and is left
   * out when the filter is on — which is the honest reading of "startups only",
   * and matches how the Companies tab already behaves.
   */
  const startupSlugs = useMemo(
    () => new Set(companies.filter((c) => c.tier !== "company").map((c) => c.slug)),
    [companies],
  );

  /**
   * A role passes every active filter except the one named in `skip`.
   *
   * The counts beside each option are what makes this necessary. Counting
   * against the whole board tells you "Intern 284" while the remote filter is
   * on and only ten of those are remote — a number the board will not honour
   * the moment you click it. Counting against everything *else* answers the
   * question the number is actually asked: how many would I have if I added
   * this one too.
   */
  const jobPasses = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const re = needle ? new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i") : null;
    // Delhi days, like every other age on the page.
    const oldestDay = maxAge ? istDay(now) - maxAge + 1 : null;
    return (j: BoardJob, skip?: "fn" | "level" | "age" | "su" | "spec" | "remote") => {
      if (skip !== "su" && startupsOnly && !startupSlugs.has(j.companySlug ?? "")) return false;
      if (skip !== "fn" && fn.length && !fn.includes(j.fn ?? "")) return false;
      if (skip !== "level" && level.length && !level.includes(j.level ?? "")) return false;
      if (skip !== "spec" && specialty.length && !specialty.includes(j.specialty ?? "")) return false;
      if (skip !== "remote" && remoteOnly && !j.remote) return false;
      if (skip !== "age" && oldestDay !== null && (!j.postedAt || istDay(Date.parse(j.postedAt)) < oldestDay))
        return false;
      if (!re) return true;
      return re.test(j.title) || re.test(j.company) || re.test(j.location ?? "");
    };
  }, [q, fn, level, maxAge, now, startupsOnly, startupSlugs, specialty, remoteOnly]);

  const jobsFiltered = useMemo(() => jobs.filter((j) => jobPasses(j)), [jobs, jobPasses]);

  const tally = (list: BoardJob[], key: "fn" | "level") => {
    const m = new Map<string, number>();
    for (const j of list) {
      const v = j[key];
      if (v) m.set(v, (m.get(v) ?? 0) + 1);
    }
    return m;
  };
  const fnCounts = useMemo(() => tally(jobs.filter((j) => jobPasses(j, "fn")), "fn"), [jobs, jobPasses]);
  const levelCounts = useMemo(
    () => tally(jobs.filter((j) => jobPasses(j, "level")), "level"),
    [jobs, jobPasses],
  );
  /**
   * Specialties on offer for whatever is selected. Nothing selected means no
   * second dropdown at all — thirty options under "all fields" is a worse
   * question than the one it is trying to refine.
   */
  /** Companies actually advertising something. `companies` also carries the
   *  ones with no open roles, and the headline was counting those as hiring. */
  const hiringCount = useMemo(() => companies.filter((c) => c.hiring).length, [companies]);

  /**
   * How many roles arrived in the newest batch.
   *
   * Counted by when a role reached the board, not by its posting date, and the
   * difference is not small. The morning pull covers the previous 24 hours, so
   * most of what lands was advertised yesterday — a run that added 694 roles
   * reported 57, because only the handful posted after midnight UTC carried
   * today's date. The chip was telling visitors the board barely moves.
   *
   * Reading the newest date present in the data rather than comparing against
   * a clock also means it can never come back zero, which is what happened
   * every night between the UTC rollover and the morning refresh.
   */
  const fresh = useMemo(() => {
    let newest = "";
    for (const j of jobs) if (j.firstSeen && j.firstSeen > newest) newest = j.firstSeen;
    if (!newest) return { count: 0, isToday: false };
    return {
      count: jobs.filter((j) => j.firstSeen === newest).length,
      isToday: newest === istToday(now),
    };
  }, [jobs, now]);

  const internCount = useMemo(
    () =>
      jobs.filter(
        (j) => /\bintern(ship)?s?\b/i.test(j.title) || /intern/i.test(j.type ?? ""),
      ).length,
    [jobs],
  );

  const specialtyOptions = useMemo(() => {
    const names = fn.flatMap((f) => SPECIALTIES[f as JobFunction] ?? []);
    return [...new Set(names)];
  }, [fn]);

  const specialtyCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const j of jobs) if (j.specialty && jobPasses(j, "spec")) m.set(j.specialty, (m.get(j.specialty) ?? 0) + 1);
    return m;
  }, [jobs, jobPasses]);

  /** slug -> domain, so a role card can show its employer's logo. */
  const domains = useMemo(
    () => Object.fromEntries(companies.filter((c) => c.domain).map((c) => [c.slug, c.domain!])),
    [companies],
  );

  const anyFilter = q || type.length || area.length || stage.length || sector.length || hiringOnly || showAll;
  const anyJobFilter = q || fn.length || level.length || maxAge || startupsOnly || specialty.length || remoteOnly;
  const otherCount = companies.filter((c) => c.tier === "company").length;
  const startupCount = companies.length - otherCount;
  const openJobs = filtered.reduce((n, c) => n + (c.openJobs ?? 0), 0);

  const counts = (
    <>
      <span className="pointer-events-auto rounded-full bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 shadow ring-1 ring-black/5">
        {view === "jobs"
          ? `${jobsFiltered.length.toLocaleString("en-IN")} ${jobsFiltered.length === 1 ? "role" : "roles"}`
          : `${filtered.length} ${filtered.length === 1 ? "company" : "companies"}`}
      </span>
      {view !== "jobs" && openJobs > 0 ? (
        <span className="pointer-events-auto rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow">
          {openJobs} open jobs
        </span>
      ) : null}
      {(view === "jobs" ? anyJobFilter : anyFilter) ? (
        <button
          onClick={() => {
            setQ("");
            setType([]);
            setArea([]);
            setStage([]);
            setSector([]);
            setHiringOnly(false);
            setShowAll(false);
            setFn([]);
            setLevel([]);
            setMaxAge(0);
            setStartupsOnly(false);
            setSpecialty([]);
            setRemoteOnly(false);
          }}
          className="pointer-events-auto rounded-full bg-white px-3 py-1.5 text-xs font-medium text-neutral-500 shadow ring-1 ring-black/5 hover:text-neutral-900"
        >
          Clear filters
        </button>
      ) : null}
    </>
  );

  const searchBox = (
    <div className="relative flex-1">
      <span aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400">
        ⌕
      </span>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={view === "jobs" ? "Search roles, companies, areas…" : "Search startups, sectors, areas…"}
        className="h-11 w-full rounded-xl border border-neutral-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-neutral-400 focus:ring-4 focus:ring-neutral-900/5"
      />
    </div>
  );

  const toggles = (
    <>
      <button
        onClick={() => setHiringOnly((v) => !v)}
        className={`h-9 rounded-full border px-3.5 text-sm font-medium transition ${
          hiringOnly
            ? "border-emerald-600 bg-emerald-600 text-white"
            : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
        }`}
      >
        Hiring now
      </button>
      <button
        onClick={() => setShowAll((v) => !v)}
        title={`Also show ${otherCount} companies that are hiring in NCR but aren't startup-shaped — consultancies, hotels, MNC arms, local firms`}
        className={`h-9 rounded-full border px-3.5 text-sm font-medium transition ${
          showAll
            ? "border-indigo-300 bg-indigo-50 font-medium text-indigo-700"
            : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
        }`}
      >
        + Non-startups
      </button>
    </>
  );

  const dropdowns = (
    <>
      <MultiSelect
        label="Which area?"
        allLabel="All areas"
        selected={area}
        onChange={setArea}
        options={areas.map((a) => ({ value: a, label: a, count: areaCounts.get(a) ?? 0 }))}
      />
      <MultiSelect
        label="Which stage?"
        allLabel="All stages"
        selected={stage}
        onChange={setStage}
        options={stages.map((st) => ({ value: st, label: st, count: stageCounts.get(st) ?? 0 }))}
      />
      <MultiSelect
        label="Startup or VC?"
        allLabel="Both"
        selected={type}
        onChange={setType}
        options={[
          { value: "startup", label: "Startups" },
          { value: "vc", label: "VC firms" },
        ]}
      />
    </>
  );

  /**
   * Sectors are pills rather than a dropdown: there are only eleven of them,
   * it is the filter people reach for first, and a row of them doubles as a
   * table of contents for what the map actually contains. Areas and stages
   * stay as selects — fifty areas would be a wall.
   */
  const sectorPills = (
    <div className="flex flex-wrap gap-1.5">
      <button
        onClick={() => setSector([])}
        className={`h-8 rounded-full px-3 text-[13px] font-medium transition ${
          sector.length === 0 ? "bg-indigo-50 font-medium text-indigo-700 ring-1 ring-indigo-300" : "bg-white text-neutral-600 ring-1 ring-neutral-200 hover:bg-neutral-50"
        }`}
      >
        Every sector
      </button>
      {sectors.map((sc) => (
        <button
          key={sc}
          onClick={() => setSector(sector.includes(sc) ? sector.filter((x) => x !== sc) : [...sector, sc])}
          className={`h-8 rounded-full px-3 text-[13px] font-medium transition ${
            sector.includes(sc)
              ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-300"
              : "bg-white text-neutral-600 ring-1 ring-neutral-200 hover:bg-neutral-50"
          }`}
        >
          {sc}
        </button>
      ))}
    </div>
  );

  const jobFilters = (
    /* One scrolling row on a phone, wrapping only once there is width to wrap
       into. Five controls wrapped to two rows cost 44px and read as a spill;
       in a row they read as a set. -mx-4 px-4 lets the row bleed to both
       edges so the last chip is visibly cut, which is what says "scrollable". */
    <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
      {/* Plain nouns, not questions. "What kind of work?" and "How senior?"
          were friendly the first time and furniture by the third, and a row of
          questions makes the eye read four sentences to find one control.
          The label names what the filter holds; the options answer it. */}
      <MultiSelect
        label="Role"
        allLabel={`All roles (${[...fnCounts.values()].reduce((a, b) => a + b, 0).toLocaleString("en-IN")})`}
        selected={fn}
        onChange={setFn}
        options={JOB_FUNCTIONS.map((f) => ({ value: f, label: f, count: fnCounts.get(f) ?? 0 }))}
      />
      {specialtyOptions.length ? (
        <MultiSelect
          label="Specialisation"
          allLabel="All of them"
          selected={specialty}
          onChange={setSpecialty}
          options={specialtyOptions.map((sp) => ({
            value: sp,
            label: sp,
            count: specialtyCounts.get(sp) ?? 0,
          }))}
        />
      ) : null}
      <MultiSelect
        label="Experience"
        allLabel="Any experience"
        selected={level}
        onChange={setLevel}
        options={JOB_LEVELS.map((l) => ({ value: l, label: l, count: levelCounts.get(l) ?? 0 }))}
      />
      <CountSelect
        label="Posted"
        allLabel="Any time"
        value={maxAge ? String(maxAge) : ""}
        onChange={(v) => setMaxAge(Number(v))}
        options={JOB_AGES.map(([lbl, days]) => ({ value: String(days), label: lbl }))}
      />
      {/* The count is the disclosure. No source carries a workplace field, so
          this is only what listings volunteer in their titles — 22 of 5,228.
          Showing the number stops it reading as "the board has no remote work". */}
      <button
        onClick={() => setRemoteOnly((v) => !v)}
        title="Only listings that say remote in the title. Most listings do not say either way."
        className={`h-9 rounded-lg border px-3.5 text-sm transition ${
          remoteOnly
            ? "border-sky-300 bg-sky-50 font-medium text-sky-700"
            : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
        }`}
      >
        🏠 Remote
        <span className={remoteOnly ? "ml-1.5 text-sky-400" : "ml-1.5 text-neutral-400"}>
          {jobs.filter((j) => j.remote && jobPasses(j, "remote")).length}
        </span>
      </button>
      <button
        onClick={() => setStartupsOnly((v) => !v)}
        title="Only roles at companies that look startup-shaped — the same tier filter the Companies tab uses"
        className={`h-9 rounded-lg border px-3.5 text-sm transition ${
          startupsOnly
            ? "border-indigo-300 bg-indigo-50 font-medium text-indigo-700"
            : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
        }`}
      >
        🚀 Startups only
        <span className={startupsOnly ? "ml-1.5 text-indigo-400" : "ml-1.5 text-neutral-400"}>
          {jobs.filter((j) => startupSlugs.has(j.companySlug ?? "") && jobPasses(j, "su")).length}
        </span>
      </button>
    </div>
  );

  const viewToggle = (
    <div className="flex overflow-hidden rounded-lg border border-neutral-200 bg-white">
      {(["jobs", "companies", "map"] as const).map((v) => (
        <button
          key={v}
          onClick={() => setView(v)}
          className={`h-9 shrink-0 px-2.5 text-sm font-medium capitalize transition sm:px-3 ${
            view === v ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-50"
          }`}
        >
          {v}
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex h-dvh flex-col bg-neutral-50">
      {/* Navigation only. The old header carried the brand, a search box, four
          dropdowns, two toggles and five links on one line; at that density
          nothing reads as more important than anything else. */}
      <header className="z-[1000] flex items-center gap-1.5 border-b border-neutral-200 bg-white px-3 py-2.5 sm:gap-2 sm:px-4">
        {/* The wordmark is the first thing to go when space runs out: on a
            375px screen the pin alone still says where you are, and the three
            controls to its right are what people came to press. */}
        <Link
          href="/"
          className="flex shrink-0 items-center gap-1.5 font-semibold whitespace-nowrap text-neutral-900"
        >
          <span aria-hidden>📍</span>
          <span className="hidden xs:inline">{SITE.name}</span>
        </Link>

        <div className="ml-auto flex min-w-0 items-center gap-1.5">
          {viewToggle}
          <ThemeToggle />
          {/* Permanent way in to the digest. The popup fires once and then sets
              a localStorage flag, so before this there was no route back for
              anyone who had ever closed it. */}
          {digest ? (
          <button
            onClick={() => window.dispatchEvent(new Event("ncr-open-digest"))}
            title="Get tomorrow's new roles at 8am"
            className="hidden h-9 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 hover:text-neutral-900 sm:flex"
          >
            <span aria-hidden>✉️</span>
            <span className="hidden md:inline">Daily digest</span>
          </button>
          ) : null}
        </div>
      </header>

      {view === "map" ? (
        <>
          <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 bg-white px-4 py-2.5">
            <div className="flex min-w-[200px] flex-1">{searchBox}</div>
            <MultiSelect
              label="Which sector?"
              allLabel="All sectors"
              selected={sector}
              onChange={setSector}
              options={sectors.map((sc) => ({ value: sc, label: sc, count: sectorCounts.get(sc) ?? 0 }))}
            />
            {dropdowns}
            {toggles}
          </div>
          <main className="relative min-h-0 flex-1 overflow-hidden">
            <MapView companies={filtered} />
            <NewsPanel items={news} />
            <div className="pointer-events-none absolute bottom-3 left-3 z-[600] flex flex-col items-start gap-2">
              <div className="flex flex-wrap items-center gap-2">{counts}</div>
            </div>
          </main>
        </>
      ) : (
        <main className="min-h-0 flex-1 overflow-auto">
          <div className="mx-auto max-w-7xl px-4 pb-14 pt-7">
            {/**
             * Written for a final-year student on a phone, because that is who
             * this is for.
             *
             * Two earlier drafts failed on the same thing: they were about the
             * board instead of about the reader. "Jobs across Delhi NCR" said
             * nothing, and "We delete the dead ones" was a line the author
             * enjoyed and nobody else understood — it takes knowing how job
             * boards rot before it means anything.
             *
             * So the headline names the reader's actual evening (scrolling
             * LinkedIn, finding nothing) and the sub-line answers the two
             * questions they ask next: is it fresh, and what will it cost me.
             * "No signup" is not a footnote here — it is the difference
             * between this and every site that sells your number to six
             * consultancies.
             */}
            <h1 className="max-w-3xl text-[28px] font-bold leading-[1.15] tracking-tight text-neutral-900 sm:text-[38px]">
              {view === "jobs" ? (
                <>
                  Stop scrolling LinkedIn.{" "}
                  <span className="text-indigo-600">
                    {jobs.length.toLocaleString("en-IN")} NCR jobs, one page.
                  </span>
                </>
              ) : (
                <>
                  {hiringCount.toLocaleString("en-IN")} companies in NCR{" "}
                  <span className="text-indigo-600">are hiring right now.</span>
                </>
              )}
            </h1>

            <p className="mt-2.5 max-w-2xl text-[15px] leading-relaxed text-neutral-500">
              {view === "jobs" ? (
                <>
                  Jobs and internships from LinkedIn, company career pages and job sites — all
                  collected here every morning.
                  <span className="hidden sm:inline">
                    {" "}
                    You don&rsquo;t have to go anywhere else, and you don&rsquo;t have to sign up
                    to anything.
                  </span>
                </>
              ) : (
                <>
                  {startupCount.toLocaleString("en-IN")} of them are startups. See exactly where
                  each one sits on the map.
                  <span className="hidden sm:inline">
                    {" "}
                    Rebuilt every morning from what they are actually advertising, not from what
                    they told a directory two years ago.
                  </span>
                </>
              )}
            </p>

            {/* Plain words, no adjectives. Every one of these is a number or a
                fact on this page, so a reader can check it in ten seconds. */}
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px] text-neutral-500">
              <span className="flex items-center gap-1.5">
                <span aria-hidden>🚫</span>
                <span>
                  <span className="font-medium text-neutral-900">No login, no signup</span> — no
                  spam calls
                </span>
              </span>
              {fresh.count ? (
                <span className="flex items-center gap-1.5">
                  <span aria-hidden>⚡</span>
                  <span>
                    <span className="font-medium text-neutral-900">
                      {fresh.count.toLocaleString("en-IN")} added{" "}
                      {fresh.isToday ? "today" : "in the last refresh"}
                    </span>{" "}
                    — new ones every morning
                  </span>
                </span>
              ) : null}
              {internCount ? (
                <span className="flex items-center gap-1.5">
                  <span aria-hidden>🎓</span>
                  <span>
                    <span className="font-medium text-neutral-900">
                      {internCount.toLocaleString("en-IN")} internships
                    </span>{" "}
                    for freshers
                  </span>
                </span>
              ) : null}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              {searchBox}
              {view === "companies" ? toggles : null}
            </div>

            {view === "jobs" ? (
              <div className="mt-3.5">{jobFilters}</div>
            ) : (
              <>
                <div className="mt-3.5">{sectorPills}</div>
                <div className="mt-3 flex flex-wrap items-center gap-2">{dropdowns}</div>
              </>
            )}

            <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-neutral-200 pt-5">
              <div className="flex flex-wrap items-center gap-2">{counts}</div>
            </div>

            {/* No items-start: the aside has to stretch to the content's height,
                or the sticky panel inside it has no travel and scrolls away. */}
            <div className="mt-4 flex gap-6">
              <div className="min-w-0 flex-1">
              {view === "jobs" ? (
                jobsFiltered.length === 0 ? (
                  <p className="px-4 py-24 text-center text-sm text-neutral-500">
                    No roles match these filters.
                  </p>
                ) : (
                  <>
                    <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
                      {jobsFiltered.slice(0, shown).map((j, i) => (
                        /* id, not url: several roles can share one hiring
                           post, and they used to be told apart by a #slug on
                           the end of the link — which then showed up in the
                           address bar of anyone who clicked. */
                        <Fragment key={j.id ?? j.url}>
                          {/* Narrow screens have no sidebar, so the slots used
                              to sit above the grid — 334px of them, which on a
                              375px phone pushed the first Apply button to
                              769px and left a jobs board showing no jobs on
                              its first screen. Two cards up, so a role is the
                              first thing seen and the slot is still the next
                              thing scrolled to. */}

                          {i === MOBILE_SUBMIT_AFTER ? (
                            <div className="col-span-full min-w-0 lg:hidden">
                              <AddYoursCard />
                            </div>
                          ) : null}
                          <JobCard
                            job={j}
                            domain={domains[j.companySlug ?? ""]}
                            now={now}
                            isStartup={startupSlugs.has(j.companySlug ?? "")}
                          />
                        </Fragment>
                      ))}
                    </div>

                    {/* Four thousand cards at once is a second of jank and a
                        hundred megabytes of DOM; nobody scrolls that far. */}
                    {shown < jobsFiltered.length ? (
                      <button
                        onClick={() => setShown((n) => n + 60)}
                        className="mx-auto mt-6 block rounded-xl border border-neutral-200 bg-white px-5 py-2.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
                      >
                        Show 60 more · {(jobsFiltered.length - shown).toLocaleString("en-IN")} left
                      </button>
                    ) : null}
                  </>
                )
              ) : (
                <>
                  <CardGrid companies={filtered.slice(0, shown)} funding={funding} />
                  {shown < filtered.length ? (
                    <button
                      onClick={() => setShown((n) => n + 60)}
                      className="mx-auto mt-6 block rounded-xl border border-neutral-200 bg-white px-5 py-2.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
                    >
                      Show 60 more · {(filtered.length - shown).toLocaleString("en-IN")} left
                    </button>
                  ) : null}
                </>
              )}
              </div>

              <aside className="hidden w-[260px] shrink-0 lg:block">
                <div className="sticky top-4 space-y-3">
                  <AddYoursCard />
                </div>
              </aside>
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
