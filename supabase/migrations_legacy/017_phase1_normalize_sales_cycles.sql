-- =============================================================================
-- Migration 017 — Fase 1: Normalização Semântica de sales_cycles
-- =============================================================================
--
-- OBJETIVO: Eliminar ambiguidades entre won_at, lost_at, closed_at,
--           stage_entered_at, owner_user_id e won_owner_user_id.
--
-- PRÉ-REQUISITOS:
--   - Migrations 001–016 aplicadas
--   - Colunas won_at, lost_at, closed_at, won_owner_user_id, lost_reason,
--     lost_owner_user_id já existem (migrations 005, [timestamp], etc.)
--
-- IDEMPOTENTE: Usa IF NOT EXISTS, CREATE OR REPLACE, DROP IF EXISTS.
-- =============================================================================


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — COLUNA won_note (se ainda não existir)                        ║
-- ║ markDealWonWithRevenue já grava won_note (sales-analytics.ts L195),      ║
-- ║ mas nenhuma migration a criou. Garantimos a existência aqui.             ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

ALTER TABLE public.sales_cycles
  ADD COLUMN IF NOT EXISTS won_note text;

COMMENT ON COLUMN public.sales_cycles.won_note
  IS 'Observação livre registrada pelo vendedor no momento do fechamento como ganho';


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — BACKFILL: closed_at para ganhos existentes                    ║
-- ║                                                                          ║
-- ║ markDealWonWithRevenue (sales-analytics.ts L186-206) grava won_at e      ║
-- ║ status='ganho', mas NUNCA grava closed_at.                               ║
-- ║ rpc_get_sales_cycle_metrics_v1 (004 L102-108) usa closed_at para contar  ║
-- ║ ganhos do mês → sem este backfill os contadores ficam zerados.           ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- B1: Ganhos com won_at mas sem closed_at
UPDATE public.sales_cycles
SET closed_at = won_at
WHERE status = 'ganho'
  AND won_at IS NOT NULL
  AND closed_at IS NULL;

-- B2: Ganhos sem won_at (dados legados — usa updated_at como melhor proxy)
UPDATE public.sales_cycles
SET
  won_at     = COALESCE(updated_at, created_at, now()),
  closed_at  = COALESCE(updated_at, created_at, now())
WHERE status = 'ganho'
  AND won_at IS NULL;

-- B3: won_owner_user_id faltante (extensão do backfill 009)
UPDATE public.sales_cycles
SET won_owner_user_id = owner_user_id
WHERE status = 'ganho'
  AND won_owner_user_id IS NULL
  AND owner_user_id IS NOT NULL;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — BACKFILL: lost_at e lost_reason para perdidos existentes      ║
-- ║                                                                          ║
-- ║ O fluxo principal (LostDealModal → rpc_move_cycle_stage_checkpoint)      ║
-- ║ nunca gravou lost_at/lost_reason na coluna.                              ║
-- ║ Tentamos recuperar lost_reason dos cycle_events.metadata.checkpoint.     ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- B4: lost_at faltante
UPDATE public.sales_cycles
SET
  lost_at = COALESCE(stage_entered_at, updated_at, now()),
  closed_at = COALESCE(closed_at, stage_entered_at, updated_at, now())
WHERE status = 'perdido'
  AND lost_at IS NULL;

-- B5: lost_reason extraído de cycle_events
UPDATE public.sales_cycles sc
SET lost_reason = sub.extracted_reason
FROM (
  SELECT DISTINCT ON (ce.cycle_id)
    ce.cycle_id,
    COALESCE(
      ce.metadata->'checkpoint'->>'lost_reason',
      ce.metadata->>'lost_reason'
    ) AS extracted_reason
  FROM public.cycle_events ce
  WHERE ce.event_type IN ('stage_changed', 'stage_checkpoint', 'closed_lost')
    AND (
      ce.metadata->'checkpoint'->>'lost_reason' IS NOT NULL
      OR ce.metadata->>'lost_reason' IS NOT NULL
    )
  ORDER BY ce.cycle_id, ce.occurred_at DESC
) sub
WHERE sc.id = sub.cycle_id
  AND sc.status = 'perdido'
  AND sc.lost_reason IS NULL
  AND sub.extracted_reason IS NOT NULL
  AND sub.extracted_reason != '';

-- B6: lost_reason sem dados nos eventos — fallback
UPDATE public.sales_cycles
SET lost_reason = 'Não informado (backfill migração 017)'
WHERE status = 'perdido'
  AND lost_reason IS NULL;

