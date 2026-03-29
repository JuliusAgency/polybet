-- Migration 025: Add seen_at to bets for unseen-results tracking
-- seen_at = NULL means the user has not acknowledged this settled bet.
-- mark_bets_seen() stamps all unseen won/lost bets for the calling user.
--
-- Note: No direct UPDATE policy is added for seen_at. The sole write path
-- is mark_bets_seen() (SECURITY DEFINER), which scopes the update to the
-- calling user's own rows. This avoids exposing a broad UPDATE grant.

ALTER TABLE bets ADD COLUMN seen_at timestamptz DEFAULT NULL;

-- Partial index: fast COUNT(*) for the badge query
CREATE INDEX idx_bets_unseen
  ON bets(user_id)
  WHERE seen_at IS NULL AND status IN ('won', 'lost');

-- RPC called by the frontend to stamp all unseen settled bets at once
CREATE OR REPLACE FUNCTION mark_bets_seen()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE bets
  SET seen_at = now()
  WHERE user_id = auth.uid()
    AND status IN ('won', 'lost')
    AND seen_at IS NULL;
$$;
