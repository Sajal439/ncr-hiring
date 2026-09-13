# Project context

Working notes for **NCR Hiring** (renamed from "Delhi NCR Startup Map", 5 Sep). Written so a new session — or a
future you — can pick this up without re-deriving anything. `README.md` covers
how to run things; this covers *why things are the way they are*.

Last updated: 5 Sep 2026

---

## What this is

An interactive map + jobs board for startups hiring across Delhi NCR, modelled
on [bangalorestartupmap.com](https://bangalorestartupmap.com) but with an
automated pipeline instead of hand entry.

**Live:** https://delhi-ncr-startup-map.vercel.app
**Repo:** https://github.com/Anmolas1402/delhi-ncr-startup-map (private)

**The bet:** the differentiator is *place* + *live hiring data*. Nobody else can
tell you what's being built in Sector 62 Noida, or which of those companies is
hiring today.

---

## Current state

| | |
|---|---|
| Companies | **1,414** (739 startup tier, 675 other) |
| Roles on company pages | **2,206** |
| Standalone roles (employer not on the map) | 1,919 |
| **Jobs board total** | **4,125** |
| Roles with salary/stipend | 226 (5.5%) — 166 Internshala, 60 Adzuna |
| Companies hiring right now | 1,212 of 1,414 |
| Companies with a careers-page link | 889 |
| Funding rounds | 346 across 157 companies |
| Verified map pins | 268 · approximate 1,146 |

Roles by source across the whole board: LinkedIn 1,896 · Adzuna 1,776 ·
Internshala 355 · career pages 98. Nothing on the board is older than 30 days —
`validate-jobs.mjs` is doing its job.

By function: Sales & Marketing 1,315 · Engineering 1,161 · **Other 820** ·
Operations 432 · Design 365 · Data 212 · Content 182 · Finance 168 · People 160
· Support 159 · Product 90 · Education 70 · Strategy 67 · Healthcare 27.

Engineering carries a second level, because "1,161 roles" is not a category you
can shop in: Enterprise & ERP 145 · QA & Testing 106 · Full-stack 84 · Security
67 · DevOps & Cloud 61 · IT support & infra 56 · Backend 52 · Frontend 42 ·
Embedded 15 · Mobile 13, with ~520 left as general engineering because
"Software Engineer" genuinely does not say more than that. Sales & Marketing
splits the same way. A second dropdown appears only once a function is picked —
thirty options under "all fields" is a worse question than the one it refines.

---

## Pages

| Route | What |
|---|---|
| `/` | Three tabs — **Jobs** (default), **Companies**, **Map**. Search, multi-select filters, sponsor sidebar. |
| `/jobs` | The older dense board. Still live because the digest links to it, but now a weaker duplicate of the Jobs tab. |
| `/company/[slug]` | 1,414 static pages: roles, funding history, news, address |
| `/advertise` | Sponsor slots — ₹999 flash / ₹1,999 tile, UPI + creative upload |
| `/coffee` | Tip jar. UPI, three tiers plus a custom amount. |
| `/submit` | List a startup **or** a job. Goes to a sheet as `pending`. |
| `/unsubscribe` | One-click, reached from the digest footer |

### Why jobs, not the map

The map was the front door and it asks a question most visitors do not have
yet. Nobody's first question is "which startups exist in Noida"; it is "what
can I apply to". So the board opens on 4,125 roles as cards, the company list
is the second tab, and the map is the third. `?view=map` still lands there.

Every filter is a multi-select and every one of them lives in the query string,
so a filtered view is a link you can send, and pressing back from a company
page returns you to exactly where you were. That last part was a real bug: the
page remounts on that navigation, so anything held only in `useState` is gone.

---

## Architecture

Next.js 16 App Router + Tailwind v4 + Leaflet. **No database** — `data/*.json`
is committed and read at build time, so every page is static.

```
data/companies.json   the map + directory
data/jobs.json        slug -> roles for companies on the map
data/open-jobs.json   roles whose employer is NOT on the map
data/funding.json     slug -> funding history
data/news.json        homepage news feed
data/sponsors.json    paid slots (hand-edited)
```

All generated except `sponsors.json`. Never hand-edit the rest — change the
inputs and re-run the build scripts.

### Two-tier companies

`tier: "startup" | "company"`. Hiring is a good liveness signal but a poor
startup signal — hair clinics and audit firms post jobs too. The UI shows the
startup tier by default with a "+ Non-startups" toggle.

Rules (org type, headcount, founding year, industry, name patterns) plus
**`scripts/overrides.json`** for hand corrections. Rules can't catch every
consultancy; the override file is the escape hatch.

### Two-tier pins

`approx: true` means a city-level guess. LinkedIn returns a company's *global*
HQ (Bacardi → Bermuda, Accenture India → Bengaluru), so those are anchored to a
city centroid computed from the 268 Maps-verified points, with deterministic
scatter. Approximate pins render **hollow**, show `Gurugram~`, and say so on the
detail page. Never present a guess as verified.

### What the sources do not carry

No source has a workplace-type field. LinkedIn's `workType` is the job function
("Engineering and Information Technology"), not the arrangement; Adzuna and
Internshala have nothing at all. So the Remote filter matches only titles that
volunteer it — **22 of 5,228** — and the toggle shows that count on purpose. A
missing flag means "not stated", never "on-site", and 22 with the number
visible is honest where a bare "Remote" toggle would imply the board has almost
no remote work.

### Standalone jobs

Only 37 of 269 Internshala employers and 161 of 649 Adzuna employers matched a
mapped company. The rest are micro-agencies ("ALL MAN", "Positive Mantra
Consulting") — adding them as map companies would undo the tiering, so their
listings go to `open-jobs.json` and surface on `/jobs` only.

---

## Pipeline

```bash
node scripts/build-from-linkedin.mjs   # raw -> companies.json
npx tsx scripts/build-jobs.mjs         # jobs.json (needs tsx: imports lib/classify.ts)
node scripts/fetch-news.mjs            # news.json + funding.json
```

| Script | Does | Cost |
|---|---|---|
| `fetch-linkedin.mjs` | 24h delta via Apify REST, hard spend cap | **paid** |
| `fetch-adzuna.mjs` | Adzuna API, 5 NCR cities | free |
| `fetch-internshala.mjs` | Internshala scrape — the only source with stipends | free |
| `discover-careers.mjs` | Crawls company sites for careers pages + ATS slugs | free |
| `fetch-ats-jobs.mjs` | Greenhouse/Lever/Ashby/Workable/Recruitee/SmartRecruiters | free |
| `fetch-spa-jobs.mjs` | Headless Chromium for JS-only boards (Keka, Darwinbox) | free |
| `fetch-archive.mjs` | Entrackr sitemaps + Inc42 API → 13,115 articles | free |
| `fetch-news.mjs` | RSS + archive → news feed and funding history | free |
| `fetch-hr-posts.mjs` | "We're hiring" posts by people at mapped companies, every 3 days | **paid** |
| `validate-jobs.mjs` | Verifies roles are still open; rolling batch of 400 | free |
| `build-from-linkedin.mjs` · `build-jobs.mjs` · `build-data.mjs` | Merge, filter, tier, classify | free |

---

## Daily refresh

`.github/workflows/refresh.yml` — 07:30 IST daily, on GitHub's servers, laptop
irrelevant. Validate → Internshala → Adzuna → career pages → LinkedIn → rebuild
→ sanity check → digest → commit → Vercel redeploys.

That last step was a lie until 4 Sep. The Vercel project had **no Git
repository connected** — it was created by a CLI deploy and had never been
wired to GitHub, so every refresh commit since this workflow was written landed
in the repo and stopped there. The run went green, the sanity check passed, the
data was committed, and production kept serving whatever the last manual
`vercel` deploy had built. Caught only by noticing that the live `/unsubscribe`
route 404ed and the live board still showed the pre-Apify-fix numbers. The repo
is connected now; a push deploys.

**Secrets required:** `APIFY_TOKEN`, `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`.

The sanity check fails the run if companies or roles drop below 500, so a broken
scrape can't overwrite good data with an empty file.

### Apify 401 — fixed 4 Sep

For a week the LinkedIn step returned `HTTP 401 user-or-token-not-found` on
every run, including after a token rotation. The stored secret was simply not
valid for any account; a fresh token set with `printf` (not `echo`) fixed it.
First fully green run: **401 jobs for $0.30**, `all sources ok`.

What made this take a week is worth keeping: **Apify answers a dead token and a
good token pasted with a trailing newline identically.** There was nothing in
the logs to tell the two apart, and each attempt to check cost a fifteen-minute
round trip, because the LinkedIn step sits thirteen minutes into the refresh.

Both halves are now fixed:

- `scripts/check-apify.mjs` prints the token's *shape* — length, whether
  trimming changed it, whether the `apify_api_` prefix is there — before it
  prints Apify's answer. It never prints the token, and costs nothing.
- The **Check Apify token** workflow runs it against the real secret from the
  Actions tab in about twenty seconds.
- `fetch-linkedin.mjs` trims the token, so the newline case can no longer
  happen at all.

Always set the secret with `printf`, which appends nothing:

```bash
printf %s "apify_api_..." | gh secret set APIFY_TOKEN
```

### Where form submissions go

Both forms write to the same Apps Script web app, which owns one Google Sheet:

- `subscribers` tab — the digest list. `/api/subscribe` and `/api/unsubscribe`.
- `ads` tab — `/advertise` submissions, one row each, plus a Drive folder
  ("NCR Startup Map - ad uploads") holding the creative and the payment
  screenshot, linked from the row.

`/api/advertise` used to try Resend, then a webhook, then `console.log` — and
neither of the first two was ever configured in production, so every ad
submission went into a Vercel function log and vanished while the form told the
advertiser it had worked. Harmless when nothing was for sale; not once the
slots were priced. It now errors in production rather than pretending, and only
logs in development.

`DriveApp` needs a scope that deploying does not grant. `authorizeDrive()`
exists to be run once from the Apps Script editor for exactly that. Until it is
approved, submissions carrying an image fail while ones without succeed, which
reads like a broken upload rather than a missing permission — the error is only
visible in the script's own Executions log, not in the response.

### Sending without a domain

The digest sends over **Gmail SMTP**, not Resend. Resend is the better product —
bounce handling, analytics, batch sends — but its shared `onboarding@resend.dev`
sender only delivers to the account holder's own address, so it cannot reach a
single subscriber until a domain is bought and verified. A domain was not worth
buying to unblock a list with no subscribers on it yet.

Gmail gives ~500 recipients/day from a dedicated account, which is far above
what this list needs now. `send-digest.mjs` picks its transport from whichever
credentials exist and prefers SMTP, so moving to Resend later is two env vars
and no code. `--cap` (default 450) refuses to start a run that would exceed the
daily limit: a half-sent digest is worse than a late one.

`SMTP_PASS` is a Google **app password**, not the account password. It needs
2-Step Verification switched on first.

## Costs

Apify free tier is $10/month (it was $5 when this was first written).
Only the LinkedIn step spends anything.

Measured 4 Sep: a 24-hour NCR sweep returned **693 jobs for $0.49**, with 1,338
of 2,158 requests failing to LinkedIn throttling — so 693 is a floor.

| Setting | $/month | After $5 credit |
|---|---|---|
| `--budget=0.90` daily (**current**) | up to $27 | ~₹1,950 worst case, ~₹860 typical |
| `--budget=0.30` every 2 days | $4.50 | **₹0** |
| Daily *full* re-sweep | $54 | rejected — re-downloads everything |

**918+ roles already arrive free** from Adzuna, Internshala and career pages, so
a ₹0 configuration is a real option, not a compromise.

Decided against going national: ~$14–21/sweep, and the map is meaningless at
national zoom. City-by-city instead — each city is its own ~$2 sweep.

---

## Sources: what works, what doesn't

**Works**

- **LinkedIn jobs** via Apify `cheap_scraper/linkedin-job-scraper`, $0.0007/job.
  Returns website, headcount, founding year, industry and description.
- **Adzuna** — free API. 649 listings/sweep, 161 matched to mapped companies.
  Salary coverage in India is poor (3%), despite being good elsewhere.
- **Internshala** — free scrape, no key. **The salary source: 46% have stipends.**
- **Entrackr** — one sitemap per day (3,000+); headlines recover from slugs.
  Their `/wp-json` is Cloudflare-redirected, so use sitemaps.
- **Inc42** — WordPress REST API fully open.
- **Greenhouse / Ashby / Lever / Workable / Recruitee / SmartRecruiters** — public JSON.
- **Keka** — JS-only, needs headless Chromium. Works.

### Hiring posts: search by company, not by keyword

A broad `hiring Gurgaon` search was tried first and measured on 120 real posts:
41 came from recruitment-agency headlines, 21 were bulk BPO/factory hiring, and
only **20 authors were founders or in-house leaders**. Filtering that afterwards
means paying $0.002 for every post you then throw away — 83% of the spend buys
noise.

`authorsCompanies` on `harvestapi/linkedin-post-search` moves the filter to
before the invoice: it returns only posts by people who work at named
companies, and the names come from the map itself. A recruiter at "ABC
Staffing" is not an employee of anything on this map, so they never enter the
dataset. The list widens on its own as the map grows.

Measured on the same 120 posts, for anyone tempted to add an LLM extraction
pass: **only 27% of the posts that survive screening mention pay at all**, and
the regexes already find 16%. The ceiling is 27%, not "near-perfect" — an LLM
cannot extract what was never written. The real gap is titles: only 28 of 44
kept posts yield one, and that is where an extraction pass would earn its keep.

82% carry an email, phone or link in the post body, so comment scraping is off
— it costs the same $0.002 per comment to recover the other 18%.

**The mapped pass has an obvious hole**, so there are two. Listening only to
companies on the map cannot reach a startup the crawlers never found, which is
the main reason to read hiring posts at all. `--mode=discover` drops the company
filter and narrows on the author's headline instead (founder, co-founder, CEO,
head of people — not "recruiter" or "talent acquisition"). It is less precise,
and screenHrPost discards more of it.

Its real output is not roles. Any employer in a kept post that is not already on
the map goes to `scripts/raw/posts/candidates.json` with a seen-count — a list
of companies hiring in NCR that no other part of this pipeline can produce. That
is the loop that grows the map.

`authorsIndustryId` would sharpen the discovery pass further (recruiters sit in
their own LinkedIn industry), but the two lookups of HarvestAPI's code list
disagreed on what ID 11 is, so it stays an unset `--industries` flag. Verify
against the CSV before trusting any ID.

#### What the first real run actually showed (40 companies, $0.096)

The prediction above — that filtering by company moves the filter ahead of the
invoice and makes this ~17× cheaper — **did not survive contact with the data**:

```
50 posts fetched, $0.096
kept 6:  25 not-ncr · 15 agency · 2 bulk-hiring · 2 no-apply-route
4 of the 6 had a parseable title
```

Three things were wrong:

1. **not-NCR was the dominant loss, not agency.** `authorsCompanies` filters on
   where the *author works*, not where the role is, so an NCR company's
   Bangalore opening comes back and is billed. Fixed by putting the city in the
   query — untested, and the next run should be measured against these numbers.
2. **The company filter is not structural.** The actor matches "employees *or
   ex-employees*", so 15 agency posts still arrived. A recruiter who once
   worked at a mapped company still matches it.
3. **The post item carries no company at all** — only author name and headline.
   Getting one properly means `profileScraperMode: "main"`, a second $0.002
   event per post, doubling the cost. Headlines yield it for free 33% of the
   time; the rest cannot be matched to a mapped company or become a candidate.

Measured cost per *usable* role: **$0.024** — roughly what the broad keyword
search it was meant to replace would cost. Do not widen the company list on the
strength of the argument alone; re-run 40 companies with the city query first
and compare against the block above.

**Doesn't**

- **Startup India / DPIIT** — `api.startupindiahub.org.in` unreachable from
  outside India *and* from this Mac. Even working: 20,745 Delhi entries at
  district-level location only, mostly one-person LLPs.
- **Crunchbase** 403 · **Tracxn** JS SPA · **Wikipedia** covers ~4% (3 of 70).
- **Darwinbox** — renders, but returned no NCR roles from 11 boards.
- **schema.org JobPosting** on careers pages — 1 of 40.
- **Arbeitnow / Remotive** — free, but 1 India job out of 175.
- **LinkedIn HR text posts** — works ($0.002/post) but ~1 in 8 is a real startup
  role; the rest are agencies, domestic staffing and engagement farming.
  `lib/hrpost.ts` filters 120 → 44. Parked: 7× the cost per usable item.

---

## Competitors

**bangalorestartupmap.com** — Supabase, hand-curated, 1,064 companies. Uses
**ISR, not a cron**: pages regenerate every ≤20 min and re-fetch the company's
ATS board live. Her limit: only ~32% of her companies list roles (sampled 19,
6 had jobs) because companies without an ATS board show nothing. Her `?hiring=1`
view shows 1,747 roles across 112 companies. She has funding, investors and
founders — all hand-entered. Ads: ₹5,000/7d via a UPI QR and manual screenshot
verification, no gateway.

**applynest.in** — job-first, student-focused, open API at
`api.applynest.in/api/public/opportunities`. Claims "90+ sources nightly" but
the database holds **467 total, ~17/day**, and `source_url` is blank on 92%.
Their real advantage is the **daily email digest** — the product is the email,
not the site. Fields worth copying: `stipend_or_salary`, `batch`,
`application_deadline`, `eligibility`, `work_mode`.

---

## Bugs found (patterns worth remembering)

**This codebase fails silently.** Every serious bug here looked like success:

1. **`continue-on-error: true` reports a failed step as green.** Hid an Apify
   401 for a whole run — the job passed, spent nothing, fetched nothing. Now
   each source soft-fails into a flag and a final step fails the run by name.
2. **React hydration #418 killed every filter on `/jobs`** while the page looked
   perfect. Relative ages called `Date.now()` during static render, so the
   build-time value differed from the viewer's. Time-relative UI must render
   after mount.
3. **`fetch-news.mjs` read 50 headlines instead of 13,115** and reported "2
   companies got funding" as if that were the answer. An edit hadn't applied.
4. **Node exit code 13** killed `discover-careers.mjs` twice — one hung socket
   left a top-level await pending and the process exited *before* the write.
   Long crawls must checkpoint, never write only at the end.
5. **The archive crawler returned less on 1,500 days than on 60** — a shared
   stop-flag aborted all workers on one transient failure.
6. **Nothing was deploying.** Vercel was never connected to the repo, so a
   green refresh, a clean commit and a stale production site all coexisted
   happily. Check the live site, not the pipeline, before believing a fix
   shipped.

   Why this hid for so long: **a CLI deploy looks like a git deploy in the
   Vercel dashboard.** Running `vercel` inside a git working tree records the
   branch and commit, so every row in the deployments list read `main` next to
   a real SHA — exactly what a connected repo produces. The only visible
   difference is the trigger icon: `>_` for CLI, a commit glyph for git. The
   authoritative check is Settings → Git, which either names the repository or
   still offers the four "Connect" provider buttons.
7. **Then it still didn't deploy.** With the repo finally connected, the first
   push came back `Blocked`: *"the commit author email
   (anmol@Anmols-MacBook-Air-2.local) is not valid"*. Neither `user.email` nor
   `user.name` was ever set in git, globally or locally, so every commit in this
   repo's history carries a machine-derived address, and Vercel refuses to build
   a commit whose author it cannot tie to a GitHub account. `git push` reports
   success either way. Fixed with `git config --global user.email
   anmolas999@gmail.com`. The workflow's own commits were never affected — the
   bot commits as `github-actions[bot]@users.noreply.github.com`, which is
   valid — so if the repo had been connected, the daily refresh would have
   deployed fine. Two independent faults, each invisible, producing one silence.
8. **Trailing `\b` breaks prefix matches** — "Data Scien**tist**",
   "Engineer**ing**", "TELE-CALLER**S**" all escaped their patterns.
9. **Shell cwd resets between commands.** Several edits silently didn't apply.
   Use absolute paths and verify the edit landed before trusting output.

**Still open:** duplicate funding rounds (₹727 Cr vs ₹727.4 Cr dedupe by exact
digits); tier noise (BCG X, BairesDev); `/submit` logs to console.

---

## What's left

**Blocked on you**
- Nothing. The digest sends from `delhincrstartups@gmail.com` over Gmail SMTP,
  ad submissions and listings land in the Sheet, and every push deploys.

**Next up, roughly in order**

1. **Get subscribers who are not you.** The machine works end to end and has an
   audience of one. Everything below is worth less than this.
2. **Re-run the hiring-post pass** with the city now in the query and compare
   against the measured block above. If the kept count stays at six, that pass
   does not pay for itself and should be switched off rather than tuned.
3. **Publish approved submissions.** Rows land in the `submissions` tab as
   `pending` and there is no script that moves an approved one into
   `data/*.json`. Until there is, the verify step ends in a spreadsheet.
4. `/jobs` is now a worse copy of the home page's Jobs tab. Either redirect it
   to `/?view=jobs` or bring the cards over — but the digest links to it, so it
   cannot simply be deleted.
5. Stale hand-written copy: the GitHub repo description still says "1,279
   companies, 1,900+ live roles" and the site's meta description says "260+
   startups". Neither is generated from the data, so both rot on every refresh.
6. Free MapTiler key → clean grey basemap (CARTO watermarks keyless tiles)
7. ₹300 of Maps geocoding to convert approximate pins to verified
8. A domain, if Resend ever replaces Gmail SMTP. Not urgent — SMTP does 500
   recipients a day and the list is nowhere near that.

**Known hole:** the map tab has no way to submit anything. The "Add yours" card
lives in the sidebar, and the map is full-bleed with no sidebar.

---

## Decisions already made

- Approximate pins are fine, **as long as they're visibly marked**
- Only companies actually hiring — that's the quality filter, not curation taste
- Don't go national — city-by-city instead
- Don't scrape ApplyNest's data; copy the field schema, build from our sources
- No multi-accounting on Apify to dodge the free tier
- Ads stay manual (UPI + screenshot) until volume justifies a gateway
- **Jobs first, map third.** The map is the differentiator, not the entry point.
- **The name says "hiring", not "startups".** Only 1,050 of the board's 4,125
  roles are at startup-tier companies; 1,156 are at the likes of Agilent and
  SimCorp and 1,919 are standalone with no tier at all. Hiding three quarters of
  the inventory to justify a word was the wrong trade, so the word moved into a
  filter — "🚀 Startups only" on the Jobs tab, matching the toggle the Companies
  tab already had. The name lives in `SITE.name` and nowhere else.
- **Nothing an open form writes reaches the site unreviewed.** The board's whole
  claim is that its data is real; a form that publishes straight through ends
  that in a day.
- **One accent colour for "this filter is on" (light indigo), near-black for
  actions.** An active filter was a solid black pill and made the filter row
  the heaviest thing on the page.
- **Email only, no Telegram.** Telegram would have shipped sooner — it needs no
  domain — but the digest is the retention loop, and a second channel to
  maintain before the first one has a single subscriber is work, not progress.
