-- Username reservation guard:
-- active listings and purchased aliases must be enforced at the database
-- boundary, not only by client-side availability checks.

ALTER TABLE public.owned_usernames ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.username_listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their owned usernames" ON public.owned_usernames;
CREATE POLICY "Users can read their owned usernames"
  ON public.owned_usernames FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Authenticated users can read active username listings" ON public.username_listings;
CREATE POLICY "Authenticated users can read active username listings"
  ON public.username_listings FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Existing profile handles become owned aliases. Do not overwrite a purchased
-- alias if old data contains a conflict; the unique index keeps the result
-- deterministic and the purchased owner remains authoritative.
INSERT INTO public.owned_usernames (handle, owner_id)
SELECT lower(trim(p.handle)), p.id
FROM public.profiles p
WHERE p.handle IS NOT NULL
  AND trim(p.handle) <> ''
ON CONFLICT (lower(handle)) DO NOTHING;

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

  SELECT id, price INTO v_listing
  FROM public.username_listings
  WHERE lower(username) = v_username
    AND is_active = true
  ORDER BY created_at DESC
  LIMIT 1;

  IF auth.uid() IS NOT NULL AND v_owner = auth.uid() THEN
    RETURN jsonb_build_object('status', 'owned', 'owner_id', v_owner);
  END IF;
  IF v_profile_owner IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'taken');
  END IF;
  IF v_listing.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'listed',
      'listing_id', v_listing.id,
      'price', v_listing.price
    );
  END IF;
  IF v_owner IS NOT NULL THEN
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

  -- Lock the ownership row and listing row before deciding. This makes two
  -- simultaneous signup/profile changes resolve identically.
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

  -- A purchased alias becomes the buyer's active username immediately. The
  -- trigger permits this because ownership was recorded above.
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
  IF auth.uid() IS NULL OR NEW.id <> auth.uid() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND lower(coalesce(OLD.handle, '')) = v_username THEN
    RETURN NEW;
  END IF;

  SELECT owner_id INTO v_owner
  FROM public.owned_usernames
  WHERE lower(handle) = v_username
  FOR UPDATE;
  IF v_owner IS NOT NULL AND v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'This username is already owned';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.username_listings
    WHERE lower(username) = v_username AND is_active = true
  ) INTO v_listing;
  IF v_listing AND coalesce(v_owner <> auth.uid(), true) THEN
    RAISE EXCEPTION 'This username is listed for sale. Buy it before using it.';
  END IF;

  IF v_owner IS NULL THEN
    INSERT INTO public.owned_usernames (handle, owner_id)
    VALUES (v_username, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_username_reservation_guard ON public.profiles;
CREATE TRIGGER profiles_username_reservation_guard
  BEFORE INSERT OR UPDATE OF handle ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_username_reservation();

-- Keep the primary profile handle aligned after a marketplace transfer. The
-- purchase RPCs in earlier migrations record ownership atomically; this
-- trigger makes that ownership visible as the buyer's active handle too.
CREATE OR REPLACE FUNCTION public.sync_owned_username_to_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET handle = lower(NEW.handle)
  WHERE id = NEW.owner_id
    AND lower(handle) <> lower(NEW.handle);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS owned_username_profile_sync ON public.owned_usernames;
CREATE TRIGGER owned_username_profile_sync
  AFTER INSERT OR UPDATE OF owner_id ON public.owned_usernames
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_owned_username_to_profile();

REVOKE ALL ON FUNCTION public.check_username_availability(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_username_availability(text) TO authenticated;
REVOKE ALL ON FUNCTION public.claim_username(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_username(text) TO authenticated;