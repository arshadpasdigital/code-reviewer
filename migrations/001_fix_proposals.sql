CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS fix_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_run_id bigint NOT NULL,
  installation_id bigint NOT NULL,
  owner text NOT NULL,
  repo text NOT NULL,
  pull_number integer NOT NULL,
  head_owner text NOT NULL,
  head_repo text NOT NULL,
  head_ref text NOT NULL,
  head_sha text NOT NULL,
  edits jsonb NOT NULL,
  patch text NOT NULL,
  validation jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('proposed', 'applied', 'stale', 'expired')),
  applied_commit_sha text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days'
);

CREATE INDEX IF NOT EXISTS fix_proposals_check_run_idx
  ON fix_proposals (check_run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS fix_proposals_expiry_idx
  ON fix_proposals (status, expires_at);
