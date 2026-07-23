package scanner

import (
	"context"
	"encoding/json"
	"fmt"
	"html"
	"net/http"
	"strings"
	"time"
)

// This file polls a handful of applicant-tracking-system (ATS) platforms
// that companies use to host their own careers page. Unlike YC/WWR, none of
// these offer a cross-company search — only a public per-company job board
// — so each fetcher is a no-op until you add company slugs to config.go
// (greenhouseCompanies, leverCompanies, ashbyCompanies, workableCompanies).

var atsHTTPClient = &http.Client{Timeout: 15 * time.Second}

// --- Greenhouse ---
// Public, no-auth job board API: https://developers.greenhouse.io/job-board.html

type greenhouseJobsResponse struct {
	Jobs []struct {
		ID          int64  `json:"id"`
		Title       string `json:"title"`
		AbsoluteURL string `json:"absolute_url"`
		UpdatedAt   string `json:"updated_at"`
		Content     string `json:"content"`
		Location    struct {
			Name string `json:"name"`
		} `json:"location"`
	} `json:"jobs"`
}

// fetchGreenhouseJobs polls each configured Greenhouse company board.
func fetchGreenhouseJobs(ctx context.Context) ([]candidate, error) {
	var candidates []candidate
	for _, company := range greenhouseCompanies {
		reqURL := fmt.Sprintf("https://boards-api.greenhouse.io/v1/boards/%s/jobs?content=true", company)
		var jobs greenhouseJobsResponse
		if err := fetchATSJSON(ctx, reqURL, &jobs); err != nil {
			return candidates, fmt.Errorf("fetching greenhouse board %q: %w", company, err)
		}
		for _, j := range jobs.Jobs {
			updated, _ := time.Parse(time.RFC3339, j.UpdatedAt)
			candidates = append(candidates, candidate{
				Source:     "greenhouse",
				ExternalID: fmt.Sprintf("greenhouse:%s:%d", company, j.ID),
				Title:      j.Title,
				Body:       stripATSHTML(j.Content) + " Location: " + j.Location.Name,
				Author:     company,
				URL:        j.AbsoluteURL,
				CreatedUTC: updated,
			})
		}
	}
	return candidates, nil
}

// --- Lever ---
// Public, no-auth postings API: https://github.com/lever/postings-api

type leverPosting struct {
	ID               string `json:"id"`
	Text             string `json:"text"`
	HostedURL        string `json:"hostedUrl"`
	CreatedAt        int64  `json:"createdAt"`
	DescriptionPlain string `json:"descriptionPlain"`
	Categories       struct {
		Location string `json:"location"`
		Team     string `json:"team"`
	} `json:"categories"`
}

// fetchLeverJobs polls each configured Lever company board.
func fetchLeverJobs(ctx context.Context) ([]candidate, error) {
	var candidates []candidate
	for _, company := range leverCompanies {
		reqURL := fmt.Sprintf("https://api.lever.co/v0/postings/%s?mode=json", company)
		var postings []leverPosting
		if err := fetchATSJSON(ctx, reqURL, &postings); err != nil {
			return candidates, fmt.Errorf("fetching lever board %q: %w", company, err)
		}
		for _, p := range postings {
			candidates = append(candidates, candidate{
				Source:     "lever",
				ExternalID: fmt.Sprintf("lever:%s:%s", company, p.ID),
				Title:      p.Text,
				Body:       p.DescriptionPlain + " Location: " + p.Categories.Location,
				Author:     company,
				URL:        p.HostedURL,
				CreatedUTC: time.UnixMilli(p.CreatedAt).UTC(),
			})
		}
	}
	return candidates, nil
}

// --- Ashby ---
// Public, no-auth job board API: https://developers.ashbyhq.com/reference/jobboardapi

type ashbyJobBoardResponse struct {
	Jobs []struct {
		ID               string `json:"id"`
		Title            string `json:"title"`
		Location         string `json:"location"`
		JobURL           string `json:"jobUrl"`
		PublishedAt      string `json:"publishedAt"`
		DescriptionPlain string `json:"descriptionPlain"`
	} `json:"jobs"`
}

// fetchAshbyJobs polls each configured Ashby company job board.
func fetchAshbyJobs(ctx context.Context) ([]candidate, error) {
	var candidates []candidate
	for _, company := range ashbyCompanies {
		reqURL := fmt.Sprintf("https://api.ashbyhq.com/posting-api/job-board/%s", company)
		var board ashbyJobBoardResponse
		if err := fetchATSJSON(ctx, reqURL, &board); err != nil {
			return candidates, fmt.Errorf("fetching ashby board %q: %w", company, err)
		}
		for _, j := range board.Jobs {
			published, _ := time.Parse(time.RFC3339, j.PublishedAt)
			candidates = append(candidates, candidate{
				Source:     "ashby",
				ExternalID: fmt.Sprintf("ashby:%s:%s", company, j.ID),
				Title:      j.Title,
				Body:       j.DescriptionPlain + " Location: " + j.Location,
				Author:     company,
				URL:        j.JobURL,
				CreatedUTC: published,
			})
		}
	}
	return candidates, nil
}

// --- Workable ---
// Public, no-auth widget API used by Workable's embeddable job list.

type workableWidgetResponse struct {
	Jobs []struct {
		Title       string `json:"title"`
		Shortcode   string `json:"shortcode"`
		URL         string `json:"url"`
		Department  string `json:"department"`
		PublishedOn string `json:"published_on"`
		Location    struct {
			City    string `json:"city"`
			Country string `json:"country"`
		} `json:"location"`
	} `json:"jobs"`
}

// fetchWorkableJobs polls each configured Workable company account. Note:
// this widget endpoint only exposes title/department/location, not the full
// job description, since that's all Workable's public embed API returns.
func fetchWorkableJobs(ctx context.Context) ([]candidate, error) {
	var candidates []candidate
	for _, company := range workableCompanies {
		reqURL := fmt.Sprintf("https://apply.workable.com/api/v1/widget/accounts/%s", company)
		var widget workableWidgetResponse
		if err := fetchATSJSON(ctx, reqURL, &widget); err != nil {
			return candidates, fmt.Errorf("fetching workable account %q: %w", company, err)
		}
		for _, j := range widget.Jobs {
			published, _ := time.Parse("2006-01-02", j.PublishedOn)
			candidates = append(candidates, candidate{
				Source:     "workable",
				ExternalID: fmt.Sprintf("workable:%s:%s", company, j.Shortcode),
				Title:      j.Title,
				Body:       "Department: " + j.Department + " Location: " + j.Location.City + ", " + j.Location.Country,
				Author:     company,
				URL:        j.URL,
				CreatedUTC: published,
			})
		}
	}
	return candidates, nil
}

// fetchATSJSON is the shared GET + JSON-decode helper for all ATS fetchers
// above, since they're all plain public REST endpoints with no auth.
func fetchATSJSON(ctx context.Context, url string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; lead-scanner/1.0)")

	resp, err := atsHTTPClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("returned status %d", resp.StatusCode)
	}
	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		return fmt.Errorf("decoding response: %w", err)
	}
	return nil
}

// stripATSHTML strips tags and unescapes entities from an ATS-provided HTML
// description field, e.g. Greenhouse's "content" field.
func stripATSHTML(s string) string {
	return strings.TrimSpace(html.UnescapeString(stripTagsPattern.ReplaceAllString(s, " ")))
}
