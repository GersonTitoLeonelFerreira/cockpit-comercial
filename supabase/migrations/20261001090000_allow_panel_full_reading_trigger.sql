-- Leitura completa no painel (AGORA/ANÁLISE do HML): rodadas criadas pelo
-- painel passam a poder gravar trigger_source = 'panel'.
--
-- NÃO APLICADA. Enquanto não for aplicada, o código grava as rodadas do
-- painel como 'analysis_job' (FULL_READING_PANEL_TRIGGER_SOURCE em
-- app/lib/server/full-reading-panel.ts). Depois de aplicar, trocar a
-- constante para 'panel'.
--
-- Só amplia a lista permitida: nenhuma linha existente muda, nenhuma
-- coluna nova, nada além de companion_full_reading_runs.

alter table public.companion_full_reading_runs
  drop constraint if exists companion_full_reading_runs_trigger_source_check;

alter table public.companion_full_reading_runs
  add constraint companion_full_reading_runs_trigger_source_check
  check (trigger_source in ('manual_preview', 'analysis_job', 'panel'));
