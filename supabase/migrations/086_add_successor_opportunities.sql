-- =============================================================================
-- Migration 086 — Nova oportunidade vinculada a ciclo terminal
-- =============================================================================
-- Objetivo:
--   Permitir criar uma nova oportunidade para o mesmo lead após Ganho ou Perdido,
--   preservando integralmente o ciclo anterior como histórico imutável.
--
-- Regras:
--   - origem deve ser Ganho ou Perdido;
--   - um lead só pode ter um ciclo ativo por empresa;
--   - novo ciclo sempre nasce em Novo;
--   - nenhum dado financeiro ou de perda é copiado;
--   - vendedor comum só pode criar para si mesmo;
--   - admin e manager podem manter vendedor anterior, enviar ao Pool,
--     distribuir automaticamente ou indicar outro vendedor.
-- =============================================================================

begin;

alter table public.sales_cycles
  add column if not exists origin_cycle_id uuid null,
  add column if not exists opportunity_type text null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fk_sales_cycles_origin_cycle_id'
  ) then
    alter table public.sales_cycles
      add constraint fk_sales_cycles_origin_cycle_id
      foreign key (origin_cycle_id)
      references public.sales_cycles(id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'chk_sales_cycles_origin_cycle_not_self'
  ) then
    alter table public.sales_cycles
      add constraint chk_sales_cycles_origin_cycle_not_self
      check (
        origin_cycle_id is null
        or origin_cycle_id <> id
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'chk_sales_cycles_opportunity_type'
  ) then
    alter table public.sales_cycles
      add constraint chk_sales_cycles_opportunity_type
      check (
        opportunity_type is null
        or opportunity_type = any (
          array[
            'reativacao',
            'renovacao',
            'recompra',
            'upgrade',
            'novo_produto'
          ]::text[]
        )
      );
  end if;
end;
$$;

create index if not exists idx_sales_cycles_company_origin_cycle
  on public.sales_cycles (company_id, origin_cycle_id)
  where origin_cycle_id is not null;

