-- =============================================================================
-- Migration 045 — AI context and apply suggestion for active company
-- =============================================================================
-- Fase 5C — IA com empresa ativa explícita
--
-- Problema:
-- As RPCs antigas da IA usam current_company_id(), mas o contexto oficial atual
-- da empresa ativa vem do cookie cockpit_active_company_id no Next.js.
--
-- Objetivo:
-- Criar versões _for_company das RPCs de IA, recebendo p_company_id
-- explicitamente e validando company_memberships + ownership/admin.
--
-- Não remove as RPCs antigas nesta migration.
-- A revogação das RPCs antigas fica para uma etapa posterior, depois de validar
-- as rotas usando as novas funções.
-- =============================================================================

begin;

-- =============================================================================
-- 1. Contexto de IA por empresa ativa
-- =============================================================================

create or replace function public.rpc_get_cycle_ai_context_for_company(
  p_company_id uuid,
  p_cycle_id uuid,
  p_events_limit integer default 12
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor_id uuid := auth.uid();
  v_membership_role text;
  v_is_admin_or_manager boolean := false;
  v_cycle record;
  v_recent_events jsonb := '[]'::jsonb;
  v_limit integer := greatest(coalesce(p_events_limit, 12), 1);
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

  select
    sc.id as cycle_id,
    sc.status::text as cycle_status,
    sc.owner_user_id,
    sc.next_action,
    sc.next_action_date,
    sc.current_group_id,
    lg.name as current_group_name,
    l.id as lead_id,
    l.name as lead_name,
    l.phone as lead_phone,
    l.email as lead_email
  into v_cycle
  from public.sales_cycles sc
  join public.leads l
    on l.id = sc.lead_id
   and l.company_id = sc.company_id
  left join public.lead_groups lg
    on lg.id = sc.current_group_id
   and lg.company_id = sc.company_id
  where sc.id = p_cycle_id
    and sc.company_id = p_company_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'cycle_not_found');
  end if;

  if not v_is_admin_or_manager and v_cycle.owner_user_id is distinct from v_actor_id then
    return jsonb_build_object('success', false, 'error', 'permission_denied');
  end if;

  select coalesce(
    jsonb_agg(event_row.event_obj order by event_row.occurred_at desc),
    '[]'::jsonb
  )
  into v_recent_events
  from (
    select
      ce.occurred_at,
      jsonb_build_object(
        'event_type', ce.event_type,
        'occurred_at', ce.occurred_at,
        'from_status', coalesce(
          ce.metadata->>'from_status',
          ce.metadata->'payload'->>'from_status',
          ce.metadata->'checkpoint'->>'from_status',
          ce.metadata->>'previous_status',
          ce.metadata->>'original_status'
        ),
        'to_status', coalesce(
          ce.metadata->>'to_status',
          ce.metadata->'payload'->>'to_status',
          ce.metadata->'checkpoint'->>'to_status',
          ce.metadata->>'applied_status',
          ce.metadata->>'new_status'
        ),
        'action_channel', coalesce(
          ce.metadata->>'action_channel',
          ce.metadata->'payload'->>'action_channel',
          ce.metadata->'checkpoint'->>'action_channel',
          ce.metadata->'suggestion'->>'action_channel'
        ),
        'action_result', coalesce(
          ce.metadata->>'action_result',
          ce.metadata->'payload'->>'action_result',
          ce.metadata->'checkpoint'->>'action_result',
          ce.metadata->'suggestion'->>'action_result'
        ),
        'result_detail', coalesce(
          ce.metadata->>'result_detail',
          ce.metadata->'payload'->>'result_detail',
          ce.metadata->'checkpoint'->>'result_detail',
          ce.metadata->'suggestion'->>'result_detail'
        ),
        'next_action', coalesce(
          ce.metadata->>'next_action',
          ce.metadata->'payload'->>'next_action',
          ce.metadata->'checkpoint'->>'next_action',
          ce.metadata->>'new_next_action'
        ),
        'next_action_date', coalesce(
          ce.metadata->>'next_action_date',
          ce.metadata->'payload'->>'next_action_date',
          ce.metadata->'checkpoint'->>'next_action_date',
          ce.metadata->>'new_next_action_date'
        ),
        'lost_reason', coalesce(
          ce.metadata->>'lost_reason',
          ce.metadata->'payload'->>'lost_reason',
          ce.metadata->'checkpoint'->>'lost_reason',
          ce.metadata->'suggestion'->>'close_reason'
        ),
        'source', coalesce(
          ce.metadata->>'source',
          ce.metadata->'payload'->>'source'
        )
      ) as event_obj
    from public.cycle_events ce
    where ce.company_id = p_company_id
      and ce.cycle_id = p_cycle_id
    order by ce.occurred_at desc
    limit v_limit
  ) as event_row;

  return jsonb_build_object(
    'success', true,
    'cycle', jsonb_build_object(
      'id', v_cycle.cycle_id,
      'status', v_cycle.cycle_status,
      'owner_user_id', v_cycle.owner_user_id,
      'next_action', v_cycle.next_action,
      'next_action_date', v_cycle.next_action_date,
      'current_group_id', v_cycle.current_group_id,
      'current_group_name', v_cycle.current_group_name
    ),
    'lead', jsonb_build_object(
      'id', v_cycle.lead_id,
      'name', v_cycle.lead_name,
      'phone', v_cycle.lead_phone,
      'email', v_cycle.lead_email
    ),
    'recent_events', v_recent_events
  );
