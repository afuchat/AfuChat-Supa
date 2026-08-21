-- Auctions are rare by design: they can never run longer than seven days.
-- The expiry RPC is called by marketplace clients and is safe to run repeatedly.

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
  v_hours integer := 168;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'You must be signed in'; END IF;
  IF v_username !~ '^[a-z0-9_]{1,30}$' THEN RAISE EXCEPTION 'Invalid username'; END IF;
  IF p_price IS NULL OR p_price < 1 THEN RAISE EXCEPTION 'Price must be at least 1 ACoin'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND lower(handle) = v_username) THEN
    RAISE EXCEPTION 'You can only list your current username';
  END IF;
  IF EXISTS (SELECT 1 FROM public.username_listings WHERE lower(username) = v_username AND is_active = true) THEN
    RAISE EXCEPTION 'This username is already listed';
  END IF;
  INSERT INTO public.username_listings
    (username, price, seller_id, is_active, is_auction, auction_end_at, reserve_price, current_bid)
  VALUES
    (v_username, p_price, auth.uid(), true, coalesce(p_is_auction, false),
     CASE WHEN coalesce(p_is_auction, false) THEN now() + (v_hours || ' hours')::interval ELSE NULL END,
     CASE WHEN coalesce(p_is_auction, false) THEN p_price ELSE NULL END, 0)
  RETURNING * INTO v_listing;
  RETURN v_listing;
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_username_auctions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count integer;
BEGIN
  UPDATE public.username_listings
  SET is_active = false
  WHERE is_active = true AND is_auction = true AND auction_end_at IS NOT NULL AND auction_end_at <= now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_username_auctions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_username_auctions() TO authenticated;