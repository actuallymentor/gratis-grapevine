ALTER TABLE push_notification_jobs
    ADD COLUMN last_subscription_created_at TEXT NOT NULL DEFAULT '';

ALTER TABLE push_notification_jobs
    ADD COLUMN lease_expires_at TEXT;

CREATE INDEX IF NOT EXISTS idx_push_notification_jobs_leases
    ON push_notification_jobs (completed_at, failed_at, lease_expires_at, created_at);

