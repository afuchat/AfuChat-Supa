-- Drop post_likes table — all like tracking now uses post_acknowledgments
DROP TABLE IF EXISTS public.post_likes CASCADE;
