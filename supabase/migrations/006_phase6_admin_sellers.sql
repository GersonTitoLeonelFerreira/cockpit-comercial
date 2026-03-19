-- ============================================================================
-- MIGRATION: Phase 6 – Admin › Gestão de Vendedores
-- Idempotent (IF NOT EXISTS / CREATE OR REPLACE throughout)
-- ============================================================================

-- 1. Add is_active column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- 2. Helper functions (SECURITY DEFINER)

-- Returns true if the current user has the 'admin' role
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Returns the company_id of the current user
CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1;
$$;

-- 3. admin_events table
CREATE TABLE IF NOT EXISTS public.admin_events (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid        NOT NULL,
  actor_user_id  uuid        NOT NULL,
  target_user_id uuid,
  event_type     text        NOT NULL,
  metadata       jsonb       NOT NULL DEFAULT '{}',
  occurred_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'admin_events'
      AND policyname = 'admin_events_select'
  ) THEN
    CREATE POLICY admin_events_select ON public.admin_events
      FOR SELECT USING (
        public.is_admin() AND company_id = public.current_company_id()
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'admin_events'
      AND policyname = 'admin_events_insert'
  ) THEN
    CREATE POLICY admin_events_insert ON public.admin_events
      FOR INSERT WITH CHECK (
        public.is_admin() AND company_id = public.current_company_id()
      );
  END IF;
END $$;

-- 4. RPC: list sellers with stats
CREATE OR REPLACE FUNCTION public.rpc_admin_list_sellers_stats(p_days int DEFAULT 30)
RETURNS TABLE (
  seller_id           uuid,
  full_name           text,
  email               text,
  role                text,
  is_active           boolean,
  active_cycles_count bigint,
  novo_count          bigint,
  contato_count       bigint,
  respondeu_count     bigint,
  negociacao_count    bigint,
  ganho_count_period  bigint,
  perdido_count_period bigint,
  last_activity_at    timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_company_id uuid;
  v_cutoff     timestamptz;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado: somente admin';
  END IF;

  v_company_id := public.current_company_id();
  v_cutoff     := now() - (p_days || ' days')::interval;

  RETURN QUERY
  SELECT
    p.id                                                                      AS seller_id,
    p.full_name,
    p.email,
    p.role,
    p.is_active,
    COALESCE((
      SELECT count(*) FROM public.sales_cycles sc
      WHERE sc.owner_user_id = p.id AND sc.status NOT IN ('ganho', 'perdido')
    ), 0)                                                                     AS active_cycles_count,
    COALESCE((
      SELECT count(*) FROM public.sales_cycles sc
      WHERE sc.owner_user_id = p.id AND sc.status = 'novo'
    ), 0)                                                                     AS novo_count,
    COALESCE((
      SELECT count(*) FROM public.sales_cycles sc
      WHERE sc.owner_user_id = p.id AND sc.status = 'contato'
    ), 0)                                                                     AS contato_count,
    COALESCE((
      SELECT count(*) FROM public.sales_cycles sc
      WHERE sc.owner_user_id = p.id AND sc.status = 'respondeu'
    ), 0)                                                                     AS respondeu_count,
    COALESCE((
      SELECT count(*) FROM public.sales_cycles sc
      WHERE sc.owner_user_id = p.id AND sc.status = 'negociacao'
    ), 0)                                                                     AS negociacao_count,
    COALESCE((
      SELECT count(*) FROM public.sales_cycles sc
      WHERE sc.owner_user_id = p.id
        AND sc.status = 'ganho'
        AND sc.updated_at >= v_cutoff
    ), 0)                                                                     AS ganho_count_period,
    COALESCE((
      SELECT count(*) FROM public.sales_cycles sc
      WHERE sc.owner_user_id = p.id
        AND sc.status = 'perdido'
        AND sc.updated_at >= v_cutoff
    ), 0)                                                                     AS perdido_count_period,
    (
      SELECT MAX(ce.occurred_at)
      FROM public.cycle_events ce
      WHERE ce.created_by = p.id
    )                                                                         AS last_activity_at
  FROM public.profiles p
  WHERE p.company_id = v_company_id
    AND p.role IN ('member', 'seller', 'consultor')
  ORDER BY p.full_name;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_admin_list_sellers_stats(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_admin_list_sellers_stats(int) TO authenticated;

-- 5. RPC: update seller role and active status
CREATE OR REPLACE FUNCTION public.rpc_admin_update_seller_access(
  p_seller_id uuid,
  p_role      text,
  p_is_active boolean
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_company_id    uuid;
  v_old_role      text;
  v_old_is_active boolean;
  v_actor         uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado: somente admin';
  END IF;

  v_company_id := public.current_company_id();
  v_actor      := auth.uid();

  SELECT role, is_active INTO v_old_role, v_old_is_active
  FROM public.profiles
  WHERE id = p_seller_id AND company_id = v_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vendedor não encontrado nesta empresa';
  END IF;

  UPDATE public.profiles
  SET role = p_role, is_active = p_is_active
  WHERE id = p_seller_id AND company_id = v_company_id;

  IF v_old_role IS DISTINCT FROM p_role THEN
    INSERT INTO public.admin_events
      (company_id, actor_user_id, target_user_id, event_type, metadata)
    VALUES (
      v_company_id, v_actor, p_seller_id, 'role_changed',
      jsonb_build_object('role_old', v_old_role, 'role_new', p_role)
    );
  END IF;

  IF v_old_is_active IS DISTINCT FROM p_is_active THEN
    INSERT INTO public.admin_events
      (company_id, actor_user_id, target_user_id, event_type, metadata)
    VALUES (
      v_company_id, v_actor, p_seller_id,
      CASE WHEN p_is_active THEN 'seller_activated' ELSE 'seller_deactivated' END,
      jsonb_build_object('is_active_old', v_old_is_active, 'is_active_new', p_is_active)
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_admin_update_seller_access(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_admin_update_seller_access(uuid, text, boolean) TO authenticated;
