CREATE TABLE IF NOT EXISTS ai_settings (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'local',
  model text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT false,
  encrypted_key text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
