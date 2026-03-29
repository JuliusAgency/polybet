-- Migration 030: Hierarchical max bet limits
-- Adds system, manager, and user max bet limit resolution with server-side enforcement.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS max_bet_limit numeric;

INSERT INTO system_settings (key, value)
VALUES ('bet_limits', jsonb_build_object('global_max_bet', 0))
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION resolve_effective_max_bet_limit(p_user_id uuid)
RETURNS TABLE (effective_limit numeric, source text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_global_limit numeric := COALESCE(
    (
      SELECT (value ->> 'global_max_bet')::numeric
      FROM system_settings
      WHERE key = 'bet_limits'
    ),
    0
  );
BEGIN
  RETURN QUERY
  SELECT
    CASE
      WHEN NULLIF(GREATEST(COALESCE(p.max_bet_limit, 0), 0), 0) IS NOT NULL
        THEN NULLIF(GREATEST(COALESCE(p.max_bet_limit, 0), 0), 0)
      WHEN NULLIF(GREATEST(COALESCE(m.max_bet_limit, 0), 0), 0) IS NOT NULL
        THEN NULLIF(GREATEST(COALESCE(m.max_bet_limit, 0), 0), 0)
      WHEN GREATEST(v_global_limit, 0) > 0
        THEN GREATEST(v_global_limit, 0)
      ELSE NULL
    END AS effective_limit,
    CASE
      WHEN NULLIF(GREATEST(COALESCE(p.max_bet_limit, 0), 0), 0) IS NOT NULL
        THEN 'user'::text
      WHEN NULLIF(GREATEST(COALESCE(m.max_bet_limit, 0), 0), 0) IS NOT NULL
        THEN 'manager'::text
      WHEN GREATEST(v_global_limit, 0) > 0
        THEN 'global'::text
      ELSE 'none'::text
    END AS source
  FROM profiles p
  LEFT JOIN manager_user_links mul ON mul.user_id = p.id
  LEFT JOIN managers m ON m.id = mul.manager_id
  WHERE p.id = p_user_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      CASE WHEN GREATEST(v_global_limit, 0) > 0 THEN GREATEST(v_global_limit, 0) ELSE NULL END,
      CASE WHEN GREATEST(v_global_limit, 0) > 0 THEN 'global'::text ELSE 'none'::text END;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION place_bet(
  p_market_id  uuid,
  p_outcome_id uuid,
  p_stake      numeric
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id       uuid := auth.uid();
  v_available     numeric;
  v_odds          numeric;
  v_payout        numeric;
  v_bet_id        uuid;
  v_balance_after numeric;
  v_effective_limit numeric;
  v_limit_source  text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT effective_limit, source
  INTO v_effective_limit, v_limit_source
  FROM resolve_effective_max_bet_limit(v_user_id);

  IF v_effective_limit IS NOT NULL AND p_stake > v_effective_limit THEN
    RAISE EXCEPTION 'Stake exceeds effective maximum bet limit';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM markets
    WHERE id = p_market_id AND status = 'open' AND is_visible = true
  ) THEN
    RAISE EXCEPTION 'Market is not available for betting';
  END IF;

  SELECT odds INTO v_odds
  FROM market_outcomes
  WHERE id = p_outcome_id AND market_id = p_market_id;

  IF v_odds IS NULL THEN
    RAISE EXCEPTION 'Invalid outcome for this market';
  END IF;

  SELECT available INTO v_available
  FROM balances
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF v_available IS NULL OR v_available < p_stake THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  v_payout        := p_stake * v_odds;
  v_balance_after := v_available - p_stake;

  INSERT INTO bets (user_id, market_id, outcome_id, stake, locked_odds, potential_payout)
  VALUES (v_user_id, p_market_id, p_outcome_id, p_stake, v_odds, v_payout)
  RETURNING id INTO v_bet_id;

  UPDATE balances
  SET available  = available - p_stake,
      in_play    = in_play + p_stake,
      updated_at = now()
  WHERE user_id = v_user_id;

  INSERT INTO balance_transactions
    (user_id, initiated_by, type, amount, balance_after, bet_id, note)
  VALUES
    (v_user_id, v_user_id, 'bet_lock', -p_stake, v_balance_after, v_bet_id, 'Bet placed');

  RETURN v_bet_id;
END;
$$;

CREATE OR REPLACE FUNCTION admin_set_global_max_bet_limit(p_value numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: super_admin required';
  END IF;

  INSERT INTO system_settings (key, value)
  VALUES (
    'bet_limits',
    jsonb_build_object('global_max_bet', CASE WHEN p_value > 0 THEN p_value ELSE 0 END)
  )
  ON CONFLICT (key) DO UPDATE
  SET value = jsonb_set(
    COALESCE(system_settings.value, '{}'::jsonb),
    '{global_max_bet}',
    to_jsonb(CASE WHEN p_value > 0 THEN p_value ELSE 0 END),
    true
  );

  INSERT INTO admin_action_logs (action, target_id, initiated_by)
  VALUES ('set_global_max_bet_limit', auth.uid(), auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION admin_set_manager_max_bet_limit(p_manager_id uuid, p_value numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: super_admin required';
  END IF;

  UPDATE managers AS m
  SET max_bet_limit = CASE WHEN p_value > 0 THEN p_value ELSE NULL END
  FROM profiles AS p
  WHERE m.id = p_manager_id
    AND p.id = m.id
    AND p.role = 'manager';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Manager not found';
  END IF;

  INSERT INTO admin_action_logs (action, target_id, initiated_by)
  VALUES ('set_manager_max_bet_limit', p_manager_id, auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION admin_set_user_max_bet_limit(p_user_id uuid, p_value numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: super_admin required';
  END IF;

  UPDATE profiles
  SET max_bet_limit = CASE WHEN p_value > 0 THEN p_value ELSE NULL END
  WHERE id = p_user_id
    AND role = 'user';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  INSERT INTO admin_action_logs (action, target_id, initiated_by)
  VALUES ('set_user_max_bet_limit', p_user_id, auth.uid());
END;
$$;
