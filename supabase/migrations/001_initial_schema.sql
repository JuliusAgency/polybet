-- Migration 001: Initial Schema
-- PolyBet SaaS betting platform
-- Roles: super_admin, manager, user
-- No self-registration — all accounts created by admins

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- profiles: extends auth.users
CREATE TABLE profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username    text UNIQUE NOT NULL,
  full_name   text NOT NULL DEFAULT '',
  role        text NOT NULL CHECK (role IN ('super_admin', 'manager', 'user')),
  phone       text,
  notes       text,
  is_active   boolean DEFAULT true NOT NULL,
  created_by  uuid REFERENCES profiles(id),
  created_at  timestamptz DEFAULT now() NOT NULL
);

-- managers: extends profiles for manager role
CREATE TABLE managers (
  id              uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  balance         numeric DEFAULT 0 NOT NULL,
  max_bet_limit   numeric,
  max_win_limit   numeric,
  margin          numeric DEFAULT 0 NOT NULL,
  monthly_stats   jsonb DEFAULT '{}' NOT NULL
);

-- manager_user_links: manager <-> user relationship
CREATE TABLE manager_user_links (
  manager_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (manager_id, user_id)
);

-- balances: user balance
CREATE TABLE balances (
  user_id     uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  available   numeric DEFAULT 0 NOT NULL,
  in_play     numeric DEFAULT 0 NOT NULL,
  updated_at  timestamptz DEFAULT now() NOT NULL
);

-- markets: from Polymarket
CREATE TABLE markets (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  polymarket_id       text UNIQUE NOT NULL,
  question            text NOT NULL,
  category            text,
  status              text DEFAULT 'open' NOT NULL CHECK (status IN ('open', 'closed', 'resolved')),
  close_at            timestamptz,
  resolved_at         timestamptz,
  winning_outcome_id  uuid,  -- FK added after market_outcomes
  created_at          timestamptz DEFAULT now() NOT NULL
);

-- market_outcomes: outcomes with odds
CREATE TABLE market_outcomes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id       uuid NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  name            text NOT NULL,
  odds            numeric NOT NULL CHECK (odds > 0),
  effective_odds  numeric NOT NULL CHECK (effective_odds > 0),
  updated_at      timestamptz DEFAULT now() NOT NULL
);

-- Add FK for winning_outcome_id (can only add after market_outcomes exists)
ALTER TABLE markets ADD CONSTRAINT fk_winning_outcome
  FOREIGN KEY (winning_outcome_id) REFERENCES market_outcomes(id);

-- bets: user bets with locked odds
CREATE TABLE bets (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES profiles(id),
  market_id         uuid NOT NULL REFERENCES markets(id),
  outcome_id        uuid NOT NULL REFERENCES market_outcomes(id),
  stake             numeric NOT NULL CHECK (stake > 0),
  locked_odds       numeric NOT NULL CHECK (locked_odds > 0),  -- IMMUTABLE after insert
  potential_payout  numeric NOT NULL CHECK (potential_payout > 0),
  status            text DEFAULT 'open' NOT NULL CHECK (status IN ('open', 'won', 'lost', 'cancelled')),
  placed_at         timestamptz DEFAULT now() NOT NULL,
  settled_at        timestamptz
);

-- balance_transactions: IMMUTABLE ledger (append-only)
CREATE TABLE balance_transactions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES profiles(id),
  initiated_by  uuid NOT NULL REFERENCES profiles(id),
  type          text NOT NULL CHECK (type IN ('mint', 'transfer', 'bet_lock', 'bet_payout', 'adjustment')),
  amount        numeric NOT NULL,
  balance_after numeric NOT NULL,
  bet_id        uuid REFERENCES bets(id),
  note          text,
  created_at    timestamptz DEFAULT now() NOT NULL
);

-- system_settings: key/value store
CREATE TABLE system_settings (
  key    text PRIMARY KEY,
  value  jsonb NOT NULL
);

-- Indexes for performance
CREATE INDEX idx_bets_user_id ON bets(user_id);
CREATE INDEX idx_bets_market_id ON bets(market_id);
CREATE INDEX idx_bets_status ON bets(status);
CREATE INDEX idx_balance_transactions_user_id ON balance_transactions(user_id);
CREATE INDEX idx_market_outcomes_market_id ON market_outcomes(market_id);
CREATE INDEX idx_manager_user_links_manager_id ON manager_user_links(manager_id);