-- B7: lost_owner_user_id faltante
UPDATE public.sales_cycles
SET lost_owner_user_id = COALESCE(owner_user_id, lost_owner_user_id)
WHERE status = 'perdido'
  AND lost_owner_user_id IS NULL
  AND owner_user_id IS NOT NULL;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — BACKFILL: ciclos fechados com next_action_date residual       ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

UPDATE public.sales_cycles
SET
  next_action      = NULL,
  next_action_date = NULL
WHERE status IN ('ganho', 'perdido', 'cancelado')
  AND next_action_date IS NOT NULL;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 5 — BACKFILL: ciclos sem owner com status ≠ 'novo'               ║
-- ║                                                                          ║
-- ║ rpc_bulk_return_cycles_to_pool (008 L143-147) e _self (008 L196-202)    ║
-- ║ setaram owner_user_id=NULL sem resetar status.                           ║
-- ║ Excluímos ganho/perdido que podem ter tido owner removido depois.        ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

UPDATE public.sales_cycles
SET
  previous_status  = status,
  status           = 'novo',
  stage_entered_at = now()
WHERE owner_user_id IS NULL
  AND status NOT IN ('novo', 'ganho', 'perdido', 'cancelado');


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 6 — CONSTRAINTS: substituir as existentes por versões corretas    ║
-- ║                                                                          ║
-- ║ A constraint original chk_lost_consistency (005 L37-42) exige            ║
-- ║ lost_reason IS NULL quando status ≠ 'perdido'. Isso impede reabrir       ║
-- ║ ciclos e complica backfills. Relaxamos: os campos são obrigatórios       ║
-- ║ somente QUANDO status = X, sem exigir NULL quando status ≠ X.           ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- Drop constraints originais da migration 005
ALTER TABLE public.sales_cycles DROP CONSTRAINT IF EXISTS chk_lost_consistency;
ALTER TABLE public.sales_cycles DROP CONSTRAINT IF EXISTS chk_paused_consistency;
ALTER TABLE public.sales_cycles DROP CONSTRAINT IF EXISTS chk_canceled_consistency;

-- Nova constraint: status=ganho → campos de ganho obrigatórios
ALTER TABLE public.sales_cycles ADD CONSTRAINT chk_won_consistency CHECK (
  CASE
    WHEN status = 'ganho' THEN
      won_at IS NOT NULL
      AND closed_at IS NOT NULL
      AND won_owner_user_id IS NOT NULL
    ELSE true
  END
);

-- Nova constraint: status=perdido → campos de perda obrigatórios
ALTER TABLE public.sales_cycles ADD CONSTRAINT chk_lost_consistency_v2 CHECK (
  CASE
    WHEN status = 'perdido' THEN
      lost_at IS NOT NULL
      AND closed_at IS NOT NULL
      AND lost_reason IS NOT NULL
    ELSE true
  END
);

-- Nova constraint: status=pausado → campos de pausa obrigatórios
ALTER TABLE public.sales_cycles ADD CONSTRAINT chk_paused_consistency_v2 CHECK (
  CASE
    WHEN status = 'pausado' THEN
      paused_at IS NOT NULL
      AND paused_reason IS NOT NULL
    ELSE true
  END
);

-- Nova constraint: status=cancelado → campos de cancelamento obrigatórios
ALTER TABLE public.sales_cycles ADD CONSTRAINT chk_canceled_consistency_v2 CHECK (
  CASE
    WHEN status = 'cancelado' THEN
      canceled_at IS NOT NULL
      AND canceled_reason IS NOT NULL
    ELSE true
  END
);

COMMENT ON CONSTRAINT chk_won_consistency ON public.sales_cycles
  IS 'Fase 1: ganho exige won_at, closed_at e won_owner_user_id preenchidos';
COMMENT ON CONSTRAINT chk_lost_consistency_v2 ON public.sales_cycles
  IS 'Fase 1: perdido exige lost_at, closed_at e lost_reason preenchidos (relaxada — não exige NULL quando status ≠ perdido)';
COMMENT ON CONSTRAINT chk_paused_consistency_v2 ON public.sales_cycles
  IS 'Fase 1: pausado exige paused_at e paused_reason (relaxada)';
COMMENT ON CONSTRAINT chk_canceled_consistency_v2 ON public.sales_cycles
  IS 'Fase 1: cancelado exige canceled_at e canceled_reason (relaxada)';


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 7 — ÍNDICE: closed_at para rpc_get_sales_cycle_metrics_v1         ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

