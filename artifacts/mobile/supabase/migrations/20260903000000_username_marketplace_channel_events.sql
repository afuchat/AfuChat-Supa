-- Publish username marketplace activity in the dedicated @usernames channel.
--
-- The marketplace RPCs and this publisher run in the same transaction. This
-- means a successful listing or acquisition always creates the channel post
-- before the client receives the RPC result.

CREATE OR REPLACE FUNCTION public.publish_username_market_event(
  p_event_type text,
  p_username text,
  p_price integer DEFAULT NULL,
  p_buyer_id uuid DEFAULT NULL,
  p_seller_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_channel_id uuid;
  v_channel_owner_id uuid;
  v_buyer_handle text;
  v_body text;
  v_username text := lower(trim(coalesce(p_username, '')));
BEGIN
  IF p_event_type NOT IN ('listed', 'acquired') OR v_username = '' THEN
    RETURN;
  END IF;

  -- Resolve the channel by its public username first, with name fallbacks
  -- for channels created before public handles were introduced.
  SELECT c.id, c.owner_id
  INTO v_channel_id, v_channel_owner_id
  FROM public.channels c
  WHERE coalesce(c.is_public, false)
    AND (
      lower(trim(coalesce(c.handle, ''))) IN ('usernames', 'afuusernames', 'username_market')
      OR lower(regexp_replace(trim(coalesce(c.name, '')), '[^a-z0-9]', '', 'gi'))
        IN ('usernames', 'afuusernames', 'usernamemarket')
    )
  ORDER BY
    CASE WHEN lower(trim(coalesce(c.handle, ''))) = 'usernames' THEN 0 ELSE 1 END,
    c.created_at ASC NULLS LAST
  LIMIT 1;

  -- Marketplace transfers must never fail because the optional announcement
  -- channel has not been created yet.
  IF v_channel_id IS NULL
     OR v_channel_owner_id IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public.chats
       WHERE id = v_channel_id
         AND coalesce(is_channel, false)
     ) THEN
    RETURN;
  END IF;

  IF p_event_type = 'listed' THEN
    v_body := format(
      '@%s has been listed on the username marketplace for %s ACoin.',
      v_username,
      coalesce(p_price, 0)::text
    );
  ELSE
    IF p_buyer_id IS NOT NULL THEN
      SELECT nullif(trim(handle), '')
      INTO v_buyer_handle
      FROM public.profiles
      WHERE id = p_buyer_id;
    END IF;

    v_body := format(
      '@%s has been acquired on the username marketplace for %s ACoin%s.',
      v_username,
      coalesce(p_price, 0)::text,
      CASE
        WHEN v_buyer_handle IS NULL THEN ''
        ELSE format(' by @%s', v_buyer_handle)
      END
    );
  END IF;

  INSERT INTO public.messages (chat_id, sender_id, encrypted_content)
  VALUES (v_channel_id, v_channel_owner_id, v_body);

  UPDATE public.chats
  SET updated_at = now()
  WHERE id = v_channel_id;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_username_market_event(text, text, integer, uuid, uuid) FROM PUBLIC, authenticated;

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
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND lower(handle) = v_username
  ) THEN
    RAISE EXCEPTION 'You can only list your current username';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.username_listings
    WHERE lower(username) = v_username
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'This username is already listed';
  END IF;

  INSERT INTO public.username_listings (
    username,
    price,
    seller_id,
    is_active,
    is_auction,
    auction_end_at,
    reserve_price,
    current_bid
  )
  VALUES (
    v_username,
    p_price,
    auth.uid(),
    true,
    false,
    NULL,
    NULL,
    0
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

CREATE OR REPLACE FUNCTION public.purchase_username(p_listing_id uuid)
RETURNS public.username_listings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_listing public.username_listings;
  v_fallback text;
  v_existing_owner uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in';
  END IF;

  SELECT *
  INTO v_listing
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

  SELECT owner_id
  INTO v_existing_owner
  FROM public.owned_usernames
  WHERE lower(handle) = lower(v_listing.username)
  FOR UPDATE;
  IF v_existing_owner IS NOT NULL
     AND v_existing_owner <> v_listing.seller_id THEN
    RAISE EXCEPTION 'This username is already owned';
  END IF;

  PERFORM public.deduct_acoin(auth.uid(), v_listing.price);
  PERFORM public.credit_acoin(v_listing.seller_id, v_listing.price);

  v_fallback := 'user_' || replace(substr(v_listing.seller_id::text, 1, 12), '-', '');
  UPDATE public.profiles
  SET handle = v_fallback
  WHERE id = v_listing.seller_id
    AND lower(handle) = lower(v_listing.username);

  INSERT INTO public.owned_usernames (handle, owner_id)
  VALUES (lower(v_listing.username), auth.uid())
  ON CONFLICT (lower(handle)) DO UPDATE
    SET owner_id = EXCLUDED.owner_id,
        created_at = now();

  UPDATE public.username_listings
  SET is_active = false
  WHERE id = v_listing.id;

  PERFORM public.publish_username_market_event(
    'acquired',
    v_listing.username,
    v_listing.price,
    auth.uid(),
    v_listing.seller_id
  );

  v_listing.is_active := false;
  RETURN v_listing;
END;
$$;

REVOKE ALL ON FUNCTION public.create_username_listing(text, integer, boolean, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_username_listing(text, integer, boolean, integer) TO authenticated;
REVOKE ALL ON FUNCTION public.purchase_username(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purchase_username(uuid) TO authenticated;

-- Preserve the same announcement behavior for auctions created by an older
-- marketplace version. Current listings use fixed-price transfers, but an
-- older active auction can still be settled.
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
  SELECT *
  INTO v_listing
  FROM public.username_listings
  WHERE id = p_listing_id
    AND is_active = true
    AND is_auction = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This auction is no longer available';
  END IF;
  IF v_listing.auction_end_at IS NULL OR v_listing.auction_end_at > now() THEN
    RAISE EXCEPTION 'This auction is still live';
  END IF;

  IF v_listing.current_bidder_id IS NULL
     OR coalesce(v_listing.current_bid, 0) < coalesce(v_listing.reserve_price, 0) THEN
    IF v_listing.current_bidder_id IS NOT NULL THEN
      PERFORM public.credit_acoin(v_listing.current_bidder_id, v_listing.current_bid);
    END IF;
    UPDATE public.username_listings
    SET is_active = false
    WHERE id = v_listing.id;
    v_listing.is_active := false;
    RETURN v_listing;
  END IF;

  PERFORM public.credit_acoin(v_listing.seller_id, v_listing.current_bid);

  v_fallback := 'user_' || replace(substr(v_listing.seller_id::text, 1, 12), '-', '');
  UPDATE public.profiles
  SET handle = v_fallback
  WHERE id = v_listing.seller_id
    AND lower(handle) = lower(v_listing.username);

  INSERT INTO public.owned_usernames (handle, owner_id)
  VALUES (lower(v_listing.username), v_listing.current_bidder_id)
  ON CONFLICT (lower(handle)) DO UPDATE
    SET owner_id = EXCLUDED.owner_id;

  UPDATE public.username_listings
  SET is_active = false
  WHERE id = v_listing.id;

  PERFORM public.publish_username_market_event(
    'acquired',
    v_listing.username,
    v_listing.current_bid,
    v_listing.current_bidder_id,
    v_listing.seller_id
  );

  v_listing.is_active := false;
  RETURN v_listing;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_username_auction(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_username_auction(uuid) TO authenticated;