CREATE TABLE IF NOT EXISTS push_subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users( id ) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    content_encoding TEXT NOT NULL DEFAULT 'aes128gcm',
    expiration_time INTEGER,
    user_agent_hash TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_success_at TEXT,
    last_failure_at TEXT,
    failure_count INTEGER NOT NULL DEFAULT 0,
    disabled_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions( user_id );
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_disabled_at ON push_subscriptions( disabled_at );

