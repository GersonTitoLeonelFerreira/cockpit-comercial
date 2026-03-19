-- =============================================================================
-- FASE 6 — Admin › Gestão de Vendedores
-- Idempotente: usa IF NOT EXISTS / OR REPLACE / DO $$ ... $$
-- NÃO usa crases — SQL puro Postgres
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Campo is_active em profiles
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- ---------------------------------------------------------------------------
-- 2. Tabela admin_events (auditoria de ações administrativas)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_events (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid        NOT NULL,
  actor_user_id  uuid        NOT NULL,
  target_user_id uuid        NULL,
  event_type     text        NOT NULL,
  metadata       jsonb       NOT NULL DEFAULT '{}',
  occurred_at    timestamptz NOT NULL DEFAULT now()
);

-- Índices úteis
CREATE INDEX IF NOT EXISTS idx_admin_events_company
  ON public.admin_events (company_id);

CREATE INDEX IF NOT EXISTS idx_admin_events_target
  ON public.admin_events (target_user_id);

CREATE INDEX IF NOT EXISTS idx_admin_events_occurred
  ON public.admin_events (occurred_at DESC);

-- ---------------------------------------------------------------------------
-- 3. RLS para admin_events
-- ---------------------------------------------------------------------------
ALTER TABLE public.admin_events ENABLE ROW LEVEL SECURITY;

-- Admin da mesma company pode ler
DROP POLICY IF EXISTS "admin_events_select" ON public.admin_events;
CREATE POLICY "admin_events_select"
  ON public.admin_events
  FOR SELECT
  USING (
    company_id = (
      SELECT p.company_id FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
      LIMIT 1
    )
  );

-- Apenas RPCs SECURITY DEFINER podem inserir (sem policy de INSERT para usuários diretos)

-- ---------------------------------------------------------------------------
-- 4. Funções helper: is_admin() e current_company_id()
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.current_company_id()
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
  SELECT company_id FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1;
$$;

-- ---------------------------------------------------------------------------
-- 5. RPC: rpc_admin_list_sellers_stats
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_admin_list_sellers_stats(p_days int DEFAULT 30)
  RETURNS TABLE (
    seller_id             uuid,
    full_name             text,
    email                 text,
    role                  text,
    is_active             boolean,
    active_cycles_count   bigint,
    novo_count            bigint,
    contato_count         bigint,
    respondeu_count       bigint,
    negociacao_count      bigint,
    ganho_count_period    bigint,
    perdido_count_period  bigint,
    last_activity_at      timestamptz
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_company_id uuid;
  v_period_start timestamptz;
BEGIN
  -- Somente admin
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado: somente admin pode executar esta função';
  END IF;

  v_company_id  := public.current_company_id();
  v_period_start := now() - (p_days || ' days')::interval;

  RETURN QUERY
  SELECT
    p.id                                    AS seller_id,
    p.full_name,
    p.email,
    p.role,
    p.is_active,

    -- Carteira ativa (ciclos abertos)
    COUNT(DISTINCT sc.id) FILTER (
      WHERE sc.status NOT IN ('ganho', 'perdido')
    )                                       AS active_cycles_count,

    -- Contagem por status atual
    COUNT(DISTINCT sc.id) FILTER (
      WHERE sc.status = 'novo'
    )                                       AS novo_count,

    COUNT(DISTINCT sc.id) FILTER (
      WHERE sc.status = 'contato'
    )                                       AS contato_count,

    COUNT(DISTINCT sc.id) FILTER (
      WHERE sc.status = 'respondeu'
    )                                       AS respondeu_count,

    COUNT(DISTINCT sc.id) FILTER (
      WHERE sc.status = 'negociacao'
    )                                       AS negociacao_count,

    -- Ganhos no período
    COUNT(DISTINCT sc.id) FILTER (
      WHERE sc.status = 'ganho'
        AND sc.updated_at >= v_period_start
    )                                       AS ganho_count_period,

    -- Perdidos no período
    COUNT(DISTINCT sc.id) FILTER (
      WHERE sc.status = 'perdido'
        AND sc.updated_at >= v_period_start
    )                                       AS perdido_count_period,

    -- Última atividade
    MAX(sc.updated_at)                      AS last_activity_at

  FROM public.profiles p
  LEFT JOIN public.sales_cycles sc
    ON sc.seller_id = p.id
    AND sc.company_id = v_company_id
  WHERE
    p.company_id = v_company_id
    AND p.role IN ('admin', 'manager', 'member', 'seller', 'consultor')
  GROUP BY
    p.id, p.full_name, p.email, p.role, p.is_active
  ORDER BY
    p.full_name ASC NULLS LAST;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. RPC: rpc_admin_update_seller_access
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_admin_update_seller_access(
  p_seller_id uuid,
  p_role      text,
  p_is_active boolean
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_admin_id    uuid;
  v_company_id  uuid;
  v_old_role    text;
  v_old_active  boolean;
  v_events      text[] := '{}';
BEGIN
  -- Somente admin
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado: somente admin pode executar esta função';
  END IF;

  v_admin_id   := auth.uid();
  v_company_id := public.current_company_id();

  -- Buscar dados atuais do vendedor, validando que pertence à mesma company
  SELECT role, is_active
    INTO v_old_role, v_old_active
  FROM public.profiles
  WHERE id = p_seller_id AND company_id = v_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vendedor não encontrado ou não pertence a esta empresa';
  END IF;

  -- Atualizar perfil
  UPDATE public.profiles
     SET role      = p_role,
         is_active = p_is_active
   WHERE id = p_seller_id AND company_id = v_company_id;

  -- Registrar eventos de auditoria
  IF v_old_role IS DISTINCT FROM p_role THEN
    INSERT INTO public.admin_events (
      company_id, actor_user_id, target_user_id, event_type, metadata
    ) VALUES (
      v_company_id,
      v_admin_id,
      p_seller_id,
      'role_changed',
      jsonb_build_object(
        'role_old', v_old_role,
        'role_new', p_role
      )
    );
    v_events := array_append(v_events, 'role_changed');
  END IF;

  IF v_old_active IS DISTINCT FROM p_is_active THEN
    INSERT INTO public.admin_events (
      company_id, actor_user_id, target_user_id, event_type, metadata
    ) VALUES (
      v_company_id,
      v_admin_id,
      p_seller_id,
      CASE WHEN p_is_active THEN 'seller_activated' ELSE 'seller_deactivated' END,
      jsonb_build_object(
        'is_active_old', v_old_active,
        'is_active_new', p_is_active
      )
    );
    v_events := array_append(
      v_events,
      CASE WHEN p_is_active THEN 'seller_activated' ELSE 'seller_deactivated' END
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'events', to_jsonb(v_events)
  );
END;
$$;
