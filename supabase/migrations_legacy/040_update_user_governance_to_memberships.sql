-- Fase 3C.7E — Atualizar governança de usuários para company_memberships
-- Objetivo:
-- 1. Parar de usar profiles.company_id, profiles.role e profiles.is_active como fonte operacional.
-- 2. Usar company_memberships como fonte oficial de permissão por empresa.
-- 3. Manter assinaturas legadas funcionando enquanto as telas são migradas.
-- 4. Bloquear uso ambíguo quando um usuário tiver mais de uma empresa ativa.

-- ---------------------------------------------------------------------------
-- 1. current_company_id()
-- ---------------------------------------------------------------------------
-- Observação:
-- O banco não lê o cookie cockpit_active_company_id do Next.js.
-- Portanto, esta função só retorna empresa quando o usuário possui exatamente
-- uma membership ativa. Se houver múltiplas, retorna null para evitar operação
-- na empresa errada.

CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_count integer;
  v_company_id uuid;
BEGIN
  SELECT COUNT(*)
    INTO v_count
  FROM public.company_memberships cm
  WHERE cm.user_id = auth.uid()
    AND cm.is_active = true;

  IF v_count <> 1 THEN
    RETURN NULL;
  END IF;

  SELECT cm.company_id
    INTO v_company_id
  FROM public.company_memberships cm
  WHERE cm.user_id = auth.uid()
    AND cm.is_active = true
  LIMIT 1;

  RETURN v_company_id;
END;
$function$;

COMMENT ON FUNCTION public.current_company_id() IS
  'Compatibilidade legada: retorna company_id somente quando o usuário possui exatamente uma empresa ativa. Para multiempresa, prefira RPCs com p_company_id explícito.';

-- ---------------------------------------------------------------------------
-- 2. is_admin()
-- ---------------------------------------------------------------------------
-- Compatibilidade legada.
-- Retorna true se o usuário for platform admin ativo ou admin em qualquer
-- company_membership ativa.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_platform_admin = true
        AND COALESCE(p.is_active_global, true) = true
    )
    OR EXISTS (
      SELECT 1
      FROM public.company_memberships cm
      WHERE cm.user_id = auth.uid()
        AND cm.role = 'admin'
        AND cm.is_active = true
    );
$function$;

COMMENT ON FUNCTION public.is_admin() IS
  'Compatibilidade legada: true para platform admin ativo ou admin ativo em pelo menos uma empresa. Para ações por empresa, usar is_company_admin(p_company_id).';

