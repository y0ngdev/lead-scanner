package scanner

import (
	"context"
	"fmt"
	"html"
	"net/http"
	"regexp"
	"strings"
	"time"
)

// YC has no public jobs API, so this scrapes the public HTML listing page.
// It's inherently more fragile than the Reddit/HN sources: if YC changes
// their markup, this regex will need updating. Treat failures here as
// expected occasionally, not a sign the whole scanner is broken.
//
// jobLinkPattern matches anchors like:
//
//	<a href="/companies/some-startup/jobs/abc123-senior-engineer">Senior Engineer</a>
var jobLinkPattern = regexp.MustCompile(`<a[^>]+href="(/companies/[^"]+/jobs/[^"]+)"[^>]*>([^<]+)</a>`)

// fetchYCJobs scrapes YC's public jobs listing page for open roles.
func fetchYCJobs(ctx context.Context) ([]candidate, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, ycJobsURL, nil)
	if err != nil {
		return nil, err
	}
	// A browser-like User-Agent reduces the odds of being blocked outright;
	// this is still just a plain HTTP GET, no headless browser involved.
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; lead-scanner/1.0)")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetching YC jobs page: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("YC jobs page returned status %d (page structure may have changed, or the request was blocked)", resp.StatusCode)
	}

	buf := make([]byte, 0, 1<<20)
	chunk := make([]byte, 32*1024)
	for {
		n, err := resp.Body.Read(chunk)
		if n > 0 {
			buf = append(buf, chunk[:n]...)
		}
		if err != nil {
			break
		}
	}
	body := string(buf)

	matches := jobLinkPattern.FindAllStringSubmatch(body, -1)
	seen := map[string]bool{}
	candidates := make([]candidate, 0, len(matches))

	for _, m := range matches {
		path, title := m[1], html.UnescapeString(strings.TrimSpace(m[2]))
		if path == "" || title == "" || seen[path] {
			continue
		}
		seen[path] = true

		company := extractCompanySlug(path)
		candidates = append(candidates, candidate{
			Source:     "yc",
			ExternalID: "yc:" + path,
			Title:      title,
			Body:       "Company: " + company,
			Author:     company,
			URL:        "https://www.ycombinator.com" + path,
			CreatedUTC: time.Now().UTC(),
		})
	}
	return candidates, nil
}

// extractCompanySlug pulls the company name out of a job path like
// "/companies/some-startup/jobs/abc123-senior-engineer".
func extractCompanySlug(path string) string {
	parts := strings.Split(path, "/")
	for i, p := range parts {
		if p == "companies" && i+1 < len(parts) {
			return parts[i+1]
		}
	}
	return "unknown"
}