CREATE INDEX IF NOT EXISTS idx_sales_cycles_closed_at
  ON public.sales_cycles (closed_at DESC)
  WHERE closed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_cycles_won_at
  ON public.sales_cycles (won_at DESC)
  WHERE won_at IS NOT NULL;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 8 — RPC: rpc_close_cycle_won (VERSIONADA PELA PRIMEIRA VEZ)      ║
-- ║                                                                          ║
-- ║ Chamada por sales-cycles.ts L59 e route.ts L60.                          ║
-- ║ Contrato:                                                                ║
-- ║   - Seta status='ganho', won_at=now(), closed_at=now()                  ║
-- ║   - Congela won_owner_user_id = owner_user_id atual                     ║
-- ║   - Grava won_total                                                      ║
-- ║   - Limpa next_action/next_action_date                                  ║
-- ║   - Registra evento cycle_events                                         ║
-- ║                                                                          ║
-- ║ NOTA: WinDealModal usa markDealWonWithRevenue (update direto) que grava  ║
-- ║ mais campos (produto, pagamento). Esta RPC é o caminho mínimo.          ║
-- ║ Fase 2 consolidará ambos em uma única RPC parametrizada.                ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DROP FUNCTION IF EXISTS public.rpc_close_cycle_won(uuid, numeric);

