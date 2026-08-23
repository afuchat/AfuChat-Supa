-- An owner may continue using their own username while it is listed.
-- Report that name as available to that owner; report it as listed/taken to
-- everyone else. The reservation trigger remains authoritative for writes.

CREATE OR REPLACE FUNCTION public.check_username_availability(p_username text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_username text := lower(trim(coalesce(p_username, '')));
  v_owner uuid;
  v_profile_owner uuid;
  v_listing record;
BEGIN
  IF v_username !~ '^[a-z0-9_]{3,30}$' THEN
    RETURN jsonb_build_object('status', 'invalid_format');
  END IF;

  SELECT owner_id INTO v_owner
  FROM public.owned_usernames
  WHERE lower(handle) = v_username
  LIMIT 1;

  SELECT id INTO v_profile_owner
  FROM public.profiles
  WHERE lower(handle) = v_username
  LIMIT 1;

  -- Ownership is checked before listing status. The current owner is allowed
  -- to keep using their name while deciding whether to sell it.
  IF auth.uid() IS NOT NULL AND (v_owner = auth.uid() OR v_profile_owner = auth.uid()) THEN
    RETURN jsonb_build_object('status', 'available', 'owned', true, 'owner_id', auth.uid());
  END IF;

  SELECT id, price INTO v_listing
  FROM public.username_listings
  WHERE lower(username) = v_username
    AND is_active = true
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_listing.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'listed',
      'listing_id', v_listing.id,
      'price', v_listing.price
    );
  END IF;

  IF v_profile_owner IS NOT NULL OR v_owner IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'taken');
  END IF;

  RETURN jsonb_build_object('status', 'available');
END;
$$;

REVOKE ALL ON FUNCTION public.check_username_availability(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_username_availability(text) TO authenticated;