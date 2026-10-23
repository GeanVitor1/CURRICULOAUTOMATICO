CREATE TABLE IF NOT EXISTS opportunity_catalog (
  key text PRIMARY KEY,
  company_key text NOT NULL,
  job jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  lease_token text,
  lease_until timestamptz
);
CREATE INDEX IF NOT EXISTS opportunity_company_idx ON opportunity_catalog(company_key);
CREATE TABLE IF NOT EXISTS resolution_tasks (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0,
  lease_token text,
  lease_until timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS resolution_tasks_due_idx ON resolution_tasks(status, created_at);
