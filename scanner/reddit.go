package scanner

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// redditListing mirrors the subset of Reddit's public JSON listing
// response (https://www.reddit.com/r/<sub>/new.json) that we care about.
type redditListing struct {
	Data struct {
		Children []struct {
			Data redditPost `json:"data"`
		} `json:"children"`
	} `json:"data"`
}

type redditPost struct {
	ID         string  `json:"id"`
	Title      string  `json:"title"`
	Selftext   string  `json:"selftext"`
	Author     string  `json:"author"`
	Permalink  string  `json:"permalink"`
	Score      int     `json:"score"`
	CreatedUTC float64 `json:"created_utc"`
}

// fetchNewPosts pulls the newest posts from a subreddit's public JSON feed.
// No auth is required for this read-only endpoint, but Reddit requires a
// descriptive User-Agent and enforces rate limits, so keep calls modest.
func fetchNewPosts(subreddit string) ([]redditPost, error) {
	url := fmt.Sprintf("https://www.reddit.com/r/%s/new.json?limit=25", subreddit)

	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "reddit-lead-scanner/1.0 (by u/your-username)")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetching r/%s: %w", subreddit, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("r/%s returned status %d", subreddit, resp.StatusCode)
	}

	var listing redditListing
	if err := json.NewDecoder(resp.Body).Decode(&listing); err != nil {
		return nil, fmt.Errorf("decoding r/%s: %w", subreddit, err)
	}

	posts := make([]redditPost, 0, len(listing.Data.Children))
	for _, c := range listing.Data.Children {
		posts = append(posts, c.Data)
	}
	return posts, nil
}

// matchKeywordText returns the first configured keyword found anywhere in
// the given text, and whether a match was found at all. Shared across all
// sources (Reddit, HN, YC).
func matchKeywordText(text string) (string, bool) {
	haystack := strings.ToLower(text)
	for _, kw := range keywords {
		if strings.Contains(haystack, strings.ToLower(kw)) {
			return kw, true
		}
	}
	return "", false
}
