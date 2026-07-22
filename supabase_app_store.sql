CREATE TABLE IF NOT EXISTS public.app_store (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.app_store ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_store_read" ON public.app_store;
CREATE POLICY "app_store_read"
ON public.app_store FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "app_store_write" ON public.app_store;
CREATE POLICY "app_store_write"
ON public.app_store FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
