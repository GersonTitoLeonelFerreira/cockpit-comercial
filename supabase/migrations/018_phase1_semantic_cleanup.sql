-- =============================================================================
-- Migration 018 — Fase 1: Saneamento Semântico de sales_cycles
-- =============================================================================
--
-- OBJETIVO: Garantir consistência semântica entre status, won_at, lost_at,
--           closed_at e won_owner_user_id conforme as regras de negócio:
--
--   • status = 'ganho'   → won_at NOT NULL, closed_at = won_at, won_owner_user_id NOT NULL
--   • status = 'perdido' → lost_at NOT NULL, closed_at = lost_at, lost_reason NOT NULL
--   • ciclo aberto       → won_at = NULL, lost_at = NULL, closed_at = NULL
--
-- PRÉ-REQUISITOS: Migrations 001–017 aplicadas.
-- IDEMPOTENTE: Usa IF NOT EXISTS, CREATE OR REPLACE, DROP IF EXISTS.
-- =============================================================================


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — BACKFILL: closed_at para ciclos ganhos                        ║
-- ║                                                                          ║
-- ║ markDealWonWithRevenue (sales-analytics.ts) gravava won_at mas omitia   ║
-- ║ closed_at. Corrigimos: closed_at deve refletir won_at.                  ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

UPDATE public.sales_cycles
SET closed_at = won_at
WHERE status = 'ganho'
  AND won_at IS NOT NULL
  AND closed_at IS NULL;

COMMENT ON COLUMN public.sales_cycles.closed_at
  IS 'Data de fechamento do ciclo: igual a won_at quando ganho, igual a lost_at quando perdido, NULL quando aberto';


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — BACKFILL: closed_at para ciclos perdidos                      ║
-- ║                                                                          ║
-- ║ Garante que closed_at reflita lost_at em todos os ciclos perdidos.       ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

UPDATE public.sales_cycles
SET closed_at = lost_at
WHERE status = 'perdido'
  AND lost_at IS NOT NULL
  AND closed_at IS NULL;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — BACKFILL: won_owner_user_id para ciclos ganhos                ║
-- ║                                                                          ║
-- ║ Complementa backfill da migration 017 — cobre casos remanescentes.      ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

UPDATE public.sales_cycles
SET won_owner_user_id = owner_user_id
WHERE status = 'ganho'
  AND won_owner_user_id IS NULL
  AND owner_user_id IS NOT NULL;

COMMENT ON COLUMN public.sales_cycles.won_owner_user_id
  IS 'Vendedor responsável no momento do fechamento como ganho (congelado — não muda se o owner mudar depois)';


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — LIMPEZA: campos de fechamento em ciclos abertos               ║
-- ║                                                                          ║
-- ║ Ciclos abertos (status NOT IN ganho/perdido) não devem ter won_at,      ║
-- ║ lost_at ou closed_at preenchidos. Limpa inconsistências históricas.      ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

UPDATE public.sales_cycles
SET
  won_at    = NULL,
  lost_at   = NULL,
  closed_at = NULL
WHERE status NOT IN ('ganho', 'perdido')
  AND (
    won_at    IS NOT NULL
    OR lost_at  IS NOT NULL
    OR closed_at IS NOT NULL
  );


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 5 — CONSTRAINTS: garantir invariantes semânticas                  ║
-- ║                                                                          ║
-- ║ As constraints da migration 017 (chk_won_consistency,                   ║
-- ║ chk_lost_consistency_v2) já cobrem os casos ganho/perdido.              ║
-- ║ Adicionamos aqui a constraint de ciclo aberto e as constraints que       ║
-- ║ garantem que closed_at reflita a data de fechamento real.                ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- Constraint: ciclos abertos não devem ter campos de fechamento preenchidos
ALTER TABLE public.sales_cycles
  DROP CONSTRAINT IF EXISTS chk_open_cycle_consistency;

ALTER TABLE public.sales_cycles
  ADD CONSTRAINT chk_open_cycle_consistency CHECK (
    CASE
      WHEN status NOT IN ('ganho', 'perdido') THEN
        won_at    IS NULL
        AND lost_at  IS NULL
        AND closed_at IS NULL
      ELSE true
    END
  );

