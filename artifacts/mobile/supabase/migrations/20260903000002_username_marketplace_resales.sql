-- Allow owners to list any username they own and label repeat sales.

ALTER TABLE public.username_listings
  ADD COLUMN IF NOT EXISTS is_resale boolean NOT NULL DEFAULT false;

-- Backfill the reliable cases:
-- 1) a handle that has already had an earlier marketplace listing; or
-- 2) an owned alias that is not the seller's current profile handle.
UPDATE public.username_listings l
SET is_resale = true
WHERE l.is_active = true
  AND (
    EXISTS (
      SELECT 1
      FROM public.username_listings previous
      WHERE lower(previous.username) = lower(l.username)
        AND previous.is_active = false
        AND previous.created_at < l.created_at
    )
    OR (
      EXISTS (
        SELECT 1
        FROM public.owned_usernames owned
        WHERE lower(owned.handle) = lower(l.username)
          AND owned.owner_id = l.seller_id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.profiles seller
        WHERE seller.id = l.seller_id
          AND lower(seller.handle) = lower(l.username)
      )
    )
  );

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
  v_is_resale boolean;
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

  -- A user may list their primary handle or any marketplace alias they own.
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND lower(handle) = v_username
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.owned_usernames
    WHERE owner_id = auth.uid()
      AND lower(handle) = v_username
  ) THEN
    RAISE EXCEPTION 'You can only list a username you own';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.username_listings
    WHERE lower(username) = v_username
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'This username is already listed';
  END IF;

  -- Initial sales of a user's own handle are not resale listings. Once a
  -- marketplace transfer has happened, future listings carry the resale label.
  v_is_resale := EXISTS (
    SELECT 1
    FROM public.username_listings
    WHERE lower(username) = v_username
      AND is_active = false
  ) OR (
    EXISTS (
      SELECT 1
      FROM public.owned_usernames
      WHERE owner_id = auth.uid()
        AND lower(handle) = v_username
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid()
        AND lower(handle) = v_username
    )
  );

  INSERT INTO public.username_listings (
    username,
    price,
    seller_id,
    is_active,
    is_auction,
    auction_end_at,
    reserve_price,
    current_bid,
    is_resale
  )
  VALUES (
    v_username,
    p_price,
    auth.uid(),
    true,
    false,
    NULL,
    NULL,
    0,
    v_is_resale
  )
  RETURNING * INTO v_listing;

  PERFORM public.publish_username_market_event(
    'listed',
    v_username,
    p_price,
    NULL,
    auth.uid()
  );

  RETURN v_listing;
END;
$$;

REVOKE ALL ON FUNCTION public.create_username_listing(text, integer, boolean, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_username_listing(text, integer, boolean, integer) TO authenticated;