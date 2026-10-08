CREATE TABLE IF NOT EXISTS source_catalog (
  key TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  board TEXT NOT NULL,
  company TEXT NOT NULL,
  sector TEXT NOT NULL DEFAULT 'Não informado',
  country TEXT NOT NULL DEFAULT '',
  jobs JSONB NOT NULL DEFAULT '[]'::jsonb,
  fetched_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  retry_at TIMESTAMPTZ,
  lease_until TIMESTAMPTZ,
  lease_token TEXT,
  last_error TEXT
);
