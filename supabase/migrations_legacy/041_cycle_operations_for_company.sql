-- =============================================================================
-- Migration 041 — Cycle operations for active company
-- =============================================================================
-- Objetivo:
-- Criar versões seguras das RPCs críticas de ciclo comercial usando p_company_id
-- explícito, validação de company_memberships e controle de permissão por empresa.
--
-- Esta migration NÃO remove as RPCs antigas.
-- A troca do front/API será feita depois, em etapa separada.
--
-- Núcleo afetado:
-- - sales_cycles
-- - cycle_events
-- - company_memberships
-- - Kanban
-- - SellerKanban
-- - próxima ação
-- - fechamento ganho/perdido
-- - atribuição de responsável
--
-- Regras:
-- - anon não executa as novas RPCs
-- - authenticated executa somente com validação interna
-- - service_role mantém execução
-- =============================================================================

begin;

-- =============================================================================
-- 1. Próxima ação por empresa ativa
-- =============================================================================

create or replace function public.rpc_set_next_action_for_company(
  p_company_id uuid,
  p_cycle_id uuid,
  p_next_action text,
  p_next_action_date timestamp with time zone
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_membership_role text;
  v_is_admin_or_manager boolean := false;
  v_cycle public.sales_cycles%rowtype;
  v_now timestamptz := now();
begin
  if v_actor_id is null then
    return jsonb_build_object('success', false, 'error_message', 'not_authenticated');
  end if;

  if p_company_id is null then
    return jsonb_build_object('success', false, 'error_message', 'company_not_found');
  end if;

  select cm.role
    into v_membership_role
  from public.company_memberships cm
  where cm.company_id = p_company_id
    and cm.user_id = v_actor_id
    and cm.is_active = true
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'error_message', 'membership_not_found');
  end if;

  v_is_admin_or_manager := v_membership_role in ('admin', 'manager');

  select *
    into v_cycle
  from public.sales_cycles
  where id = p_cycle_id
    and company_id = p_company_id;

  if not found then
    return jsonb_build_object('success', false, 'error_message', 'cycle_not_found');
  end if;

  if not v_is_admin_or_manager and v_cycle.owner_user_id is distinct from v_actor_id then
    return jsonb_build_object('success', false, 'error_message', 'permission_denied');
  end if;

  if v_cycle.status in ('ganho', 'perdido', 'cancelado') then
    return jsonb_build_object(
      'success', false,
      'error_message', 'Não é possível definir próxima ação em ciclo fechado'
    );
  end if;

  update public.sales_cycles
  set
    next_action = p_next_action,
    next_action_date = p_next_action_date,
    updated_at = v_now
  where id = p_cycle_id
    and company_id = p_company_id;

  insert into public.cycle_events (
    cycle_id,
    company_id,
    event_type,
    metadata,
    created_by,
    occurred_at
  )
  values (
    p_cycle_id,
    p_company_id,
    'next_action_set',
    jsonb_build_object(
      'previous_next_action', v_cycle.next_action,
      'previous_next_action_date', v_cycle.next_action_date,
      'new_next_action', p_next_action,
      'new_next_action_date', p_next_action_date
    ),
    v_actor_id,
    v_now
  );

  return jsonb_build_object('success', true);
end;
$function$;

-- =============================================================================
-- 2. Movimento simples de etapa por empresa ativa
-- =============================================================================

