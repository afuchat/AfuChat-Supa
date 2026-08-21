-- Username marketplace integrity:
-- one active listing per handle and atomic payment/ownership transfer.

WITH duplicates AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY lower(username)
           ORDER BY created_at DESC, id DESC
         ) AS rn
  FROM public.username_listings
  WHERE is_active = true
)
UPDATE public.username_listings l
SET is_active = false
FROM duplicates d
WHERE l.id = d.id
  AND d.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS username_listings_one_active_handle
  ON public.username_listings (lower(username))
  WHERE is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS owned_usernames_unique_handle
  ON public.owned_usernames (lower(handle));

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

  -- Only the current profile username may be listed from this flow.
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND lower(handle) = v_username
  ) THEN
    RAISE EXCEPTION 'You can only list a username owned by your profile';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.username_listings
    WHERE lower(username) = v_username AND is_active = true
  ) THEN
    RAISE EXCEPTION 'This username is already listed';
  END IF;

  INSERT INTO public.username_listings (
    username, price, seller_id, is_active, is_auction,
    auction_end_at, reserve_price, current_bid
  )
  VALUES (
    v_username, p_price, auth.uid(), true, coalesce(p_is_auction, false),
    CASE WHEN p_is_auction THEN now() + (greatest(1, least(coalesce(p_duration_hours, 24), 720)) || ' hours')::interval ELSE NULL END,
    CASE WHEN p_is_auction THEN p_price ELSE NULL END,
    0
  )
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
  v_balance integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in';
  END IF;

  SELECT * INTO v_listing
  FROM public.username_listings
  WHERE id = p_listing_id AND is_active = true AND is_auction = false
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This fixed-price listing is no longer available';
  END IF;
  IF v_listing.seller_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot buy your own username';
  END IF;

  SELECT acoin INTO v_balance
  FROM public.profiles
  WHERE id = auth.uid()
  FOR UPDATE;
  IF coalesce(v_balance, 0) < v_listing.price THEN
    RAISE EXCEPTION 'Not enough ACoin';
  END IF;

  -- The alias is transferred in the same transaction as the payment.
  -- The seller can never retain the alias after this function succeeds.
  UPDATE public.profiles SET acoin = acoin - v_listing.price WHERE id = auth.uid();
  UPDATE public.profiles SET acoin = acoin + v_listing.price WHERE id = v_listing.seller_id;
  -- A primary profile handle has priority in the resolver. Release it before
  -- creating the buyer alias, otherwise the sold handle still opens the seller.
  UPDATE public.profiles
  SET handle = 'user_' || replace(substr(v_listing.seller_id::text, 1, 12), '-', '')
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