-- ---------------------------------------------------------------------------
-- 3. Função explícita para alterar role por empresa
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_set_user_role_for_company(
  p_company_id uuid,
  p_user_id uuid,
  p_role text
)
RETURNS TABLE(success boolean, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_admin_id uuid;
  v_next_role text;
  v_old_role text;
BEGIN
  v_admin_id := auth.uid();
  v_next_role := lower(btrim(coalesce(p_role, '')));

  IF p_company_id IS NULL THEN
    RETURN QUERY SELECT false, 'Empresa obrigatória.';
    RETURN;
  END IF;

  IF p_user_id IS NULL THEN
    RETURN QUERY SELECT false, 'Usuário obrigatório.';
    RETURN;
  END IF;

  IF v_next_role NOT IN ('admin', 'manager', 'member') THEN
    RETURN QUERY SELECT false, 'Role inválido. Valores aceitos: admin, manager, member.';
    RETURN;
  END IF;

  IF NOT public.has_active_company_membership(p_company_id, ARRAY['admin']) THEN
    RETURN QUERY SELECT false, 'Acesso negado: admin ativo da empresa obrigatório.';
    RETURN;
  END IF;

  SELECT cm.role
    INTO v_old_role
  FROM public.company_memberships cm
  WHERE cm.company_id = p_company_id
    AND cm.user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Usuário não possui vínculo com esta empresa.';
    RETURN;
  END IF;

  UPDATE public.company_memberships
     SET role = v_next_role,
         updated_at = now(),
         metadata = metadata || jsonb_build_object(
           'last_role_change_source', 'fn_set_user_role_for_company',
           'last_role_change_at', now()
         )
   WHERE company_id = p_company_id
     AND user_id = p_user_id;

  IF v_old_role IS DISTINCT FROM v_next_role THEN
    INSERT INTO public.admin_events (
      company_id,
      actor_user_id,
      target_user_id,
      event_type,
      metadata
    ) VALUES (
      p_company_id,
      v_admin_id,
      p_user_id,
      'role_changed',
      jsonb_build_object(
        'role_old', v_old_role,
        'role_new', v_next_role,
        'source', 'fn_set_user_role_for_company'
      )
    );
  END IF;

  RETURN QUERY SELECT true, 'Role do usuário atualizado para: ' || v_next_role;
END;
$function$;

COMMENT ON FUNCTION public.fn_set_user_role_for_company(uuid, uuid, text) IS
  'Altera role de um usuário dentro de uma empresa específica usando company_memberships como fonte oficial.';

-- ---------------------------------------------------------------------------
-- 4. Wrapper legado fn_set_user_role(p_user_id, p_role)
-- ---------------------------------------------------------------------------
-- Mantém assinatura antiga, mas só funciona se current_company_id() conseguir
-- resolver empresa única. Em ambiente multiempresa, deve ser substituída pela
-- função com p_company_id explícito.

CREATE OR REPLACE FUNCTION public.fn_set_user_role(p_user_id uuid, p_role text)
RETURNS TABLE(success boolean, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_company_id uuid;
BEGIN
  v_company_id := public.current_company_id();

  IF v_company_id IS NULL THEN
    RETURN QUERY SELECT false, 'Empresa ativa ambígua. Use a versão com p_company_id.';
    RETURN;
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.fn_set_user_role_for_company(v_company_id, p_user_id, p_role);
END;
$function$;

COMMENT ON FUNCTION public.fn_set_user_role(uuid, text) IS
  'Wrapper legado. Usa current_company_id() e falha quando o usuário possui múltiplas empresas ativas.';

-- ---------------------------------------------------------------------------
-- 5. RPC explícita para atualizar acesso de usuário comercial por empresa
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_admin_update_seller_access_for_company(
  p_company_id uuid,
  p_seller_id uuid,
  p_role text,
  p_is_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_admin_id uuid;
  v_next_role text;
  v_old_role text;
  v_old_active boolean;
  v_events text[] := '{}';
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'Empresa obrigatória';
  END IF;

  IF p_seller_id IS NULL THEN
    RAISE EXCEPTION 'Usuário obrigatório';
  END IF;

  IF p_is_active IS NULL THEN
    RAISE EXCEPTION 'Status ativo/inativo obrigatório';
  END IF;

  IF NOT public.has_active_company_membership(p_company_id, ARRAY['admin']) THEN
    RAISE EXCEPTION 'Acesso negado: admin ativo da empresa obrigatório';
  END IF;

  v_admin_id := auth.uid();
  v_next_role := lower(btrim(coalesce(p_role, '')));

  IF v_next_role NOT IN ('admin', 'manager', 'member') THEN
    RAISE EXCEPTION 'Role inválido. Valores aceitos: admin, manager, member';
  END IF;

  SELECT cm.role, cm.is_active
    INTO v_old_role, v_old_active
  FROM public.company_memberships cm
  WHERE cm.company_id = p_company_id
    AND cm.user_id = p_seller_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuário não possui vínculo com esta empresa';
  END IF;

  UPDATE public.company_memberships
     SET role = v_next_role,
         is_active = p_is_active,
         updated_at = now(),
         metadata = metadata || jsonb_build_object(
           'last_access_update_source', 'rpc_admin_update_seller_access_for_company',
           'last_access_update_at', now()
         )
   WHERE company_id = p_company_id
     AND user_id = p_seller_id;

  IF v_old_role IS DISTINCT FROM v_next_role THEN
    INSERT INTO public.admin_events (
      company_id,
      actor_user_id,
      target_user_id,
      event_type,
      metadata
    ) VALUES (
      p_company_id,
      v_admin_id,
      p_seller_id,
      'role_changed',
      jsonb_build_object('role_old', v_old_role, 'role_new', v_next_role)
    );

    v_events := array_append(v_events, 'role_changed');
  END IF;

  IF v_old_active IS DISTINCT FROM p_is_active THEN
    INSERT INTO public.admin_events (
      company_id,
      actor_user_id,
      target_user_id,
      event_type,
      metadata
    ) VALUES (
      p_company_id,
      v_admin_id,
      p_seller_id,
      CASE WHEN p_is_active THEN 'seller_activated' ELSE 'seller_deactivated' END,
      jsonb_build_object('is_active_old', v_old_active, 'is_active_new', p_is_active)
    );

    v_events := array_append(
      v_events,
      CASE WHEN p_is_active THEN 'seller_activated' ELSE 'seller_deactivated' END
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'company_id', p_company_id,
    'seller_id', p_seller_id,
    'events', to_jsonb(v_events)
  );
END;
$function$;

COMMENT ON FUNCTION public.rpc_admin_update_seller_access_for_company(uuid, uuid, text, boolean) IS
  'Atualiza role/status de um usuário dentro de uma empresa específica usando company_memberships.';

-- ---------------------------------------------------------------------------
-- 6. Wrapper legado rpc_admin_update_seller_access(...)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_admin_update_seller_access(
  p_seller_id uuid,
  p_role text,
  p_is_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_company_id uuid;
BEGIN
  v_company_id := public.current_company_id();

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Empresa ativa ambígua. Use rpc_admin_update_seller_access_for_company com p_company_id.';
  END IF;

  RETURN public.rpc_admin_update_seller_access_for_company(
    v_company_id,
    p_seller_id,
    p_role,
    p_is_active
  );
END;
$function$;

COMMENT ON FUNCTION public.rpc_admin_update_seller_access(uuid, text, boolean) IS
  'Wrapper legado. Usa current_company_id() e falha quando o usuário possui múltiplas empresas ativas.';

-- ---------------------------------------------------------------------------
-- 7. RPC explícita para listar usuários comerciais por empresa
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_admin_list_sellers_stats_for_company(
  p_company_id uuid,
  p_days integer DEFAULT 30
)
RETURNS TABLE(
  seller_id uuid,
  full_name text,
  email text,
  role text,
  is_active boolean,
  active_cycles_count bigint,
  novo_count bigint,
  contato_count bigint,
  respondeu_count bigint,
  negociacao_count bigint,
  ganho_count_period bigint,
  perdido_count_period bigint,
  last_activity_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_period_start timestamptz;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'Empresa obrigatória';
  END IF;

  IF NOT public.has_active_company_membership(p_company_id, ARRAY['admin']) THEN
    RAISE EXCEPTION 'Acesso negado: admin ativo da empresa obrigatório';
  END IF;

  v_period_start := now() - (COALESCE(p_days, 30) || ' days')::interval;

  RETURN QUERY
  SELECT
    p.id AS seller_id,
    p.full_name,
    p.email,
    cm.role,
    cm.is_active,
    COUNT(DISTINCT sc.id) FILTER (
      WHERE sc.status NOT IN ('ganho', 'perdido')
    ) AS active_cycles_count,
    COUNT(DISTINCT sc.id) FILTER (
      WHERE sc.status = 'novo'
    ) AS novo_count,
    COUNT(DISTINCT sc.id) FILTER (
      WHERE sc.status = 'contato'
    ) AS contato_count,
    COUNT(DISTINCT sc.id) FILTER (
      WHERE sc.status = 'respondeu'
    ) AS respondeu_count,
    COUNT(DISTINCT sc.id) FILTER (
      WHERE sc.status = 'negociacao'
    ) AS negociacao_count,
    COUNT(DISTINCT sc.id) FILTER (
      WHERE sc.status = 'ganho'
        AND sc.updated_at >= v_period_start
    ) AS ganho_count_period,
    COUNT(DISTINCT sc.id) FILTER (
      WHERE sc.status = 'perdido'
        AND sc.updated_at >= v_period_start
    ) AS perdido_count_period,
    MAX(sc.updated_at) AS last_activity_at
  FROM public.company_memberships cm
  JOIN public.profiles p
    ON p.id = cm.user_id
  LEFT JOIN public.sales_cycles sc
    ON sc.owner_user_id = cm.user_id
   AND sc.company_id = p_company_id
  WHERE cm.company_id = p_company_id
    AND cm.role IN ('admin', 'manager', 'member')
  GROUP BY
    p.id,
    p.full_name,
    p.email,
    cm.role,
    cm.is_active
  ORDER BY
    p.full_name ASC NULLS LAST;
END;
$function$;

COMMENT ON FUNCTION public.rpc_admin_list_sellers_stats_for_company(uuid, integer) IS
  'Lista usuários comerciais e estatísticas por empresa usando company_memberships como fonte oficial.';

-- ---------------------------------------------------------------------------
-- 8. Wrapper legado rpc_admin_list_sellers_stats(p_days)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_admin_list_sellers_stats(p_days integer DEFAULT 30)
RETURNS TABLE(
  seller_id uuid,
  full_name text,
  email text,
  role text,
  is_active boolean,
  active_cycles_count bigint,
  novo_count bigint,
  contato_count bigint,
  respondeu_count bigint,
  negociacao_count bigint,
  ganho_count_period bigint,
  perdido_count_period bigint,
  last_activity_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_company_id uuid;
BEGIN
  v_company_id := public.current_company_id();

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Empresa ativa ambígua. Use rpc_admin_list_sellers_stats_for_company com p_company_id.';
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.rpc_admin_list_sellers_stats_for_company(v_company_id, p_days);
END;
$function$;

COMMENT ON FUNCTION public.rpc_admin_list_sellers_stats(integer) IS
  'Wrapper legado. Usa current_company_id() e falha quando o usuário possui múltiplas empresas ativas.';    