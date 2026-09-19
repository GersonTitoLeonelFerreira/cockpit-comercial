-- Yolen — Trilha A — A5.3.1
-- Snapshot histórico do vendedor responsável no instante da análise stateful.
--
-- IMPORTANTE:
-- - eventos históricos existentes permanecem com seller_user_id NULL;
-- - não é seguro preencher histórico usando o owner_user_id atual;
-- - novos eventos recebem o owner_user_id do ciclo no instante do INSERT;
-- - nenhuma escrita automática de CRM ou Agenda é adicionada.

begin;

alter table
  public.companion_commercial_state_events
add column if not exists
  seller_user_id uuid;

comment on column
  public.companion_commercial_state_events.seller_user_id
is
  'Snapshot do owner_user_id do ciclo no instante em que a análise stateful foi persistida. Eventos históricos anteriores a esta coluna podem permanecer NULL.';

create or replace function
  public.set_companion_state_event_seller_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_user_id uuid;
begin
  select
    cycle.owner_user_id
  into
    v_owner_user_id
  from
    public.sales_cycles cycle
  where
    cycle.company_id =
      new.company_id
    and
    cycle.id =
      new.cycle_id;

  if not found then
    raise exception
      'Ciclo comercial não encontrado para snapshot do vendedor';
  end if;

  new.seller_user_id :=
    v_owner_user_id;

  return new;
end;
$$;

revoke all
on function
  public.set_companion_state_event_seller_snapshot()
from public, anon, authenticated, service_role;

drop trigger if exists
  companion_state_event_seller_snapshot
on
  public.companion_commercial_state_events;

create trigger
  companion_state_event_seller_snapshot
before insert
on
  public.companion_commercial_state_events
for each row
execute function
  public.set_companion_state_event_seller_snapshot();

create index if not exists
  companion_commercial_state_events_seller_generated_idx
on
  public.companion_commercial_state_events (
    company_id,
    seller_user_id,
    generated_at desc
  )
where
  seller_user_id is not null;

commit;
