-- Migration 049: admin_create_demo_event RPC
-- Creates a Polymarket-style event with N child markets in one transaction.
-- Mirrors admin_create_demo_market (mig. 022) but builds the Event → Markets hierarchy.
--
-- p_markets is a jsonb array. Each element supports:
--   question     text    (required) — user-visible question/title of the child market
--   group_label  text    (optional) — short label inside the event (e.g. "by Apr 22")
--   outcomes     jsonb   (optional) — array of { name, price?, odds? }; defaults to Yes/No @ 1.90/1.95
--   close_at     timestamptz (optional) — per-market override; falls back to p_close_at
--
-- Example payload:
--   [
--     { "question": "Iran ceasefire by Apr 22", "group_label": "by Apr 22",
--       "outcomes": [{"name":"Yes","price":0.25},{"name":"No","price":0.75}] },
--     { "question": "Iran ceasefire by Apr 30", "group_label": "by Apr 30" }
--   ]

CREATE OR REPLACE FUNCTION admin_create_demo_event(
  p_title       text,
  p_markets     jsonb,
  p_description text        DEFAULT NULL,
  p_category    text        DEFAULT NULL,
  p_close_at    timestamptz DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_event_id   uuid;
  v_market_id  uuid;
  v_market     jsonb;
  v_outcome    jsonb;
  v_outcomes   jsonb;
  v_close_at   timestamptz;
  v_price      numeric;
  v_odds       numeric;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF p_title IS NULL OR length(trim(p_title)) = 0 THEN
    RAISE EXCEPTION 'Event title is required';
  END IF;

  IF p_markets IS NULL OR jsonb_typeof(p_markets) <> 'array' OR jsonb_array_length(p_markets) = 0 THEN
    RAISE EXCEPTION 'At least one child market is required';
  END IF;

  -- Create event
  INSERT INTO events (
    polymarket_id, title, description, category, status, is_visible, close_at
  )
  VALUES (
    'demo-event-' || gen_random_uuid()::text,
    p_title,
    p_description,
    p_category,
    'open',
    true,
    COALESCE(p_close_at, now() + interval '7 days')
  )
  RETURNING id INTO v_event_id;

  -- Create child markets
  FOR v_market IN SELECT * FROM jsonb_array_elements(p_markets)
  LOOP
    IF (v_market->>'question') IS NULL OR length(trim(v_market->>'question')) = 0 THEN
      RAISE EXCEPTION 'Each market requires a non-empty "question"';
    END IF;

    v_close_at := COALESCE(
      (v_market->>'close_at')::timestamptz,
      p_close_at,
      now() + interval '7 days'
    );

    INSERT INTO markets (
      polymarket_id, question, status, is_visible, close_at,
      category, event_id, group_label
    )
    VALUES (
      'demo-' || gen_random_uuid()::text,
      v_market->>'question',
      'open',
      true,
      v_close_at,
      p_category,
      v_event_id,
      v_market->>'group_label'
    )
    RETURNING id INTO v_market_id;

    -- Outcomes: use provided array or fall back to Yes/No defaults
    v_outcomes := v_market->'outcomes';

    IF v_outcomes IS NULL OR jsonb_typeof(v_outcomes) <> 'array' OR jsonb_array_length(v_outcomes) = 0 THEN
      INSERT INTO market_outcomes (market_id, name, price, odds, effective_odds)
      VALUES
        (v_market_id, 'Yes', 0.5, 1.90, 1.90),
        (v_market_id, 'No',  0.5, 1.95, 1.95);
    ELSE
      FOR v_outcome IN SELECT * FROM jsonb_array_elements(v_outcomes)
      LOOP
        IF (v_outcome->>'name') IS NULL OR length(trim(v_outcome->>'name')) = 0 THEN
          RAISE EXCEPTION 'Each outcome requires a non-empty "name"';
        END IF;

        v_price := NULLIF(v_outcome->>'price', '')::numeric;
        v_odds  := NULLIF(v_outcome->>'odds',  '')::numeric;

        -- Derive odds from price if only price is provided (1/price).
        IF v_odds IS NULL THEN
          IF v_price IS NOT NULL AND v_price > 0 AND v_price <= 1 THEN
            v_odds := 1 / v_price;
          ELSE
            v_odds := 1.90;
          END IF;
        END IF;

        INSERT INTO market_outcomes (market_id, name, price, odds, effective_odds)
        VALUES (v_market_id, v_outcome->>'name', v_price, v_odds, v_odds);
      END LOOP;
    END IF;
  END LOOP;

  RETURN v_event_id;
END;
$$;

COMMENT ON FUNCTION admin_create_demo_event(text, jsonb, text, text, timestamptz) IS
  'Super-admin RPC: create a demo event with N child markets (Polymarket-style hierarchy). '
  'Used by the Test Lab UI.';
