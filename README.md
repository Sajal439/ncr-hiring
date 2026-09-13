# Delhi NCR Startup Map

An interactive map and directory of startups and VC firms across Gurugram, Noida,
Delhi, Faridabad and Ghaziabad. Modelled on
[bangalorestartupmap.com](https://bangalorestartupmap.com), but with a
reproducible data pipeline instead of a hand-maintained database.

**1,279 companies**, filtered two ways.

**By pin accuracy:**

- **268 verified** — real street address and coordinates checked against Google Maps.
- **1,011 approximate** — sourced from live job postings. We know they're hiring in
  Gurugram / Noida / Delhi but haven't confirmed the office address, so they're
  pinned at city level with a deterministic offset and flagged `approx: true`.
  The map draws them as hollow dots and the detail page says so. We never show a
  guessed pin as a verified one.

**By quality tier** (`tier` field), because hiring proves a company is alive but
not that it's a startup — hair clinics and audit firms post jobs too:

- **737 startup-tier** — shown by default.
- **542 other companies** — hiring in NCR but not startup-shaped (consultancies,
  hotels, MNC arms, local firms). Hidden behind the "+ Non-startups" toggle
  rather than deleted, since they are still real and still hiring.

**1,011 are hiring right now, with 1,702 open roles** — a live signal the
Bangalore map fakes with a Google search link.

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind v4
- Leaflet + `leaflet.markercluster`, OpenStreetMap tiles
- No database. `data/companies.json` is committed and read at build time, so every
  company page is statically generated.

## Running it

```bash
npm install
npm run dev
```

## The data pipeline

The dataset is built, not hand-typed. Three inputs, one script:

| File | What it holds | Maintained by |
|---|---|---|
| `scripts/candidates.json` | Company names + guessed city, the input to scraping | You |
| `scripts/raw/p*.tsv` | Google-Maps-verified `name / place / address / lat / lng / domain` | The scrape |
| `scripts/profiles.tsv` | `name / sector / stage / founded / teamSize / tags / tagline` | You |

```bash
node scripts/build-data.mjs   # -> data/companies.json
```

The script drops anything outside the NCR bounding box, derives the `area` facet
from the address text (`lib/areas.ts` holds the same rules for runtime use), and
warns about rows missing a profile.

### Adding companies

1. Append names to `scripts/candidates.json`.
2. Run them through a Google Maps place scraper as
   `"<name> head office <city>"` with `maxPlacesPerSearch: 1` and
   `searchLocations: ["Delhi NCR, India"]`. This project used the Apify actor
   `beatanalytics/google-maps-place-details-scraper` (~$0.002/company).
3. **Review the results** — roughly a third are noise: retail stores instead of
   head offices, or the Bengaluru/Mumbai HQ of a company with no NCR office. Keep
   the good rows in a new `scripts/raw/pN.tsv`.
4. Write a matching row in `scripts/profiles.tsv`.
5. Re-run `node scripts/build-data.mjs`.

## Configuration

| Env var | Purpose |
|---|---|
| `NEXT_PUBLIC_TILE_URL` | Map tile URL template. Defaults to OpenStreetMap. Set a MapTiler/CARTO/Stadia URL with your key before taking real traffic — CARTO watermarks unauthenticated tiles. |
| `SUBMIT_WEBHOOK_URL` | Where `/api/submit` forwards new submissions (Slack/Discord/Zapier). Without it, submissions are logged to the server console. |

## Notes on the approach

Logos come from Google's favicon service (`s2/favicons?domain=…`) with a coloured
letter tile as fallback, so no logo files are stored. "View open jobs" is a Google
search link rather than a scraped job board — the same trick the Bangalore map
uses, and it stays correct for free.

## The jobs pipeline

Job postings turn out to be a better company source than any startup registry:
dead companies don't post jobs, so the quality filter is built in.

```bash
node scripts/build-from-linkedin.mjs   # jobs pull -> map records
node scripts/refresh-jobs.mjs --dry    # free ATS refresh, report only
```

**Discovery** — LinkedIn jobs scrapes (Apify `cheap_scraper/linkedin-job-scraper`,
$0.0007/job, inside Apify's $5/month free allowance) return company name, website,
employee count, founding year, industry, organisation type and description. That
metadata was hand-written for the first 268; now it arrives automatically.

Two pulls so far, deliberately sliced by different job titles because LinkedIn caps
any single search at ~1,000 results:

| Pull | Titles | Jobs | Distinct companies |
|---|---|---|---|
| 01 | 6 (engineering, PM, sales, marketing, ops, data) | 588 | 395 |
| 02 | 15 (design, BD, CS, HR, finance, content, growth, intern, supply chain, QA…) | 2,590 | 1,388 |

Pull 02 hit LinkedIn rate limiting — 5,050 of 8,359 requests failed — so it
returned 2,590 of a requested 4,200. Rate limiting, not budget, is the ceiling.
Add more pulls as `companies-NN.json`; `build-from-linkedin.mjs` merges them all
and sums job counts per company.

**Filtering** — `build-from-linkedin.mjs` drops companies outside NCR, staffing and
recruiting agencies, anything under 10 employees, and anything over 20,000. It then
assigns a quality `tier` from organisation type, headcount, founding year, website
presence and industry. 1,537 raw companies became 1,011 usable, of which 469 are
startup-tier.

**Location** — LinkedIn returns the company's *global HQ*, not its NCR office
(Bacardi resolves to Bermuda, Accenture India to Bengaluru), so those addresses
are unusable. Instead we anchor to a city centroid computed from the 268
Maps-verified points and scatter deterministically around it.

**Refreshing counts** — `refresh-jobs.mjs` uses the free public Greenhouse, Ashby
and Lever board APIs. No key, no credits. But measured coverage is only **~6%**
(4 of 70 sampled), because most Indian startups run careers on Naukri, Keka or
Darwinbox rather than a US-style ATS. Re-running the LinkedIn pull is the
practical way to refresh everything, and it's cheap enough to stay free.

## Pulling the DPIIT / Startup India registry

`scripts/fetch-startupindia.mjs` pulls the official DPIIT-recognised startup
registry from the public search API behind
[startupindia.gov.in](https://www.startupindia.gov.in/content/sih/en/search.html?roles=Startup&page=0).

**It only works from an Indian IP.** The API host `api.startupindiahub.org.in`
times out from foreign cloud runners and CI (verified against both a sandbox and
Apify's cloud browsers — the page shell renders, zero result cards). Run it on
your own machine.

```bash
node scripts/fetch-startupindia.mjs --probe   # one page; prints the field names
node scripts/fetch-startupindia.mjs           # full Delhi pull
```

Start with `--probe`. It prints which fields each record actually carries and
flags any address/lat/lng field, which decides whether these records can be
mapped at all or only listed. If the default request body is rejected, capture
the real one from DevTools into `scripts/si-payload.json` — the script picks it
up automatically. The header comment has the steps.

### Why this isn't just "import 15,000 rows"

Registry entries are keyed on **city, not street address**, so they carry no
coordinates — 15,000 Delhi entries would stack on a single pin unless each is
geocoded through the Maps pipeline above (~$0.002 each, with roughly a third
coming back as retail outlets or non-NCR head offices). DPIIT recognition is also
a self-serve tax and compliance registration rather than a traction signal, so a
large share of the tail is single-person or dormant entities.

Treat the registry as a **directory tier** — searchable, city-level, no pins —
sitting alongside the curated map, rather than as a replacement for it.

## Not built yet

- News feed (RSS from Entrackr / Inc42 / YourStory)
- Paid promotion slots and an ads table
- Newsletter capture
- Persisting `/submit` to a real store rather than a webhook
