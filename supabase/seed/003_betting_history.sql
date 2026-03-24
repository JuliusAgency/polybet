-- Seed: Local betting history for development
-- Adds demo markets, outcomes, bets, ledger entries, admin action logs, and sync run history.
-- Depends on 002_test_users.sql.

DO $$
DECLARE
  admin_id    uuid := '00000000-0000-0000-0000-000000000001';
  manager_id  uuid := '00000000-0000-0000-0000-000000000002';
  user1_id    uuid := '00000000-0000-0000-0000-000000000003';
  user2_id    uuid := '00000000-0000-0000-0000-000000000004';
  user3_id    uuid := '00000000-0000-0000-0000-000000000005';

  market_open_manual_id   uuid := '10000000-0000-0000-0000-000000000001';
  market_open_seeded_id   uuid := '10000000-0000-0000-0000-000000000002';
  market_resolved_id      uuid := '10000000-0000-0000-0000-000000000003';
  market_resolved_2_id    uuid := '10000000-0000-0000-0000-000000000004';
  market_resolved_3_id    uuid := '10000000-0000-0000-0000-000000000005';

  outcome_open_manual_yes_id uuid := '11000000-0000-0000-0000-000000000001';
  outcome_open_manual_no_id  uuid := '11000000-0000-0000-0000-000000000002';
  outcome_open_seeded_yes_id uuid := '11000000-0000-0000-0000-000000000003';
  outcome_open_seeded_no_id  uuid := '11000000-0000-0000-0000-000000000004';
  outcome_resolved_yes_id    uuid := '11000000-0000-0000-0000-000000000005';
  outcome_resolved_no_id     uuid := '11000000-0000-0000-0000-000000000006';
  outcome_r2_yes_id          uuid := '11000000-0000-0000-0000-000000000007';
  outcome_r2_no_id           uuid := '11000000-0000-0000-0000-000000000008';
  outcome_r3_yes_id          uuid := '11000000-0000-0000-0000-000000000009';
  outcome_r3_no_id           uuid := '11000000-0000-0000-0000-000000000010';

  bet_open_user1_id      uuid := '12000000-0000-0000-0000-000000000001';
  bet_open_user2_id      uuid := '12000000-0000-0000-0000-000000000002';
  bet_resolved_user1_id  uuid := '12000000-0000-0000-0000-000000000003';
  bet_resolved_user2_id  uuid := '12000000-0000-0000-0000-000000000004';
  bet_resolved_user3_id  uuid := '12000000-0000-0000-0000-000000000005';
  bet_r2_user1_id        uuid := '12000000-0000-0000-0000-000000000006';
  bet_r2_user2_id        uuid := '12000000-0000-0000-0000-000000000007';
  bet_r2_user3_id        uuid := '12000000-0000-0000-0000-000000000008';
  bet_r3_user1_id        uuid := '12000000-0000-0000-0000-000000000009';
  bet_r3_user2_id        uuid := '12000000-0000-0000-0000-000000000010';
  bet_r3_user3_id        uuid := '12000000-0000-0000-0000-000000000011';

  tx_manager_deposit_id  uuid := '13000000-0000-0000-0000-000000000001';
  tx_user1_deposit_id    uuid := '13000000-0000-0000-0000-000000000002';
  tx_user2_withdraw_id   uuid := '13000000-0000-0000-0000-000000000003';
  tx_user3_deposit_id    uuid := '13000000-0000-0000-0000-000000000004';
  tx_user1_open_lock_id  uuid := '13000000-0000-0000-0000-000000000005';
  tx_user2_open_lock_id  uuid := '13000000-0000-0000-0000-000000000006';
  tx_user1_hist_lock_id  uuid := '13000000-0000-0000-0000-000000000007';
  tx_user1_hist_pay_id   uuid := '13000000-0000-0000-0000-000000000008';
  tx_user2_hist_lock_id  uuid := '13000000-0000-0000-0000-000000000009';
  tx_user2_hist_pay_id   uuid := '13000000-0000-0000-0000-000000000010';
  tx_user3_hist_lock_id  uuid := '13000000-0000-0000-0000-000000000011';
  tx_user3_hist_pay_id   uuid := '13000000-0000-0000-0000-000000000012';
  tx_r2_user1_lock_id    uuid := '13000000-0000-0000-0000-000000000013';
  tx_r2_user2_lock_id    uuid := '13000000-0000-0000-0000-000000000014';
  tx_r2_user3_lock_id    uuid := '13000000-0000-0000-0000-000000000015';
  tx_r3_user1_lock_id    uuid := '13000000-0000-0000-0000-000000000016';
  tx_r3_user2_lock_id    uuid := '13000000-0000-0000-0000-000000000017';
  tx_r3_user3_lock_id    uuid := '13000000-0000-0000-0000-000000000018';
  tx_r2_user1_pay_id     uuid := '13000000-0000-0000-0000-000000000019';
  tx_r2_user2_pay_id     uuid := '13000000-0000-0000-0000-000000000020';
  tx_r2_user3_pay_id     uuid := '13000000-0000-0000-0000-000000000021';
  tx_r3_user1_pay_id     uuid := '13000000-0000-0000-0000-000000000022';
  tx_r3_user2_pay_id     uuid := '13000000-0000-0000-0000-000000000023';
  tx_r3_user3_pay_id     uuid := '13000000-0000-0000-0000-000000000024';

  action_reset_user2_id  uuid := '14000000-0000-0000-0000-000000000001';
  action_reset_user3_id  uuid := '14000000-0000-0000-0000-000000000002';

  sync_run_demo_id       uuid := '15000000-0000-0000-0000-000000000001';
