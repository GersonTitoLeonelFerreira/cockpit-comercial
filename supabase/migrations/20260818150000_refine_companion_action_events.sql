-- Yolen Companion - Trilha C - Fase C1
-- Refinamentos finais da telemetria de ações.
--
-- Esta migration é incremental porque 20260818140000 já foi aplicada em produção.
-- Ajustes:
-- - idempotência também correlaciona coaching_note_id e conversation_key;
-- - metadata bloqueia conteúdo de conversa em qualquer profundidade;
-- - consulta passa a aceitar lead_id para recuperar todos os ciclos do lead.

-- ---------------------------------------------------------------------------
-- rpc_record_companion_action_event
-- ---------------------------------------------------------------------------
create or replace function
  public.rpc_record_companion_action_event(
    p_company_id uuid,
    p_cycle_id uuid,
    p_seller_user_id uuid,
    p_action_type text,
    p_idempotency_key text,
    p_coaching_note_id uuid default null,
    p_conversation_key text default null,
    p_metadata jsonb default '{}'::jsonb
  )
returns table (
  event_id uuid,
  occurred_at timestamp with time zone,
  already_registered boolean
)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_metadata jsonb;
  v_idempotency_key text;
  v_conversation_key text;

  v_event_id uuid;
  v_occurred_at timestamp with time zone;
  v_inserted boolean;
begin
  if p_company_id is null then
    raise exception
      'company_id é obrigatório';
  end if;

  if p_cycle_id is null then
    raise exception
      'cycle_id é obrigatório';
  end if;

  if p_seller_user_id is null then
    raise exception
      'seller_user_id é obrigatório';
  end if;

  if
    p_action_type not in (
      'suggestion_shown',
      'suggestion_copied',
      'suggestion_inserted',
      'suggestion_ignored',
      'suggestion_edited',
      'suggestion_sent',
      'crm_accepted',
      'crm_rejected',
      'agenda_accepted',
      'agenda_rejected'
    )
  then
    raise exception
      'action_type inválido';
  end if;

  v_idempotency_key :=
    nullif(
      btrim(
        coalesce(p_idempotency_key, '')
      ),
      ''
    );

  if v_idempotency_key is null then
    raise exception
      'idempotency_key é obrigatório';
  end if;

  if char_length(v_idempotency_key) > 200 then
    raise exception
      'idempotency_key ultrapassa o limite de 200 caracteres';
  end if;

  v_conversation_key :=
    nullif(
      btrim(
        coalesce(p_conversation_key, '')
      ),
      ''
    );

  if
    v_conversation_key is not null
    and char_length(v_conversation_key) > 500
  then
    raise exception
      'conversation_key ultrapassa o limite de 500 caracteres';
  end if;

  v_metadata :=
    coalesce(p_metadata, '{}'::jsonb);

  if jsonb_typeof(v_metadata) <> 'object' then
    raise exception
      'metadata precisa ser um objeto JSON';
  end if;

  if
    jsonb_path_exists(v_metadata, '$.**.conversation_text')
    or jsonb_path_exists(v_metadata, '$.**.messages')
    or jsonb_path_exists(v_metadata, '$.**.suggested_message')
    or jsonb_path_exists(v_metadata, '$.**.text_content')
    or jsonb_path_exists(v_metadata, '$.**.audio_transcription')
  then
    raise exception
      'metadata não pode armazenar conteúdo da conversa';
  end if;

  perform 1
  from public.sales_cycles cycle
  where cycle.company_id = p_company_id
    and cycle.id = p_cycle_id
  for share;

  if not found then
    raise exception
      'Ciclo comercial não encontrado na empresa informada';
  end if;

  if p_coaching_note_id is not null then
    perform 1
    from public.ai_coaching_notes note
    where note.id = p_coaching_note_id
      and note.company_id = p_company_id
      and note.cycle_id = p_cycle_id;

    if not found then
      raise exception
        'coaching_note_id não pertence a esta empresa ou ciclo';
    end if;
  end if;

  insert into
    public.companion_action_events (
      company_id,
      cycle_id,
      seller_user_id,
      action_type,
      coaching_note_id,
      conversation_key,
      idempotency_key,
      metadata
    )
  values (
    p_company_id,
    p_cycle_id,
    p_seller_user_id,
    p_action_type,
    p_coaching_note_id,
    v_conversation_key,
    v_idempotency_key,
    v_metadata
  )
  on conflict (company_id, idempotency_key)
    do nothing
  returning
    id,
    companion_action_events.occurred_at
  into
    v_event_id,
    v_occurred_at;

  v_inserted := found;

  if not v_inserted then
    select
      id,
      companion_action_events.occurred_at
    into
      v_event_id,
      v_occurred_at
    from public.companion_action_events
    where company_id = p_company_id
      and idempotency_key = v_idempotency_key;

    perform 1
    from public.companion_action_events existing
    where existing.id = v_event_id
      and existing.cycle_id = p_cycle_id
      and existing.action_type = p_action_type
      and existing.seller_user_id = p_seller_user_id
      and existing.coaching_note_id is not distinct from p_coaching_note_id
      and existing.conversation_key is not distinct from v_conversation_key;

    if not found then
      raise exception
        'idempotency_key já foi usada para um evento diferente';
    end if;
  end if;

  return query
  select
    v_event_id,
    v_occurred_at,
    not v_inserted;