create or replace function public.rpc_move_cycle_stage_for_company(
  p_company_id uuid,
  p_cycle_id uuid,
  p_to_status text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_membership_role text;
  v_is_admin_or_manager boolean := false;
  v_cycle public.sales_cycles%rowtype;
  v_now timestamptz := now();
begin
  if v_actor_id is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  if p_company_id is null then
    return jsonb_build_object('success', false, 'error', 'company_not_found');
  end if;

  select cm.role
    into v_membership_role
  from public.company_memberships cm
  where cm.company_id = p_company_id
    and cm.user_id = v_actor_id
    and cm.is_active = true
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'error', 'membership_not_found');
  end if;

  v_is_admin_or_manager := v_membership_role in ('admin', 'manager');

  select *
    into v_cycle
  from public.sales_cycles
  where id = p_cycle_id
    and company_id = p_company_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'cycle_not_found');
  end if;

  if not v_is_admin_or_manager and v_cycle.owner_user_id is distinct from v_actor_id then
    return jsonb_build_object('success', false, 'error', 'permission_denied');
  end if;

  if v_cycle.status in ('ganho', 'perdido', 'cancelado') then
    return jsonb_build_object('success', false, 'error', 'cycle_already_closed');
  end if;

  if p_to_status in ('ganho', 'perdido') then
    return jsonb_build_object(
      'success', false,
      'error', 'Use rpc_close_cycle_won_for_company/rpc_close_cycle_lost_for_company para fechamento terminal'
    );
  end if;

  update public.sales_cycles
  set
    previous_status = status,
    status = p_to_status::lead_status,
    stage_entered_at = v_now,
    updated_at = v_now
  where id = p_cycle_id
    and company_id = p_company_id;

  insert into public.cycle_events (
    cycle_id,
    company_id,
    event_type,
    metadata,
    created_by,
    occurred_at
  )
  values (
    p_cycle_id,
    p_company_id,
    'stage_changed',
    jsonb_build_object(
      'from_status', v_cycle.status,
      'to_status', p_to_status,
      'payload', coalesce(p_metadata, '{}'::jsonb)
    ),
    v_actor_id,
    v_now
  );

  return jsonb_build_object('success', true);
end;
$function$;

-- =============================================================================
-- 3. Movimento com checkpoint por empresa ativa
-- =============================================================================

create or replace function public.rpc_move_cycle_stage_checkpoint_for_company(
  p_company_id uuid,
  p_cycle_id uuid,
  p_to_status text,
  p_checkpoint jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_membership_role text;
  v_is_admin_or_manager boolean := false;
  v_cycle public.sales_cycles%rowtype;
  v_next_action text;
  v_next_action_date timestamptz;
  v_now timestamptz := now();
begin
  if v_actor_id is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  if p_company_id is null then
    return jsonb_build_object('success', false, 'error', 'company_not_found');
  end if;

  select cm.role
    into v_membership_role
  from public.company_memberships cm
  where cm.company_id = p_company_id
    and cm.user_id = v_actor_id
    and cm.is_active = true
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'error', 'membership_not_found');
  end if;

  v_is_admin_or_manager := v_membership_role in ('admin', 'manager');

  select *
    into v_cycle
  from public.sales_cycles
  where id = p_cycle_id
    and company_id = p_company_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'cycle_not_found');
  end if;

  if not v_is_admin_or_manager and v_cycle.owner_user_id is distinct from v_actor_id then
    return jsonb_build_object('success', false, 'error', 'permission_denied');
  end if;

  if v_cycle.status in ('ganho', 'perdido', 'cancelado') then
    return jsonb_build_object('success', false, 'error', 'cycle_already_closed');
  end if;

  if p_to_status in ('ganho', 'perdido') then
    return jsonb_build_object(
      'success', false,
      'error', 'Use rpc_close_cycle_won_for_company/rpc_close_cycle_lost_for_company para fechamento terminal'
    );
  end if;

  v_next_action := nullif(p_checkpoint->>'next_action', '');

  v_next_action_date := case
    when nullif(p_checkpoint->>'next_action_date', '') is null then null
    else (p_checkpoint->>'next_action_date')::timestamptz
  end;

  update public.sales_cycles
  set
    previous_status = status,
    status = p_to_status::lead_status,
    stage_entered_at = v_now,
    next_action = coalesce(v_next_action, next_action),
    next_action_date = coalesce(v_next_action_date, next_action_date),
    updated_at = v_now
  where id = p_cycle_id
    and company_id = p_company_id;

  insert into public.cycle_events (
    cycle_id,
    company_id,
    event_type,
    metadata,
    created_by,
    occurred_at
  )
  values (
    p_cycle_id,
    p_company_id,
    'stage_changed',
    jsonb_build_object(
      'from_status', v_cycle.status,
      'to_status', p_to_status,
      'checkpoint', coalesce(p_checkpoint, '{}'::jsonb),
      'action_channel', p_checkpoint->>'action_channel',
      'action_result', p_checkpoint->>'action_result',
      'result_detail', p_checkpoint->>'result_detail',
      'note', p_checkpoint->>'note',
      'next_action', p_checkpoint->>'next_action',
      'next_action_date', p_checkpoint->>'next_action_date',
      'lost_reason', p_checkpoint->>'lost_reason'
    ),
    v_actor_id,
    v_now
  );

  return jsonb_build_object('success', true);
