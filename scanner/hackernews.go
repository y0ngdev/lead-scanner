package scanner

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// Hacker News has a real public API (via Algolia's search index), so
// unlike Wellfound/YC this one is robust and needs no scraping.
const hnSearchURL = "https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&query=Who%20is%20hiring"
const hnItemURL = "https://hn.algolia.com/api/v1/items/%d"

type hnSearchResult struct {
	Hits []struct {
		ObjectID string `json:"objectID"`
		Title    string `json:"title"`
	} `json:"hits"`
}

type hnItem struct {
	ID       int      `json:"id"`
	Children []hnItem `json:"children"`
	Text     string   `json:"text"`
	Author   string   `json:"author"`
	CreatedAt string  `json:"created_at"`
	Type     string   `json:"type"`
}

// fetchHNWhoIsHiring finds the most recent monthly "Ask HN: Who is hiring?"
// thread and returns its top-level comments (each comment is one company's
// posting) as candidates.
func fetchHNWhoIsHiring(ctx context.Context) ([]candidate, error) {
	threadID, err := findLatestWhoIsHiringThread(ctx)
	if err != nil {
		return nil, err
	}

	item, err := fetchHNItem(ctx, threadID)
	if err != nil {
		return nil, err
	}

	candidates := make([]candidate, 0, len(item.Children))
	for _, comment := range item.Children {
		if comment.Type != "comment" || comment.Text == "" {
			continue
		}
		created, _ := time.Parse(time.RFC3339, comment.CreatedAt)
		candidates = append(candidates, candidate{
			Source:     "hackernews",
			ExternalID: fmt.Sprintf("hn:%d", comment.ID),
			Title:      firstLine(comment.Text),
			Body:       comment.Text,
			Author:     comment.Author,
			URL:        fmt.Sprintf("https://news.ycombinator.com/item?id=%d", comment.ID),
			CreatedUTC: created,
		})
	}
	return candidates, nil
}

func findLatestWhoIsHiringThread(ctx context.Context) (int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, hnSearchURL, nil)
	if err != nil {
		return 0, err
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return 0, fmt.Errorf("searching HN for who's hiring thread: %w", err)
	}
	defer resp.Body.Close()

	var result hnSearchResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return 0, fmt.Errorf("decoding HN search results: %w", err)
	}

	for _, hit := range result.Hits {
		if hit.ObjectID == "" {
			continue
		}
		var id int
		if _, err := fmt.Sscanf(hit.ObjectID, "%d", &id); err == nil {
			return id, nil
		}
	}
	return 0, fmt.Errorf("no who's hiring thread found")
}

func fetchHNItem(ctx context.Context, id int) (*hnItem, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fmt.Sprintf(hnItemURL, id), nil)
	if err != nil {
		return nil, err
	}

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetching HN item %d: %w", id, err)
	}
	defer resp.Body.Close()

	var item hnItem
	if err := json.NewDecoder(resp.Body).Decode(&item); err != nil {
		return nil, fmt.Errorf("decoding HN item %d: %w", id, err)
	}
	return &item, nil
}

// firstLine returns a short title-like snippet from a longer HN comment,
// since comments don't have their own titles.
func firstLine(text string) string {
	const maxLen = 120
	// HN comment text is HTML; a raw first-N-chars snippet is good enough
	// for display purposes without pulling in an HTML parser.
	if len(text) <= maxLen {
		return text
	}
	return text[:maxLen] + "..."
}
