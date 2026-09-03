-- Announce username delistings in the same channel timeline as listings and
-- acquisitions.

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
  IF p_event_type NOT IN ('listed', 'acquired', 'delisted') OR v_username = '' THEN
    RETURN;
  END IF;

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
  ELSIF p_event_type = 'acquired' THEN
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
  ELSE
    v_body := format(
      '@%s has been unlisted from the username marketplace and is no longer available for sale.',
      v_username
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

  PERFORM public.publish_username_market_event(
    'delisted',
    v_listing.username,
    v_listing.price,
    NULL,
    auth.uid()
  );

  v_listing.is_active := false;
  RETURN v_listing;
END;
$$;

REVOKE ALL ON FUNCTION public.delist_username_listing(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delist_username_listing(uuid) TO authenticated;