create or replace function public.rpc_create_successor_cycle_for_company(
  p_company_id uuid,
  p_source_cycle_id uuid,
  p_opportunity_type text,
  p_assignment_mode text,
  p_owner_user_id uuid default null,
  p_group_id uuid default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_is_admin_or_manager boolean := false;
  v_source public.sales_cycles%rowtype;
  v_source_terminal_owner_id uuid;
  v_destination_owner_id uuid := null;
  v_candidate_owner_id uuid;
  v_existing_active_cycle_id uuid;
  v_new_cycle_id uuid;
  v_type text := lower(btrim(coalesce(p_opportunity_type, '')));
  v_mode text := lower(btrim(coalesce(p_assignment_mode, '')));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_now timestamptz := now();
begin
  if v_actor_id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'not_authenticated'
    );
  end if;

  if p_company_id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'company_not_found'
    );
  end if;

  if p_source_cycle_id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'source_cycle_not_found'
    );
  end if;

  if v_type not in (
    'reativacao',
    'renovacao',
    'recompra',
    'upgrade',
    'novo_produto'
  ) then
    return jsonb_build_object(
      'success', false,
      'error', 'invalid_opportunity_type'
    );
  end if;

  if v_mode not in (
    'same_seller',
    'pool',
    'auto_balance',
    'specific_seller'
  ) then
    return jsonb_build_object(
      'success', false,
      'error', 'invalid_assignment_mode'
    );
  end if;

  select cm.role
    into v_actor_role
  from public.company_memberships cm
  join public.profiles p
    on p.id = cm.user_id
  where cm.company_id = p_company_id
    and cm.user_id = v_actor_id
    and cm.is_active = true
    and coalesce(p.is_active_global, true) = true
  limit 1;

  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'membership_not_found'
    );
  end if;

  v_is_admin_or_manager := v_actor_role in ('admin', 'manager');

  select *
    into v_source
  from public.sales_cycles
  where id = p_source_cycle_id
    and company_id = p_company_id
  for update;

  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'source_cycle_not_found'
    );
  end if;

  if v_source.status not in ('ganho', 'perdido') then
    return jsonb_build_object(
      'success', false,
      'error', 'source_cycle_not_terminal'
    );
  end if;

  if not exists (
    select 1
    from public.leads l
    where l.id = v_source.lead_id
      and l.company_id = p_company_id
      and l.deleted_at is null
  ) then
    return jsonb_build_object(
      'success', false,
      'error', 'lead_not_available'
    );
  end if;

  v_source_terminal_owner_id := case
    when v_source.status = 'ganho' then v_source.won_owner_user_id
    when v_source.status = 'perdido' then v_source.lost_owner_user_id
    else null
  end;

  if not v_is_admin_or_manager
    and v_source.owner_user_id is distinct from v_actor_id
    and v_source_terminal_owner_id is distinct from v_actor_id
  then
    return jsonb_build_object(
      'success', false,
      'error', 'permission_denied'
    );
  end if;

  if not v_is_admin_or_manager
    and v_mode <> 'same_seller'
  then
    return jsonb_build_object(
      'success', false,
      'error', 'destination_change_requires_manager'
    );
  end if;

  if p_group_id is not null
    and not exists (
      select 1
      from public.lead_groups lg
      where lg.id = p_group_id
        and lg.company_id = p_company_id
        and lg.archived_at is null
    )
  then
    return jsonb_build_object(
      'success', false,
      'error', 'invalid_group'
    );
  end if;

  select sc.id
    into v_existing_active_cycle_id
  from public.sales_cycles sc
  where sc.company_id = p_company_id
    and sc.lead_id = v_source.lead_id
    and sc.status not in ('ganho', 'perdido')
  limit 1;

  if v_existing_active_cycle_id is not null then
    return jsonb_build_object(
      'success', false,
      'error', 'active_cycle_exists',
      'active_cycle_id', v_existing_active_cycle_id
    );
  end if;

  if v_mode = 'same_seller' then
    if not v_is_admin_or_manager then
      v_destination_owner_id := v_actor_id;
    else
      v_candidate_owner_id := coalesce(
        v_source_terminal_owner_id,
        v_source.owner_user_id
      );

      if v_candidate_owner_id is not null then
        select cm.user_id
          into v_destination_owner_id
        from public.company_memberships cm
        join public.profiles p
          on p.id = cm.user_id
        where cm.company_id = p_company_id
          and cm.user_id = v_candidate_owner_id
          and cm.is_active = true
          and coalesce(p.is_active_global, true) = true
        limit 1;
      end if;
    end if;
  end if;

  if v_mode = 'pool' then
    if not v_is_admin_or_manager then
      return jsonb_build_object(
        'success', false,
        'error', 'destination_change_requires_manager'
      );
    end if;

    v_destination_owner_id := null;
  end if;

  if v_mode = 'specific_seller' then
    if not v_is_admin_or_manager then
      return jsonb_build_object(
        'success', false,
        'error', 'destination_change_requires_manager'
      );
    end if;

    if p_owner_user_id is null then
      return jsonb_build_object(
        'success', false,
        'error', 'owner_required'
      );
    end if;

    select cm.user_id
      into v_destination_owner_id
    from public.company_memberships cm
    join public.profiles p
      on p.id = cm.user_id
    where cm.company_id = p_company_id
      and cm.user_id = p_owner_user_id
      and cm.is_active = true
      and coalesce(p.is_active_global, true) = true
    limit 1;

    if v_destination_owner_id is null then
      return jsonb_build_object(
        'success', false,
        'error', 'invalid_owner'
      );
    end if;
  end if;

  if v_mode = 'auto_balance' then
    if not v_is_admin_or_manager then
      return jsonb_build_object(
        'success', false,
        'error', 'destination_change_requires_manager'
      );
    end if;

    select cm.user_id
      into v_destination_owner_id
    from public.company_memberships cm
    join public.profiles p
      on p.id = cm.user_id
    left join public.sales_cycles active_cycle
      on active_cycle.company_id = p_company_id
     and active_cycle.owner_user_id = cm.user_id
     and active_cycle.status in (
       'novo',
       'contato',
       'respondeu',
       'negociacao',
       'pausado'
     )
    where cm.company_id = p_company_id
      and cm.is_active = true
      and cm.role in ('member', 'manager')
      and coalesce(p.is_active_global, true) = true
    group by cm.user_id, p.full_name, p.email
    order by
      count(active_cycle.id) asc,
      coalesce(
        nullif(p.full_name, ''),
        nullif(p.email, ''),
        cm.user_id::text
      ) asc,
      cm.user_id asc
    limit 1;

    if v_destination_owner_id is null then
      return jsonb_build_object(
        'success', false,
        'error', 'auto_distribution_unavailable'
      );
    end if;
  end if;

  insert into public.sales_cycles (
    company_id,
    lead_id,
    owner_user_id,
    status,
    stage_entered_at,
    current_group_id,
    origin_cycle_id,
    opportunity_type,
    created_at,
    updated_at
  )
  values (
    p_company_id,
    v_source.lead_id,
    v_destination_owner_id,
    'novo'::lead_status,
    v_now,
    p_group_id,
    v_source.id,
    v_type,
    v_now,
    v_now
  )
  returning id
    into v_new_cycle_id;

  insert into public.cycle_events (
    cycle_id,
    company_id,
    event_type,
    metadata,
    created_by,
    occurred_at
  )
  values
    (
      v_new_cycle_id,
      p_company_id,
      'cycle_created',
      jsonb_build_object(
        'source', 'successor_cycle',
        'entry_mode', 'successor_cycle',
        'origin_cycle_id', v_source.id,
        'origin_status', v_source.status,
        'opportunity_type', v_type,
        'assignment_mode', v_mode,
        'owner_user_id', v_destination_owner_id,
        'group_id', p_group_id,
        'note', v_note
      ),
      v_actor_id,
      v_now
    ),
    (
      v_source.id,
      p_company_id,
      'successor_cycle_created',
      jsonb_build_object(
        'successor_cycle_id', v_new_cycle_id,
        'opportunity_type', v_type,
        'assignment_mode', v_mode,
        'owner_user_id', v_destination_owner_id,
        'group_id', p_group_id,
        'note', v_note
      ),
      v_actor_id,
      v_now
    );

  if p_group_id is not null then
    insert into public.lead_group_cycles (
      company_id,
      group_id,
      cycle_id,
      attached_by,
      attached_at
    )
    values (
      p_company_id,
      p_group_id,
      v_new_cycle_id,
      v_actor_id,
      v_now
    );

    insert into public.cycle_events (
      cycle_id,
      company_id,
      event_type,
      metadata,
      created_by,
      occurred_at
    )
    values (
      v_new_cycle_id,
      p_company_id,
      'group_attached',
      jsonb_build_object(
        'group_id', p_group_id,
        'source', 'successor_cycle'
      ),
      v_actor_id,
      v_now
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'cycle_id', v_new_cycle_id,
    'lead_id', v_source.lead_id,
    'origin_cycle_id', v_source.id,
    'owner_user_id', v_destination_owner_id,
    'assignment_mode', v_mode,
    'opportunity_type', v_type,
    'group_id', p_group_id
  );
end;
$function$;

revoke all on function public.rpc_create_successor_cycle_for_company(
  uuid,
  uuid,
  text,
  text,
  uuid,
  uuid,
  text
) from public;

grant execute on function public.rpc_create_successor_cycle_for_company(
  uuid,
  uuid,
  text,
  text,
  uuid,
  uuid,
  text
) to authenticated;

grant execute on function public.rpc_create_successor_cycle_for_company(
  uuid,
  uuid,
  text,
  text,
  uuid,
  uuid,
  text
) to service_role;

commit;
