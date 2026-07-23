package scanner

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"html"
	"net/http"
	"strings"
	"time"
)

// secrets are managed by Encore's secrets system — set with:
//
//	encore secret set ResendAPIKey
//	encore secret set RedditClientID
//	encore secret set RedditClientSecret
//
// Get a free Resend API key at https://resend.com (no credit card needed
// for the free tier, generous enough for a personal lead digest).
//
// Get Reddit OAuth app credentials by registering a free "script" app at
// https://www.reddit.com/prefs/apps — needed because Reddit blocks
// anonymous/unauthenticated scraping of its public JSON endpoints from most
// cloud/datacenter IPs.
var secrets struct {
	ResendAPIKey       string
	RedditClientID     string
	RedditClientSecret string
}

// notifyEmail is where digests get sent. Edit this to your own address.
const notifyEmail = "prosperugbovo@gmail.com"

// emailFrom is the sender address. Resend's shared "onboarding@resend.dev"
// works immediately with no setup for testing; once you verify your own
// domain in Resend, switch this to something like "leads@yourdomain.com".
const emailFrom = "Lead Scanner <onboarding@resend.dev>"

// sendLeadDigest emails a summary of newly found leads. No-op if there
// are no new leads, so a normal scan with nothing new sends no email.
func sendLeadDigest(ctx context.Context, leads []Lead) error {
	if len(leads) == 0 {
		return nil
	}
	if secrets.ResendAPIKey == "" {
		return fmt.Errorf("ResendAPIKey secret not set — run 'encore secret set ResendAPIKey'")
	}

	payload := map[string]any{
		"from":    emailFrom,
		"to":      []string{notifyEmail},
		"subject": fmt.Sprintf("%d new lead(s) found", len(leads)),
		"html":    buildDigestHTML(leads),
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("encoding email payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.resend.com/emails", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+secrets.ResendAPIKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("sending digest email: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		return fmt.Errorf("resend API returned status %d", resp.StatusCode)
	}
	return nil
}

// buildDigestHTML renders leads as a simple, readable email body grouped
// by source so you can scan it in a few seconds on your phone.
func buildDigestHTML(leads []Lead) string {
	bySource := map[string][]Lead{}
	var order []string
	for _, l := range leads {
		if _, seen := bySource[l.Source]; !seen {
			order = append(order, l.Source)
		}
		bySource[l.Source] = append(bySource[l.Source], l)
	}

	var b strings.Builder
	b.WriteString(fmt.Sprintf("<h2>%d new lead(s)</h2>", len(leads)))
	for _, source := range order {
		b.WriteString(fmt.Sprintf("<h3>%s (%d)</h3><ul>", html.EscapeString(source), len(bySource[source])))
		for _, l := range bySource[source] {
			b.WriteString(fmt.Sprintf(
				`<li><a href="%s">%s</a> — matched "%s"</li>`,
				html.EscapeString(l.URL),
				html.EscapeString(l.Title),
				html.EscapeString(l.MatchedKeyword),
			))
		}
		b.WriteString("</ul>")
	}
	return b.String()
}
