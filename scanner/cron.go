package scanner

import (
	"context"

	"encore.dev/cron"
)

// scanCronEndpoint is the internal entrypoint the cron job calls. It wraps
// Scan so the cron job doesn't need to care about the return value.
//
//encore:api private
func scanCronEndpoint(ctx context.Context) error {
	_, err := Scan(ctx)
	return err
}

// Runs every 30 minutes. Reddit's public JSON endpoints are rate-limited,
// so don't go much tighter than this across ~8 subreddits.
var _ = cron.NewJob("scan-reddit-leads", cron.JobConfig{
	Title:    "Scan subreddits for leads",
	Every:    30 * cron.Minute,
	Endpoint: scanCronEndpoint,
})