end;
$$;

-- =============================================================================
-- 2. Aplicação de sugestão de IA por empresa ativa
-- =============================================================================

create or replace function public.rpc_apply_ai_open_suggestion_for_company(
  p_company_id uuid,
  p_cycle_id uuid,
  p_to_status text,
  p_next_action text default null,
  p_next_action_date timestamptz default null,
  p_summary text default null,
  p_suggestion jsonb default '{}'::jsonb,
  p_source text default 'ai_copilot_detail'
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor_id uuid := auth.uid();
  v_membership_role text;
  v_is_admin_or_manager boolean := false;
  v_cycle public.sales_cycles%rowtype;
  v_now timestamptz := now();
  v_to_status public.lead_status;
  v_next_action text;
  v_next_action_date timestamptz;
  v_summary text;
  v_source text;
  v_status_changed boolean := false;
  v_action_changed boolean := false;
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

  if p_to_status is null or p_to_status not in ('novo', 'contato', 'respondeu', 'negociacao', 'pausado') then
    return jsonb_build_object('success', false, 'error', 'invalid_open_status');
  end if;

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

  v_to_status := p_to_status::public.lead_status;
  v_summary := nullif(trim(coalesce(p_summary, '')), '');
  v_source := coalesce(nullif(trim(coalesce(p_source, '')), ''), 'ai_copilot_detail');
  v_next_action := nullif(trim(coalesce(p_next_action, '')), '');
  v_next_action_date := p_next_action_date;

  if v_to_status = 'novo' then
    v_next_action := null;
    v_next_action_date := null;
  end if;

  if v_next_action is null then
    v_next_action_date := null;
  end if;

  v_status_changed := v_cycle.status is distinct from v_to_status;
  v_action_changed :=
    v_cycle.next_action is distinct from v_next_action
    or v_cycle.next_action_date is distinct from v_next_action_date;

  update public.sales_cycles
  set
    previous_status = case
      when v_status_changed then v_cycle.status::text
      else previous_status
    end,
    status = case
      when v_status_changed then v_to_status
      else status
    end,
    stage_entered_at = case
      when v_status_changed then v_now
      else stage_entered_at
    end,
    next_action = v_next_action,
    next_action_date = v_next_action_date,
    updated_at = v_now
  where id = p_cycle_id
    and company_id = p_company_id;

  if v_status_changed then
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
        'to_status', v_to_status::text,
        'action_channel', p_suggestion->>'action_channel',
        'action_result', p_suggestion->>'action_result',
        'result_detail', p_suggestion->>'result_detail',
        'note', v_summary,
        'next_action', v_next_action,
        'next_action_date', v_next_action_date,
        'source', v_source,
        'applied_by_ai', true
      ),
      v_actor_id,
      v_now
    );
  end if;

  if not v_status_changed and v_action_changed then
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
        'new_next_action', v_next_action,
        'new_next_action_date', v_next_action_date,
        'note', v_summary,
        'source', v_source,
        'applied_by_ai', true
      ),
      v_actor_id,
      v_now
    );
  end if;

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
    'ai_suggestion_applied',
    jsonb_build_object(
      'original_status', v_cycle.status,
      'applied_status', v_to_status::text,
      'next_action', v_next_action,
      'next_action_date', v_next_action_date,
      'edited_summary', v_summary,
      'suggestion', coalesce(p_suggestion, '{}'::jsonb),
      'source', v_source
    ),
    v_actor_id,
    v_now
  );

  return jsonb_build_object(
    'success', true,
    'id', p_cycle_id,
    'status', v_to_status::text,
    'previous_status', v_cycle.status,
    'next_action', v_next_action,
    'next_action_date', v_next_action_date
  );
end;
$$;

-- =============================================================================
-- 3. Grants
-- =============================================================================

revoke execute on function public.rpc_get_cycle_ai_context_for_company(
  uuid,
  uuid,
  integer
) from public;

revoke execute on function public.rpc_get_cycle_ai_context_for_company(
  uuid,
  uuid,
  integer
) from anon;

grant execute on function public.rpc_get_cycle_ai_context_for_company(
  uuid,
  uuid,
  integer
) to authenticated, service_role;

revoke execute on function public.rpc_apply_ai_open_suggestion_for_company(
  uuid,
  uuid,
  text,
  text,
  timestamptz,
  text,
  jsonb,
  text
) from public;

revoke execute on function public.rpc_apply_ai_open_suggestion_for_company(
  uuid,
  uuid,
  text,
  text,
  timestamptz,
  text,
  jsonb,
  text
) from anon;

grant execute on function public.rpc_apply_ai_open_suggestion_for_company(
  uuid,
  uuid,
  text,
  text,
  timestamptz,
  text,
  jsonb,
  text
) to authenticated, service_role;

commit;