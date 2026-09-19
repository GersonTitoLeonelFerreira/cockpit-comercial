-- Yolen Companion V2 - Fase 12A, Frente 2B - Blocker 3
-- Persistencia determinística da última etapa válida do Método Comercial
-- por (company_id, cycle_id, conversation_key), para permitir um gate
-- anti-regressão entre chamadas de composeSellerFacingGuidance.
--
-- Antes desta migration, o "estágio" do método (ex.: Formalização) era
-- recalculado do zero pelo modelo a cada chamada da rota
-- /api/companion/method-guidance, sem nenhuma comparação com o estágio
-- anterior. Nada no código impedia uma regressão silenciosa (ex.:
-- Formalização -> Descoberta) sem evidência real.
--
-- Escopo: apenas o estágio usado por composeSellerFacingGuidance
-- (superfície AGORA, rota method-guidance). O estágio derivado
-- separadamente em commercial-reading-contract.ts (usado pelo motor
-- ativo stateful-communication-executor.ts para a superfície ANÁLISE)
-- continua sendo um mecanismo diferente, documentado como risco residual
-- separado — unificá-lo exigiria uma mudança de arquitetura maior, fora
-- do escopo deste blocker pontual.
--
-- Chave: (company_id, cycle_id, conversation_key) — a MESMA chave usada
-- por companion_commercial_states, porque o guidance também é avaliado
-- por conversa dentro do ciclo (um ciclo pode ter mais de uma
-- conversation_key). Nunca por lead_id: reabertura de ciclo (Blocker 4)
-- deve nascer sem estágio anterior, e cada ciclo é uma negociação
-- distinta.
--
-- method_config_version_id é referenciado explicitamente para que uma
-- nova versão publicada do método NUNCA seja comparada contra o estágio
-- persistido de uma versão antiga (chaves/ordens de estágio podem ter
-- mudado por completo); o código de aplicação trata uma versão diferente
-- como "sem estágio anterior para esta versão", não como regressão.

create table public.companion_method_stage_state (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  cycle_id uuid not null,
  conversation_key text not null,
  method_config_version_id uuid not null,
  stage_key text not null,
  stage_name text not null,
  stage_display_order integer not null,
  stage_reason text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),

  constraint companion_method_stage_state_cycle_company_fkey
    foreign key (company_id, cycle_id)
    references public.sales_cycles (company_id, id)
    on delete cascade,

  constraint companion_method_stage_state_config_version_fkey
    foreign key (method_config_version_id)
    references public.company_commercial_config_versions (id)
    on delete cascade,

  constraint companion_method_stage_state_conversation_key_check
    check (
      conversation_key = btrim(conversation_key)
      and char_length(conversation_key) between 1 and 500
    ),

  constraint companion_method_stage_state_stage_key_check
    check (
      stage_key = btrim(stage_key)
      and char_length(stage_key) between 1 and 200
    ),

  constraint companion_method_stage_state_stage_name_check
    check (
      stage_name = btrim(stage_name)
      and char_length(stage_name) between 1 and 200
    ),

  constraint companion_method_stage_state_display_order_check
    check (stage_display_order >= 0)
);

create unique index companion_method_stage_state_scope_uidx
  on public.companion_method_stage_state (
    company_id,
    cycle_id,
    conversation_key
  );

create index companion_method_stage_state_config_version_idx
  on public.companion_method_stage_state (method_config_version_id);

alter table public.companion_method_stage_state enable row level security;
alter table public.companion_method_stage_state force row level security;

revoke all
on table public.companion_method_stage_state
from public, anon, authenticated, service_role;

grant select, insert, update
on table public.companion_method_stage_state
to service_role;

comment on table public.companion_method_stage_state is
  'Última etapa válida conhecida do Método Comercial por (company_id, cycle_id, conversation_key), usada como gate anti-regressão determinístico em composeSellerFacingGuidance. Acesso exclusivo via service_role (mesma politica de companion_commercial_states).';

comment on column public.companion_method_stage_state.method_config_version_id is
  'Versão do método sob a qual esta etapa foi calculada. Uma nova versão publicada torna este registro obsoleto para fins de comparação (o código de aplicação trata isso como ausência de estágio anterior, não como regressão).';