end;
$function$;

-- =============================================================================
-- 4. Fechamento perdido por empresa ativa
-- =============================================================================

create or replace function public.rpc_close_cycle_lost_for_company(
  p_company_id uuid,
  p_cycle_id uuid,
  p_lost_reason text default null::text,
  p_note text default null::text,
  p_action_channel text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_membership_role text;
  v_is_admin_or_manager boolean := false;
  v_cycle public.sales_cycles%rowtype;
  v_now timestamptz := now();
  v_reason text;
  v_note text;
  v_lost_owner_user_id uuid;
begin
  if v_actor_id is null then
    return jsonb_build_object('success', false, 'error_message', 'not_authenticated');
  end if;

  if p_company_id is null then
    return jsonb_build_object('success', false, 'error_message', 'company_not_found');
  end if;

  select cm.role
    into v_membership_role
  from public.company_memberships cm
  where cm.company_id = p_company_id
    and cm.user_id = v_actor_id
    and cm.is_active = true
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'error_message', 'membership_not_found');
  end if;

  v_is_admin_or_manager := v_membership_role in ('admin', 'manager');

  select *
    into v_cycle
  from public.sales_cycles
  where id = p_cycle_id
    and company_id = p_company_id;

  if not found then
    return jsonb_build_object('success', false, 'error_message', 'cycle_not_found');
  end if;

  if not v_is_admin_or_manager and v_cycle.owner_user_id is distinct from v_actor_id then
    return jsonb_build_object('success', false, 'error_message', 'permission_denied');
  end if;

  if v_cycle.status in ('ganho', 'perdido', 'cancelado') then
    return jsonb_build_object(
      'success', false,
      'error_message', 'Ciclo já está fechado como ' || v_cycle.status
    );
  end if;

  v_reason := coalesce(nullif(trim(p_lost_reason), ''), 'Não informado');
  v_note := nullif(trim(p_note), '');
  v_lost_owner_user_id := coalesce(v_cycle.owner_user_id, v_actor_id);

  update public.sales_cycles
  set
    status = 'perdido',
    previous_status = v_cycle.status,
    stage_entered_at = v_now,
    lost_at = v_now,
    closed_at = v_now,
    lost_reason = v_reason,
    lost_owner_user_id = v_lost_owner_user_id,
    next_action = null,
    next_action_date = null,
    updated_at = v_now
  where id = p_cycle_id
    and company_id = p_company_id;

  insert into public.cycle_events (
    cycle_id,
    company_id,
    event_type,
    metadata,
    created_by,
    occurred_at
  )
  values (
    p_cycle_id,
    p_company_id,
    'closed_lost',
    jsonb_build_object(
      'from_status', v_cycle.status,
      'to_status', 'perdido',
      'lost_reason', v_reason,
      'lost_owner_user_id', v_lost_owner_user_id,
      'note', v_note,
      'action_channel', p_action_channel
    ),
    v_actor_id,
    v_now
  );

  return jsonb_build_object(
    'success', true,
    'id', p_cycle_id,
    'status', 'perdido',
    'previous_status', v_cycle.status,
    'lost_at', v_now,
    'closed_at', v_now,
    'lost_reason', v_reason
  );
end;
$function$;

-- =============================================================================
-- 5. Fechamento ganho por empresa ativa
-- =============================================================================

