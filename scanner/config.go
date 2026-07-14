package scanner

// Subreddits worth watching for gig / client / hiring signals.
// Add or remove based on where your niche actually posts.
var subreddits = []string{
	"forhire",
	"freelance",
	"webdev",
	"golang",
	"fintech",
	"Entrepreneur",
	"startups",
	"technicalwriting",
}

// Keywords that suggest someone is looking to hire, not just chatting.
// Matching is case-insensitive and checked against title + body.
var keywords = []string{
	"technical writer",
	"looking for a developer",
	"hiring a developer",
	"need a developer",
	"go developer",
	"golang developer",
	"backend engineer",
	"backend developer",
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
