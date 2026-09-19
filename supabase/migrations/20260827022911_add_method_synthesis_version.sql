-- Yolen — ONDA 8 / HOTFIX
-- Rastreabilidade da versão do algoritmo de síntese que materializou
-- method_construction / method_definition no builder.
--
-- A lógica de síntese (suggestInitialMethodConstruction,
-- applyBuyerDecisionArchitecture) evolui ao longo do tempo. Um
-- method_definition em review_ready pode ter sido compilado por uma versão
-- anterior do algoritmo, sobre respostas de diagnóstico que continuam
-- válidas. Esta coluna deixa isso auditável sem exigir reprocessar nada
-- automaticamente: método antigo sem valor aqui é tratado como "versão
-- desconhecida / anterior", nunca como erro.
--
-- Nullable de propósito: rascunhos existentes não carregam este valor e
-- continuam válidos exatamente como estão.

alter table public.company_commercial_method_builder_drafts
  add column method_synthesis_version text;

comment on column public.company_commercial_method_builder_drafts.method_synthesis_version is
  'Versão do algoritmo de síntese (ex.: guided-method-synthesis-v2) que produziu o method_construction/method_definition atual. Nulo = anterior a este rastreamento ou desconhecida.';