create or replace function public.rpc_close_cycle_won_for_company(
  p_company_id uuid,
  p_cycle_id uuid,
  p_won_value numeric default null::numeric,
  p_revenue_date_ref date default null::date,
  p_won_note text default null::text,
  p_product_id uuid default null::uuid,
  p_won_unit_price numeric default null::numeric,
  p_payment_method text default null::text,
  p_payment_type text default null::text,
  p_entry_amount numeric default null::numeric,
  p_installments_count integer default null::integer,
  p_installment_amount numeric default null::numeric,
  p_payment_notes text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_membership_role text;
  v_is_admin_or_manager boolean := false;
  v_cycle public.sales_cycles%rowtype;
  v_now timestamptz := now();
  v_won_owner_user_id uuid;
  v_won_note text;
  v_payment_notes text;
  v_won_total numeric;
begin
  if v_actor_id is null then
    return jsonb_build_object('success', false, 'error_message', 'not_authenticated');
  end if;

  if p_company_id is null then
    return jsonb_build_object('success', false, 'error_message', 'company_not_found');
  end if;

  select cm.role
    into v_membership_role
  from public.company_memberships cm
  where cm.company_id = p_company_id
    and cm.user_id = v_actor_id
    and cm.is_active = true
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'error_message', 'membership_not_found');
  end if;

  v_is_admin_or_manager := v_membership_role in ('admin', 'manager');

  select *
    into v_cycle
  from public.sales_cycles
  where id = p_cycle_id
    and company_id = p_company_id;

  if not found then
    return jsonb_build_object('success', false, 'error_message', 'cycle_not_found');
  end if;

  if not v_is_admin_or_manager and v_cycle.owner_user_id is distinct from v_actor_id then
    return jsonb_build_object('success', false, 'error_message', 'permission_denied');
  end if;

  if v_cycle.status in ('ganho', 'perdido', 'cancelado') then
    return jsonb_build_object(
      'success', false,
      'error_message', 'Ciclo já está fechado como ' || v_cycle.status
    );
  end if;

  v_won_owner_user_id := coalesce(v_cycle.owner_user_id, v_actor_id);
  v_won_note := nullif(trim(p_won_note), '');
  v_payment_notes := nullif(trim(p_payment_notes), '');
  v_won_total := coalesce(p_won_value, v_cycle.won_total, 0);

  update public.sales_cycles
  set
    status = 'ganho',
    previous_status = v_cycle.status,
    stage_entered_at = v_now,
    won_at = v_now,
    closed_at = v_now,
    won_total = v_won_total,
    won_owner_user_id = v_won_owner_user_id,
    revenue_seller_ref_date = p_revenue_date_ref,
    won_value_source = case
      when p_revenue_date_ref is not null then 'revenue'
      else 'manual'
    end,
    won_note = v_won_note,
    product_id = p_product_id,
    won_unit_price = p_won_unit_price,
    payment_method = p_payment_method,
    payment_type = p_payment_type,
    entry_amount = p_entry_amount,
    installments_count = p_installments_count,
    installment_amount = p_installment_amount,
    payment_notes = v_payment_notes,
    next_action = null,
    next_action_date = null,
    updated_at = v_now
  where id = p_cycle_id
    and company_id = p_company_id;

  insert into public.cycle_events (
    cycle_id,
    company_id,
    event_type,
    metadata,
    created_by,
    occurred_at
  )
  values (
    p_cycle_id,
    p_company_id,
    'closed_won',
    jsonb_build_object(
      'from_status', v_cycle.status,
      'to_status', 'ganho',
      'won_total', v_won_total,
      'won_owner_user_id', v_won_owner_user_id,
      'revenue_seller_ref_date', p_revenue_date_ref,
      'won_note', v_won_note,
      'product_id', p_product_id,
      'won_unit_price', p_won_unit_price,
      'payment_method', p_payment_method,
      'payment_type', p_payment_type,
      'entry_amount', p_entry_amount,
      'installments_count', p_installments_count,
      'installment_amount', p_installment_amount,
      'payment_notes', v_payment_notes
    ),
    v_actor_id,
    v_now
  );

  return jsonb_build_object(
    'success', true,
    'id', p_cycle_id,
    'status', 'ganho',
    'previous_status', v_cycle.status,
    'won_at', v_now,
    'closed_at', v_now,
    'won_total', v_won_total,
    'won_owner_user_id', v_won_owner_user_id
  );
end;
$function$;

-- =============================================================================
-- 6. Atribuição de responsável por empresa ativa
-- =============================================================================

