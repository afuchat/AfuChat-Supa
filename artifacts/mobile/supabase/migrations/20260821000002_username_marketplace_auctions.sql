-- Native auction support with escrowed bids.

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
  v_hours integer := greatest(1, least(coalesce(p_duration_hours, 48), 720));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'You must be signed in'; END IF;
  IF v_username !~ '^[a-z0-9_]{1,30}$' THEN RAISE EXCEPTION 'Invalid username'; END IF;
  IF p_price IS NULL OR p_price < 1 THEN RAISE EXCEPTION 'Price must be at least 1 ACoin'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND lower(handle) = v_username
  ) THEN RAISE EXCEPTION 'You can only list your current username'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.username_listings WHERE lower(username) = v_username AND is_active = true
  ) THEN RAISE EXCEPTION 'This username is already listed'; END IF;

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

CREATE OR REPLACE FUNCTION public.place_username_bid(p_listing_id uuid, p_amount integer)
RETURNS public.username_listings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_listing public.username_listings;
  v_previous_bidder uuid;
  v_previous_amount integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'You must be signed in'; END IF;
  IF p_amount IS NULL OR p_amount < 1 THEN RAISE EXCEPTION 'Bid must be at least 1 ACoin'; END IF;
  SELECT * INTO v_listing FROM public.username_listings
    WHERE id = p_listing_id AND is_active = true AND is_auction = true FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This auction is no longer available'; END IF;
  IF v_listing.auction_end_at IS NULL OR v_listing.auction_end_at <= now() THEN RAISE EXCEPTION 'This auction has ended'; END IF;
  IF v_listing.seller_id = auth.uid() THEN RAISE EXCEPTION 'You cannot bid on your own username'; END IF;
  IF p_amount <= greatest(coalesce(v_listing.current_bid, 0), coalesce(v_listing.reserve_price, 0)) THEN
    RAISE EXCEPTION 'Bid must be higher than the current bid and reserve';
  END IF;

  SELECT bidder_id, amount INTO v_previous_bidder, v_previous_amount
  FROM public.username_bids WHERE listing_id = v_listing.id
  ORDER BY amount DESC, created_at DESC LIMIT 1;

  PERFORM public.deduct_acoin(auth.uid(), p_amount);
  IF v_previous_bidder IS NOT NULL THEN
    PERFORM public.credit_acoin(v_previous_bidder, v_previous_amount);
  END IF;
  INSERT INTO public.username_bids (listing_id, bidder_id, amount)
  VALUES (v_listing.id, auth.uid(), p_amount);
  UPDATE public.username_listings SET current_bid = p_amount, current_bidder_id = auth.uid()
  WHERE id = v_listing.id;
  v_listing.current_bid := p_amount;
  v_listing.current_bidder_id := auth.uid();
  RETURN v_listing;
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_username_auction(p_listing_id uuid)
RETURNS public.username_listings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_listing public.username_listings;
  v_fallback text;
BEGIN
  SELECT * INTO v_listing FROM public.username_listings
    WHERE id = p_listing_id AND is_active = true AND is_auction = true FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This auction is no longer available'; END IF;
  IF v_listing.auction_end_at IS NULL OR v_listing.auction_end_at > now() THEN RAISE EXCEPTION 'This auction is still live'; END IF;
  IF v_listing.current_bidder_id IS NULL OR coalesce(v_listing.current_bid, 0) < coalesce(v_listing.reserve_price, 0) THEN
    IF v_listing.current_bidder_id IS NOT NULL THEN
      PERFORM public.credit_acoin(v_listing.current_bidder_id, v_listing.current_bid);
    END IF;
    UPDATE public.username_listings SET is_active = false WHERE id = v_listing.id;
    v_listing.is_active := false;
    RETURN v_listing;
  END IF;

  PERFORM public.credit_acoin(v_listing.seller_id, v_listing.current_bid);
  v_fallback := 'user_' || replace(substr(v_listing.seller_id::text, 1, 12), '-', '');
  UPDATE public.profiles SET handle = v_fallback
    WHERE id = v_listing.seller_id AND lower(handle) = lower(v_listing.username);
  INSERT INTO public.owned_usernames (handle, owner_id)
    VALUES (lower(v_listing.username), v_listing.current_bidder_id)
    ON CONFLICT (lower(handle)) DO UPDATE SET owner_id = EXCLUDED.owner_id;
  UPDATE public.username_listings SET is_active = false WHERE id = v_listing.id;
  v_listing.is_active := false;
  RETURN v_listing;
END;
$$;

REVOKE ALL ON FUNCTION public.place_username_bid(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_username_bid(uuid, integer) TO authenticated;
REVOKE ALL ON FUNCTION public.settle_username_auction(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_username_auction(uuid) TO authenticated;