package scanner

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// redditListing mirrors the subset of Reddit's OAuth JSON listing response
// (https://oauth.reddit.com/r/<sub>/new) that we care about.
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

// redditUserAgent identifies us to Reddit per their API rules. The format
// Reddit recommends is "<platform>:<app id>:<version> (by /u/<username>)".
const redditUserAgent = "golang:lead-scanner:v1.0 (by /u/leadscannerbot)"

// redditTokenCache holds the app-only OAuth access token so we don't fetch a
// fresh one on every subreddit request; Reddit tokens are valid for ~1 hour.
var redditTokenCache struct {
	mu        sync.Mutex
	value     string
	expiresAt time.Time
}

// redditAccessToken returns a cached OAuth app-only ("client_credentials")
// access token, fetching a new one if missing or expired. This is what lets
// us call oauth.reddit.com instead of the public www.reddit.com/*.json
// endpoints, which Reddit blocks for most cloud/datacenter IPs regardless of
// User-Agent.
func redditAccessToken() (string, error) {
	redditTokenCache.mu.Lock()
	defer redditTokenCache.mu.Unlock()

	if redditTokenCache.value != "" && time.Now().Before(redditTokenCache.expiresAt) {
		return redditTokenCache.value, nil
	}

	if secrets.RedditClientID == "" || secrets.RedditClientSecret == "" {
		return "", fmt.Errorf("RedditClientID/RedditClientSecret secrets not set — register an app at https://www.reddit.com/prefs/apps and run 'encore secret set RedditClientID' / 'encore secret set RedditClientSecret'")
	}

	form := url.Values{"grant_type": {"client_credentials"}}
	req, err := http.NewRequest(http.MethodPost, "https://www.reddit.com/api/v1/access_token", strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.SetBasicAuth(secrets.RedditClientID, secrets.RedditClientSecret)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("User-Agent", redditUserAgent)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("fetching reddit access token: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("reddit access token endpoint returned status %d", resp.StatusCode)
	}

	var tok struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tok); err != nil {
		return "", fmt.Errorf("decoding reddit access token: %w", err)
	}
	if tok.AccessToken == "" {
		return "", fmt.Errorf("reddit access token response missing access_token")
	}

	redditTokenCache.value = tok.AccessToken
	// Renew a bit early so we never fire a request with a token that expires
	// mid-flight.
	redditTokenCache.expiresAt = time.Now().Add(time.Duration(tok.ExpiresIn-30) * time.Second)
	return tok.AccessToken, nil
}

// fetchNewPosts pulls the newest posts from a subreddit. It prefers Reddit's
// authenticated OAuth API (reliable, but needs RedditClientID/Secret set up
// via reddit.com/prefs/apps) and falls back to an anonymous scrape of
// old.reddit.com's public JSON endpoint if the OAuth attempt fails for any
// reason — secrets not set yet, a placeholder/invalid value, or Reddit
// rejecting the request. That fallback is best-effort, since it's the same
// anonymous access Reddit has been known to block from some IPs, but it
// costs nothing to try rather than hard-failing the whole source until
// OAuth is fully working.
func fetchNewPosts(subreddit string) ([]redditPost, error) {
	if posts, err := fetchNewPostsOAuth(subreddit); err == nil {
		return posts, nil
	}
	return fetchNewPostsAnonymous(subreddit)
}

func fetchNewPostsOAuth(subreddit string) ([]redditPost, error) {
	token, err := redditAccessToken()
	if err != nil {
		return nil, fmt.Errorf("getting reddit access token: %w", err)
	}

	reqURL := fmt.Sprintf("https://oauth.reddit.com/r/%s/new?limit=25", subreddit)
	req, err := http.NewRequest(http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("User-Agent", redditUserAgent)

	return doRedditRequest(req, subreddit)
}

// fetchNewPostsAnonymous scrapes old.reddit.com's public JSON listing with
// no auth. Best-effort: Reddit has been known to 403 this from cloud IPs
// regardless of headers, but old.reddit.com plus a realistic browser
// User-Agent survives more often than the placeholder bot UA this used to
// send to www.reddit.com.
func fetchNewPostsAnonymous(subreddit string) ([]redditPost, error) {
	reqURL := fmt.Sprintf("https://old.reddit.com/r/%s/new.json?limit=25", subreddit)
	req, err := http.NewRequest(http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36")

	return doRedditRequest(req, subreddit)
}

// doRedditRequest sends a prepared Reddit listing request and decodes the
// response, shared by both the OAuth and anonymous-fallback paths.
func doRedditRequest(req *http.Request, subreddit string) ([]redditPost, error) {
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
// sources (Reddit, HN, YC, ATS boards).
func matchKeywordText(text string) (string, bool) {
	haystack := strings.ToLower(text)
	for _, kw := range keywords {
		if strings.Contains(haystack, strings.ToLower(kw)) {
			return kw, true
		}
	}
	return "", false
}
