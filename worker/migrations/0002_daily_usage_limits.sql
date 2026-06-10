CREATE TABLE IF NOT EXISTS daily_usage (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users( id ) ON DELETE CASCADE,
    usage_date TEXT NOT NULL,
    scope TEXT NOT NULL CHECK ( scope IN ( 'recording_seconds', 'messages', 'grapevine_questions' ) ),
    used INTEGER NOT NULL DEFAULT 0 CHECK ( used >= 0 ),
    limit_value INTEGER NOT NULL CHECK ( limit_value >= 0 ),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE ( user_id, usage_date, scope ),
    CHECK ( used <= limit_value )
);

CREATE INDEX IF NOT EXISTS idx_daily_usage_user_date ON daily_usage( user_id, usage_date );
CREATE INDEX IF NOT EXISTS idx_daily_usage_date_scope ON daily_usage( usage_date, scope );
