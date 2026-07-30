-- Yolen Companion V2 - Fase 3
-- Ledger canônico e append-only das versões observadas de cada mensagem.
--
-- Esta migration cria somente a fundação de dados. Ela não altera o motor
-- padrão, não liga o V2 e não modifica as rotas ou a extensão do Companion.

create table public.conversation_messages (
  id bigint generated always as identity primary key,
  company_id uuid not null,
  cycle_id uuid not null,
  conversation_key text not null,
  message_key text not null,
  version integer not null,
  direction text not null,
  occurred_at timestamp with time zone not null,
  content_type text not null,
  text_content text,
  audio_transcription text,
  is_deleted boolean default false not null,
  captured_by uuid,
  ingested_at timestamp with time zone default now() not null,

  constraint conversation_messages_cycle_company_fkey
    foreign key (company_id, cycle_id)
    references public.sales_cycles (company_id, id)
    on delete cascade,

  constraint conversation_messages_captured_by_fkey
    foreign key (captured_by)
    references auth.users (id)
    on delete set null,

  constraint conversation_messages_conversation_key_check
    check (
      conversation_key = btrim(conversation_key)
      and char_length(conversation_key) between 1 and 500
    ),

  constraint conversation_messages_message_key_check
    check (
      message_key = btrim(message_key)
      and char_length(message_key) between 1 and 500
    ),

  constraint conversation_messages_version_check
    check (version > 0),

  constraint conversation_messages_direction_check
    check (direction in ('incoming', 'outgoing')),

  constraint conversation_messages_content_type_check
    check (content_type in ('text', 'audio')),

  constraint conversation_messages_content_check
    check (
      (
        is_deleted = true
        and text_content is null
        and audio_transcription is null
      )
      or
      (
        is_deleted = false
        and (
          content_type = 'audio'
          or nullif(btrim(text_content), '') is not null
        )
      )
    ),

  constraint conversation_messages_audio_transcription_check
    check (
      audio_transcription is null
      or content_type = 'audio'
    )
);

create unique index conversation_messages_identity_version_uidx
  on public.conversation_messages (
    company_id,
    conversation_key,
    message_key,
    version
  );

create index conversation_messages_cycle_occurred_idx
  on public.conversation_messages (
    company_id,
    cycle_id,
    occurred_at,
    id
  );

create index conversation_messages_captured_by_idx
  on public.conversation_messages (captured_by)
  where captured_by is not null;

alter table public.conversation_messages enable row level security;
alter table public.conversation_messages force row level security;

create policy conversation_messages_client_access_denied
  on public.conversation_messages
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- O projeto ainda possui privilégios padrão amplos para novas tabelas.
-- Revogar explicitamente impede exposição acidental pela Data API.
revoke all on table public.conversation_messages
  from public, anon, authenticated, service_role;

grant select, insert on table public.conversation_messages
  to service_role;

revoke all on sequence public.conversation_messages_id_seq
  from public, anon, authenticated, service_role;

grant usage, select on sequence public.conversation_messages_id_seq
  to service_role;

comment on table public.conversation_messages is
  'Ledger append-only das versões de mensagens capturadas pelo Yolen Companion V2.';

comment on column public.conversation_messages.conversation_key is
  'Identidade estável da conversa dentro da empresa.';

comment on column public.conversation_messages.message_key is
  'Identidade estável da mensagem fornecida pela origem.';

comment on column public.conversation_messages.version is
  'Versão crescente da mesma mensagem; edições e exclusões geram novas linhas.';

comment on column public.conversation_messages.is_deleted is
  'Marca a versão de exclusão; versões apagadas não preservam conteúdo nesta linha.';
