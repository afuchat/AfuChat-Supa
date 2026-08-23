-- Username reservation hardening.
--
-- The reservation check must not depend on auth.uid(). Older clients write
-- profiles directly, and trusted server jobs may also write profile rows
-- without a user session. The database remains authoritative for both paths.

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
  -- A profile's handle is the identity being claimed. Do not allow an empty
  -- or malformed handle to become a reservation through a direct write.
  IF v_username !~ '^[a-z0-9_]{3,30}$' THEN
    RAISE EXCEPTION 'Invalid username';
  END IF;

  -- Keeping the current value is always valid, including when its owner has
  -- listed it. This is what lets the owner continue using their listed name.
  IF TG_OP = 'UPDATE' AND lower(coalesce(OLD.handle, '')) = v_username THEN
    RETURN NEW;
  END IF;

  -- Lock the canonical ownership row so concurrent profile changes and
  -- marketplace transfers cannot both succeed for the same name.
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

  -- Every primary profile handle is also recorded in the canonical ownership
  -- table, so future direct writes from old app versions use the same lock.
  IF v_owner IS NULL THEN
    INSERT INTO public.owned_usernames (handle, owner_id)
    VALUES (v_username, NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_username_reservation_guard ON public.profiles;
CREATE TRIGGER profiles_username_reservation_guard
  BEFORE INSERT OR UPDATE OF handle ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_username_reservation();

REVOKE ALL ON FUNCTION public.enforce_username_reservation() FROM PUBLIC;