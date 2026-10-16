-- Keep originals out of frequently read workspace JSON. Copy inside the database:
-- migrating existing files must not transfer them through the application.
CREATE TABLE IF NOT EXISTS resume_files (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  resume_id TEXT NOT NULL,
  extension TEXT NOT NULL CHECK (extension IN ('.pdf', '.docx')),
  ciphertext TEXT NOT NULL,
  PRIMARY KEY (workspace_id, resume_id)
);

INSERT INTO resume_files (workspace_id, resume_id, extension, ciphertext)
SELECT w.id, r->>'id', r->'storedFile'->>'extension', r->'storedFile'->>'ciphertext'
FROM workspaces w
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(w.data->'resumes', '[]'::jsonb)) r
WHERE r->'storedFile'->>'extension' IN ('.pdf', '.docx')
  AND r->'storedFile'->>'ciphertext' IS NOT NULL
ON CONFLICT (workspace_id, resume_id) DO NOTHING;

UPDATE workspaces w
SET data = jsonb_set(w.data, '{resumes}', (
  SELECT COALESCE(jsonb_agg(
    CASE WHEN EXISTS (
      SELECT 1 FROM resume_files f WHERE f.workspace_id = w.id AND f.resume_id = r->>'id'
    ) THEN (r - 'storedFile') || '{"originalFileAvailable":true}'::jsonb ELSE r END
    ORDER BY position
  ), '[]'::jsonb)
  FROM jsonb_array_elements(COALESCE(w.data->'resumes', '[]'::jsonb)) WITH ORDINALITY AS items(r, position)
))
WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements(COALESCE(w.data->'resumes', '[]'::jsonb)) r
  WHERE r ? 'storedFile'
);
