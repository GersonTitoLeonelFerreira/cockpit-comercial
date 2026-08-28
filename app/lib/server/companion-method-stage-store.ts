import 'server-only'

import type {
  SupabaseClient,
} from '@supabase/supabase-js'

// Fase 12A, Frente 2B — Blocker 3.
//
// Persiste a última etapa VÁLIDA conhecida do Método Comercial por
// (company_id, cycle_id, conversation_key), permitindo um gate
// determinístico anti-regressão em composeSellerFacingGuidance.
//
// Escopo deliberadamente estreito: só cobre o estágio usado pela
// superfície AGORA (rota method-guidance). O estágio derivado
// separadamente em commercial-reading-contract.ts (superfície ANÁLISE,
// motor stateful-communication-executor.ts) é um mecanismo diferente,
// não coberto por este módulo.

export type CompanionMethodStageRecord = {
  method_config_version_id: string
  stage_key: string
  stage_name: string
  stage_display_order: number
  stage_reason: string | null
  updated_at: string
}

export class CompanionMethodStageStoreError extends Error {
  readonly code: string
  readonly status_code: number
  readonly retryable: boolean

  constructor({
    code,
    message,
    status_code,
    retryable,
  }: {
    code: string
    message: string
    status_code: number
    retryable: boolean
  }) {
    super(message)

    this.name = 'CompanionMethodStageStoreError'
    this.code = code
    this.status_code = status_code
    this.retryable = retryable
  }
}

function fail({
  code,
  message,
  status_code,
  retryable,
}: {
  code: string
  message: string
  status_code: number
  retryable: boolean
}): never {
  throw new CompanionMethodStageStoreError({
    code,
    message,
    status_code,
    retryable,
  })
}

type StageStateRow = {
  method_config_version_id: unknown
  stage_key: unknown
  stage_name: unknown
  stage_display_order: unknown
  stage_reason: unknown
  updated_at: unknown
}

function normalizeRow(row: StageStateRow): CompanionMethodStageRecord {
  return {
    method_config_version_id: String(row.method_config_version_id),
    stage_key: String(row.stage_key),
    stage_name: String(row.stage_name),
    stage_display_order: Number(row.stage_display_order),
    stage_reason:
      typeof row.stage_reason === 'string' ? row.stage_reason : null,
    updated_at: String(row.updated_at),
  }
}

/**
 * Carrega o último estágio persistido para este escopo, ou null se nunca
 * houve um. Nunca lança para "não encontrado" — só para falha real de
 * infraestrutura.
 */
export async function loadCompanionMethodStage({
  admin,
  companyId,
  cycleId,
  conversationKey,
}: {
  admin: SupabaseClient
  companyId: string
  cycleId: string
  conversationKey: string
}): Promise<CompanionMethodStageRecord | null> {
  const { data, error } = await admin
    .from('companion_method_stage_state')
    .select(
      'method_config_version_id, stage_key, stage_name, stage_display_order, stage_reason, updated_at',
    )
    .eq('company_id', companyId)
    .eq('cycle_id', cycleId)
    .eq('conversation_key', conversationKey)
    .maybeSingle()

  if (error) {
    fail({
      code: 'METHOD_STAGE_READ_FAILED',
      message: error.message || 'Falha ao carregar o estágio persistido do método.',
      status_code: 500,
      retryable: true,
    })
  }

  if (!data) {
    return null
  }

  return normalizeRow(data as StageStateRow)
}

/**
 * Grava (upsert) o estágio mais recente aceito para este escopo. Chamado
 * SOMENTE depois que o gate de continuidade (validateStageContinuity)
 * já aprovou o candidato — este módulo não decide se a transição é
 * legítima, apenas persiste o resultado já validado.
 */
export async function saveCompanionMethodStage({
  admin,
  companyId,
  cycleId,
  conversationKey,
  methodConfigVersionId,
  stageKey,
  stageName,
  stageDisplayOrder,
  stageReason,
}: {
  admin: SupabaseClient
  companyId: string
  cycleId: string
  conversationKey: string
  methodConfigVersionId: string
  stageKey: string
  stageName: string
  stageDisplayOrder: number
  stageReason: string | null
}): Promise<void> {
  const nowIso = new Date().toISOString()

  const { error } = await admin
    .from('companion_method_stage_state')
    .upsert(
      {
        company_id: companyId,
        cycle_id: cycleId,
        conversation_key: conversationKey,
        method_config_version_id: methodConfigVersionId,
        stage_key: stageKey,
        stage_name: stageName,
        stage_display_order: stageDisplayOrder,
        stage_reason: stageReason,
        updated_at: nowIso,
      },
      {
        onConflict: 'company_id,cycle_id,conversation_key',
      },
    )

  if (error) {
    fail({
      code: 'METHOD_STAGE_WRITE_FAILED',
      message: error.message || 'Falha ao persistir o estágio do método.',
      status_code: 500,
      retryable: true,
    })
  }
}
