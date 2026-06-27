begin;

create table if not exists public.ai_coaching_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  cycle_id uuid not null,
  created_by uuid not null,
  source text not null default 'ai_copilot_detail',
  coaching jsonb not null,
  yolen_decision jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_coaching_notes_company_cycle_created_idx
  on public.ai_coaching_notes (
    company_id,
    cycle_id,
    created_at desc
  );

alter table public.ai_coaching_notes enable row level security;

revoke all on table public.ai_coaching_notes from anon, authenticated;

create or replace function public.rpc_save_ai_coaching_for_company(
  p_company_id uuid,
  p_cycle_id uuid,
  p_coaching jsonb,
  p_yolen_decision jsonb default '{}'::jsonb,
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
  v_cycle_owner_user_id uuid;
  v_note_id uuid;
  v_now timestamptz := now();
  v_source text;
  v_summary text;
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

  if p_cycle_id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'cycle_not_found'
    );
  end if;

  if p_coaching is null
    or jsonb_typeof(p_coaching) <> 'object'
  then
    return jsonb_build_object(
      'success', false,
      'error', 'invalid_coaching'
    );
  end if;

  v_summary := nullif(
    trim(
      coalesce(
        p_coaching->>'conversation_summary',
        ''
      )
    ),
    ''
  );

  if v_summary is null then
    return jsonb_build_object(
      'success', false,
      'error', 'missing_conversation_summary'
    );
  end if;

  select cm.role
    into v_membership_role
  from public.company_memberships cm
  where cm.company_id = p_company_id
    and cm.user_id = v_actor_id
    and cm.is_active = true
  limit 1;

  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'membership_not_found'
    );
  end if;

  v_is_admin_or_manager :=
    v_membership_role in ('admin', 'manager');

  select sc.owner_user_id
    into v_cycle_owner_user_id
  from public.sales_cycles sc
  where sc.id = p_cycle_id
    and sc.company_id = p_company_id;

  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'cycle_not_found'
    );
  end if;

  if not v_is_admin_or_manager
    and v_cycle_owner_user_id is distinct from v_actor_id
  then
    return jsonb_build_object(
      'success', false,
      'error', 'permission_denied'
    );
  end if;

  v_source := coalesce(
    nullif(
      trim(
        coalesce(
          p_source,
          ''
        )
      ),
      ''
    ),
    'ai_copilot_detail'
  );

  insert into public.ai_coaching_notes (
    company_id,
    cycle_id,
    created_by,
    source,
    coaching,
    yolen_decision,
    created_at
  )
  values (
    p_company_id,
    p_cycle_id,
    v_actor_id,
    v_source,
    p_coaching,
    coalesce(
      p_yolen_decision,
      '{}'::jsonb
    ),
    v_now
  )
  returning id into v_note_id;

  insert into public.cycle_events (
    company_id,
    cycle_id,
    event_type,
    created_by,
    metadata,
    occurred_at
  )
  values (
    p_company_id,
    p_cycle_id,
    'ai_coaching_saved',
    v_actor_id,
    jsonb_build_object(
      'coaching_note_id',
      v_note_id,
      'summary_preview',
      left(v_summary, 220),
      'source',
      v_source
    ),
    v_now
  );

  return jsonb_build_object(
    'success', true,
    'id', v_note_id,
    'occurred_at', v_now
  );
end;
$$;

revoke all on function public.rpc_save_ai_coaching_for_company(
  uuid,
  uuid,
  jsonb,
  jsonb,
  text
) from public;

grant execute on function public.rpc_save_ai_coaching_for_company(
  uuid,
  uuid,
  jsonb,
  jsonb,
  text
) to authenticated;

create or replace function public.rpc_list_ai_coaching_for_cycle_for_company(
  p_company_id uuid,
  p_cycle_id uuid,
  p_limit integer default 10
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
  v_cycle_owner_user_id uuid;
  v_limit integer := least(
    greatest(
      coalesce(p_limit, 10),
      1
    ),
    50
  );
  v_items jsonb := '[]'::jsonb;
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

  select cm.role
    into v_membership_role
  from public.company_memberships cm
  where cm.company_id = p_company_id
    and cm.user_id = v_actor_id
    and cm.is_active = true
  limit 1;

  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'membership_not_found'
    );
  end if;

  v_is_admin_or_manager :=
    v_membership_role in ('admin', 'manager');

  select sc.owner_user_id
    into v_cycle_owner_user_id
  from public.sales_cycles sc
  where sc.id = p_cycle_id
    and sc.company_id = p_company_id;

  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'cycle_not_found'
    );
  end if;

  if not v_is_admin_or_manager
    and v_cycle_owner_user_id is distinct from v_actor_id
  then
    return jsonb_build_object(
      'success', false,
      'error', 'permission_denied'
    );
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',
        note.id,
        'created_at',
        note.created_at,
        'source',
        note.source,
        'coaching',
        note.coaching,
        'yolen_decision',
        note.yolen_decision
      )
      order by note.created_at desc
    ),
    '[]'::jsonb
  )
  into v_items
  from (
    select
      acn.id,
      acn.created_at,
      acn.source,
      acn.coaching,
      acn.yolen_decision
    from public.ai_coaching_notes acn
    where acn.company_id = p_company_id
      and acn.cycle_id = p_cycle_id
    order by acn.created_at desc
    limit v_limit
  ) note;

  return jsonb_build_object(
    'success', true,
    'items', v_items
  );
end;
$$;

revoke all on function public.rpc_list_ai_coaching_for_cycle_for_company(
  uuid,
  uuid,
  integer
) from public;

grant execute on function public.rpc_list_ai_coaching_for_cycle_for_company(
  uuid,
  uuid,
  integer
) to authenticated;

commit;