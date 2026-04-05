-- Migration 040: Fix is_super_admin() circular RLS recursion
--
-- Problem: Migration 039 enabled RLS on `profiles`. The is_super_admin()
-- function reads from `profiles` without SECURITY DEFINER, so when it is
-- called inside an RLS policy it triggers RLS evaluation on `profiles` again,
-- causing infinite recursion (PostgreSQL error 54001, stack depth exceeded).
--
-- Affected tables: profiles, manager_user_links, balance_transactions, managers
-- (all tables whose policies call is_super_admin())
--
-- Fix: Add SECURITY DEFINER so the function runs as its owner (postgres,
-- which has BYPASSRLS) and reads profiles without entering RLS evaluation.
-- SET search_path prevents search_path injection attacks on SECURITY DEFINER
-- functions.

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  );
$$;
