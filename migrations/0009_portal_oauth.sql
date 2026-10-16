CREATE TABLE IF NOT EXISTS portal_oauth_states (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  state_hash text NOT NULL,
  client_id text NOT NULL,
  redirect_uri text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS portal_oauth_states_user_idx ON portal_oauth_states(user_id);
CREATE TABLE IF NOT EXISTS portal_oauth_accounts (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  generation text NOT NULL,
  encrypted_data text,
  connected_at timestamptz,
  expires_at timestamptz
);
CREATE INDEX IF NOT EXISTS portal_oauth_accounts_user_idx ON portal_oauth_accounts(user_id);
