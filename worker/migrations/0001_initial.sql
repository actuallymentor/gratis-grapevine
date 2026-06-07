PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS hubs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    email_normalized TEXT NOT NULL UNIQUE,
    whatsapp_telephone TEXT NOT NULL,
    whatsapp_telephone_digits TEXT NOT NULL,
    hub_id TEXT REFERENCES hubs( id ),
    requested_hub_name TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK ( status IN ( 'pending', 'accepted', 'blocked' ) ),
    role TEXT NOT NULL DEFAULT 'member' CHECK ( role IN ( 'member', 'admin' ) ),
    review_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    approved_at TEXT,
    approved_by_user_id TEXT REFERENCES users( id ),
    blocked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_status ON users( status );
CREATE INDEX IF NOT EXISTS idx_users_role ON users( role );
CREATE INDEX IF NOT EXISTS idx_users_hub_id ON users( hub_id );
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users( created_at );

CREATE TABLE IF NOT EXISTS webauthn_credentials (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users( id ) ON DELETE CASCADE,
    credential_id TEXT NOT NULL UNIQUE,
    public_key TEXT NOT NULL,
    counter INTEGER NOT NULL DEFAULT 0,
    device_type TEXT,
    backed_up INTEGER NOT NULL DEFAULT 0,
    transports_json TEXT,
    created_at TEXT NOT NULL,
    last_used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_user_id ON webauthn_credentials( user_id );

CREATE TABLE IF NOT EXISTS password_credentials (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE REFERENCES users( id ) ON DELETE CASCADE,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    algorithm TEXT NOT NULL,
    parameters_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users( id ) ON DELETE CASCADE,
    session_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    last_used_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    user_agent_hash TEXT,
    ip_prefix TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions( user_id );
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions( expires_at );

CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users( id ) ON DELETE CASCADE,
    hub_id TEXT REFERENCES hubs( id ),
    body TEXT NOT NULL,
    body_normalized TEXT NOT NULL,
    source TEXT NOT NULL CHECK ( source IN ( 'voice_transcript', 'typed', 'edited_voice_transcript' ) ),
    client_recorded_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages( user_id );
CREATE INDEX IF NOT EXISTS idx_messages_hub_id ON messages( hub_id );
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages( created_at );
CREATE INDEX IF NOT EXISTS idx_messages_hub_created_at ON messages( hub_id, created_at );
CREATE INDEX IF NOT EXISTS idx_messages_user_created_at ON messages( user_id, created_at );

CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
    message_id UNINDEXED,
    body,
    body_normalized
);

CREATE TRIGGER IF NOT EXISTS messages_fts_insert AFTER INSERT ON messages
BEGIN
    INSERT INTO messages_fts( rowid, message_id, body, body_normalized )
    VALUES ( new.rowid, new.id, new.body, new.body_normalized );
END;

CREATE TRIGGER IF NOT EXISTS messages_fts_update AFTER UPDATE ON messages
BEGIN
    INSERT INTO messages_fts( messages_fts, rowid, message_id, body, body_normalized )
    VALUES ( 'delete', old.rowid, old.id, old.body, old.body_normalized );

    INSERT INTO messages_fts( rowid, message_id, body, body_normalized )
    VALUES ( new.rowid, new.id, new.body, new.body_normalized );
END;

CREATE TRIGGER IF NOT EXISTS messages_fts_delete AFTER DELETE ON messages
BEGIN
    INSERT INTO messages_fts( messages_fts, rowid, message_id, body, body_normalized )
    VALUES ( 'delete', old.rowid, old.id, old.body, old.body_normalized );
END;

CREATE TABLE IF NOT EXISTS grapevine_updates (
    id TEXT PRIMARY KEY,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    generated_at TEXT NOT NULL,
    model TEXT,
    prompt_version TEXT NOT NULL,
    status TEXT NOT NULL CHECK ( status IN ( 'success', 'empty', 'error' ) ),
    summary_markdown TEXT,
    source_message_count INTEGER NOT NULL DEFAULT 0,
    usage_json TEXT,
    error_message TEXT,
    generation_kind TEXT NOT NULL CHECK ( generation_kind IN ( 'scheduled', 'manual' ) ),
    triggered_by_user_id TEXT REFERENCES users( id )
);

CREATE INDEX IF NOT EXISTS idx_grapevine_updates_generated_at ON grapevine_updates( generated_at );
CREATE INDEX IF NOT EXISTS idx_grapevine_updates_status ON grapevine_updates( status );
CREATE INDEX IF NOT EXISTS idx_grapevine_updates_period ON grapevine_updates( period_start, period_end );
CREATE INDEX IF NOT EXISTS idx_grapevine_updates_kind_generated_at ON grapevine_updates( generation_kind, generated_at );
CREATE UNIQUE INDEX IF NOT EXISTS idx_grapevine_updates_scheduled_period
    ON grapevine_updates( period_start, period_end, generation_kind )
    WHERE generation_kind = 'scheduled';

CREATE TABLE IF NOT EXISTS ai_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users( id ) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    model TEXT,
    time_window TEXT,
    filters_json TEXT,
    question TEXT,
    response_markdown TEXT,
    source_message_count INTEGER NOT NULL DEFAULT 0,
    usage_json TEXT,
    created_at TEXT NOT NULL,
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_ai_requests_user_id ON ai_requests( user_id );
CREATE INDEX IF NOT EXISTS idx_ai_requests_kind ON ai_requests( kind );
CREATE INDEX IF NOT EXISTS idx_ai_requests_created_at ON ai_requests( created_at );

CREATE TABLE IF NOT EXISTS rate_limits (
    id TEXT PRIMARY KEY,
    scope TEXT NOT NULL,
    bucket TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    reset_at TEXT NOT NULL,
    UNIQUE ( scope, bucket )
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_reset_at ON rate_limits( reset_at );

CREATE TABLE IF NOT EXISTS webauthn_challenges (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    challenge TEXT NOT NULL,
    kind TEXT NOT NULL CHECK ( kind IN ( 'registration', 'authentication' ) ),
    payload_json TEXT,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_challenge ON webauthn_challenges( challenge );
CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_expires_at ON webauthn_challenges( expires_at );

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users( id ) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL,
    created_by_user_id TEXT REFERENCES users( id )
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens( user_id );
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at ON password_reset_tokens( expires_at );

INSERT OR IGNORE INTO hubs ( id, name, slug, is_active, created_at, updated_at ) VALUES
    ( 'hub_amsterdam', 'Amsterdam', 'amsterdam', 1, datetime( 'now' ), datetime( 'now' ) ),
    ( 'hub_london', 'London', 'london', 1, datetime( 'now' ), datetime( 'now' ) ),
    ( 'hub_madrid', 'Madrid', 'madrid', 1, datetime( 'now' ), datetime( 'now' ) ),
    ( 'hub_berlin', 'Berlin', 'berlin', 1, datetime( 'now' ), datetime( 'now' ) ),
    ( 'hub_paris', 'Paris', 'paris', 1, datetime( 'now' ), datetime( 'now' ) ),
    ( 'hub_lisbon', 'Lisbon', 'lisbon', 1, datetime( 'now' ), datetime( 'now' ) ),
    ( 'hub_elsewhere', 'Elsewhere', 'elsewhere', 1, datetime( 'now' ), datetime( 'now' ) );
