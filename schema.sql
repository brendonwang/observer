-- Run once in Cloudflare D1 > your database > Console.
CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    last_seen_at INTEGER NOT NULL,
    thread_count INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS threads (
    id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    title TEXT NOT NULL,
    project TEXT NOT NULL,
    status TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    received_at INTEGER NOT NULL,
    snapshot TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS threads_recent ON threads(updated_at DESC);
CREATE TABLE IF NOT EXISTS previews (
    thread_id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    mime TEXT NOT NULL,
    image_b64 TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS login_attempts (
    fingerprint TEXT PRIMARY KEY,
    attempts INTEGER NOT NULL,
    reset_at INTEGER NOT NULL
);
