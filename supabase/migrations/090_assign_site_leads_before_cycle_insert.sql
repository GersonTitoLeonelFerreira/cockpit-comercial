-- Distribui leads importados pela API antes da criação do ciclo.

begin;

create or replace function public.fn_assign_site_lead_round_robin()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_entry_mode text;
  v_owner_ids uuid[] := array[]::uuid[];
  v_last_owner_id uuid;
  v_position integer;
begin
  if new.owner_user_id is not null then
    return new;
  end if;

  select entry_mode
    into v_entry_mode
  from public.leads
  where id = new.lead_id
    and company_id = new.company_id;

  if v_entry_mode is distinct from 'import_api' then
    return new;
  end if;

  insert into public.company_site_lead_distribution (company_id)
  values (new.company_id)
  on conflict (company_id) do nothing;

  select last_assigned_owner_id
    into v_last_owner_id
  from public.company_site_lead_distribution
  where company_id = new.company_id
  for update;

  select coalesce(
    array_agg(cm.user_id order by lower(coalesce(p.full_name, p.email, '')), cm.user_id),
    array[]::uuid[]
  )
    into v_owner_ids
  from public.company_memberships cm
  join public.profiles p on p.id = cm.user_id
  where cm.company_id = new.company_id
    and cm.is_active = true
    and cm.role = 'member'
    and coalesce(p.is_active_global, true) = true;

  if coalesce(array_length(v_owner_ids, 1), 0) = 0 then
    return new;
  end if;

  v_position := coalesce(array_position(v_owner_ids, v_last_owner_id), 0) + 1;

  if v_position > array_length(v_owner_ids, 1) then
    v_position := 1;
  end if;

  new.owner_user_id := v_owner_ids[v_position];

  update public.company_site_lead_distribution
     set last_assigned_owner_id = new.owner_user_id,
         updated_at = now()
   where company_id = new.company_id;

  return new;
end;
$$;

drop trigger if exists trg_assign_site_lead_round_robin on public.sales_cycles;

create trigger trg_assign_site_lead_round_robin
before insert on public.sales_cycles
for each row execute function public.fn_assign_site_lead_round_robin();

commit;
