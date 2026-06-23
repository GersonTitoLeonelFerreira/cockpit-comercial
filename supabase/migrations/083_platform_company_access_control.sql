begin;

create or replace function public.rpc_platform_set_company_status(
  p_company_id uuid,
  p_platform_status text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_current_status text;
  v_next_status text := lower(btrim(coalesce(p_platform_status, '')));
  v_membership record;
  v_backup jsonb;
  v_restore_active boolean;
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

  if v_next_status not in ('active', 'blocked') then
    return jsonb_build_object(
      'success', false,
      'error', 'invalid_platform_status'
    );
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_actor_id
      and p.is_platform_admin = true
      and coalesce(p.is_active_global, true) = true
  ) then
    return jsonb_build_object(
      'success', false,
      'error', 'platform_admin_required'
    );
  end if;

  select c.platform_status
    into v_current_status
  from public.companies c
  where c.id = p_company_id
  for update;

  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'company_not_found'
    );
  end if;

  if v_current_status = v_next_status then
    return jsonb_build_object(
      'success', true,
      'changed', false,
      'platform_status', v_current_status
    );
  end if;

  update public.companies
  set
    platform_status = v_next_status,
    platform_status_updated_at = v_now
  where id = p_company_id;

  if v_next_status = 'blocked' then
    for v_membership in
      select
        cm.id,
        cm.is_active,
        cm.metadata
      from public.company_memberships cm
      where cm.company_id = p_company_id
      for update
    loop
      update public.company_memberships
      set
        is_active = false,
        metadata = jsonb_set(
          coalesce(v_membership.metadata, '{}'::jsonb),
          '{platform_company_block_backup}',
          jsonb_build_object(
            'is_active', v_membership.is_active,
            'blocked_at', v_now,
            'blocked_by', v_actor_id
          ),
          true
        )
      where id = v_membership.id;
    end loop;
  else
    for v_membership in
      select
        cm.id,
        cm.is_active,
        cm.metadata
      from public.company_memberships cm
      where cm.company_id = p_company_id
      for update
    loop
      v_backup := coalesce(
        v_membership.metadata,
        '{}'::jsonb
      ) -> 'platform_company_block_backup';

      v_restore_active := case
        when v_backup ? 'is_active'
          then (v_backup ->> 'is_active')::boolean
        else v_membership.is_active
      end;

      update public.company_memberships
      set
        is_active = v_restore_active,
        metadata = coalesce(
          v_membership.metadata,
          '{}'::jsonb
        ) - 'platform_company_block_backup'
      where id = v_membership.id;
    end loop;
  end if;

  insert into public.admin_events (
    company_id,
    actor_user_id,
    target_user_id,
    event_type,
    metadata
  )
  values (
    p_company_id,
    v_actor_id,
    null,
    'company_platform_status_changed',
    jsonb_build_object(
      'from_status', v_current_status,
      'to_status', v_next_status,
      'source', 'platform_company_status_control'
    )
  );

  return jsonb_build_object(
    'success', true,
    'changed', true,
    'platform_status', v_next_status
  );
end;
$function$;

revoke all on function public.rpc_platform_set_company_status(uuid, text) from public;

grant execute on function public.rpc_platform_set_company_status(uuid, text)
to authenticated;

grant execute on function public.rpc_platform_set_company_status(uuid, text)
to service_role;

commit;