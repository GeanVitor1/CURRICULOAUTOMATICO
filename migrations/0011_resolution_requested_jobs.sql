ALTER TABLE resolution_tasks ADD COLUMN requested_job_ids jsonb NOT NULL DEFAULT '[]';
