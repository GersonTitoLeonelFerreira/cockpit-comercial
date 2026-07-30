begin;

create or replace function public.rpc_admin_update_seller_access_for_company(
  p_company_id uuid,
  p_seller_id uuid,
  p_role text,
  p_is_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  v_admin_id uuid;
  v_next_role text;
  v_old_role text;
  v_old_active boolean;
  v_events text[] := '{}';
  v_returned_to_pool_count integer := 0;
  v_now timestamptz := now();
begin
  if p_company_id is null then
    raise exception 'Empresa obrigatória';
  end if;

  if p_seller_id is null then
    raise exception 'Usuário obrigatório';
  end if;

  if p_is_active is null then
    raise exception 'Status ativo/inativo obrigatório';
  end if;

  if not public.has_active_company_membership(
    p_company_id,
    array['admin']
  ) then
    raise exception 'Acesso negado: admin ativo da empresa obrigatório';
  end if;

  v_admin_id := auth.uid();
  v_next_role := lower(btrim(coalesce(p_role, '')));

  if v_next_role not in ('admin', 'manager', 'member') then
    raise exception 'Role inválido. Valores aceitos: admin, manager, member';
  end if;

  select
    cm.role,
    cm.is_active
  into
    v_old_role,
    v_old_active
  from public.company_memberships cm
  where cm.company_id = p_company_id
    and cm.user_id = p_seller_id;

  if not found then
    raise exception 'Usuário não possui vínculo com esta empresa';
  end if;

  update public.company_memberships
  set
    role = v_next_role,
    is_active = p_is_active,
    updated_at = v_now,
    metadata = metadata || jsonb_build_object(
      'last_access_update_source',
      'rpc_admin_update_seller_access_for_company',
      'last_access_update_at',
      v_now
    )
  where company_id = p_company_id
    and user_id = p_seller_id;

  if v_old_role is distinct from v_next_role then
    insert into public.admin_events (
      company_id,
      actor_user_id,
      target_user_id,
      event_type,
      metadata
    )
    values (
      p_company_id,
      v_admin_id,
      p_seller_id,
      'role_changed',
      jsonb_build_object(
        'role_old',
        v_old_role,
        'role_new',
        v_next_role
      )
    );

    v_events := array_append(v_events, 'role_changed');
  end if;

  if coalesce(v_old_active, false) = true
    and p_is_active = false then
    with returned_cycles as (
      update public.sales_cycles
      set
        owner_user_id = null,
        updated_at = v_now
      where company_id = p_company_id
        and owner_user_id = p_seller_id
        and (
          status is null
          or status not in ('ganho', 'perdido', 'cancelado')
        )
      returning id
    ),
    inserted_events as (
      insert into public.cycle_events (
        cycle_id,
        company_id,
        event_type,
        metadata,
        created_by,
        occurred_at
      )
      select
        returned_cycles.id,
        p_company_id,
        'returned_to_pool',
        jsonb_build_object(
          'reason',
          'seller_deactivated',
          'details',
          'Ciclo devolvido automaticamente ao Pool após a desativação do responsável.',
          'previous_owner',
          p_seller_id,
          'source',
          'seller_access_update'
        ),
        v_admin_id,
        v_now
      from returned_cycles
      returning cycle_id
    )
    select count(*)
    into v_returned_to_pool_count
    from inserted_events;
  end if;

  if v_old_active is distinct from p_is_active then
    insert into public.admin_events (
      company_id,
      actor_user_id,
      target_user_id,
      event_type,
      metadata
    )
    values (
      p_company_id,
      v_admin_id,
      p_seller_id,
      case
        when p_is_active then 'seller_activated'
        else 'seller_deactivated'
      end,
      jsonb_build_object(
        'is_active_old',
        v_old_active,
        'is_active_new',
        p_is_active,
        'active_cycles_returned_to_pool',
        v_returned_to_pool_count
      )
    );

    v_events := array_append(
      v_events,
      case
        when p_is_active then 'seller_activated'
        else 'seller_deactivated'
      end
    );
  end if;

  return jsonb_build_object(
    'ok',
    true,
    'company_id',
    p_company_id,
    'seller_id',
    p_seller_id,
    'events',
    to_jsonb(v_events),
    'active_cycles_returned_to_pool',
    v_returned_to_pool_count
  );
end;
$function$;

commit;
