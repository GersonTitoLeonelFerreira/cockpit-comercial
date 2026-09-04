-- Message Intelligence Engine V1
-- Índice de suporte à FK composta da telemetria active.
--
-- A FK referencia sales_cycles(company_id, id).
-- Este índice evita custo desnecessário em operações relacionadas
-- à integridade referencial da tabela de telemetria.

create index
  message_intelligence_active_pilot_company_cycle_idx
on public.message_intelligence_active_pilot_events (
  company_id,
  cycle_id
);
