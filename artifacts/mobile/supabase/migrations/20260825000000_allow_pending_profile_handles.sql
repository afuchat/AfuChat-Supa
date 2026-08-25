-- New auth users can receive a profile row before onboarding collects a handle.
-- Keep username reservation enforcement for every non-empty handle, but allow
-- the temporary blank value used by the initial profile row.

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
  IF v_username = '' THEN
    RETURN NEW;
  END IF;

  IF v_username !~ '^[a-z0-9_]{3,30}$' THEN
    RAISE EXCEPTION 'Invalid username';
  END IF;

  IF TG_OP = 'UPDATE' AND lower(coalesce(OLD.handle, '')) = v_username THEN
    RETURN NEW;
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

DROP TRIGGER IF EXISTS profiles_username_reservation_guard ON public.profiles;
CREATE TRIGGER profiles_username_reservation_guard
  AFTER INSERT OR UPDATE OF handle ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_username_reservation();

REVOKE ALL ON FUNCTION public.enforce_username_reservation() FROM PUBLIC;