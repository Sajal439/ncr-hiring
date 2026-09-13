import { SITE } from "@/lib/site";
import { ClientOnly } from "@/components/ClientOnly";
import { Explorer } from "@/components/Explorer";
import { SubscribeCard } from "@/components/SubscribeCard";
import { allJobs, areas, companies, fundingAmounts, jobText, news, sectors, stages, stats } from "@/lib/data";

export default function Home() {
  return (
    <>
      {/* Explorer seeds its filters from the query string, which only exists in
          the browser. A Suspense boundary was tried first and broke hydration
          outright — the header rendered but nothing was interactive. */}
      <ClientOnly fallback={<div className="h-dvh bg-neutral-50" />}>
        <Explorer
          companies={companies}
          areas={areas}
          sectors={sectors}
          stages={stages}
          news={news}
          jobText={jobText}
          funding={fundingAmounts}
          jobs={allJobs}
          digest={!!process.env.SUBSCRIBERS_URL}
        />
      </ClientOnly>
      <SubscribeCard enabled={!!process.env.SUBSCRIBERS_URL} />
      {/* Crawlable copy + links; the interactive UI above is client-rendered. */}
      <div className="sr-only">
        <h1>{SITE.name} — jobs at companies hiring across Delhi NCR</h1>
        <p>
          {stats.hiring} companies hiring across Gurugram, Noida, Delhi, Faridabad and
          Ghaziabad, with {stats.openJobs} open roles between them. {stats.startupTier} of
          them are startup-tier. Rebuilt every morning from what they are actually
          advertising.
        </p>
        <ul>
          {companies.map((c) => (
            <li key={c.slug}>
              <a href={`/company/${c.slug}`}>
                {c.name} — {c.tagline}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
