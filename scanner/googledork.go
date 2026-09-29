package scanner

import (
	"bytes"
	"context"
	"crypto/md5"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// googleDorkSites lists every ATS platform we want to dork. Google's index
// covers all companies on each platform, so we get fresh results from
// companies we've never explicitly listed in config.go.
var googleDorkSites = []string{
	"jobs.ashbyhq.com",
	"boards.greenhouse.io",
	"jobs.lever.co",
	"apply.workable.com",
	"jobs.smartrecruiters.com",
	"jobs.jobvite.com",
	"jobs.bamboohr.com",
}

// serperSearchURL is Serper.dev's Google Search JSON API.
const serperSearchURL = "https://google.serper.dev/search"

// serperMaxResults is the number of results to request per query.
// Serper counts each request as 1 credit regardless of num; capping at 10
// keeps responses lean. The free tier gives 2,500 credits/month.
const serperMaxResults = 10

type serperRequest struct {
	Q   string `json:"q"`
	Num int    `json:"num"`
}

type serperResponse struct {
	Organic []struct {
		Title   string `json:"title"`
		Link    string `json:"link"`
		Snippet string `json:"snippet"`
	} `json:"organic"`
}

// fetchGoogleDorkJobs runs one Serper search per ATS domain × keyword batch,
// returning any job-page results as candidates. It uses a condensed OR
// boolean of your configured keywords so each site costs a single API credit.
//
// The candidates produced here will have a snippet-only Body (no full job
// description, since that would require fetching each URL). The snippet is
// typically enough for keyword matching; the direct link lets you read more.
func fetchGoogleDorkJobs(ctx context.Context) ([]candidate, error) {
	if secrets.SerperAPIKey == "" {
		// Skip silently rather than erroring — Serper is optional and the
		// scan should still succeed without it.
		return nil, nil
	}

	// Build a condensed keyword query. We take a representative subset to
	// stay within Google's ~32-word query limit per search. Full matching
	// still happens in processCandidate, this just gets results into the pipe.
	queryKeywords := buildDorkKeywords(keywords)

	var candidates []candidate
	for _, site := range googleDorkSites {
		q := fmt.Sprintf("site:%s %s", site, queryKeywords)
		results, err := runSerperSearch(ctx, q)
		if err != nil {
			// Log and continue — one site failure shouldn't kill the whole run.
			return candidates, fmt.Errorf("serper search for %s: %w", site, err)
		}
		for _, r := range results {
			if r.Link == "" || r.Title == "" {
				continue
			}
			// Use an MD5 of the URL as the external ID — stable across runs,
			// de-dupes against the unique post_id constraint in the DB.
			id := fmt.Sprintf("googledork:%x", md5.Sum([]byte(r.Link)))
			candidates = append(candidates, candidate{
				Source:     "google-dork",
				ExternalID: id,
				Title:      r.Title,
				Body:       r.Snippet,
				Author:     site, // domain as author gives a useful source hint
				URL:        r.Link,
				CreatedUTC: time.Now().UTC(),
			})
		}
	}
	return candidates, nil
}

// runSerperSearch calls the Serper API for a single query and returns the
// organic results.
func runSerperSearch(ctx context.Context, q string) ([]struct {
	Title   string `json:"title"`
	Link    string `json:"link"`
	Snippet string `json:"snippet"`
}, error) {
	payload, err := json.Marshal(serperRequest{Q: q, Num: serperMaxResults})
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, serperSearchURL, bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-API-KEY", secrets.SerperAPIKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("HTTP request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Serper returned status %d", resp.StatusCode)
	}

	var sr serperResponse
	if err := json.NewDecoder(resp.Body).Decode(&sr); err != nil {
		return nil, fmt.Errorf("decoding response: %w", err)
	}
	return sr.Organic, nil
}

// buildDorkKeywords builds a compact OR boolean from the keyword list, keeping
// the total string short enough to fit comfortably within Google's query limit.
// Multi-word phrases are quoted; single words are bare.
func buildDorkKeywords(kws []string) string {
	// Deduplicate and take the most "hiring-signal" specific ones to keep
	// the query targeted and within length limits.
	seen := map[string]bool{}
	var parts []string
	for _, kw := range kws {
		lc := strings.ToLower(kw)
		if seen[lc] {
			continue
		}
		seen[lc] = true
		if strings.Contains(kw, " ") {
			parts = append(parts, `"`+kw+`"`)
		} else {
			parts = append(parts, kw)
		}
		// Cap at ~8 terms so the site: prefix + terms stay well under 32 words.
		if len(parts) >= 8 {
			break
		}
	}
	if len(parts) == 1 {
		return parts[0]
	}
	return "(" + strings.Join(parts, " OR ") + ")"
}
