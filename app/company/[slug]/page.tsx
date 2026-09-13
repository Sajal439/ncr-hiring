import { SITE } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/Logo";
import { companies, getCompany, getFunding, getJobs, getNews } from "@/lib/data";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return companies.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const c = getCompany((await params).slug);
  if (!c) return {};
  return {
    title: c.name,
    description: c.tagline,
    alternates: { canonical: `/company/${c.slug}` },
    openGraph: { title: `${c.name} — ${SITE.name}`, description: c.tagline },
  };
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-t border-neutral-100 py-3 sm:grid-cols-[160px_1fr] sm:gap-4">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">{label}</dt>
      <dd className="text-sm text-neutral-800">{children}</dd>
    </div>
  );
}

export default async function CompanyPage({ params }: Props) {
  const c = getCompany((await params).slug);
  if (!c) notFound();

  const jobs = getJobs(c.slug);
  const funding = getFunding(c.slug);
  const mentions = getNews(c.slug);
  const jobsUrl = `https://www.google.com/search?q=${encodeURIComponent(`${c.name} Gurgaon Noida Delhi careers jobs`)}`;
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}`;

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← All companies
      </Link>

      <header className="mt-6 flex items-start gap-4">
        <Logo name={c.name} domain={c.domain} size={64} rounded="rounded-xl" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{c.name}</h1>
            <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-600">
              {c.stage}
            </span>
            {c.type === "vc" ? (
              <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
                VC
              </span>
            ) : null}
            {c.hiring ? (
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                {c.openJobs} open {c.openJobs === 1 ? "role" : "roles"}
              </span>
            ) : null}
            {funding?.amount ? (
              <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-700">
                Raised {funding.amount}
                {funding.round ? ` · ${funding.round}` : ""}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-neutral-600">{c.tagline}</p>
        </div>
      </header>

      <div className="mt-5 flex flex-wrap gap-2">
        {c.domain ? (
          <a
            href={`https://${c.domain}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            {c.domain} ↗
          </a>
        ) : null}
        {c.careersUrl ? (
          <a
            href={c.careersUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-neutral-200 px-3.5 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Careers page ↗
          </a>
        ) : jobs.length === 0 ? (
          <a
            href={jobsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-neutral-200 px-3.5 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Search for jobs ↗
          </a>
        ) : null}
        <a
          href={mapUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-neutral-200 px-3.5 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Open in Maps ↗
        </a>
      </div>

      {c.about ? <p className="mt-7 leading-relaxed text-neutral-700">{c.about}</p> : null}

      {jobs.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            {jobs.length} open {jobs.length === 1 ? "role" : "roles"} in Delhi NCR
          </h2>
          <ul className="mt-3 divide-y divide-neutral-100 rounded-xl border border-neutral-200">
            {jobs.map((j) => (
              <li key={j.url}>
                <a
                  href={j.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 transition hover:bg-neutral-50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-neutral-900">{j.title}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
                      {j.fn ? (
                        <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-medium text-neutral-700">
                          {j.fn}
                        </span>
                      ) : null}
                      {j.level ? <span className="text-neutral-400">{j.level}</span> : null}
                      {j.salary ? (
                        <span className="rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-800">
                          {j.salary}
                        </span>
                      ) : null}
                      <span className="text-neutral-300">·</span>
                      <span>{j.location}</span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          j.source === "careers"
                            ? "bg-emerald-50 text-emerald-700"
                            : j.source === "internshala"
                              ? "bg-violet-50 text-violet-700"
                              : j.source === "adzuna"
                                ? "bg-orange-50 text-orange-700"
                                : "bg-sky-50 text-sky-700"
                        }`}
                      >
                        {j.source === "careers"
                          ? "careers page"
                          : j.source === "internshala"
                            ? "Internshala"
                            : j.source === "adzuna"
                              ? "Adzuna"
                              : "LinkedIn"}
                      </span>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3 text-xs text-neutral-400">
                    {j.posted}
                    <span className="font-medium text-neutral-900">Apply ↗</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-neutral-400">
            Roles link straight to the original posting — the company&apos;s own careers page
            where we could reach it, LinkedIn otherwise.
          </p>
        </section>
      ) : null}

      {funding && (funding.amount || funding.round) ? (
        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Funding
          </h2>
          <ul className="mt-3 space-y-2">
            {[funding, ...funding.history].map((f) => (
              <li key={f.url} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-medium text-neutral-900">
                  {[f.amount, f.round].filter(Boolean).join(" · ") || "Round"}
                </span>
                <span className="text-xs text-neutral-400">
                  {f.date ? new Date(f.date).toLocaleDateString("en-IN", { month: "short", year: "numeric" }) : ""}
                </span>
                <a
                  href={f.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-neutral-500 underline-offset-2 hover:underline"
                >
                  {f.source} ↗
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-neutral-400">
            Parsed from Entrackr and Inc42 coverage — recent rounds, not a complete history.
          </p>
        </section>
      ) : null}

      {mentions.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            In the news
          </h2>
          <ul className="mt-3 space-y-2">
            {mentions.map((n) => (
              <li key={n.url}>
                <a
                  href={n.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-neutral-800 underline-offset-2 hover:underline"
                >
                  {n.title}
                </a>
                <span className="ml-2 text-xs text-neutral-400">{n.source}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <dl className="mt-7">
        <Row label="Sector">{c.sector}</Row>
        {c.stage !== "Unknown" ? <Row label="Stage">{c.stage}</Row> : null}
        {c.tags.length ? <Row label="Tags">{c.tags.join(", ")}</Row> : null}
        <Row label="Area">{c.area}</Row>
        <Row label={c.approx ? "Location" : "Address"}>
          {c.address}
          {c.approx ? (
            <span className="mt-1 block text-xs text-neutral-500">
              Approximate — placed at city level. We know this company is hiring in{" "}
              {c.area} but haven&apos;t verified its exact office address yet.
            </span>
          ) : null}
        </Row>
        {c.founded ? <Row label="Founded">{c.founded}</Row> : null}
        {c.teamSize ? <Row label="Team size">{c.teamSize}</Row> : null}
      </dl>

      <p className="mt-10 text-xs text-neutral-400">
        Something wrong or out of date?{" "}
        <Link href="/submit" className="underline hover:text-neutral-700">
          Send a correction
        </Link>
        .
      </p>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Organization",
            name: c.name,
            description: c.tagline,
            url: c.domain ? `https://${c.domain}` : undefined,
            foundingDate: c.founded ? String(c.founded) : undefined,
            address: { "@type": "PostalAddress", streetAddress: c.address, addressCountry: "IN" },
            geo: { "@type": "GeoCoordinates", latitude: c.lat, longitude: c.lng },
          }),
        }}
      />
    </div>
  );
}
