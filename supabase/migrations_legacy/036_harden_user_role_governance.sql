-- Fase 3B — Governança de usuários, vendedores e permissões
-- Objetivo: alinhar funções legadas ao contrato oficial de roles: admin, manager, member.
-- Não altera dados existentes.

-- 1) Corrige fallback e normalização de role no trigger de criação de usuário.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_raw_role text;
  v_role text;
  v_full_name text;
  v_company uuid;
BEGIN
  v_raw_role := lower(btrim(coalesce(new.raw_user_meta_data->>'role', 'member')));

  v_role := CASE
    WHEN v_raw_role IN ('admin', 'manager', 'member') THEN v_raw_role
    WHEN v_raw_role IN ('seller', 'consultor', 'user') THEN 'member'
    ELSE 'member'
  END;

  v_full_name := coalesce(nullif(btrim(new.raw_user_meta_data->>'full_name'), ''), new.email, 'Usuário');

  BEGIN
    v_company := nullif(new.raw_user_meta_data->>'company_id', '')::uuid;
  EXCEPTION WHEN others THEN
    v_company := null;
  END;

  INSERT INTO public.profiles (id, company_id, role, full_name, email, created_at)
  VALUES (new.id, v_company, v_role, v_full_name, new.email, now())
  ON CONFLICT (id) DO UPDATE
    SET
      company_id = coalesce(excluded.company_id, public.profiles.company_id),
      role       = excluded.role,
      full_name  = coalesce(excluded.full_name, public.profiles.full_name),
      email      = coalesce(excluded.email, public.profiles.email);

  RETURN new;
END;
$function$;

-- 2) Corrige função legada de alteração de role para usar public.profiles como fonte oficial.
CREATE OR REPLACE FUNCTION public.fn_set_user_role(p_user_id uuid, p_role text)
 RETURNS TABLE(success boolean, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_admin_id uuid;
  v_company_id uuid;
  v_next_role text;
  v_old_role text;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN QUERY SELECT false, 'Acesso negado: somente admin pode alterar role.';
    RETURN;
  END IF;

  v_admin_id := auth.uid();
  v_company_id := public.current_company_id();
  v_next_role := lower(btrim(coalesce(p_role, '')));

  IF v_next_role NOT IN ('admin', 'manager', 'member') THEN
    RETURN QUERY SELECT false, 'Role inválido. Valores aceitos: admin, manager, member.';
    RETURN;
  END IF;

  SELECT role
    INTO v_old_role
  FROM public.profiles
  WHERE id = p_user_id
    AND company_id = v_company_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Usuário não encontrado ou não pertence a esta empresa.';
    RETURN;
  END IF;

  UPDATE public.profiles
     SET role = v_next_role
   WHERE id = p_user_id
     AND company_id = v_company_id;

  IF v_old_role IS DISTINCT FROM v_next_role THEN
    INSERT INTO public.admin_events (
      company_id, actor_user_id, target_user_id, event_type, metadata
    ) VALUES (
      v_company_id,
      v_admin_id,
      p_user_id,
      'role_changed',
      jsonb_build_object('role_old', v_old_role, 'role_new', v_next_role, 'source', 'fn_set_user_role')
    );
  END IF;

  RETURN QUERY SELECT true, 'Role do usuário atualizado para: ' || v_next_role;
END;
$function$;

-- 3) Endurece RPC oficial de acesso de vendedores/usuários comerciais.
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
  v_admin_id uuid;
  v_company_id uuid;
  v_next_role text;
  v_old_role text;
  v_old_active boolean;
  v_events text[] := '{}';
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado: somente admin';
  END IF;

  IF p_seller_id IS NULL THEN
    RAISE EXCEPTION 'Usuário obrigatório';
  END IF;

  IF p_is_active IS NULL THEN
    RAISE EXCEPTION 'Status ativo/inativo obrigatório';
  END IF;

  v_admin_id := auth.uid();
  v_company_id := public.current_company_id();
  v_next_role := lower(btrim(coalesce(p_role, '')));

  IF v_next_role NOT IN ('admin', 'manager', 'member') THEN
    RAISE EXCEPTION 'Role inválido. Valores aceitos: admin, manager, member';
  END IF;

  SELECT role, is_active
    INTO v_old_role, v_old_active
  FROM public.profiles
  WHERE id = p_seller_id
    AND company_id = v_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vendedor não encontrado ou não pertence a esta empresa';
  END IF;

  UPDATE public.profiles
     SET role = v_next_role,
         is_active = p_is_active
   WHERE id = p_seller_id
     AND company_id = v_company_id;

  IF v_old_role IS DISTINCT FROM v_next_role THEN
    INSERT INTO public.admin_events (
      company_id, actor_user_id, target_user_id, event_type, metadata
    ) VALUES (
      v_company_id,
      v_admin_id,
      p_seller_id,
      'role_changed',
      jsonb_build_object('role_old', v_old_role, 'role_new', v_next_role)
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
      jsonb_build_object('is_active_old', v_old_active, 'is_active_new', p_is_active)
    );
    v_events := array_append(
      v_events,
      CASE WHEN p_is_active THEN 'seller_activated' ELSE 'seller_deactivated' END
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'events', to_jsonb(v_events));
END;
$function$;

-- 4) Remove roles legadas da RPC de listagem administrativa.
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
  v_period_start timestamptz;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado: somente admin';
  END IF;

  v_company_id := public.current_company_id();
  v_period_start := now() - (p_days || ' days')::interval;

  RETURN QUERY
  SELECT
    p.id AS seller_id,
    p.full_name,
    p.email,
    p.role,
    p.is_active,
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
  FROM public.profiles p
  LEFT JOIN public.sales_cycles sc
    ON sc.owner_user_id = p.id
   AND sc.company_id = v_company_id
  WHERE p.company_id = v_company_id
    AND p.role IN ('admin', 'manager', 'member')
  GROUP BY p.id, p.full_name, p.email, p.role, p.is_active
  ORDER BY p.full_name ASC NULLS LAST;
END;
$function$;