BEGIN
  -- Markets
  INSERT INTO markets (
    id, polymarket_id, question, category, status, close_at, resolved_at, winning_outcome_id,
    created_at, is_visible, liquidity, volume, image_url, polymarket_slug
  ) VALUES
    (
      market_open_manual_id,
      'demo:local:open:manual',
      '[DEMO] Manual bet placement market',
      'Demo',
      'open',
      '2026-04-01T12:00:00Z',
      NULL,
      NULL,
      '2026-03-20T09:00:00Z',
      true,
      12000,
      3400,
      NULL,
      'demo-local-open-manual'
    ),
    (
      market_open_seeded_id,
      'demo:local:open:seeded',
      '[DEMO] Open market with seeded bets',
      'Demo',
      'open',
      '2026-04-02T12:00:00Z',
      NULL,
      NULL,
      '2026-03-20T10:00:00Z',
      true,
      18000,
      5200,
      NULL,
      'demo-local-open-seeded'
    ),
    (
      market_resolved_id,
      'demo:local:resolved:history',
      '[DEMO] Resolved market with betting history',
      'Demo',
      'resolved',
      '2026-03-19T12:00:00Z',
      '2026-03-20T14:00:00Z',
      NULL,
      '2026-03-19T09:00:00Z',
      true,
      20000,
      8600,
      NULL,
      'demo-local-resolved-history'
    ),
    (
      market_resolved_2_id,
      'demo:local:resolved:crypto',
      '[DEMO] Will BTC reach $100k by end of March?',
      'Crypto',
      'resolved',
      '2026-03-22T12:00:00Z',
      '2026-03-22T14:00:00Z',
      NULL,
      '2026-03-20T10:00:00Z',
      true,
      35000,
      12400,
      NULL,
      'demo-local-resolved-crypto'
    ),
    (
      market_resolved_3_id,
      'demo:local:resolved:sports',
      '[DEMO] Will the home team win the championship?',
      'Sports',
      'resolved',
      '2026-03-22T16:00:00Z',
      '2026-03-22T18:00:00Z',
      NULL,
      '2026-03-20T11:00:00Z',
      true,
      28000,
      9800,
      NULL,
      'demo-local-resolved-sports'
    )
  ON CONFLICT (id) DO NOTHING;

  -- Outcomes
  INSERT INTO market_outcomes (
    id, market_id, name, odds, effective_odds, updated_at, polymarket_token_id
  ) VALUES
    (outcome_open_manual_yes_id, market_open_manual_id,  'Yes', 1.90, 1.90, '2026-03-20T09:00:00Z', 'demo:local:open:manual:yes'),
    (outcome_open_manual_no_id,  market_open_manual_id,  'No',  1.95, 1.95, '2026-03-20T09:00:00Z', 'demo:local:open:manual:no'),
    (outcome_open_seeded_yes_id, market_open_seeded_id,  'Yes', 2.00, 2.00, '2026-03-20T10:00:00Z', 'demo:local:open:seeded:yes'),
    (outcome_open_seeded_no_id,  market_open_seeded_id,  'No',  1.72, 1.72, '2026-03-20T10:00:00Z', 'demo:local:open:seeded:no'),
    (outcome_resolved_yes_id,    market_resolved_id,     'Yes', 1.80, 1.80, '2026-03-19T09:00:00Z', 'demo:local:resolved:history:yes'),
    (outcome_resolved_no_id,     market_resolved_id,     'No',  2.05, 2.05, '2026-03-19T09:00:00Z', 'demo:local:resolved:history:no'),
    (outcome_r2_yes_id,          market_resolved_2_id,   'Yes', 1.75, 1.75, '2026-03-20T10:00:00Z', 'demo:local:resolved:crypto:yes'),
    (outcome_r2_no_id,           market_resolved_2_id,   'No',  2.00, 2.00, '2026-03-20T10:00:00Z', 'demo:local:resolved:crypto:no'),
    (outcome_r3_yes_id,          market_resolved_3_id,   'Yes', 2.20, 2.20, '2026-03-20T11:00:00Z', 'demo:local:resolved:sports:yes'),
    (outcome_r3_no_id,           market_resolved_3_id,   'No',  1.65, 1.65, '2026-03-20T11:00:00Z', 'demo:local:resolved:sports:no')
  ON CONFLICT (id) DO NOTHING;

  UPDATE markets
  SET winning_outcome_id = outcome_resolved_yes_id
  WHERE id = market_resolved_id
    AND winning_outcome_id IS DISTINCT FROM outcome_resolved_yes_id;

  -- market_resolved_2: Yes wins (BTC reached $100k)
  UPDATE markets
  SET winning_outcome_id = outcome_r2_yes_id
  WHERE id = market_resolved_2_id
    AND winning_outcome_id IS DISTINCT FROM outcome_r2_yes_id;

  -- market_resolved_3: No wins (home team did not win)
  UPDATE markets
  SET winning_outcome_id = outcome_r3_no_id
  WHERE id = market_resolved_3_id
    AND winning_outcome_id IS DISTINCT FROM outcome_r3_no_id;

  -- Bets
  INSERT INTO bets (
    id, user_id, market_id, outcome_id, stake, locked_odds, potential_payout, status, placed_at, settled_at
  ) VALUES
    -- Original open bets
    (
      bet_open_user1_id,
      user1_id,
      market_open_seeded_id,
      outcome_open_seeded_yes_id,
      50,
      2.00,
      100,
      'open',
      '2026-03-20T11:00:00Z',
      NULL
    ),
    (
      bet_open_user2_id,
      user2_id,
      market_open_seeded_id,
      outcome_open_seeded_no_id,
      25,
      1.72,
      43,
      'open',
      '2026-03-20T11:05:00Z',
      NULL
    ),
    -- Original resolved bets (market_resolved_1)
    (
      bet_resolved_user1_id,
      user1_id,
      market_resolved_id,
      outcome_resolved_yes_id,
      40,
      1.80,
      72,
      'won',
      '2026-03-19T10:30:00Z',
      '2026-03-20T14:00:30Z'
    ),
    (
      bet_resolved_user2_id,
      user2_id,
      market_resolved_id,
      outcome_resolved_no_id,
      30,
      2.05,
      61.5,
      'lost',
      '2026-03-19T10:35:00Z',
      '2026-03-20T14:00:35Z'
    ),
    (
      bet_resolved_user3_id,
      user3_id,
      market_resolved_id,
      outcome_resolved_yes_id,
      20,
      1.80,
      36,
      'won',
      '2026-03-19T10:40:00Z',
      '2026-03-20T14:00:40Z'
    ),
    -- market_resolved_2 bets: Yes wins → user1 won, user2 lost, user3 won
    (
      bet_r2_user1_id,
      user1_id,
      market_resolved_2_id,
      outcome_r2_yes_id,
      60,
      1.75,
      105,
      'won',
      '2026-03-21T11:00:00Z',
      '2026-03-22T14:00:00Z'
    ),
    (
      bet_r2_user2_id,
      user2_id,
      market_resolved_2_id,
      outcome_r2_no_id,
      40,
      2.00,
      80,
      'lost',
      '2026-03-21T11:05:00Z',
      '2026-03-22T14:00:05Z'
    ),
    (
      bet_r2_user3_id,
      user3_id,
      market_resolved_2_id,
      outcome_r2_yes_id,
      45,
      1.75,
      78.75,
      'won',
      '2026-03-21T11:10:00Z',
      '2026-03-22T14:00:10Z'
    ),
    -- market_resolved_3 bets: No wins → user1 won, user2 cancelled, user3 won
    (
      bet_r3_user1_id,
      user1_id,
      market_resolved_3_id,
      outcome_r3_no_id,
      80,
      1.65,
      132,
      'won',
      '2026-03-21T12:00:00Z',
      '2026-03-22T18:00:00Z'
    ),
    (
      bet_r3_user2_id,
      user2_id,
      market_resolved_3_id,
      outcome_r3_yes_id,
      20,
      2.20,
      44,
      'cancelled',
      '2026-03-21T12:05:00Z',
      '2026-03-22T18:00:05Z'
    ),
    (
      bet_r3_user3_id,
      user3_id,
      market_resolved_3_id,
      outcome_r3_no_id,
      40,
      1.65,
      66,
      'won',
      '2026-03-21T12:10:00Z',
      '2026-03-22T18:00:10Z'
    )
  ON CONFLICT (id) DO NOTHING;

  -- Financial transactions and bet ledger
  INSERT INTO balance_transactions (
    id, user_id, initiated_by, type, amount, balance_after, bet_id, note, created_at
  ) VALUES
    -- Original transactions
    (tx_manager_deposit_id, manager_id, admin_id,    'adjustment',  300,  300,  NULL,                  'Seed manager float',          '2026-03-20T08:30:00Z'),
    (tx_user1_deposit_id,   user1_id,   manager_id,  'adjustment',  200,  1200, NULL,                  'Seed top-up for user1',        '2026-03-20T09:10:00Z'),
    (tx_user2_withdraw_id,  user2_id,   manager_id,  'transfer',   -100,  900,  NULL,                  'Seed withdrawal for user2',    '2026-03-20T09:20:00Z'),
    (tx_user3_deposit_id,   user3_id,   manager_id,  'adjustment',  150,  1150, NULL,                  'Seed top-up for user3',        '2026-03-20T09:30:00Z'),
    (tx_user1_open_lock_id, user1_id,   user1_id,    'bet_lock',    -50,  1150, bet_open_user1_id,     'Bet placed',                   '2026-03-20T11:00:05Z'),
    (tx_user2_open_lock_id, user2_id,   user2_id,    'bet_lock',    -25,  875,  bet_open_user2_id,     'Bet placed',                   '2026-03-20T11:05:05Z'),
    (tx_user1_hist_lock_id, user1_id,   user1_id,    'bet_lock',    -40,  1110, bet_resolved_user1_id, 'Bet placed',                   '2026-03-19T10:30:05Z'),
    (tx_user1_hist_pay_id,  user1_id,   user1_id,    'bet_payout',   72,  1182, bet_resolved_user1_id, 'Bet won',                      '2026-03-20T14:00:30Z'),
    (tx_user2_hist_lock_id, user2_id,   user2_id,    'bet_lock',    -30,  845,  bet_resolved_user2_id, 'Bet placed',                   '2026-03-19T10:35:05Z'),
    (tx_user2_hist_pay_id,  user2_id,   user2_id,    'bet_payout',    0,  845,  bet_resolved_user2_id, 'Bet lost',                     '2026-03-20T14:00:35Z'),
    (tx_user3_hist_lock_id, user3_id,   user3_id,    'bet_lock',    -20,  1130, bet_resolved_user3_id, 'Bet placed',                   '2026-03-19T10:40:05Z'),
    (tx_user3_hist_pay_id,  user3_id,   user3_id,    'bet_payout',   36,  1166, bet_resolved_user3_id, 'Bet won',                      '2026-03-20T14:00:40Z'),
    -- market_resolved_2 locks (2026-03-21)
    (tx_r2_user1_lock_id,   user1_id,   user1_id,    'bet_lock',    -60,  1122, bet_r2_user1_id,       'Bet placed',                   '2026-03-21T11:00:05Z'),
    (tx_r2_user2_lock_id,   user2_id,   user2_id,    'bet_lock',    -40,  805,  bet_r2_user2_id,       'Bet placed',                   '2026-03-21T11:05:05Z'),
    (tx_r2_user3_lock_id,   user3_id,   user3_id,    'bet_lock',    -45,  1121, bet_r2_user3_id,       'Bet placed',                   '2026-03-21T11:10:05Z'),
    -- market_resolved_3 locks (2026-03-21)
    (tx_r3_user1_lock_id,   user1_id,   user1_id,    'bet_lock',    -80,  1042, bet_r3_user1_id,       'Bet placed',                   '2026-03-21T12:00:05Z'),
    (tx_r3_user2_lock_id,   user2_id,   user2_id,    'bet_lock',    -20,  785,  bet_r3_user2_id,       'Bet placed',                   '2026-03-21T12:05:05Z'),
    (tx_r3_user3_lock_id,   user3_id,   user3_id,    'bet_lock',    -40,  1081, bet_r3_user3_id,       'Bet placed',                   '2026-03-21T12:10:05Z'),
    -- market_resolved_2 payouts (2026-03-22): Yes wins → user1 won (+105), user2 lost (+0), user3 won (+78.75)
    (tx_r2_user1_pay_id,    user1_id,   user1_id,    'bet_payout',  105,  1147, bet_r2_user1_id,       'Bet won',                      '2026-03-22T14:00:00Z'),
    (tx_r2_user2_pay_id,    user2_id,   user2_id,    'bet_payout',    0,  785,  bet_r2_user2_id,       'Bet lost',                     '2026-03-22T14:00:05Z'),
    (tx_r2_user3_pay_id,    user3_id,   user3_id,    'bet_payout',   78.75, 1159.75, bet_r2_user3_id,  'Bet won',                      '2026-03-22T14:00:10Z'),
    -- market_resolved_3 payouts (2026-03-22): No wins → user1 won (+132), user2 cancelled (+20), user3 won (+66)
    (tx_r3_user1_pay_id,    user1_id,   user1_id,    'bet_payout',  132,  1279, bet_r3_user1_id,       'Bet won',                      '2026-03-22T18:00:00Z'),
    (tx_r3_user2_pay_id,    user2_id,   user2_id,    'bet_payout',   20,  805,  bet_r3_user2_id,       'Bet cancelled — stake refunded','2026-03-22T18:00:05Z'),
    (tx_r3_user3_pay_id,    user3_id,   user3_id,    'bet_payout',   66,  1225.75, bet_r3_user3_id,    'Bet won',                      '2026-03-22T18:00:10Z')
  ON CONFLICT (id) DO NOTHING;

  -- Account activity history for manager profile page
  INSERT INTO admin_action_logs (id, created_at, action, target_id, initiated_by)
  VALUES
    (action_reset_user2_id, '2026-03-20T09:45:00Z', 'reset_password', user2_id, admin_id),
    (action_reset_user3_id, '2026-03-20T09:50:00Z', 'reset_password', user3_id, admin_id)
  ON CONFLICT (id) DO NOTHING;

  -- Sync history so the admin sync UI is not empty after reset
  INSERT INTO sync_runs (
    id, created_by, status, phase, max_pages, progress_current, progress_total,
    markets_synced, outcomes_updated, markets_settled, errors, error_message,
    created_at, started_at, updated_at, finished_at
  ) VALUES (
    sync_run_demo_id,
    admin_id,
    'completed',
    'demo_seeded',
    1,
    3,
    3,
    3,
    6,
    1,
    '[]'::jsonb,
    NULL,
    '2026-03-20T16:00:00Z',
    '2026-03-20T16:00:00Z',
    '2026-03-20T16:01:00Z',
    '2026-03-20T16:01:00Z'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Final balances after all seeded financial actions, historical bets, and open bets
  -- user1: 1200 deposit − 40 (hist1 lock) + 72 (hist1 won) − 60 (r2 lock) + 105 (r2 won) − 80 (r3 lock) + 132 (r3 won) − 50 (open lock) = 1279
  -- user2: 900 deposit − 30 (hist1 lock) + 0 (hist1 lost) − 40 (r2 lock) + 0 (r2 lost) − 20 (r3 lock) + 20 (r3 cancelled) − 25 (open lock) = 805
  -- user3: 1150 deposit − 20 (hist1 lock) + 36 (hist1 won) − 45 (r2 lock) + 78.75 (r2 won) − 40 (r3 lock) + 66 (r3 won) = 1225.75
  UPDATE balances
  SET available = CASE user_id
      WHEN user1_id THEN 1279
      WHEN user2_id THEN 805
      WHEN user3_id THEN 1225.75
      ELSE available
    END,
    in_play = CASE user_id
      WHEN user1_id THEN 50
      WHEN user2_id THEN 25
      WHEN user3_id THEN 0
      ELSE in_play
    END,
    updated_at = '2026-03-22T18:01:00Z'
  WHERE user_id IN (user1_id, user2_id, user3_id);

  UPDATE managers
  SET balance = 300
  WHERE id = manager_id;

  RAISE NOTICE 'Betting history seed created successfully';
END;
$$;