create or replace function public.rpc_assign_cycle_owner_for_company(
  p_company_id uuid,
  p_cycle_id uuid,
  p_owner_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_membership_role text;
  v_cycle public.sales_cycles%rowtype;
  v_now timestamptz := now();
  v_event_type text;
  v_target_exists boolean := false;
begin
  if v_actor_id is null then
    return jsonb_build_object('success', false, 'error_message', 'not_authenticated');
  end if;

  if p_company_id is null then
    return jsonb_build_object('success', false, 'error_message', 'company_not_found');
  end if;

  if p_owner_user_id is null then
    return jsonb_build_object('success', false, 'error_message', 'owner_user_id_required');
  end if;

  select cm.role
    into v_membership_role
  from public.company_memberships cm
  where cm.company_id = p_company_id
    and cm.user_id = v_actor_id
    and cm.is_active = true
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'error_message', 'membership_not_found');
  end if;

  if v_membership_role not in ('admin', 'manager') then
    return jsonb_build_object('success', false, 'error_message', 'permission_denied');
  end if;

  select exists (
    select 1
    from public.company_memberships cm
    where cm.company_id = p_company_id
      and cm.user_id = p_owner_user_id
      and cm.is_active = true
  )
  into v_target_exists;

  if not v_target_exists then
    return jsonb_build_object('success', false, 'error_message', 'owner_membership_not_found');
  end if;

  select *
    into v_cycle
  from public.sales_cycles
  where id = p_cycle_id
    and company_id = p_company_id;

  if not found then
    return jsonb_build_object('success', false, 'error_message', 'cycle_not_found');
  end if;

  if v_cycle.status in ('ganho', 'perdido', 'cancelado') then
    return jsonb_build_object('success', false, 'error_message', 'cycle_already_closed');
  end if;

  if v_cycle.owner_user_id is not distinct from p_owner_user_id then
    return jsonb_build_object('success', true, 'no_change', true);
  end if;

  v_event_type := case
    when v_cycle.owner_user_id is null then 'owner_assigned'
    else 'owner_reassigned'
  end;

  update public.sales_cycles
  set
    owner_user_id = p_owner_user_id,
    updated_at = v_now
  where id = p_cycle_id
    and company_id = p_company_id;

  insert into public.cycle_events (
    cycle_id,
    company_id,
    event_type,
    metadata,
    created_by,
    occurred_at
  )
  values (
    p_cycle_id,
    p_company_id,
    v_event_type,
    jsonb_build_object(
      'previous_owner_user_id', v_cycle.owner_user_id,
      'new_owner_user_id', p_owner_user_id,
      'from_status', v_cycle.status,
      'to_status', v_cycle.status,
      'source', 'single_assign',
      'rule', 'assign_keeps_current_status'
    ),
    v_actor_id,
    v_now
  );

  return jsonb_build_object('success', true);
end;
$function$;

-- =============================================================================
-- 7. Privilégios das novas RPCs
-- =============================================================================
-- Por padrão, funções novas podem nascer executáveis por PUBLIC.
-- Por isso, removemos acesso genérico e liberamos apenas para authenticated
-- e service_role. anon não deve executar operação comercial crítica.

revoke all on function public.rpc_set_next_action_for_company(uuid, uuid, text, timestamp with time zone) from public;
revoke all on function public.rpc_move_cycle_stage_for_company(uuid, uuid, text, jsonb) from public;
revoke all on function public.rpc_move_cycle_stage_checkpoint_for_company(uuid, uuid, text, jsonb) from public;
revoke all on function public.rpc_close_cycle_lost_for_company(uuid, uuid, text, text, text) from public;
revoke all on function public.rpc_close_cycle_won_for_company(uuid, uuid, numeric, date, text, uuid, numeric, text, text, numeric, integer, numeric, text) from public;
revoke all on function public.rpc_assign_cycle_owner_for_company(uuid, uuid, uuid) from public;

grant execute on function public.rpc_set_next_action_for_company(uuid, uuid, text, timestamp with time zone) to authenticated, service_role;
grant execute on function public.rpc_move_cycle_stage_for_company(uuid, uuid, text, jsonb) to authenticated, service_role;
grant execute on function public.rpc_move_cycle_stage_checkpoint_for_company(uuid, uuid, text, jsonb) to authenticated, service_role;
grant execute on function public.rpc_close_cycle_lost_for_company(uuid, uuid, text, text, text) to authenticated, service_role;
grant execute on function public.rpc_close_cycle_won_for_company(uuid, uuid, numeric, date, text, uuid, numeric, text, text, numeric, integer, numeric, text) to authenticated, service_role;
grant execute on function public.rpc_assign_cycle_owner_for_company(uuid, uuid, uuid) to authenticated, service_role;

commit;