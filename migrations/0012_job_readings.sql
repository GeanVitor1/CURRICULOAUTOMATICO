CREATE TABLE IF NOT EXISTS job_readings (
  key text PRIMARY KEY,
  reading jsonb NOT NULL,
  model text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
