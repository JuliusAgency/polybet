-- Migration 046: RPC for archiving resolved markets
--
-- The archive button was doing a direct client-side UPDATE on markets,
-- but the project convention is that all writes go through SECURITY DEFINER
-- RPCs which bypass RLS. The direct update silently affected 0 rows because
-- no UPDATE policy existed in the applied migrations.

CREATE OR REPLACE FUNCTION archive_market(p_market_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_status text;
BEGIN
  -- Only super_admin may archive
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role IS DISTINCT FROM 'super_admin' THEN
    RAISE EXCEPTION 'forbidden: only super_admin can archive markets';
  END IF;

  -- Check current status
  SELECT status INTO v_status FROM markets WHERE id = p_market_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'market not found';
  END IF;
  IF v_status <> 'resolved' THEN
    RAISE EXCEPTION 'only resolved markets can be archived (current status: %)', v_status;
  END IF;

  UPDATE markets
  SET status      = 'archived',
      archived_at = now()
  WHERE id = p_market_id;
END;
$$;
