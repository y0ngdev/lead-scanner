# Lead Scanner

Watches five sources for SWE, technical writing, DevRel, and API/product
documentation opportunities, matches them against your keywords, and
stores hits so you can review a queue instead of checking each site by
hand.

## Sources

| Source | How it works | Reliability |
|---|---|---|
| Reddit | Public `/new.json` listing per subreddit, no auth | Stable |
| Hacker News | Official Algolia HN API, latest Who's Hiring thread | Stable |
| We Work Remotely | Public RSS feed, remote-programming category | Stable |
| YC jobs | Best-effort HTML scrape of `ycombinator.com/jobs` | Fragile — no official API |
| DevRel Jobs (devreljob.com) | Best-effort HTML scrape | Fragile — no official API |
| Google Dork (Serper.dev) | `site:` queries across Ashby, Greenhouse, Lever, Workable, and more — finds jobs at any company on those platforms, not just ones you've listed | Stable (paid API; free tier = 2,500 searches/month) |

Two sources were deliberately left out:

- **Wellfound** — no public API, and the scrapers that exist need paid
  anti-bot bypass (Cloudflare/DataDome), not worth wiring in here.
- **Write the Docs' own job board** — currently inactive (they moved job
  postings to their newsletter/Slack instead). **DevRel Careers** is also
  down for maintenance as of this writing. DevRel Jobs (devreljob.com)
  fills that niche instead — it's live and well-populated with Developer
  Advocate / Developer Relations / Developer Experience roles.

## How it works

- `scanner/config.go` — subreddits, keywords, and the URLs for YC/WWR/DevRel
  Jobs. Edit the keyword list first; the defaults cover SWE, technical
  writing, API docs, and DevRel broadly, so tune them to cut noise.
- `scanner/reddit.go`, `scanner/hackernews.go`, `scanner/wwr.go`,
  `scanner/yc.go`, `scanner/devreljobs.go` — one fetcher per source, each
  producing the shared `candidate` shape.
- `scanner/scanner.go` — matches candidates against keywords, stores hits,
  and exposes the API.
- `scanner/cron.go` — runs the scan automatically every 30 minutes.

## Setup

1. Install the Encore CLI:
   ```
   curl -L https://encore.dev/install.sh | bash
   ```
2. Get a free API key at [resend.com](https://resend.com) (no card needed)
   and set it as an Encore secret:
   ```
   encore secret set ResendAPIKey
   ```
3. *(Optional)* Get a free Serper.dev API key at [serper.dev](https://serper.dev)
   (free tier: 2,500 searches/month, no card needed) to enable Google Dork
   scanning across all ATS platforms:
   ```
   encore secret set SerperAPIKey
   ```
   Without this key the Google Dork source is silently skipped — everything
   else continues to work normally.
4. Edit `notifyEmail` in `scanner/email.go` to your own address.
5. From this directory:
   ```
   encore run
   ```
   This starts a local dev server, spins up Postgres automatically, and
   runs migrations.

## Email digest

Every scan run — manual or on the 30-min cron — emails you a summary of
whatever's new, grouped by source, with a direct link and the keyword that
matched. If nothing new was found, no email is sent, so you won't get
spammed on quiet runs.

- Uses Resend's shared `onboarding@resend.dev` sender by default, which
  works immediately with no domain setup — good for getting started.
- Once you verify your own domain in Resend, switch `emailFrom` in
  `scanner/email.go` to something like `leads@yourdomain.com`.
- A failed email send is logged but never fails the scan — leads are
  already safely stored either way, so you can always check `/leads`.

## API

- `POST /scan` — trigger a scan manually (also runs on a 30-min cron).
- `GET /leads?reviewed=false&source=devrel-jobs&limit=50` — list leads,
  newest first. `source` values: `reddit`, `hackernews`, `weworkremotely`,
  `yc`, `devrel-jobs`, `greenhouse`, `lever`, `ashby`, `workable`,
  `google-dork`. Both filters are optional.
- `POST /leads/:id/review` — mark a lead as actioned.

## Customizing

- **Keywords**: edit `scanner/config.go`. "software engineer" and similar
  broad terms are included since WWR/DevRel Jobs are already curated dev
  boards — tighten these if your queue gets noisy.
- **Scan frequency**: edit `Every` in `scanner/cron.go`. Reddit and the two
  scraped sources are rate-limited/blockable per IP; don't go much tighter
  than 30 minutes.
- **YC or DevRel Jobs scraper breaking**: if either returns zero results,
  the site likely changed its markup — inspect the page source and update
  `jobLinkPattern` (in `yc.go`) or `devRelJobLinkPattern` (in
  `devreljobs.go`). Expected occasional maintenance for scraping sites with
  no official API.
- **Notifications**: leads currently just sit in the DB. A natural next
  step is a webhook in `insertLead` (in `scanner.go`) that posts new leads
  to Slack/Discord/X DMs.

## Deploying

Push to an `encore.dev`-linked GitHub repo, or run `encore app deploy`, to
get a hosted instance with a dashboard, logs, and tracing — no infra setup
needed.
