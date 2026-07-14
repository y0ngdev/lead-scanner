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

// devreljob.com has no public API, so — like yc.go — this is a best-effort
// HTML scrape. It fills the niche that Write the Docs' job board (now
// inactive) and DevRel Careers (down for maintenance) used to cover.
//
// jobLinkPattern matches anchors like:
//   <a href="/jobs/neo4j-senior-developer-advocate-656">...<span>title/company/location text</span>...</a>
// The (?s) flag lets '.' match newlines since real markup nests tags.
var devRelJobLinkPattern = regexp.MustCompile(`(?s)<a[^>]+href="(/jobs/[^"]+)"[^>]*>(.*?)</a>`)
var stripTagsPattern = regexp.MustCompile(`<[^>]+>`)

// fetchDevRelJobs scrapes devreljob.com's homepage listing for open roles.
func fetchDevRelJobs(ctx context.Context) ([]candidate, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, devRelJobsURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; lead-scanner/1.0)")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetching DevRel Jobs page: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("DevRel Jobs page returned status %d (page structure may have changed, or the request was blocked)", resp.StatusCode)
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

	matches := devRelJobLinkPattern.FindAllStringSubmatch(body, -1)
	seen := map[string]bool{}
	candidates := make([]candidate, 0, len(matches))

	for _, m := range matches {
		path := m[1]
		text := html.UnescapeString(strings.TrimSpace(stripTagsPattern.ReplaceAllString(m[2], " ")))
		text = strings.Join(strings.Fields(text), " ") // collapse repeated whitespace

		// Skip nav links like /jobs/roles or /jobs/locations that aren't
		// individual postings (postings end in "-<numeric id>").
		if path == "" || text == "" || seen[path] || !endsWithID(path) {
			continue
		}
		seen[path] = true

		candidates = append(candidates, candidate{
			Source:     "devrel-jobs",
			ExternalID: "devrel:" + path,
			Title:      text,
			Body:       text,
			URL:        "https://www.devreljob.com" + path,
			CreatedUTC: time.Now().UTC(),
		})
	}
	return candidates, nil
}

// endsWithID checks a path like "/jobs/some-slug-656" ends in digits,
// which distinguishes real postings from category/nav links.
func endsWithID(path string) bool {
	i := strings.LastIndex(path, "-")
	if i == -1 || i == len(path)-1 {
		return false
	}
	for _, r := range path[i+1:] {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}
