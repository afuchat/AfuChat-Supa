-- Keep public channel/group usernames reserved across all username flows.

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

  -- The current owner may continue using their own handle, including while
  -- it is listed for sale.
  IF auth.uid() IS NOT NULL AND (v_owner = auth.uid() OR v_profile_owner = auth.uid()) THEN
    RETURN jsonb_build_object('status', 'available', 'owned', true, 'owner_id', auth.uid());
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.public_chat_usernames
    WHERE username = v_username
  ) THEN
    RETURN jsonb_build_object('status', 'taken');
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

CREATE OR REPLACE FUNCTION public.claim_username(p_username text)
RETURNS public.owned_usernames
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_username text := lower(trim(coalesce(p_username, '')));
  v_existing_owner uuid;
  v_listing_id uuid;
  v_owned public.owned_usernames;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in';
  END IF;
  IF v_username !~ '^[a-z0-9_]{3,30}$' THEN
    RAISE EXCEPTION 'Invalid username';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_username));

  IF EXISTS (
    SELECT 1 FROM public.public_chat_usernames
    WHERE username = v_username
  ) THEN
    RAISE EXCEPTION 'This username is already used by a public channel or group';
  END IF;

  SELECT owner_id INTO v_existing_owner
  FROM public.owned_usernames
  WHERE lower(handle) = v_username
  FOR UPDATE;
  IF v_existing_owner IS NOT NULL AND v_existing_owner <> auth.uid() THEN
    RAISE EXCEPTION 'This username is already owned';
  END IF;

  SELECT id INTO v_listing_id
  FROM public.username_listings
  WHERE lower(username) = v_username
    AND is_active = true
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;
  IF v_listing_id IS NOT NULL AND coalesce(v_existing_owner <> auth.uid(), true) THEN
    RAISE EXCEPTION 'This username is listed for sale. Buy it before using it.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE lower(handle) = v_username AND id <> auth.uid()
  ) THEN
    RAISE EXCEPTION 'This username is already in use';
  END IF;

  INSERT INTO public.owned_usernames (handle, owner_id)
  VALUES (v_username, auth.uid())
  ON CONFLICT (lower(handle)) DO UPDATE
    SET owner_id = EXCLUDED.owner_id
  RETURNING * INTO v_owned;

  UPDATE public.profiles
  SET handle = v_username
  WHERE id = auth.uid();

  RETURN v_owned;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_username_reservation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_username text := lower(trim(coalesce(NEW.handle, '')));
  v_owner uuid;
  v_listing boolean;
BEGIN
  IF v_username !~ '^[a-z0-9_]{3,30}$' THEN
    RAISE EXCEPTION 'Invalid username';
  END IF;

  IF TG_OP = 'UPDATE' AND lower(coalesce(OLD.handle, '')) = v_username THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_username));

  IF EXISTS (
    SELECT 1 FROM public.public_chat_usernames
    WHERE username = v_username
  ) THEN
    RAISE EXCEPTION 'This username is already used by a public channel or group';
  END IF;

  SELECT owner_id INTO v_owner
  FROM public.owned_usernames
  WHERE lower(handle) = v_username
  FOR UPDATE;

  IF v_owner IS NOT NULL AND v_owner <> NEW.id THEN
    RAISE EXCEPTION 'This username is already owned';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.username_listings
    WHERE lower(username) = v_username
      AND is_active = true
  ) INTO v_listing;
  IF v_listing AND coalesce(v_owner <> NEW.id, true) THEN
    RAISE EXCEPTION 'This username is listed for sale. Buy it before using it.';
  END IF;

  IF v_owner IS NULL THEN
    INSERT INTO public.owned_usernames (handle, owner_id)
    VALUES (v_username, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.check_username_availability(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_username_availability(text) TO authenticated;
REVOKE ALL ON FUNCTION public.claim_username(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_username(text) TO authenticated;
REVOKE ALL ON FUNCTION public.enforce_username_reservation() FROM PUBLIC;