// Package scanner watches Reddit, Hacker News's "Who's Hiring" thread, and
// YC's jobs page for posts that look like potential gigs or clients, and
// stores matches as leads.
package scanner

import (
	"context"
	"strconv"
	"time"

	"encore.dev/rlog"
	"encore.dev/storage/sqldb"
)

var db = sqldb.NewDatabase("leads", sqldb.DatabaseConfig{
	Migrations: "./migrations",
})

// candidate is the source-agnostic shape every fetcher (Reddit, HN, YC)
// produces before we check it against keywords and store it.
type candidate struct {
	Source     string // "reddit", "hackernews", "yc"
	Subreddit  string // only set for reddit
	ExternalID string // unique ID within the source, used for de-duping
	Title      string
	Body       string
	Author     string
	URL        string
	Score      int
	CreatedUTC time.Time
}

// Lead is a stored candidate that matched one of our watch keywords.
type Lead struct {
	ID             int64     `json:"id"`
	Source         string    `json:"source"`
	Subreddit      string    `json:"subreddit"`
	PostID         string    `json:"post_id"`
	Title          string    `json:"title"`
	Body           string    `json:"body"`
	Author         string    `json:"author"`
	URL            string    `json:"url"`
	MatchedKeyword string    `json:"matched_keyword"`
	Score          int       `json:"score"`
	CreatedUTC     time.Time `json:"created_utc"`
	FoundAt        time.Time `json:"found_at"`
	Reviewed       bool      `json:"reviewed"`
}

// ScanResult summarizes the outcome of a scan run, broken down by source
// since each has very different volume and failure modes.
type ScanResult struct {
	RedditPostsChecked int `json:"reddit_posts_checked"`
	HNCommentsChecked  int `json:"hn_comments_checked"`
	YCJobsChecked      int `json:"yc_jobs_checked"`
	WWRJobsChecked     int `json:"wwr_jobs_checked"`
	DevRelJobsChecked  int `json:"devrel_jobs_checked"`
	NewLeads           int `json:"new_leads"`
}

// Scan checks Reddit, HN's Who's Hiring thread, and YC's jobs page for
// anything matching our keywords, and inserts new matches as leads. Safe
// to call repeatedly; duplicates are skipped via the unique post_id
// constraint (namespaced by source).
//
//encore:api public method=POST path=/scan
func Scan(ctx context.Context) (*ScanResult, error) {
	result := &ScanResult{}
	newLeads := []Lead{}

	// Reddit: iterate configured subreddits.
	for _, sub := range subreddits {
		posts, err := fetchNewPosts(sub)
		if err != nil {
			rlog.Error("reddit scan failed", "subreddit", sub, "err", err)
			continue
		}
		for _, p := range posts {
			result.RedditPostsChecked++
			c := candidate{
				Source:     "reddit",
				Subreddit:  sub,
				ExternalID: "reddit:" + p.ID,
				Title:      p.Title,
				Body:       p.Selftext,
				Author:     p.Author,
				URL:        "https://reddit.com" + p.Permalink,
				Score:      p.Score,
				CreatedUTC: time.Unix(int64(p.CreatedUTC), 0).UTC(),
			}
			lead, err := processCandidate(ctx, c)
			if err != nil {
				rlog.Error("failed to process reddit candidate", "id", p.ID, "err", err)
				continue
			}
			if lead != nil {
				result.NewLeads++
				newLeads = append(newLeads, *lead)
			}
		}
	}

	// Hacker News: current month's Who's Hiring thread, top-level comments.
	hnCandidates, err := fetchHNWhoIsHiring(ctx)
	if err != nil {
		rlog.Error("hn scan failed", "err", err)
	}
	for _, c := range hnCandidates {
		result.HNCommentsChecked++
		lead, err := processCandidate(ctx, c)
		if err != nil {
			rlog.Error("failed to process hn candidate", "id", c.ExternalID, "err", err)
			continue
		}
		if lead != nil {
			result.NewLeads++
			newLeads = append(newLeads, *lead)
		}
	}

	// YC jobs page: best-effort HTML scrape. Every entry is already a
	// job listing, but we still run it through keyword matching so your
	// queue stays scoped to roles that fit your stack/niche.
	ycCandidates, err := fetchYCJobs(ctx)
	if err != nil {
		rlog.Error("yc scan failed", "err", err)
	}
	for _, c := range ycCandidates {
		result.YCJobsChecked++
		lead, err := processCandidate(ctx, c)
		if err != nil {
			rlog.Error("failed to process yc candidate", "id", c.ExternalID, "err", err)
			continue
		}
		if lead != nil {
			result.NewLeads++
			newLeads = append(newLeads, *lead)
		}
	}

	// We Work Remotely: standard RSS feed, no scraping needed.
	wwrCandidates, err := fetchWWRJobs(ctx)
	if err != nil {
		rlog.Error("wwr scan failed", "err", err)
	}
	for _, c := range wwrCandidates {
		result.WWRJobsChecked++
		lead, err := processCandidate(ctx, c)
		if err != nil {
			rlog.Error("failed to process wwr candidate", "id", c.ExternalID, "err", err)
			continue
		}
		if lead != nil {
			result.NewLeads++
			newLeads = append(newLeads, *lead)
		}
	}

	// DevRel Jobs: best-effort HTML scrape, fills the DevRel/API-docs
	// niche now that Write the Docs and DevRel Careers are unavailable.
	devRelCandidates, err := fetchDevRelJobs(ctx)
	if err != nil {
		rlog.Error("devrel jobs scan failed", "err", err)
	}
	for _, c := range devRelCandidates {
		result.DevRelJobsChecked++
		lead, err := processCandidate(ctx, c)
		if err != nil {
			rlog.Error("failed to process devrel candidate", "id", c.ExternalID, "err", err)
			continue
		}
		if lead != nil {
			result.NewLeads++
			newLeads = append(newLeads, *lead)
		}
	}

	rlog.Info("scan complete",
		"reddit_checked", result.RedditPostsChecked,
		"hn_checked", result.HNCommentsChecked,
		"yc_checked", result.YCJobsChecked,
		"wwr_checked", result.WWRJobsChecked,
		"devrel_checked", result.DevRelJobsChecked,
		"new_leads", result.NewLeads,
	)

	// Email a digest of everything new this run. A failed send doesn't
	// fail the scan — leads are already safely in the DB either way.
	if err := sendLeadDigest(ctx, newLeads); err != nil {
		rlog.Error("failed to send lead digest email", "err", err)
	}

	return result, nil
}

