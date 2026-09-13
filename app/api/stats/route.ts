import { NextResponse } from "next/server";
import companies from "@/data/companies.json";

export const runtime = "nodejs";
// data/companies.json is committed and rewritten by the daily refresh, so this
// can be built with the rest of the site and served from the CDN. It goes stale
// only as fast as the deploy does, which is once a day.
export const dynamic = "force-static";

/**
 * Public read-only summary of the map, for anyone embedding it elsewhere.
 *
 * Scope matches what the Map tab shows by default: startup-tier companies with
 * coordinates, excluding the `company` tier that sits behind the "+ Non-startups"
 * toggle. Anything reading this should get the same numbers a visitor sees.
 *
 * `pts` is deliberately a tuple array rather than objects — it is ~950 rows and
 * the field names would triple the payload for no benefit:
 *
 *   [lat, lng, verified, hiring]
 *
 * `verified` is 1 where the street address was checked against Google Maps and
 * 0 where the pin is a city-level guess derived from a job posting. Consumers
 * must not present a 0 as a confirmed location.
 *
 * `labels` is keyed by index into `pts` and carries [name, area, sector, openJobs]
 * for verified rows only. An approximate pin sits at a generated offset from a
 * city centre, so naming the company under it would claim a precision the data
 * does not have.
 */
export function GET() {
  const rows = companies.filter(
    (c) =>
      c.tier !== "company" &&
      typeof c.lat === "number" &&
      typeof c.lng === "number",
  );

  const labels: Record<number, [string, string, string, number]> = {};
  rows.forEach((c, i) => {
    if (c.approx) return;
    labels[i] = [c.name, c.area ?? "", c.sector ?? "", c.openJobs ?? 0];
  });

  const body = {
    generated: new Date().toISOString().slice(0, 10),
    scope: "startup-tier companies with coordinates",
    total: rows.length,
    verified: rows.filter((c) => !c.approx).length,
    hiring: rows.filter((c) => c.hiring).length,
    openJobs: rows.reduce((n, c) => n + (c.openJobs ?? 0), 0),
    labels,
    pts: rows.map((c) => [
      +c.lat.toFixed(4),
      +c.lng.toFixed(4),
      c.approx ? 0 : 1,
      c.hiring ? 1 : 0,
    ]),
  };

  return NextResponse.json(body, {
    headers: {
      // Public data, no credentials, so any origin may read it.
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
