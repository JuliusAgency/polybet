-- Migration 038: Enable RLS on bets + add markets to realtime publication
--
-- Problem: Supabase Realtime postgres_changes requires RLS to be enabled on the
-- subscribed table to properly authorize and send events to subscribers.
-- Without RLS enabled on `bets`, realtime events for bet status changes (e.g.
-- won/lost after market settlement) are not delivered to client subscriptions.
--
-- Additionally, `markets` was not in the realtime publication, so changes to
-- market status (resolved) were not broadcast. useMyBets joins markets data,
-- so we need to invalidate the bets query when markets change too.

-- 1. Enable RLS on bets
--    Policies already exist from migration 008:
--      "Users read own bets"            -> user_id = auth.uid()
--      "Managers read linked user bets" -> via manager_user_links
--      "Super admin reads all bets"     -> is_super_admin()
--    SECURITY DEFINER RPCs (settle_market, place_bet, etc.) run as postgres
--    which has BYPASSRLS, so they are unaffected.
ALTER TABLE bets ENABLE ROW LEVEL SECURITY;

-- 2. Add markets table to realtime publication so that market status changes
--    (open -> resolved) are broadcast to subscribers.
--    useMyBets joins markets data and needs to react to market resolution.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'markets'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE markets;
  END IF;
END;
$$;
