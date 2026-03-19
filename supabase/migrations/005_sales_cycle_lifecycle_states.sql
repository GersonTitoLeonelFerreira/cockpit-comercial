-- Migration 005: Sales Cycle Lifecycle States
-- Adiciona estados completos ao ciclo de vida de vendas
-- Data: 2026-03-13

-- ============================================
-- STEP 1: Criar o ENUM de estados
-- ============================================

CREATE TYPE public.sales_cycle_status AS ENUM (
  'novo',
  'contato',
  'respondeu',
  'negociacao',
  'ganho',
  'perdido',
  'pausado',
  'cancelado'
);

-- ============================================
-- STEP 2: Adicionar colunas novas à tabela
-- ============================================

ALTER TABLE public.sales_cycles ADD COLUMN previous_status text;
ALTER TABLE public.sales_cycles ADD COLUMN lost_reason text;
ALTER TABLE public.sales_cycles ADD COLUMN lost_at timestamptz;
ALTER TABLE public.sales_cycles ADD COLUMN lost_owner_user_id uuid REFERENCES auth.users(id);
ALTER TABLE public.sales_cycles ADD COLUMN paused_at timestamptz;
ALTER TABLE public.sales_cycles ADD COLUMN paused_reason text;
ALTER TABLE public.sales_cycles ADD COLUMN canceled_at timestamptz;
ALTER TABLE public.sales_cycles ADD COLUMN canceled_reason text;

-- ============================================
-- STEP 3: Adicionar constraint de validação
-- ============================================

ALTER TABLE public.sales_cycles ADD CONSTRAINT chk_lost_consistency CHECK (
  CASE 
    WHEN status = 'perdido' THEN lost_reason IS NOT NULL AND lost_at IS NOT NULL AND lost_owner_user_id IS NOT NULL
    WHEN status != 'perdido' THEN lost_reason IS NULL AND lost_at IS NULL AND lost_owner_user_id IS NULL
  END
);

ALTER TABLE public.sales_cycles ADD CONSTRAINT chk_paused_consistency CHECK (
  CASE 
    WHEN status = 'pausado' THEN paused_at IS NOT NULL AND paused_reason IS NOT NULL
    WHEN status != 'pausado' THEN paused_at IS NULL AND paused_reason IS NULL
  END
);

ALTER TABLE public.sales_cycles ADD CONSTRAINT chk_canceled_consistency CHECK (
  CASE 
    WHEN status = 'cancelado' THEN canceled_at IS NOT NULL AND canceled_reason IS NOT NULL
    WHEN status != 'cancelado' THEN canceled_at IS NULL AND canceled_reason IS NULL
  END
);

-- ============================================
-- STEP 4: Criar função para registrar transições
-- ============================================

CREATE OR REPLACE FUNCTION public.fn_log_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.previous_status := OLD.status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- STEP 5: Criar trigger para log de mudanças
-- ============================================

DROP TRIGGER IF EXISTS trg_log_status_change ON public.sales_cycles;
CREATE TRIGGER trg_log_status_change
BEFORE UPDATE ON public.sales_cycles
FOR EACH ROW
EXECUTE FUNCTION public.fn_log_status_change();

-- ============================================
-- STEP 6: Criar índices para performance
-- ============================================

CREATE INDEX idx_sales_cycles_status ON public.sales_cycles(status);
CREATE INDEX idx_sales_cycles_lost_at ON public.sales_cycles(lost_at DESC) WHERE status = 'perdido';
CREATE INDEX idx_sales_cycles_paused_at ON public.sales_cycles(paused_at DESC) WHERE status = 'pausado';