CREATE TABLE IF NOT EXISTS public.app_store (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.app_store ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    WHERE p.polname = 'app_store_read' AND c.relname = 'app_store'
  ) THEN
    CREATE POLICY "app_store_read"
      ON public.app_store FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    WHERE p.polname = 'app_store_write' AND c.relname = 'app_store'
  ) THEN
    CREATE POLICY "app_store_write"
      ON public.app_store FOR ALL
      TO anon, authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
