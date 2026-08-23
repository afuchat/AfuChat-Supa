-- Allow a seller to remove an active username listing they own.
-- The ownership check lives in the security-definer function so it cannot
-- be bypassed by a client-side update.
CREATE OR REPLACE FUNCTION public.delist_username_listing(p_listing_id uuid)
RETURNS public.username_listings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_listing public.username_listings;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in';
  END IF;

  SELECT *
  INTO v_listing
  FROM public.username_listings
  WHERE id = p_listing_id
    AND seller_id = auth.uid()
    AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Listing not found or you are not the seller';
  END IF;

  IF v_listing.is_auction AND (
    v_listing.current_bidder_id IS NOT NULL
    OR coalesce(v_listing.current_bid, 0) > 0
  ) THEN
    RAISE EXCEPTION 'This auction cannot be delisted after receiving a bid';
  END IF;

  UPDATE public.username_listings
  SET is_active = false
  WHERE id = v_listing.id;

  v_listing.is_active := false;
  RETURN v_listing;
END;
$$;

REVOKE ALL ON FUNCTION public.delist_username_listing(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delist_username_listing(uuid) TO authenticated;