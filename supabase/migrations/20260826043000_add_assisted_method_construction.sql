-- Yolen — ONDA 8 / FASE 2
-- Construção assistida do método comercial.
--
-- O diagnóstico da Fase 1 permanece em draft_data. Esta migration acrescenta
-- somente o estado de construção do método e, quando a revisão humana estiver
-- pronta, uma materialização do contrato commercial-method-v2. Nada aqui
-- publica company_commercial_config_versions nem altera o consumidor.

alter table public.company_commercial_method_builder_drafts
  add column method_construction_status text not null default 'not_started',
  add column method_construction jsonb,
  add column method_definition jsonb,
  add column method_started_at timestamp with time zone,
  add column method_updated_at timestamp with time zone;

alter table public.company_commercial_method_builder_drafts
  add constraint company_commercial_method_builder_method_status_check
    check (
      method_construction_status in (
        'not_started',
        'editing',
        'review_ready'
      )
    ),

  add constraint company_commercial_method_builder_method_construction_check
    check (
      method_construction is null
      or jsonb_typeof(method_construction) = 'object'
    ),

  add constraint company_commercial_method_builder_method_definition_check
    check (
      method_definition is null
      or (
        jsonb_typeof(method_definition) = 'object'
        and method_definition ->> 'contract_version' = 'commercial-method-v2'
      )
    ),

  add constraint company_commercial_method_builder_method_ready_check
    check (
      method_construction_status = 'not_started'
      or ready_for_method = true
    ),

  add constraint company_commercial_method_builder_method_state_check
    check (
      (
        method_construction_status = 'not_started'
        and method_definition is null
      )
      or (
        method_construction_status = 'editing'
        and method_construction is not null
        and method_definition is null
      )
      or (
        method_construction_status = 'review_ready'
        and method_construction is not null
        and method_definition is not null
      )
    ),

  add constraint company_commercial_method_builder_method_timestamps_check
    check (
      method_updated_at is null
      or (
        method_started_at is not null
        and method_updated_at >= method_started_at
      )
    );

create index company_commercial_method_builder_method_status_idx
  on public.company_commercial_method_builder_drafts (
    company_id,
    method_construction_status,
    method_updated_at desc
  );

comment on column public.company_commercial_method_builder_drafts.method_construction is
  'Rascunho editável da Fase 2. Pode estar incompleto e nunca é consumido diretamente pelo Companion.';

comment on column public.company_commercial_method_builder_drafts.method_definition is
  'Materialização validada de commercial-method-v2 preparada para revisão humana. Não implica publicação.';