// processCandidate checks a candidate against the keyword list and, on a
// new match, stores it and returns the resulting Lead. Returns (nil, nil)
// if there's no match or the candidate was already known.
func processCandidate(ctx context.Context, c candidate) (*Lead, error) {
	kw, ok := matchKeywordText(c.Title + " " + c.Body)
	if !ok {
		return nil, nil
	}
	inserted, err := insertLead(ctx, c, kw)
	if err != nil {
		return nil, err
	}
	if !inserted {
		return nil, nil
	}
	return &Lead{
		Source:         c.Source,
		Subreddit:      c.Subreddit,
		PostID:         c.ExternalID,
		Title:          c.Title,
		Body:           c.Body,
		Author:         c.Author,
		URL:            c.URL,
		MatchedKeyword: kw,
		Score:          c.Score,
		CreatedUTC:     c.CreatedUTC,
		FoundAt:        time.Now().UTC(),
	}, nil
}

// insertLead writes a matched candidate to the database. Returns false (no
// error) if it was already recorded.
func insertLead(ctx context.Context, c candidate, keyword string) (bool, error) {
	_, err := db.Exec(ctx, `
		INSERT INTO leads (source, subreddit, post_id, title, body, author, url, matched_keyword, score, created_utc)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		ON CONFLICT (post_id) DO NOTHING
	`, c.Source, c.Subreddit, c.ExternalID, c.Title, c.Body, c.Author, c.URL, keyword, c.Score, c.CreatedUTC)
	if err != nil {
		return false, err
	}

	var exists bool
	err = db.QueryRow(ctx, `SELECT true FROM leads WHERE post_id = $1 AND found_at > now() - interval '1 minute'`, c.ExternalID).Scan(&exists)
	if err != nil {
		return false, nil
	}
	return exists, nil
}

// ListLeadsParams filters the lead listing.
type ListLeadsParams struct {
	Source   string `query:"source"`   // "reddit", "hackernews", or "yc"; empty means no filter
	Reviewed string `query:"reviewed"` // "true" or "false"; empty means no filter
	Limit    int    `query:"limit"`
}

// ListLeadsResponse wraps the returned leads.
type ListLeadsResponse struct {
	Leads []Lead `json:"leads"`
}

// ListLeads returns leads, newest first. Filter with ?reviewed=false to see
// only leads you haven't actioned yet, and/or ?source=yc to scope to one
// source.
//
//encore:api public method=GET path=/leads
func ListLeads(ctx context.Context, params *ListLeadsParams) (*ListLeadsResponse, error) {
	limit := params.Limit
	if limit <= 0 || limit > 200 {
		limit = 50
	}

	query := `
		SELECT id, source, subreddit, post_id, title, body, author, url, matched_keyword, score, created_utc, found_at, reviewed
		FROM leads WHERE 1=1
	`
	args := []any{}
	argN := 1

	if params.Source != "" {
		query += " AND source = $" + strconv.Itoa(argN)
		args = append(args, params.Source)
		argN++
	}
	if params.Reviewed != "" {
		reviewed, err := strconv.ParseBool(params.Reviewed)
		if err != nil {
			return nil, err
		}
		query += " AND reviewed = $" + strconv.Itoa(argN)
		args = append(args, reviewed)
		argN++
	}
	query += " ORDER BY found_at DESC LIMIT $" + strconv.Itoa(argN)
	args = append(args, limit)

	rows, err := db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	leads := []Lead{}
	for rows.Next() {
		var l Lead
		if err := rows.Scan(&l.ID, &l.Source, &l.Subreddit, &l.PostID, &l.Title, &l.Body, &l.Author, &l.URL,
			&l.MatchedKeyword, &l.Score, &l.CreatedUTC, &l.FoundAt, &l.Reviewed); err != nil {
			return nil, err
		}
		leads = append(leads, l)
	}
	return &ListLeadsResponse{Leads: leads}, nil
}

// MarkReviewed flags a lead as actioned so it stops showing up in your
// default queue.
//
//encore:api public method=POST path=/leads/:id/review
func MarkReviewed(ctx context.Context, id int64) error {
	_, err := db.Exec(ctx, `UPDATE leads SET reviewed = true WHERE id = $1`, id)
	return err
}