COMMENT ON CONSTRAINT chk_open_cycle_consistency ON public.sales_cycles
  IS 'Fase 1 (018): ciclos abertos (status ≠ ganho/perdido) devem ter won_at, lost_at e closed_at = NULL';

-- Constraint: para ganhos, closed_at deve refletir won_at (ser igual)
ALTER TABLE public.sales_cycles
  DROP CONSTRAINT IF EXISTS chk_closed_at_reflects_won_at;

ALTER TABLE public.sales_cycles
  ADD CONSTRAINT chk_closed_at_reflects_won_at CHECK (
    CASE
      WHEN status = 'ganho' THEN
        closed_at IS NOT NULL
        AND won_at IS NOT NULL
        AND closed_at = won_at
      ELSE true
    END
  );

COMMENT ON CONSTRAINT chk_closed_at_reflects_won_at ON public.sales_cycles
  IS 'Fase 1 (018): quando status = ganho, closed_at deve ser igual a won_at';

-- Constraint: para perdidos, closed_at deve refletir lost_at (ser igual)
ALTER TABLE public.sales_cycles
  DROP CONSTRAINT IF EXISTS chk_closed_at_reflects_lost_at;

ALTER TABLE public.sales_cycles
  ADD CONSTRAINT chk_closed_at_reflects_lost_at CHECK (
    CASE
      WHEN status = 'perdido' THEN
        closed_at IS NOT NULL
        AND lost_at IS NOT NULL
        AND closed_at = lost_at
      ELSE true
    END
  );

COMMENT ON CONSTRAINT chk_closed_at_reflects_lost_at ON public.sales_cycles
  IS 'Fase 1 (018): quando status = perdido, closed_at deve ser igual a lost_at';


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 6 — TRIGGER: manter invariantes em novos registros                ║
-- ║                                                                          ║
-- ║ Atualiza o trigger trg_sales_cycles_lifecycle (criado na migration 017)  ║
-- ║ para garantir que closed_at sempre seja igual a won_at ou lost_at        ║
-- ║ (não apenas que seja NOT NULL).                                          ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.fn_sales_cycles_lifecycle_018()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Ciclo fechado como GANHO
  IF NEW.status = 'ganho' THEN
    -- Garantir won_at preenchido
    IF NEW.won_at IS NULL THEN
      NEW.won_at := now();
    END IF;
    -- closed_at deve refletir won_at
    NEW.closed_at := NEW.won_at;
    -- Congelar won_owner_user_id
    IF NEW.won_owner_user_id IS NULL THEN
      NEW.won_owner_user_id := COALESCE(NEW.owner_user_id, OLD.owner_user_id);
    END IF;
    -- Garantir lost_reason e lost_at nulos (ciclo ganho não é perdido)
    NEW.lost_at := NULL;
    RETURN NEW;
  END IF;

  -- Ciclo fechado como PERDIDO
  IF NEW.status = 'perdido' THEN
    -- Garantir lost_at preenchido
    IF NEW.lost_at IS NULL THEN
      NEW.lost_at := now();
    END IF;
    -- closed_at deve refletir lost_at
    NEW.closed_at := NEW.lost_at;
    -- Garantir lost_reason preenchido
    IF NEW.lost_reason IS NULL THEN
      NEW.lost_reason := 'Não informado';
    END IF;
    -- Garantir won_at nulo (ciclo perdido não é ganho)
    NEW.won_at := NULL;
    RETURN NEW;
  END IF;

  -- Ciclo aberto (qualquer outro status)
  -- Limpar campos de fechamento
  NEW.won_at    := NULL;
  NEW.lost_at   := NULL;
  NEW.closed_at := NULL;

  RETURN NEW;
END;
$$;

-- Substituir trigger existente (se houver) pelo da migration 018
DROP TRIGGER IF EXISTS trg_sales_cycles_lifecycle_018 ON public.sales_cycles;

CREATE TRIGGER trg_sales_cycles_lifecycle_018
  BEFORE INSERT OR UPDATE
  ON public.sales_cycles
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sales_cycles_lifecycle_018();

COMMENT ON FUNCTION public.fn_sales_cycles_lifecycle_018()
  IS 'Fase 1 (018): mantém invariantes semânticas de won_at/lost_at/closed_at em sincronia com status';
