-- Username marketplace: fixed-price transfers only.
-- This supersedes the earlier function while keeping its RPC signature compatible.

CREATE OR REPLACE FUNCTION public.create_username_listing(
  p_username text,
  p_price integer,
  p_is_auction boolean DEFAULT false,
  p_duration_hours integer DEFAULT NULL
)
RETURNS public.username_listings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_username text := lower(trim(p_username));
  v_listing public.username_listings;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in';
  END IF;
  IF v_username !~ '^[a-z0-9_]{1,30}$' THEN
    RAISE EXCEPTION 'Invalid username';
  END IF;
  IF p_price IS NULL OR p_price < 1 THEN
    RAISE EXCEPTION 'Price must be at least 1 ACoin';
  END IF;
  IF coalesce(p_is_auction, false) THEN
    RAISE EXCEPTION 'Auctions are not supported';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND lower(handle) = v_username
  ) THEN
    RAISE EXCEPTION 'You can only list your current username';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.username_listings
    WHERE lower(username) = v_username AND is_active = true
  ) THEN
    RAISE EXCEPTION 'This username is already listed';
  END IF;

  INSERT INTO public.username_listings
    (username, price, seller_id, is_active, is_auction, auction_end_at, reserve_price, current_bid)
  VALUES
    (v_username, p_price, auth.uid(), true, false, NULL, NULL, 0)
  RETURNING * INTO v_listing;
  RETURN v_listing;
END;
$$;

CREATE OR REPLACE FUNCTION public.purchase_username(p_listing_id uuid)
RETURNS public.username_listings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_listing public.username_listings;
  v_fallback text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in';
  END IF;

  SELECT * INTO v_listing
  FROM public.username_listings
  WHERE id = p_listing_id
    AND is_active = true
    AND is_auction = false
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This username is no longer available';
  END IF;
  IF v_listing.seller_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot buy your own username';
  END IF;

  -- Both routines lock and validate balances. Any failure rolls back this
  -- transaction, so a handle can never move without its payment.
  PERFORM public.deduct_acoin(auth.uid(), v_listing.price);
  PERFORM public.credit_acoin(v_listing.seller_id, v_listing.price);

  -- A primary handle must be released before the alias is assigned. The
  -- generated replacement is not visible as the sold handle.
  v_fallback := 'user_' || replace(substr(v_listing.seller_id::text, 1, 12), '-', '');
  UPDATE public.profiles
  SET handle = v_fallback
  WHERE id = v_listing.seller_id
    AND lower(handle) = lower(v_listing.username);

  INSERT INTO public.owned_usernames (handle, owner_id)
  VALUES (lower(v_listing.username), auth.uid())
  ON CONFLICT (lower(handle)) DO UPDATE SET owner_id = EXCLUDED.owner_id;

  UPDATE public.username_listings
  SET is_active = false
  WHERE id = v_listing.id;
  v_listing.is_active := false;
  RETURN v_listing;
END;
$$;

REVOKE ALL ON FUNCTION public.create_username_listing(text, integer, boolean, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_username_listing(text, integer, boolean, integer) TO authenticated;
REVOKE ALL ON FUNCTION public.purchase_username(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purchase_username(uuid) TO authenticated;