-- Yolen Companion — rodada 11 (HML), item B: arquivos com "Incluir na
-- leitura".
--
-- NÃO APLICADA por quem escreveu: o dono do banco revisa e aplica.
--
-- Um arquivo da conversa (imagem, PDF) só entra na leitura completa quando
-- o vendedor pede. Ao incluir, o servidor pede ao modelo um resumo
-- factual, uma vez só, e guarda SÓ o resumo: o arquivo não é guardado em
-- lugar nenhum (nem aqui, nem em storage). Esta tabela registra o pedido e
-- o resultado.
--
-- Minimização:
--   - sem o conteúdo do arquivo e sem URL;
--   - o resumo nunca traz CPF, documento, cartão ou dados bancários (o
--     servidor instrui o modelo e ainda mascara números com esse formato).
--
-- Isolamento: tabela nova e independente; nenhuma tabela existente muda e
-- o ledger (conversation_messages) não é tocado. Acesso somente pelo
-- servidor (service_role), como companion_full_reading_runs.

create table
  public.companion_conversation_attachments (
    id uuid
      primary key
      default gen_random_uuid(),

    company_id uuid
      not null,

    cycle_id uuid
      not null,

    conversation_key text
      not null,

    -- Mensagem do ledger que mostra o arquivo.
    message_key text
      not null,

    kind text
      not null,

    file_name text,

    size_bytes integer,

    page_count integer,

    -- 'resumindo' (pedido em andamento), 'incluido' (resumo pronto),
    -- 'falhou' (o modelo não conseguiu ler).
    status text
      not null
      default 'resumindo',

    summary text,

    failure_code text,

    model text,

    input_tokens integer,

    output_tokens integer,

    included_by uuid,

    requested_at timestamp with time zone
      not null
      default clock_timestamp(),

    summarized_at timestamp with time zone,

    constraint
      companion_conversation_attachments_kind_check
      check (
        kind in (
          'imagem',
          'pdf',
          'documento'
        )
      ),

    constraint
      companion_conversation_attachments_status_check
      check (
        status in (
          'resumindo',
          'incluido',
          'falhou'
        )
      ),

    constraint
      companion_conversation_attachments_summary_check
      check (
        (status = 'incluido' and summary is not null and summarized_at is not null)
        or (status <> 'incluido')
      ),

    constraint
      companion_conversation_attachments_text_check
      check (
        message_key = btrim(message_key)
        and char_length(message_key) between 1 and 500
        and conversation_key = btrim(conversation_key)
        and char_length(conversation_key) between 1 and 500
        and (file_name is null or char_length(file_name) <= 300)
        and (summary is null or char_length(summary) <= 4000)
      ),

    constraint
      companion_conversation_attachments_counts_check
      check (
        (size_bytes is null or size_bytes >= 0)
        and (page_count is null or page_count >= 0)
        and (input_tokens is null or input_tokens >= 0)
        and (output_tokens is null or output_tokens >= 0)
      ),

    constraint
      companion_conversation_attachments_cycle_fkey
      foreign key (
        company_id,
        cycle_id
      )
      references public.sales_cycles (
        company_id,
        id
      )
      on delete restrict
  );

-- Um registro por arquivo (mensagem) por conversa.
create unique index
  companion_conversation_attachments_message_uidx
on public.companion_conversation_attachments (
  company_id,
  conversation_key,
  message_key
);

create index
  companion_conversation_attachments_requested_idx
on public.companion_conversation_attachments (
  company_id,
  requested_at desc
);

alter table
  public.companion_conversation_attachments
enable row level security;

alter table
  public.companion_conversation_attachments
force row level security;

-- Nenhum acesso client-side, em nenhuma direção.
create policy
  companion_conversation_attachments_client_denied
on public.companion_conversation_attachments
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

revoke all
on table
  public.companion_conversation_attachments
from public, anon, authenticated, service_role;

grant
  select,
  insert,
  update
on table
  public.companion_conversation_attachments
to service_role;

comment on table
  public.companion_conversation_attachments
is
  'Companion (HML): arquivos da conversa incluidos na leitura completa pelo vendedor. Guarda so o resumo factual (sem o arquivo, sem URL, sem documentos pessoais). Acesso somente pelo servidor (service_role).';
