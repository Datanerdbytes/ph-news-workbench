CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'ink-white',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('owner', 'editor')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS workspace_members_user_idx ON workspace_members (user_id);

CREATE TABLE IF NOT EXISTS workspace_invites (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('owner', 'editor')),
  created_by TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  accepted_by TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspace_invites_workspace_idx ON workspace_invites (workspace_id);

CREATE TABLE IF NOT EXISTS feeds (
  id SERIAL PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT,
  etag TEXT,
  last_modified TEXT,
  last_fetched_at TIMESTAMPTZ,
  error_message TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (workspace_id, url)
);

CREATE TABLE IF NOT EXISTS news_items (
  id SERIAL PRIMARY KEY,
  feed_id INTEGER REFERENCES feeds(id) ON DELETE SET NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  guid TEXT,
  link TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  published_at TIMESTAMPTZ,
  raw_payload JSONB,
  dedup_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (workspace_id, dedup_hash)
);

CREATE INDEX IF NOT EXISTS feeds_workspace_idx ON feeds (workspace_id);
CREATE INDEX IF NOT EXISTS news_items_workspace_idx ON news_items (workspace_id);
CREATE INDEX IF NOT EXISTS news_items_feed_idx ON news_items (feed_id);

CREATE TABLE IF NOT EXISTS drafts (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  news_item_id INTEGER REFERENCES news_items(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  estimated_cost NUMERIC(10,6) NOT NULL,
  status TEXT NOT NULL DEFAULT 'drafted',
  correlation_id UUID NOT NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS drafts_user_item_idx ON drafts (user_id, news_item_id, id DESC);
CREATE INDEX IF NOT EXISTS drafts_workspace_idx ON drafts (workspace_id, id DESC);

CREATE TABLE IF NOT EXISTS scheduled_posts (
  id SERIAL PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  news_item_id INTEGER REFERENCES news_items(id) ON DELETE SET NULL,
  draft_id INTEGER REFERENCES drafts(id) ON DELETE SET NULL,
  text TEXT NOT NULL,
  image_url TEXT,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  kind TEXT NOT NULL DEFAULT 'post',
  source TEXT NOT NULL DEFAULT 'local',
  facebook_post_id TEXT,
  facebook_post_ids JSONB,
  page_id TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_by TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scheduled_workspace_time_idx ON scheduled_posts (workspace_id, scheduled_for);
CREATE INDEX IF NOT EXISTS scheduled_due_idx ON scheduled_posts (status, scheduled_for);
CREATE INDEX IF NOT EXISTS scheduled_native_idx ON scheduled_posts (source, status, scheduled_for);

CREATE TABLE IF NOT EXISTS scheduled_post_events (
  id BIGSERIAL PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  scheduled_post_id INTEGER NOT NULL,
  news_item_id INTEGER,
  event TEXT NOT NULL,
  source TEXT NOT NULL,
  actor_user_id TEXT,
  facebook_post_id TEXT,
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scheduled_post_events_post_idx
  ON scheduled_post_events (scheduled_post_id, created_at DESC);

CREATE INDEX IF NOT EXISTS scheduled_post_events_workspace_idx
  ON scheduled_post_events (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS usage_daily (
  day DATE PRIMARY KEY,
  total_tokens INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS facebook_connections (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  page_id TEXT NOT NULL,
  page_name TEXT NOT NULL,
  access_token TEXT NOT NULL,
  scopes TEXT,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS facebook_pages (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  page_id TEXT NOT NULL,
  page_name TEXT NOT NULL,
  access_token TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, page_id)
);

CREATE INDEX IF NOT EXISTS facebook_pages_workspace_idx
  ON facebook_pages (workspace_id, is_primary DESC);

CREATE TABLE IF NOT EXISTS live_streams (
  id SERIAL PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  facebook_video_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'created',
  stream_key TEXT,
  secure_stream_url TEXT,
  permalink_url TEXT,
  planned_start_time TIMESTAMPTZ,
  created_by TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, facebook_video_id)
);

CREATE INDEX IF NOT EXISTS live_streams_workspace_idx
  ON live_streams (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  dedupe_key TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_idx
  ON notifications (user_id, id DESC);

CREATE INDEX IF NOT EXISTS notifications_workspace_idx
  ON notifications (workspace_id, created_at DESC);

-- One UNREAD notification per workspace + dedupe key. Once the row is read,
-- a new occurrence of the same condition may insert again.
CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_unread_idx
  ON notifications (workspace_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL AND read_at IS NULL;