// Rodada 10 (HML), item J: captura em ciclo encerrado.
//
// Só com a leitura completa ligada para quem captura (regra por usuário da
// rodada 15: preview com a flag, ou produção com o usuário na lista). A rota de captura lê o ciclo; se ele está em ganho,
// perdido ou cancelado, pede à RPC p_allow_closed_cycle = true (parâmetro
// da migração 20261003090000, já aplicada). Defesa: se a RPC ainda assim
// recusar (banco sem o parâmetro, ou ciclo encerrado), a rota responde com
// um código próprio, sem aviso de falha no painel, e a extensão para de
// tentar por um tempo. Ciclo aberto e flag desligada: chamada idêntica à de
// hoje.
//
// Depois de uma captura aceita, a rota diz se o cliente escreveu depois do
// encerramento (o mesmo critério da leitura de atendimento). Só então a
// extensão abre as abas para o ciclo encerrado.

import type { SupabaseClient } from '@supabase/supabase-js'

import {
  classifyLedgerEvent,
  isCustomerMessage,
} from '@/app/lib/companion/full-reading/conversation-events'

import {
  isFullReadingEnabledForUser,
  type FullReadingFlagEnv,
} from './full-reading-flag'

export const CLOSED_CYCLE_CAPTURE_UNAVAILABLE =
  'CLOSED_CYCLE_CAPTURE_UNAVAILABLE'

export const CLOSED_CYCLE_STATUSES =
  new Set(['ganho', 'perdido', 'cancelado'])

// Função sem o parâmetro novo (banco sem a migração 20261003090000) ou
// ambígua.
const MISSING_FUNCTION_CODES =
  new Set(['PGRST202', 'PGRST203', '42883'])

export type ClosedCycleCaptureTarget = {
  status: string
  closed_at: string | null
}

type CycleRow = {
  status?: unknown
  closed_at?: unknown
  won_at?: unknown
  lost_at?: unknown
  canceled_at?: unknown
  stage_entered_at?: unknown
}

type LedgerRow = {
  direction?: unknown
  author_kind?: unknown
  occurred_at?: unknown
  content_type?: unknown
  text_content?: unknown
}

function text(
  value: unknown,
): string | null {
  return typeof value === 'string' && value.length > 0
    ? value
    : null
}

function toTime(
  value: string | null,
): number | null {
  if (!value) {
    return null
  }

  const parsed =
    Date.parse(value)

  return Number.isNaN(parsed)
    ? null
    : parsed
}

// Mesmo encerramento que o painel usa (kanban da leitura completa).
export function closedAtFromCycleRow(
  row: CycleRow,
): string | null {
  const status =
    text(row.status)

  return status === 'perdido'
    ? text(row.lost_at) ?? text(row.closed_at) ?? text(row.stage_entered_at)
    : status === 'cancelado'
      ? text(row.canceled_at) ?? text(row.closed_at) ?? text(row.stage_entered_at)
      : status === 'ganho'
        ? text(row.won_at) ?? text(row.closed_at) ?? text(row.stage_entered_at)
        : text(row.closed_at)
}

// null: regra desligada para o usuário, ciclo aberto, não encontrado ou
// leitura falhou (a chamada segue exatamente como hoje).
export async function readClosedCycleCaptureTarget({
  admin,
  userId,
  companyId,
  cycleId,
  env = process.env,
}: {
  admin: SupabaseClient
  // Rodada 16: quem captura (sub do token). Em produção, só quem está em
  // COMPANION_FULL_READING_SELLER_IDS; desligada, nenhuma consulta.
  userId: string | null | undefined
  companyId: string
  cycleId: string
  env?: FullReadingFlagEnv
}): Promise<ClosedCycleCaptureTarget | null> {
  if (!isFullReadingEnabledForUser({ env, userId })) {
    return null
  }

  const { data, error } =
    await admin
      .from('sales_cycles')
      .select('status, closed_at, won_at, lost_at, canceled_at, stage_entered_at')
      .eq('company_id', companyId)
      .eq('id', cycleId)
      .maybeSingle()

  if (error || !data) {
    return null
  }

  const row =
    data as CycleRow

  const status =
    text(row.status)

  if (!status || !CLOSED_CYCLE_STATUSES.has(status)) {
    return null
  }

  return {
    status,
    closed_at: closedAtFromCycleRow(row),
  }
}

// A RPC ainda não aceita ciclo encerrado: função sem o parâmetro novo ou a
// recusa de hoje.
export function isClosedCycleCaptureUnavailable({
  error,
  classificationCode,
}: {
  error: { code?: unknown } | null | undefined
  classificationCode: string
}): boolean {
  return (
    classificationCode === 'CAPTURE_CYCLE_CLOSED' ||
    (typeof error?.code === 'string' && MISSING_FUNCTION_CODES.has(error.code))
  )
}

// O cliente escreveu depois do encerramento (mensagem real, não evento)?
export async function customerWroteAfterClosureInLedger({
  admin,
  companyId,
  cycleId,
  conversationKey,
  closedAt,
}: {
  admin: SupabaseClient
  companyId: string
  cycleId: string
  conversationKey: string
  closedAt: string | null
}): Promise<boolean> {
  const closedTime =
    toTime(closedAt)

  if (closedTime === null || !closedAt) {
    return false
  }

  const { data, error } =
    await admin
      .from('conversation_messages')
      .select('direction, author_kind, occurred_at, content_type, text_content')
      .eq('company_id', companyId)
      .eq('cycle_id', cycleId)
      .eq('conversation_key', conversationKey)
      .gt('occurred_at', closedAt)
      .order('occurred_at', { ascending: false })
      .limit(50)

  if (error || !Array.isArray(data)) {
    return false
  }

  return (data as LedgerRow[]).some((row) => {
    const message = {
      direction: text(row.direction),
      author_kind: text(row.author_kind),
      content_type: text(row.content_type),
      text_content: text(row.text_content),
    }

    const occurred =
      toTime(text(row.occurred_at))

    return (
      occurred !== null &&
      occurred > closedTime &&
      classifyLedgerEvent(message) === null &&
      isCustomerMessage(message)
    )
  })
}
