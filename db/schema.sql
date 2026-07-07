CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  content_markdown TEXT NOT NULL,
  cover_asset_id TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED')),
  content_origin TEXT NOT NULL DEFAULT 'ORIGINAL' CHECK (content_origin IN ('ORIGINAL', 'REPOST', 'TRANSLATION')),
  creation_statement TEXT NOT NULL DEFAULT 'NONE' CHECK (creation_statement IN ('NONE', 'AI_ASSISTED', 'AGGREGATED', 'PERSONAL_VIEW')),
  visibility TEXT NOT NULL DEFAULT 'PUBLIC' CHECK (visibility IN ('PUBLIC', 'PRIVATE')),
  pub_date TEXT NOT NULL,
  updated_date TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cover_asset_id) REFERENCES assets(id)
);

CREATE INDEX IF NOT EXISTS idx_posts_status_pub_date
  ON posts(status, pub_date DESC);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS post_tags (
  post_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  PRIMARY KEY (post_id, tag_id),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  r2_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  alt TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_assets_created_at
  ON assets(created_at DESC);

CREATE TABLE IF NOT EXISTS post_assets (
  post_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  usage TEXT NOT NULL DEFAULT 'INLINE' CHECK (usage IN ('COVER', 'INLINE', 'ATTACHMENT')),
  PRIMARY KEY (post_id, asset_id, usage),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN ('pageview', 'web_vital', 'client_error', 'api')),
  path TEXT NOT NULL,
  page_title TEXT,
  referrer TEXT,
  visitor_id TEXT,
  session_id TEXT,
  metric_name TEXT,
  metric_value REAL,
  duration_ms REAL,
  status_code INTEGER,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at
  ON analytics_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_events_type_created_at
  ON analytics_events(event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_events_path_created_at
  ON analytics_events(path, created_at DESC);
