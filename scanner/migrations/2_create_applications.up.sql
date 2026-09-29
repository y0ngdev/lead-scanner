CREATE TABLE applications (
    id              BIGSERIAL PRIMARY KEY,
    lead_id         BIGINT REFERENCES leads(id) ON DELETE SET NULL,
    company         TEXT NOT NULL,
    role            TEXT NOT NULL,
    job_url         TEXT NOT NULL DEFAULT '',
    source          TEXT NOT NULL DEFAULT 'manual',
    status          TEXT NOT NULL DEFAULT 'applied', -- 'wishlist', 'applied', 'screening', 'interviewing', 'offer', 'rejected', 'withdrawn'
    applied_date    DATE,
    salary          TEXT NOT NULL DEFAULT '',
    location        TEXT NOT NULL DEFAULT '',
    contact_name    TEXT NOT NULL DEFAULT '',
    contact_email   TEXT NOT NULL DEFAULT '',
    notes           TEXT NOT NULL DEFAULT '',
    next_step       TEXT NOT NULL DEFAULT '',
    next_step_date  DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_applications_status ON applications (status);
CREATE INDEX idx_applications_lead_id ON applications (lead_id);
CREATE INDEX idx_applications_created_at ON applications (created_at DESC);
