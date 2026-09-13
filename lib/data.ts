import raw from "@/data/companies.json";
import jobsIndex from "@/data/jobs.json";
import standalone from "@/data/open-jobs.json";
import newsFeed from "@/data/news.json";
import fundingIndex from "@/data/funding.json";
import type { Company } from "./types";

export type Job = {
  /** Unique per listing. Only hiring posts need one: several roles can come
   *  from a single post and so share a url. Absent everywhere else. */
  id?: string;
  title: string;
  url: string;
  location: string;
  posted: string;
  type?: string;
  /** Derived seniority: Intern | Junior | Mid | Senior | Lead | Exec. */
  level?: string;
  /** Derived function: Engineering, Product, Design, Data, ... */
  fn?: string;
  /** The narrower label under `fn`, where the title says enough to pick one. */
  specialty?: string;
  /** True only where the listing says so. Absent means not stated, not on-site. */
  remote?: boolean;
  /** Absolute posting date (YYYY-MM-DD), so age stays correct as time passes. */
  postedAt?: string;
  /** When we last confirmed this role was still open. */
  checkedAt?: string;
  /** When this role first reached the board (YYYY-MM-DD). Not the same as
   *  postedAt: a role posted yesterday evening arrives this morning. */
  firstSeen?: string;
  /** Where the listing came from. */
  source?: "careers" | "linkedin" | "internshala" | "adzuna" | "linkedin-post" | "submitted";
  /** Stipend or salary as written by the source, e.g. "₹ 12,000 /month". */
  salary?: string;
  /** For hiring posts, where the post says to apply. The listing links to the
   *  post itself, which has the context; this is what the post asks you to do
   *  once you have read it. */
  applyUrl?: string;
  applyEmail?: string;
};

const jobs = jobsIndex as Record<string, Job[]>;

/** Open roles for a company, freshest first. Empty when we have none. */
export const getJobs = (slug: string): Job[] => jobs[slug] ?? [];

export type NewsItem = { title: string; url: string; date: string; source: string; company?: string };

/** A role as shown on the jobs board — company page roles plus standalone ones. */
export type BoardJob = Job & { company: string; companySlug?: string };
export type Funding = {
  amount?: string;
  round?: string;
  title: string;
  url: string;
  date: string;
  source: string;
  /** Earlier rounds we found for the same company, newest first. */
  history: Omit<Funding, "history">[];
};

export const news = newsFeed as NewsItem[];
const funding = fundingIndex as Record<string, Funding>;

/** Most recent funding round we saw in the news for this company, if any. */
export const getFunding = (slug: string): Funding | undefined => funding[slug];

/**
 * slug -> latest round amount, e.g. "$70 Mn". Passed to the cards on the home
 * page: 157 short strings, which is far cheaper than shipping the whole
 * funding index just to print one line per company.
 */
export const fundingAmounts: Record<string, string> = Object.fromEntries(
  Object.entries(funding)
    .filter(([, f]) => f.amount)
    .map(([slug, f]) => [slug, f.amount as string]),
);

/** Headlines that mention this company. */
export const getNews = (slug: string): NewsItem[] => news.filter((n) => n.company === slug);

/**
 * Searchable text for each company's open roles — titles, functions and
 * seniority. Without this, searching "intern" can only match company names and
 * taglines, so it misses every company actually hiring interns.
 */
export const jobText: Record<string, string> = Object.fromEntries(
  Object.entries(jobs).map(([slug, list]) => [
    slug,
    list.map((j) => `${j.title} ${j.fn ?? ""} ${j.level ?? ""}`).join(" ").toLowerCase(),
  ]),
);

export const companies = raw as Company[];

const bySlug = new Map(companies.map((c) => [c.slug, c]));
export const getCompany = (slug: string) => bySlug.get(slug);

/**
 * Every role in one flat list for the jobs board: roles attached to a mapped
 * company, plus the standalone listings whose employer is not on the map.
 */
export const allJobs: BoardJob[] = [
  ...Object.entries(jobs).flatMap(([slug, list]) =>
    list.map((j) => ({
      ...j,
      company: bySlug.get(slug)?.name ?? slug,
      companySlug: slug,
    })),
  ),
  ...(standalone as BoardJob[]),
].sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? ""));

/** Distinct values for a field, ordered by how many companies carry them. */
function facet(key: "area" | "sector" | "stage"): string[] {
  const counts = new Map<string, number>();
  for (const c of companies) counts.set(c[key], (counts.get(c[key]) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([v]) => v);
}

export const areas = facet("area");
export const sectors = facet("sector");
export const stages = facet("stage");

export const stats = {
  total: companies.length,
  startups: companies.filter((c) => c.type === "startup").length,
  vcs: companies.filter((c) => c.type === "vc").length,
  startupTier: companies.filter((c) => c.tier !== "company").length,
  hiring: companies.filter((c) => c.hiring).length,
  openJobs: companies.reduce((n, c) => n + (c.openJobs ?? 0), 0),
};
