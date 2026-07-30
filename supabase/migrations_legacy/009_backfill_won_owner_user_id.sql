-- Migration 009: Backfill won_owner_user_id for existing won deals
-- Preenche won_owner_user_id para ganhos existentes onde está NULL
-- Usa owner_user_id como melhor dado disponível
-- Idempotente: só atualiza onde won_owner_user_id IS NULL
UPDATE public.sales_cycles
SET
  won_owner_user_id = owner_user_id,
  updated_at = NOW()
WHERE status = 'ganho'
  AND won_owner_user_id IS NULL
  AND owner_user_id IS NOT NULL;
