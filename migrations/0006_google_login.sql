ALTER TABLE users ALTER COLUMN password DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub text;
CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_idx ON users(google_sub);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS google_authenticated_at timestamptz;
CREATE TABLE IF NOT EXISTS google_oauth_states (
  state_hash text PRIMARY KEY,
  browser_hash text NOT NULL,
  nonce text NOT NULL,
  code_verifier text NOT NULL,
  intent text NOT NULL,
  user_id text REFERENCES users(id) ON DELETE CASCADE,
  session_hash text REFERENCES sessions(token) ON DELETE CASCADE,
  client_id text NOT NULL,
  redirect_uri text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS google_oauth_states_expiry_idx ON google_oauth_states(expires_at);
