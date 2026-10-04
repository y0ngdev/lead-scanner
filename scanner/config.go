package scanner

// Subreddits worth watching for gig / client / hiring signals.
// Add or remove based on where your niche actually posts.
var subreddits = []string{
	"forhire",
	"freelance",
	"webdev",
	"webdesign",
	"website",
	"golang",
	"fintech",
	"Entrepreneur",
	"startups",
	"technicalwriting",
	"NoStupidQuestions",
}

// Keywords that suggest someone is looking to hire, not just chatting.
// Matching is case-insensitive and checked against title + body.
var keywords = []string{
	"technical writer",
	"technical content engineer",
	"technical content manager",
	"content engineer",
	"documentation engineer",
	"docs engineer",
	"knowledge engineer",
	"information developer",
	"API technical writer",
	"developer content",
	"content strategist",
	"technical writing",
	"looking for a developer",
	"hiring a developer",
	"need a developer",
	"go developer",
	"go engineer",
	"golang",
	"laravel",
	"backend",
	"full stack developer",
	"software engineer",
	"payments api",
	"fintech engineer",
	"api documentation",
	"product documentation",
	"developer advocate",
	"developer relations",
	"devrel",
	"looking to hire",
	"need someone to build",
	"remote developer",
	"remote role",
	"remote position",
	"hiring remote",
	// High-intent website gig keywords (from reddit-outreach-bot)
	"need website",
	"need a website",
	"need site",
	"build website",
	"make me a website",
}

// ATS (applicant tracking system) company boards to poll for new postings.
// Unlike YC/WWR, these platforms don't offer a cross-company search API —
// only a public per-company job board — so there's nothing to scan until
// you add the company slugs you actually care about. Find a slug from a
// company's careers page URL, e.g.:
//
//	boards.greenhouse.io/<slug>       -> greenhouseCompanies
//	jobs.lever.co/<slug>              -> leverCompanies
//	jobs.ashbyhq.com/<slug>           -> ashbyCompanies
//	apply.workable.com/<slug>         -> workableCompanies
//
// All slugs below were verified live against their respective APIs before
// being added. To add more: visit the company's careers page, find the
// ATS URL in your browser, and copy the slug (the segment after the domain).

// Greenhouse — mid-to-large tech companies (boards.greenhouse.io/<slug>)
var greenhouseCompanies = []string{
	"stripe",     // Stripe — payments infrastructure
	"cloudflare", // Cloudflare — network / security
	"figma",      // Figma — design tools
	"reddit",     // Reddit
	"airtable",   // Airtable — no-code database
	"intercom",   // Intercom — customer messaging
}

// Lever — high-growth startups (jobs.lever.co/<slug>)
// Many companies have migrated off Lever; add slugs as you discover them.
var leverCompanies = []string{}

// Ashby — engineering-heavy, Series A–C companies (jobs.ashbyhq.com/<slug>)
var ashbyCompanies = []string{
	"linear",     // Linear — project management
	"supabase",   // Supabase — open source Firebase alternative
	"replit",     // Replit — collaborative browser IDE
	"ramp",       // Ramp — corporate cards & spend management
	"posthog",    // PostHog — open source product analytics
	"raycast",    // Raycast — macOS launcher / dev tools
	"cursor",     // Cursor — AI code editor
	"clerk",      // Clerk — auth & user management
	"perplexity", // Perplexity AI — AI search engine
	"openai",     // OpenAI
}

// Workable — often used by remote-first and international teams
var workableCompanies = []string{
	"mercury", // Mercury — banking for startups
	"loom",    // Loom — async video messaging
}

// ycJobsURL is YC's public jobs listing. No auth needed, but this is a
// best-effort HTML scrape (YC has no public jobs API) so it's more
// fragile than the Reddit/HN sources if they change their markup.
const ycJobsURL = "https://www.ycombinator.com/jobs/role/all"

// wwrFeedURL is We Work Remotely's public programming-jobs RSS feed.
// Standard XML, no auth, no scraping needed.
const wwrFeedURL = "https://weworkremotely.com/categories/remote-programming-jobs.rss"

// devRelJobsURL is a live, active DevRel-focused board that regularly
// carries developer advocate, API docs, and dev-facing content roles.
// Like the YC scraper, this is a best-effort HTML scrape since the site
// has no public API — Write the Docs' job board is inactive and DevRel
// Careers is down for maintenance as of this writing, so this fills that
// niche instead.
const devRelJobsURL = "https://www.devreljob.com/"