end;
$$;

revoke all
on function
  public.rpc_record_companion_action_event(
    uuid, uuid, uuid, text, text, uuid, text, jsonb
  )
from public, anon, authenticated, service_role;

grant execute
on function
  public.rpc_record_companion_action_event(
    uuid, uuid, uuid, text, text, uuid, text, jsonb
  )
to service_role;

-- ---------------------------------------------------------------------------
-- rpc_list_companion_action_events
-- A assinatura muda para incluir p_lead_id. A função anterior é removida
-- quando ainda existir; a nova assinatura usa CREATE OR REPLACE para permitir
-- reaplicação segura em ambientes onde o refinamento já tenha sido executado.
-- ---------------------------------------------------------------------------
drop function if exists
  public.rpc_list_companion_action_events(
    uuid, uuid, boolean, uuid, text,
    timestamp with time zone, timestamp with time zone, integer
  );

create or replace function
  public.rpc_list_companion_action_events(
    p_company_id uuid,
    p_requesting_user_id uuid,
    p_is_admin_or_manager boolean,
    p_cycle_id uuid default null,
    p_lead_id uuid default null,
    p_action_type text default null,
    p_since timestamp with time zone default null,
    p_until timestamp with time zone default null,
    p_limit integer default 100
  )
returns table (
  id uuid,
  cycle_id uuid,
  seller_user_id uuid,
  action_type text,
  coaching_note_id uuid,
  conversation_key text,
  metadata jsonb,
  occurred_at timestamp with time zone
)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_limit integer;
begin
  if p_company_id is null then
    raise exception
      'company_id é obrigatório';
  end if;

  if p_requesting_user_id is null then
    raise exception
      'requesting_user_id é obrigatório';
  end if;

  if
    p_action_type is not null
    and p_action_type not in (
      'suggestion_shown',
      'suggestion_copied',
      'suggestion_inserted',
      'suggestion_ignored',
      'suggestion_edited',
      'suggestion_sent',
      'crm_accepted',
      'crm_rejected',
      'agenda_accepted',
      'agenda_rejected'
    )
  then
    raise exception
      'action_type inválido';
  end if;

  v_limit := coalesce(p_limit, 100);

  if v_limit < 1 then
    v_limit := 1;
  end if;

  if v_limit > 500 then
    v_limit := 500;
  end if;

  return query
  select
    event.id,
    event.cycle_id,
    event.seller_user_id,
    event.action_type,
    event.coaching_note_id,
    event.conversation_key,
    event.metadata,
    event.occurred_at
  from public.companion_action_events event
  join public.sales_cycles cycle
    on cycle.company_id = event.company_id
   and cycle.id = event.cycle_id
  where event.company_id = p_company_id
    and (
      p_cycle_id is null
      or event.cycle_id = p_cycle_id
    )
    and (
      p_lead_id is null
      or cycle.lead_id = p_lead_id
    )
    and (
      p_action_type is null
      or event.action_type = p_action_type
    )
    and (
      p_since is null
      or event.occurred_at >= p_since
    )
    and (
      p_until is null
      or event.occurred_at <= p_until
    )
    and (
      p_is_admin_or_manager
      or event.seller_user_id = p_requesting_user_id
    )
  order by event.occurred_at desc
  limit v_limit;
end;
$$;

revoke all
on function
  public.rpc_list_companion_action_events(
    uuid, uuid, boolean, uuid, uuid, text,
    timestamp with time zone, timestamp with time zone, integer
  )
from public, anon, authenticated, service_role;

grant execute
on function
  public.rpc_list_companion_action_events(
    uuid, uuid, boolean, uuid, uuid, text,
    timestamp with time zone, timestamp with time zone, integer
  )
to service_role;
