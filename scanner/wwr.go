package scanner

import (
	"context"
	"encoding/xml"
	"fmt"
	"net/http"
	"time"
)

// wwrRSS mirrors the subset of We Work Remotely's RSS feed we care about.
type wwrRSS struct {
	Channel struct {
		Items []struct {
			Title       string `xml:"title"`
			Link        string `xml:"link"`
			Description string `xml:"description"`
			PubDate     string `xml:"pubDate"`
			GUID        string `xml:"guid"`
		} `xml:"item"`
	} `xml:"channel"`
}

// fetchWWRJobs pulls the latest listings from We Work Remotely's public
// programming-jobs RSS feed. Standard XML, no auth, no scraping.
func fetchWWRJobs(ctx context.Context) ([]candidate, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, wwrFeedURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "lead-scanner/1.0")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetching WWR feed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("WWR feed returned status %d", resp.StatusCode)
	}

	var feed wwrRSS
	if err := xml.NewDecoder(resp.Body).Decode(&feed); err != nil {
		return nil, fmt.Errorf("decoding WWR feed: %w", err)
	}

	candidates := make([]candidate, 0, len(feed.Channel.Items))
	for _, item := range feed.Channel.Items {
		if item.GUID == "" || item.Title == "" {
			continue
		}
		created, _ := time.Parse(time.RFC1123Z, item.PubDate)
		candidates = append(candidates, candidate{
			Source:     "weworkremotely",
			ExternalID: "wwr:" + item.GUID,
			Title:      item.Title,
			Body:       item.Description,
			URL:        item.Link,
			CreatedUTC: created,
		})
	}
	return candidates, nil
}
