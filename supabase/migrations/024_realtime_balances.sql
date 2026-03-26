-- Migration 024: Enable Realtime for balances table
-- Required for useUserBalance hook to receive live updates when balance changes
-- (bet placed, bet settled, deposit, withdrawal).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'balances'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE balances;
  END IF;
END $$;
