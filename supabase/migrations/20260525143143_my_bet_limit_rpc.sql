-- QA 2026-05-25 (Bug 2): the bet placement modal must show the user's own max
-- bet limit. resolve_effective_max_bet_limit exists but is not callable per-self
-- from the client. Expose a thin self-scoped wrapper. Returns NULL when no limit
-- applies (0/none in the hierarchy).

CREATE OR REPLACE FUNCTION get_my_effective_max_bet_limit()
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT effective_limit FROM resolve_effective_max_bet_limit(auth.uid());
$$;

GRANT EXECUTE ON FUNCTION get_my_effective_max_bet_limit() TO authenticated;
