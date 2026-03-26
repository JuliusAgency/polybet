-- Migration 022: Fix admin_create_demo_market — polymarket_id is NOT NULL UNIQUE
-- Use a generated unique stub so the insert doesn't fail.

CREATE OR REPLACE FUNCTION admin_create_demo_market(
  p_question text DEFAULT 'Demo market — will this bet settle correctly?'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_market_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  INSERT INTO markets (polymarket_id, question, status, is_visible, close_at)
  VALUES (
    'demo-' || gen_random_uuid()::text,
    p_question,
    'open',
    true,
    now() + interval '7 days'
  )
  RETURNING id INTO v_market_id;

  INSERT INTO market_outcomes (market_id, name, odds, effective_odds)
  VALUES
    (v_market_id, 'Yes', 1.90, 1.90),
    (v_market_id, 'No',  1.95, 1.95);

  RETURN v_market_id;
END;
$$;
