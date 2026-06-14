CREATE TABLE IF NOT EXISTS push_notification_jobs (
    id TEXT PRIMARY KEY,
    audience TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    options_json TEXT NOT NULL DEFAULT '{}',
    last_subscription_id TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT,
    failed_at TEXT,
    last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_push_notification_jobs_pending
    ON push_notification_jobs (completed_at, failed_at, created_at);

