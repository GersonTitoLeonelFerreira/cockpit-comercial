-- ==========================================================================
-- PR 1 — Reliable Data Foundation
-- Somente DDL. Sem UPDATE, sem TRIGGER, sem FUNCTION, sem BACKFILL.
-- ==========================================================================

-- 1) leads.entry_mode — como o lead entrou no CRM
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS entry_mode text NOT NULL DEFAULT 'unknown';

ALTER TABLE public.leads
  ADD CONSTRAINT leads_entry_mode_check
  CHECK (entry_mode IN ('manual', 'import_excel', 'import_api', 'webhook', 'crm_migration', 'unknown'))
  NOT VALID;

ALTER TABLE public.leads
  VALIDATE CONSTRAINT leads_entry_mode_check;

-- 2) leads.lead_origin_at — quando o lead realmente nasceu comercialmente
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS lead_origin_at timestamptz NULL;

-- 3) leads.first_worked_at — quando o time começou a trabalhar o lead
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS first_worked_at timestamptz NULL;

-- 4) sales_cycles.first_worked_at — quando o ciclo foi efetivamente trabalhado
ALTER TABLE public.sales_cycles
  ADD COLUMN IF NOT EXISTS first_worked_at timestamptz NULL;

-- 5) Índices parciais (não bloqueiam, criados em background)
CREATE INDEX IF NOT EXISTS idx_leads_entry_mode
  ON public.leads (entry_mode)
  WHERE entry_mode != 'unknown';

CREATE INDEX IF NOT EXISTS idx_leads_lead_origin_at
  ON public.leads (lead_origin_at)
  WHERE lead_origin_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_first_worked_at
  ON public.leads (first_worked_at)
  WHERE first_worked_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_cycles_first_worked_at
  ON public.sales_cycles (first_worked_at)
  WHERE first_worked_at IS NOT NULL;
