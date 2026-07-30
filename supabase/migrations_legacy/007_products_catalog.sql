-- =============================================================================
-- Migration 007: Catálogo Comercial — Tabela products
-- =============================================================================

-- 1. Tabela products
CREATE TABLE IF NOT EXISTS public.products (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text DEFAULT '',
  base_price numeric(12,2) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_products_company ON public.products(company_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON public.products(company_id, active);

-- 3. RLS
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- SELECT: qualquer membro da mesma empresa pode ver produtos
DROP POLICY IF EXISTS "products_select" ON public.products;
CREATE POLICY "products_select"
  ON public.products
  FOR SELECT
  USING (
    company_id = (
      SELECT p.company_id FROM public.profiles p
      WHERE p.id = auth.uid()
      LIMIT 1
    )
  );

-- INSERT: somente admin da mesma empresa
DROP POLICY IF EXISTS "products_insert" ON public.products;
CREATE POLICY "products_insert"
  ON public.products
  FOR INSERT
  WITH CHECK (
    company_id = (
      SELECT p.company_id FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
      LIMIT 1
    )
  );

-- UPDATE: somente admin da mesma empresa
DROP POLICY IF EXISTS "products_update" ON public.products;
CREATE POLICY "products_update"
  ON public.products
  FOR UPDATE
  USING (
    company_id = (
      SELECT p.company_id FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
      LIMIT 1
    )
  );

-- DELETE: somente admin da mesma empresa
DROP POLICY IF EXISTS "products_delete" ON public.products;
CREATE POLICY "products_delete"
  ON public.products
  FOR DELETE
  USING (
    company_id = (
      SELECT p.company_id FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
      LIMIT 1
    )
  );

-- 4. Trigger para updated_at automático
CREATE OR REPLACE FUNCTION public.fn_products_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_updated_at ON public.products;
CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_products_updated_at();
