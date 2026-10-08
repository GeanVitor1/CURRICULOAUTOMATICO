ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS consent boolean NOT NULL DEFAULT false;
