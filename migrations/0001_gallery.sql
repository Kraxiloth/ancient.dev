CREATE TABLE IF NOT EXISTS appearances (
 id TEXT PRIMARY KEY,
 status TEXT NOT NULL CHECK(status IN ('uploading','pending','approved','deleting')),
 name TEXT NOT NULL,
 author TEXT NOT NULL,
 description TEXT NOT NULL,
 appearance TEXT NOT NULL,
 images TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 published_at INTEGER,
 nonce TEXT NOT NULL,
 notification_sent INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS gallery_published ON appearances(status,published_at DESC,id DESC);