CREATE OR REPLACE FUNCTION public.rpc_close_cycle_won(
  p_cycle_id  uuid,
  p_won_value numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_company_id uuid;
  v_cycle      public.sales_cycles%ROWTYPE;
  v_now        timestamptz := now();
BEGIN
  v_company_id := public.current_company_id();
  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'company_not_found');
  END IF;

  SELECT * INTO v_cycle
  FROM public.sales_cycles
  WHERE id = p_cycle_id AND company_id = v_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'cycle_not_found');
  END IF;

  -- Bloquear se já está fechado
  IF v_cycle.status IN ('ganho', 'perdido', 'cancelado') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'Ciclo já está fechado como ' || v_cycle.status
    );
  END IF;

  UPDATE public.sales_cycles
  SET
    status             = 'ganho',
    previous_status    = v_cycle.status,
    stage_entered_at   = v_now,
    won_at             = v_now,
    closed_at          = v_now,
    won_total          = COALESCE(p_won_value, won_total, 0),
    won_owner_user_id  = COALESCE(v_cycle.owner_user_id, auth.uid()),
    next_action        = NULL,
    next_action_date   = NULL,
    updated_at         = v_now
  WHERE id = p_cycle_id AND company_id = v_company_id;

  INSERT INTO public.cycle_events (
    cycle_id, company_id, event_type, metadata, created_by, occurred_at
  ) VALUES (
    p_cycle_id,
    v_company_id,
    'closed_won',
    jsonb_build_object(
      'from_status',       v_cycle.status,
      'won_total',         COALESCE(p_won_value, v_cycle.won_total, 0),
      'won_owner_user_id', COALESCE(v_cycle.owner_user_id, auth.uid())
    ),
    auth.uid(),
    v_now
  );

  RETURN jsonb_build_object(
    'success', true,
    'id', p_cycle_id,
    'status', 'ganho',
    'won_at', v_now,
    'closed_at', v_now,
    'won_total', COALESCE(p_won_value, v_cycle.won_total, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_close_cycle_won(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_close_cycle_won(uuid, numeric) TO authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 9 — RPC: rpc_close_cycle_lost (VERSIONADA PELA PRIMEIRA VEZ)     ║
-- ║                                                                          ║
-- ║ Chamada por sales-cycles.ts L71 e route.ts L82.                          ║
-- ║ Contrato:                                                                ║
-- ║   - Seta status='perdido', lost_at=now(), closed_at=now()               ║
-- ║   - Grava lost_reason e lost_owner_user_id                              ║
-- ║   - Limpa next_action/next_action_date                                  ║
-- ║   - Registra evento cycle_events                                         ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DROP FUNCTION IF EXISTS public.rpc_close_cycle_lost(uuid, text);

CREATE OR REPLACE FUNCTION public.rpc_close_cycle_lost(
  p_cycle_id    uuid,
  p_loss_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_company_id uuid;
  v_cycle      public.sales_cycles%ROWTYPE;
  v_now        timestamptz := now();
  v_reason     text;
BEGIN
  v_company_id := public.current_company_id();
  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'company_not_found');
  END IF;

  SELECT * INTO v_cycle
  FROM public.sales_cycles
  WHERE id = p_cycle_id AND company_id = v_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'cycle_not_found');
  END IF;

  -- Bloquear se já está fechado
  IF v_cycle.status IN ('ganho', 'perdido', 'cancelado') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'Ciclo já está fechado como ' || v_cycle.status
    );
  END IF;

  v_reason := COALESCE(NULLIF(TRIM(p_loss_reason), ''), 'Não informado');

  UPDATE public.sales_cycles
  SET
    status             = 'perdido',
    previous_status    = v_cycle.status,
    stage_entered_at   = v_now,
    lost_at            = v_now,
    closed_at          = v_now,
    lost_reason        = v_reason,
    lost_owner_user_id = COALESCE(v_cycle.owner_user_id, auth.uid()),
    next_action        = NULL,
    next_action_date   = NULL,
    updated_at         = v_now
  WHERE id = p_cycle_id AND company_id = v_company_id;

  INSERT INTO public.cycle_events (
    cycle_id, company_id, event_type, metadata, created_by, occurred_at
  ) VALUES (
    p_cycle_id,
    v_company_id,
    'closed_lost',
    jsonb_build_object(
      'from_status',        v_cycle.status,
      'lost_reason',        v_reason,
      'lost_owner_user_id', COALESCE(v_cycle.owner_user_id, auth.uid())
    ),
    auth.uid(),
    v_now
  );

  RETURN jsonb_build_object(
    'success', true,
    'id', p_cycle_id,
    'status', 'perdido',
    'lost_at', v_now,
    'closed_at', v_now,
    'lost_reason', v_reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_close_cycle_lost(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_close_cycle_lost(uuid, text) TO authenticated;


-- ╔═══��═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 10 — RPC: rpc_assign_cycle_owner (VERSIONADA PELA PRIMEIRA VEZ)  ║
-- ║                                                                          ║
-- ║ Chamada por sales-cycles.ts L30.                                         ║
-- ║ Diferente de rpc_reassign_cycle_owner (008): esta é para atribuição      ║
-- ║ inicial do pool → vendedor. Se o ciclo está 'novo', avança para          ║
-- ║ 'contato'. Se já tem status, mantém.                                     ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DROP FUNCTION IF EXISTS public.rpc_assign_cycle_owner(uuid, uuid);

CREATE OR REPLACE FUNCTION public.rpc_assign_cycle_owner(
  p_cycle_id       uuid,
  p_owner_user_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_company_id uuid;
  v_cycle      public.sales_cycles%ROWTYPE;
  v_now        timestamptz := now();
  v_new_status text;
BEGIN
  v_company_id := public.current_company_id();
  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'company_not_found');
  END IF;

  SELECT * INTO v_cycle
  FROM public.sales_cycles
  WHERE id = p_cycle_id AND company_id = v_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'cycle_not_found');
  END IF;

  -- Se está no pool (status 'novo'), avança para 'contato'
  -- Caso contrário, mantém o status atual
  IF v_cycle.status = 'novo' THEN
    v_new_status := 'contato';
  ELSE
    v_new_status := v_cycle.status;
  END IF;

  UPDATE public.sales_cycles
  SET
    owner_user_id    = p_owner_user_id,
    status           = v_new_status,
    previous_status  = v_cycle.status,
    stage_entered_at = CASE WHEN v_new_status != v_cycle.status THEN v_now ELSE stage_entered_at END,
    updated_at       = v_now
  WHERE id = p_cycle_id AND company_id = v_company_id;

  INSERT INTO public.cycle_events (
    cycle_id, company_id, event_type, metadata, created_by, occurred_at
  ) VALUES (
    p_cycle_id,
    v_company_id,
    'owner_assigned',
    jsonb_build_object(
      'from_owner',  v_cycle.owner_user_id,
      'to_owner',    p_owner_user_id,
      'from_status', v_cycle.status,
      'to_status',   v_new_status
    ),
    auth.uid(),
    v_now
  );

  RETURN jsonb_build_object(
    'success', true,
    'id', p_cycle_id,
    'status', v_new_status,
    'owner_user_id', p_owner_user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_assign_cycle_owner(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_assign_cycle_owner(uuid, uuid) TO authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 11 — RPC: rpc_set_next_action (VERSIONADA PELA PRIMEIRA VEZ)     ║
-- ║                                                                          ║
-- ║ Chamada por sales-cycles.ts L45.                                         ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DROP FUNCTION IF EXISTS public.rpc_set_next_action(uuid, text, timestamptz);

CREATE OR REPLACE FUNCTION public.rpc_set_next_action(
  p_cycle_id         uuid,
  p_next_action      text,
  p_next_action_date timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_company_id uuid;
  v_cycle      public.sales_cycles%ROWTYPE;
BEGIN
  v_company_id := public.current_company_id();
  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'company_not_found');
  END IF;

  SELECT * INTO v_cycle
  FROM public.sales_cycles
  WHERE id = p_cycle_id AND company_id = v_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'cycle_not_found');
  END IF;

  -- Não permite setar próxima ação em ciclos fechados
  IF v_cycle.status IN ('ganho', 'perdido', 'cancelado') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'Não é possível definir próxima ação em ciclo fechado'
    );
  END IF;

  UPDATE public.sales_cycles
  SET
    next_action      = p_next_action,
    next_action_date = p_next_action_date,
    updated_at       = now()
  WHERE id = p_cycle_id AND company_id = v_company_id;

  INSERT INTO public.cycle_events (
    cycle_id, company_id, event_type, metadata, created_by, occurred_at
  ) VALUES (
    p_cycle_id,
    v_company_id,
    'next_action_set',
    jsonb_build_object(
      'next_action',      p_next_action,
      'next_action_date', p_next_action_date
    ),
    auth.uid(),
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'id', p_cycle_id,
    'next_action', p_next_action,
    'next_action_date', p_next_action_date
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_set_next_action(uuid, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_set_next_action(uuid, text, timestamptz) TO authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 12 — CORREÇÃO: rpc_move_cycle_stage_checkpoint                    ║
-- ║                                                                          ║
-- ║ Problema: aceita p_to_status='ganho'/'perdido' sem preencher os campos  ║
-- ║ de lifecycle. LostDealModal usa esta RPC para fechar como perdido.       ║
-- ║                                                                          ║
-- ║ Solução: quando to_status é 'ganho' ou 'perdido', extrair dados do      ║
-- ║ checkpoint e preencher os campos corretamente.                           ║
-- ║ Quando to_status é 'perdido', grava lost_at/lost_reason/closed_at.      ║
-- ║ Quando to_status é 'ganho', bloqueia — deve usar rpc_close_cycle_won.   ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.rpc_move_cycle_stage_checkpoint(
  p_cycle_id   uuid,
  p_to_status  text,
  p_checkpoint jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id       uuid;
  v_cycle            public.sales_cycles%ROWTYPE;
  v_next_action      text;
  v_next_action_date timestamptz;
  v_now              timestamptz := now();
  v_lost_reason      text;
BEGIN
  v_company_id := public.current_company_id();
  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'company_not_found');
  END IF;

  SELECT * INTO v_cycle
  FROM public.sales_cycles
  WHERE id = p_cycle_id AND company_id = v_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'cycle_not_found');
  END IF;

  -- Bloquear se já está fechado
  IF v_cycle.status IN ('ganho', 'perdido', 'cancelado') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Ciclo já está fechado como ' || v_cycle.status
    );
  END IF;

  -- Ganho DEVE usar rpc_close_cycle_won (que grava produto, pagamento, etc.)
  IF p_to_status = 'ganho' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Use rpc_close_cycle_won para fechar como ganho'
    );
  END IF;

  -- PERDIDO: tratar campos de lifecycle
  IF p_to_status = 'perdido' THEN
    v_lost_reason := COALESCE(
      NULLIF(TRIM(p_checkpoint->>'lost_reason'), ''),
      'Não informado'
    );

    UPDATE public.sales_cycles
    SET
      previous_status    = status,
      status             = 'perdido',
      stage_entered_at   = v_now,
      lost_at            = v_now,
      closed_at          = v_now,
      lost_reason        = v_lost_reason,
      lost_owner_user_id = COALESCE(v_cycle.owner_user_id, auth.uid()),
      next_action        = NULL,
      next_action_date   = NULL,
      updated_at         = v_now
    WHERE id = p_cycle_id AND company_id = v_company_id;

    INSERT INTO public.cycle_events (
      cycle_id, company_id, event_type, metadata, created_by, occurred_at
    ) VALUES (
      p_cycle_id,
      v_company_id,
      'closed_lost',
      jsonb_build_object(
        'from_status',   v_cycle.status,
        'to_status',     'perdido',
        'lost_reason',   v_lost_reason,
        'checkpoint',    p_checkpoint
      ),
      auth.uid(),
      v_now
    );

    RETURN jsonb_build_object('success', true);
  END IF;

  -- TRANSIÇÃO NORMAL (contato, respondeu, negociacao, etc.)
  v_next_action      := p_checkpoint->>'next_action';
  v_next_action_date := (p_checkpoint->>'next_action_date')::timestamptz;

  UPDATE public.sales_cycles
  SET
    previous_status  = status,
    status           = p_to_status::lead_status,
    stage_entered_at = v_now,
    next_action      = COALESCE(v_next_action, next_action),
    next_action_date = COALESCE(v_next_action_date, next_action_date),
    updated_at       = v_now
  WHERE id = p_cycle_id AND company_id = v_company_id;

  INSERT INTO public.cycle_events (
    cycle_id, company_id, event_type, metadata, created_by, occurred_at
  ) VALUES (
    p_cycle_id,
    v_company_id,
    'stage_changed',
    jsonb_build_object(
      'from_status', v_cycle.status,
      'to_status',   p_to_status,
      'checkpoint',  p_checkpoint
    ),
    auth.uid(),
    v_now
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Permissões já existem da migration 007, mas reforçamos
REVOKE ALL ON FUNCTION public.rpc_move_cycle_stage_checkpoint(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_move_cycle_stage_checkpoint(uuid, text, jsonb) TO authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 13 — CORREÇÃO: rpc_bulk_return_cycles_to_pool                     ║
-- ║                                                                          ║
-- ║ Problema (008 L143-147): não reseta status nem stage_entered_at.         ║
-- ║ Ciclo fica sem owner mas com status='negociacao' etc.                    ║
-- ║ A versão individual (rpc_return_cycle_to_pool_with_reason, 010 L108-114) ║
-- ║ já faz o reset correto. Alinhamos aqui.                                  ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.rpc_bulk_return_cycles_to_pool(
  p_cycle_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_cycle_id   uuid;
  v_cycle      public.sales_cycles%ROWTYPE;
  v_now        timestamptz := now();
BEGIN
  v_company_id := public.current_company_id();
  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'company_not_found');
  END IF;

  FOREACH v_cycle_id IN ARRAY p_cycle_ids
  LOOP
    SELECT * INTO v_cycle
    FROM public.sales_cycles
    WHERE id = v_cycle_id AND company_id = v_company_id;

    IF NOT FOUND THEN CONTINUE; END IF;

    -- Não devolver ciclos fechados ao pool
    IF v_cycle.status IN ('ganho', 'perdido', 'cancelado') THEN CONTINUE; END IF;

    UPDATE public.sales_cycles
    SET
      owner_user_id    = NULL,
      previous_status  = status,
      status           = 'novo',
      stage_entered_at = v_now,
      updated_at       = v_now
    WHERE id = v_cycle_id AND company_id = v_company_id;

    INSERT INTO public.cycle_events (
      cycle_id, company_id, event_type, metadata, created_by, occurred_at
    ) VALUES (
      v_cycle_id,
      v_company_id,
      'returned_to_pool',
      jsonb_build_object(
        'by_admin',        true,
        'previous_owner',  v_cycle.owner_user_id,
        'previous_status', v_cycle.status
      ),
      auth.uid(),
      v_now
    );
  END LOOP;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_bulk_return_cycles_to_pool(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_return_cycles_to_pool(uuid[]) TO authenticated;


-- ╔═════════════════════���═════════════════════════════════════════════════════╗
-- ║ BLOCO 14 — CORREÇÃO: rpc_bulk_return_cycles_to_pool_self                ║
-- ║ Mesmo tratamento do bloco 13, mas restrito ao próprio seller.            ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.rpc_bulk_return_cycles_to_pool_self(
  p_cycle_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_user_id    uuid;
  v_cycle_id   uuid;
  v_cycle      public.sales_cycles%ROWTYPE;
  v_now        timestamptz := now();
BEGIN
  v_company_id := public.current_company_id();
  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'company_not_found');
  END IF;

  v_user_id := auth.uid();

  FOREACH v_cycle_id IN ARRAY p_cycle_ids
  LOOP
    SELECT * INTO v_cycle
    FROM public.sales_cycles
    WHERE id = v_cycle_id
      AND company_id = v_company_id
      AND owner_user_id = v_user_id;

    IF NOT FOUND THEN CONTINUE; END IF;

    -- Não devolver ciclos fechados ao pool
    IF v_cycle.status IN ('ganho', 'perdido', 'cancelado') THEN CONTINUE; END IF;

    UPDATE public.sales_cycles
    SET
      owner_user_id    = NULL,
      previous_status  = status,
      status           = 'novo',
      stage_entered_at = v_now,
      updated_at       = v_now
    WHERE id = v_cycle_id
      AND company_id = v_company_id
      AND owner_user_id = v_user_id;

    IF FOUND THEN
      INSERT INTO public.cycle_events (
        cycle_id, company_id, event_type, metadata, created_by, occurred_at
      ) VALUES (
        v_cycle_id,
        v_company_id,
        'returned_to_pool',
        jsonb_build_object(
          'by_self',         true,
          'previous_owner',  v_user_id,
          'previous_status', v_cycle.status
        ),
        v_user_id,
        v_now
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_bulk_return_cycles_to_pool_self(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_return_cycles_to_pool_self(uuid[]) TO authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 15 — CORREÇÃO: rpc_recall_group_to_pool                           ║
-- ║                                                                          ║
-- ║ Problema (008 L495-500): não reseta status. Mesma correção.              ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.rpc_recall_group_to_pool(
  p_group_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_updated    integer := 0;
  v_rec        record;
  v_now        timestamptz := now();
BEGIN
  v_company_id := public.current_company_id();
  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'company_not_found');
  END IF;

  FOR v_rec IN
    SELECT id, status, owner_user_id
    FROM public.sales_cycles
    WHERE current_group_id = p_group_id
      AND company_id = v_company_id
      AND status NOT IN ('ganho', 'perdido', 'cancelado')
      AND owner_user_id IS NOT NULL
  LOOP
    UPDATE public.sales_cycles
    SET
      owner_user_id    = NULL,
      previous_status  = status,
      status           = 'novo',
      stage_entered_at = v_now,
      updated_at       = v_now
    WHERE id = v_rec.id AND company_id = v_company_id;

    INSERT INTO public.cycle_events (
      cycle_id, company_id, event_type, metadata, created_by, occurred_at
    ) VALUES (
      v_rec.id,
      v_company_id,
      'returned_to_pool',
      jsonb_build_object(
        'by_group_recall',  true,
        'group_id',         p_group_id,
        'previous_owner',   v_rec.owner_user_id,
        'previous_status',  v_rec.status
      ),
      auth.uid(),
      v_now
    );

    v_updated := v_updated + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'updated_count', v_updated);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_recall_group_to_pool(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_recall_group_to_pool(uuid) TO authenticated;


-- ╔═════════════════════════════════════════════════════��═════════════════════╗
-- ║ BLOCO 16 — CORREÇÃO: markDealWonWithRevenue precisa gravar closed_at    ║
-- ║                                                                          ║
-- ║ sales-analytics.ts L186-206 faz UPDATE direto sem gravar closed_at.      ║
-- ║ Não podemos corrigir o TS nesta migration, mas podemos garantir que o    ║
-- ║ trigger preencha closed_at quando status muda para um status terminal.   ║
-- ║                                                                          ║
-- ║ Criamos um trigger BEFORE UPDATE que preenche closed_at automaticamente  ║
-- ║ quando o status muda para ganho/perdido/cancelado.                       ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.fn_auto_fill_closed_at()
RETURNS TRIGGER AS $$
BEGIN
  -- Se o status está mudando para um status terminal...
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status IN ('ganho', 'perdido', 'cancelado') THEN
      -- Preenche closed_at se não foi explicitamente setado
      IF NEW.closed_at IS NULL THEN
        NEW.closed_at := now();
      END IF;

      -- Preenche won_at se ganho e não setado
      IF NEW.status = 'ganho' AND NEW.won_at IS NULL THEN
        NEW.won_at := now();
      END IF;

      -- Preenche won_owner_user_id se ganho e não setado
      IF NEW.status = 'ganho' AND NEW.won_owner_user_id IS NULL THEN
        NEW.won_owner_user_id := COALESCE(NEW.owner_user_id, OLD.owner_user_id);
      END IF;

      -- Preenche lost_at se perdido e não setado
      IF NEW.status = 'perdido' AND NEW.lost_at IS NULL THEN
        NEW.lost_at := now();
      END IF;

      -- Preenche lost_reason se perdido e não setado
      IF NEW.status = 'perdido' AND NEW.lost_reason IS NULL THEN
        NEW.lost_reason := 'Não informado';
      END IF;

      -- Preenche lost_owner_user_id se perdido e não setado
      IF NEW.status = 'perdido' AND NEW.lost_owner_user_id IS NULL THEN
        NEW.lost_owner_user_id := COALESCE(NEW.owner_user_id, OLD.owner_user_id);
      END IF;

      -- Limpa next_action ao fechar
      NEW.next_action      := NULL;
      NEW.next_action_date := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_fill_closed_at ON public.sales_cycles;
CREATE TRIGGER trg_auto_fill_closed_at
  BEFORE UPDATE ON public.sales_cycles
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_auto_fill_closed_at();

COMMENT ON FUNCTION public.fn_auto_fill_closed_at()
  IS 'Fase 1: Garante que closed_at, won_at, lost_at, lost_reason e won_owner_user_id '
     'são preenchidos automaticamente quando o status muda para terminal (ganho/perdido/cancelado). '
     'Funciona como rede de segurança para updates diretos (ex: markDealWonWithRevenue em sales-analytics.ts).';


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 17 — RPC: rpc_get_user_sales_cycles (VERSIONADA)                  ║
-- ║                                                                          ║
-- ║ Chamada por sales-cycles.ts L88.                                         ║
-- ║ Retorna ciclos do vendedor com dados do lead, ordenados por updated_at.  ║
-- ╚═════════════════════════════════���═════════════════════════════════════════╝

DROP FUNCTION IF EXISTS public.rpc_get_user_sales_cycles(uuid, text, int, int);

CREATE OR REPLACE FUNCTION public.rpc_get_user_sales_cycles(
  p_owner_user_id uuid DEFAULT NULL,
  p_status        text DEFAULT NULL,
  p_limit         int  DEFAULT 100,
  p_offset        int  DEFAULT 0
)
RETURNS TABLE (
  cycle_id         uuid,
  cycle_status     text,
  stage_entered_at timestamptz,
  next_action      text,
  next_action_date timestamptz,
  owner_user_id    uuid,
  lead_id          uuid,
  lead_name        text,
  lead_phone       text,
  lead_email       text,
  created_at       timestamptz,
  updated_at       timestamptz,
  closed_at        timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_company_id uuid;
  v_user_id    uuid;
  v_is_admin   boolean;
  v_owner      uuid;
BEGIN
  v_company_id := public.current_company_id();
  IF v_company_id IS NULL THEN RETURN; END IF;

  v_user_id  := auth.uid();
  v_is_admin := public.is_admin();

  -- Seller pode ver apenas seus ciclos
  IF v_is_admin THEN
    v_owner := p_owner_user_id; -- NULL = todos
  ELSE
    v_owner := v_user_id;
  END IF;

  RETURN QUERY
  SELECT
    sc.id            AS cycle_id,
    sc.status::text  AS cycle_status,
    sc.stage_entered_at,
    sc.next_action,
    sc.next_action_date,
    sc.owner_user_id,
    sc.lead_id,
    l.name           AS lead_name,
    l.phone          AS lead_phone,
    l.email          AS lead_email,
    sc.created_at,
    sc.updated_at,
    sc.closed_at
  FROM public.sales_cycles sc
  JOIN public.leads l ON l.id = sc.lead_id
  WHERE sc.company_id = v_company_id
    AND (v_owner IS NULL OR sc.owner_user_id = v_owner)
    AND (p_status IS NULL OR sc.status = p_status)
  ORDER BY sc.updated_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_get_user_sales_cycles(uuid, text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_get_user_sales_cycles(uuid, text, int, int) TO authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 18 — RPC: rpc_get_pool_cycles (VERSIONADA)                        ║
-- ║                                                                          ║
-- ║ Chamada por sales-cycles.ts L103.                                        ║
-- ║ Retorna ciclos do pool (owner_user_id IS NULL, status = 'novo').         ║
-- ╚═══════════════════════════��═══════════════════════════════════════════════╝

DROP FUNCTION IF EXISTS public.rpc_get_pool_cycles(int, int);

CREATE OR REPLACE FUNCTION public.rpc_get_pool_cycles(
  p_limit  int DEFAULT 100,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  cycle_id         uuid,
  cycle_status     text,
  stage_entered_at timestamptz,
  next_action      text,
  next_action_date timestamptz,
  owner_user_id    uuid,
  lead_id          uuid,
  lead_name        text,
  lead_phone       text,
  lead_email       text,
  created_at       timestamptz,
  updated_at       timestamptz,
  closed_at        timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  v_company_id := public.current_company_id();
  IF v_company_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    sc.id            AS cycle_id,
    sc.status::text  AS cycle_status,
    sc.stage_entered_at,
    sc.next_action,
    sc.next_action_date,
    sc.owner_user_id,
    sc.lead_id,
    l.name           AS lead_name,
    l.phone          AS lead_phone,
    l.email          AS lead_email,
    sc.created_at,
    sc.updated_at,
    sc.closed_at
  FROM public.sales_cycles sc
  JOIN public.leads l ON l.id = sc.lead_id
  WHERE sc.company_id = v_company_id
    AND sc.owner_user_id IS NULL
    AND sc.status = 'novo'
  ORDER BY sc.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_get_pool_cycles(int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_get_pool_cycles(int, int) TO authenticated;


-- =============================================================================
-- FIM DA MIGRATION 017
-- =============================================================================
