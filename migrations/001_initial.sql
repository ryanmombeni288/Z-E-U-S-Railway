CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  uuid TEXT,
  limit_gb DOUBLE PRECISION,
  expiry_days INTEGER,
  ips TEXT,
  connection_type TEXT,
  tls TEXT,
  port TEXT,
  used_gb DOUBLE PRECISION NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_active BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fingerprint TEXT NOT NULL DEFAULT 'chrome',
  max_connections INTEGER,
  limit_req INTEGER,
  used_req INTEGER NOT NULL DEFAULT 0,
  ip_limit INTEGER,
  active_ips TEXT,
  block_porn INTEGER NOT NULL DEFAULT 0,
  block_ads INTEGER NOT NULL DEFAULT 0,
  frag_len TEXT NOT NULL DEFAULT '200-3000',
  frag_int TEXT NOT NULL DEFAULT '1-2',
  lifetime_used_gb DOUBLE PRECISION NOT NULL DEFAULT 0,
  user_proxy_ip TEXT,
  user_proxy_iata TEXT,
  user_socks5 TEXT,
  auto_reset_vol_days INTEGER NOT NULL DEFAULT 0,
  auto_reset_req_days INTEGER NOT NULL DEFAULT 0,
  last_reset_vol_time BIGINT NOT NULL DEFAULT 0,
  last_reset_req_time BIGINT NOT NULL DEFAULT 0,
  auto_rotate_ip INTEGER NOT NULL DEFAULT 1,
  rotate_time INTEGER NOT NULL DEFAULT 0,
  ip_operator TEXT NOT NULL DEFAULT 'all',
  ip_count INTEGER NOT NULL DEFAULT 15,
  last_rotate_time BIGINT NOT NULL DEFAULT 0,
  auto_rotate_user_proxy INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_unique ON users (LOWER(username));
CREATE INDEX IF NOT EXISTS users_uuid_idx ON users (uuid);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS runtime_statistics (
  key TEXT PRIMARY KEY,
  value BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

UPDATE users
SET ip_limit = max_connections
WHERE ip_limit IS NULL AND max_connections IS NOT NULL;

UPDATE users
SET lifetime_used_gb = used_gb
WHERE lifetime_used_gb = 0 OR lifetime_used_gb IS NULL;
