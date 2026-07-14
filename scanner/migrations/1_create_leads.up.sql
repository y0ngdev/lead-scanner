CREATE TABLE leads (
    id              BIGSERIAL PRIMARY KEY,
    source          TEXT NOT NULL DEFAULT 'reddit',
    subreddit       TEXT NOT NULL DEFAULT '',
    post_id         TEXT NOT NULL UNIQUE,
    title           TEXT NOT NULL,
    body            TEXT,
    author          TEXT,
    url             TEXT NOT NULL,
    matched_keyword TEXT NOT NULL,
    score           INT NOT NULL DEFAULT 0,
    created_utc     TIMESTAMPTZ NOT NULL,
    found_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed        BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_leads_found_at ON leads (found_at DESC);
CREATE INDEX idx_leads_subreddit ON leads (subreddit);
CREATE INDEX idx_leads_source ON leads (source);
