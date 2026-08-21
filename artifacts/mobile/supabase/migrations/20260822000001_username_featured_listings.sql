-- Paid featured placement for active username listings.

CREATE TABLE IF NOT EXISTS public.username_featured_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.username_listings(id) ON DELETE CASCADE,
  sponsor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount integer NOT NULL CHECK (amount > 0),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS username_featured_active_sort
  ON public.username_featured_listings (ends_at DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS username_featured_listing_lookup
  ON public.username_featured_listings (listing_id, ends_at DESC);

ALTER TABLE public.username_featured_listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Featured placements are public" ON public.username_featured_listings;
CREATE POLICY "Featured placements are public"
  ON public.username_featured_listings FOR SELECT
  TO authenticated
  USING (ends_at > now());

CREATE OR REPLACE FUNCTION public.feature_username_listing(
  p_listing_id uuid,
  p_duration_hours integer DEFAULT 24
)
RETURNS public.username_featured_listings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_listing public.username_listings;
  v_feature public.username_featured_listings;
  v_hours integer := greatest(24, least(coalesce(p_duration_hours, 24), 168));
  v_amount integer := CASE
    WHEN v_hours <= 24 THEN 250
    WHEN v_hours <= 72 THEN 600
    ELSE 1200
  END;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'You must be signed in'; END IF;
  SELECT * INTO v_listing
  FROM public.username_listings
  WHERE id = p_listing_id AND is_active = true
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This listing is no longer available'; END IF;
  IF v_listing.seller_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the listing owner can feature this username';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.username_featured_listings
    WHERE listing_id = p_listing_id AND ends_at > now()
  ) THEN
    RAISE EXCEPTION 'This username is already featured';
  END IF;

  PERFORM public.deduct_acoin(auth.uid(), v_amount);
  INSERT INTO public.username_featured_listings
    (listing_id, sponsor_id, amount, ends_at)
  VALUES
    (p_listing_id, auth.uid(), v_amount, now() + (v_hours || ' hours')::interval)
  RETURNING * INTO v_feature;
  RETURN v_feature;
END;
$$;

REVOKE ALL ON FUNCTION public.feature_username_listing(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.feature_username_listing(uuid, integer) TO authenticated;