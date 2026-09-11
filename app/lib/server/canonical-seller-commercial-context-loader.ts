import 'server-only'

import type {
  SupabaseClient,
} from '@supabase/supabase-js'

import type {
  CompanionClientContext,
} from '@/app/lib/companion/companion-client-context-contract'

import {
  loadCanonicalLedgerAtReferenceTime,
  selectStatefulDiagnosticMessages,
  type StatefulCopilotRealContextSupabaseClient,
} from '@/app/lib/companion/stateful-copilot-real-context-loader'

import {
  createStatefulCopilotSupabaseReader,
  type StatefulCopilotStateReadResult,
  type StatefulCopilotSupabaseReadClient,
} from '@/app/lib/companion/stateful-copilot-supabase-reader'

import type {
  CompanionTokenPayload,
} from './companion-token'

import {
  loadCompanionClientContext,
} from './companion-client-context-loader'

import {
  loadCanonicalCommercialReadingSource,
  type CanonicalCommercialReadingSource,
} from './canonical-commercial-reading-source'

const MAX_SNAPSHOT_ATTEMPTS = 2

type JsonRecord =
  Record<string, unknown>

type CanonicalLedger =
  Awaited<
    ReturnType<
      typeof loadCanonicalLedgerAtReferenceTime
    >
  >

export type CanonicalSellerCommercialContext = {
  client_context: CompanionClientContext

  company_id: string
  cycle_id: string
  conversation_key: string
  reference_time: string

  // O ledger que valida o estado persistido precisa representar o mesmo
  // instante semântico em que esse estado foi calculado. Isso impede que
  // uma observação posterior do DOM (por exemplo, scroll/virtualização)
  // altere retroativamente a fotografia comercial já persistida.
  ledger_reference_time: string

  canonical_messages:
    CanonicalLedger['canonicalMessages']

  known_message_ids: string[]
  active_message_ids: string[]

  state_read: StatefulCopilotStateReadResult

  current_reading:
    CanonicalCommercialReadingSource | null
}

export class CanonicalSellerStateReadError
  extends Error {
  readonly code: string
  readonly retryable: boolean

  constructor({
    code,
    message,
    retryable,
  }: {
    code: string
    message: string
    retryable: boolean
  }) {
    super(message)

    this.name =
      'CanonicalSellerStateReadError'

    this.code = code
    this.retryable = retryable
  }
}

function isRecord(
  value: unknown,
): value is JsonRecord {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value)
  )
}

function normalizeDateOrNull(
  value: unknown,
): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const timestamp =
    Date.parse(value)

  if (!Number.isFinite(timestamp)) {
    return null
  }

  return new Date(timestamp).toISOString()
}

async function loadPersistedStateReferenceTime({
  admin,
  companyId,
  cycleId,
  conversationKey,
}: {
  admin: SupabaseClient
  companyId: string
  cycleId: string
  conversationKey: string
}): Promise<string | null> {
  const {
    data,
    error,
  } =
    await admin
      .from(
        'companion_commercial_states',
      )
      .select(
        'company_id, cycle_id, conversation_key, state_updated_at',
      )
      .eq(
        'company_id',
        companyId,
      )
      .eq(
        'cycle_id',
        cycleId,
      )
      .eq(
        'conversation_key',
        conversationKey,
      )
      .maybeSingle()

  if (error) {
    throw new CanonicalSellerStateReadError({
      code:
        'CANONICAL_SELLER_STATE_REFERENCE_READ_FAILED',
      message:
        'Não foi possível localizar a referência temporal do estado comercial.',
      retryable: true,
    })
  }

  if (data === null) {
    return null
  }

  if (!isRecord(data)) {
    throw new CanonicalSellerStateReadError({
      code:
        'CANONICAL_SELLER_STATE_REFERENCE_INVALID',
      message:
        'A referência temporal do estado comercial possui formato inválido.',
      retryable: false,
    })
  }

  if (
    data.company_id !== companyId ||
    data.cycle_id !== cycleId ||
    data.conversation_key !== conversationKey
  ) {
    throw new CanonicalSellerStateReadError({
      code:
        'CANONICAL_SELLER_STATE_SCOPE_MISMATCH',
      message:
        'A referência temporal do estado comercial pertence a outro escopo.',
      retryable: false,
    })
  }

  const stateUpdatedAt =
    normalizeDateOrNull(
      data.state_updated_at,
    )

  if (!stateUpdatedAt) {
    throw new CanonicalSellerStateReadError({
      code:
        'CANONICAL_SELLER_STATE_REFERENCE_INVALID',
      message:
        'A referência temporal do estado comercial é inválida.',
      retryable: false,
    })
  }

  return stateUpdatedAt
}

function collectStateMemoryIds(
  stateRead: StatefulCopilotStateReadResult,
): string[] {
  if (stateRead.mode !== 'found') {
    return []
  }

  return [
    ...stateRead.state.facts,
    ...stateRead.state.needs,
    ...stateRead.state.open_loops,
    ...stateRead.state.objections,
    ...stateRead.state.commitments,
    ...stateRead.state.signals,
    ...stateRead.state.uncertainties,
  ].map((item) => item.id)
}

function stateMatchesReference({
  stateRead,
  stateReferenceTime,
}: {
  stateRead: StatefulCopilotStateReadResult
  stateReferenceTime: string | null
}): boolean {
  if (stateRead.mode === 'missing') {
    return stateReferenceTime === null
  }

  return (
    stateReferenceTime !== null &&
    Date.parse(stateRead.state_updated_at) ===
      Date.parse(stateReferenceTime)
  )
}

export async function loadCanonicalSellerCommercialContext({
  admin,
  token,
  cycle_id,
  conversation_key,
  reference_time,
}: {
  admin: SupabaseClient
  token: CompanionTokenPayload
  cycle_id: unknown
  conversation_key: unknown
  reference_time: unknown
}): Promise<CanonicalSellerCommercialContext> {
  // Primeiro, o loader operacional existente continua sendo a autoridade
  // para normalização de escopo, membership e permissão sobre o ciclo.
  // Nenhuma leitura stateful acontece antes desse gate.
  const clientContext =
    await loadCompanionClientContext({
      admin,
      token,
      cycle_id,
      conversation_key,
      reference_time,
    })

  const companyId =
    clientContext.identity.company_id

  const cycleId =
    clientContext.identity.cycle_id

  const conversationKey =
    clientContext.identity.conversation_key

  const referenceTime =
    clientContext.generated_at

  const reader =
    createStatefulCopilotSupabaseReader({
      client:
        admin as unknown as
          StatefulCopilotSupabaseReadClient,
    })

  for (
    let attempt = 0;
    attempt < MAX_SNAPSHOT_ATTEMPTS;
    attempt += 1
  ) {
    const stateReferenceTime =
      await loadPersistedStateReferenceTime({
        admin,
        companyId,
        cycleId,
        conversationKey,
      })

    const ledgerReferenceTime =
      stateReferenceTime ??
      referenceTime

    const {
      knownMessageIds,
      canonicalMessages,
    } =
      await loadCanonicalLedgerAtReferenceTime({
        client:
          admin as unknown as
            StatefulCopilotRealContextSupabaseClient,
        companyId,
        cycleId,
        conversationKey,
        referenceTime:
          ledgerReferenceTime,
      })

    const activeMessageIds =
      selectStatefulDiagnosticMessages(
        canonicalMessages,
      ).map((message) => message.id)

    let stateRead:
      StatefulCopilotStateReadResult

    try {
      stateRead =
        await reader({
          company_id: companyId,
          cycle_id: cycleId,
          conversation_key:
            conversationKey,
          known_message_ids:
            knownMessageIds,
          active_message_ids:
            activeMessageIds,
        })
    } catch {
      throw new CanonicalSellerStateReadError({
        code:
          'CANONICAL_SELLER_STATE_READ_FAILED',
        message:
          'Não foi possível carregar o estado comercial persistido.',
        retryable: true,
      })
    }

    // O background pode promover uma nova versão exatamente entre a leitura
    // da referência e a leitura do snapshot. Uma única repetição recompõe o
    // par estado+ledger; se continuar correndo, falhamos fechado em vez de
    // misturar duas versões comerciais na mesma resposta seller-facing.
    if (
      !stateMatchesReference({
        stateRead,
        stateReferenceTime,
      })
    ) {
      if (
        attempt + 1 <
        MAX_SNAPSHOT_ATTEMPTS
      ) {
        continue
      }

      throw new CanonicalSellerStateReadError({
        code:
          'CANONICAL_SELLER_STATE_CHANGED_DURING_READ',
        message:
          'O estado comercial mudou durante a leitura. Tente novamente.',
        retryable: true,
      })
    }

    const currentReading =
      stateRead.mode === 'found'
        ? await loadCanonicalCommercialReadingSource({
          admin,
          company_id: companyId,
          cycle_id: cycleId,
          conversation_key:
            conversationKey,
          reference_time:
            referenceTime,
          state_read: stateRead,
          validation_context: {
            available_message_ids:
              knownMessageIds,
            available_memory_ids:
              collectStateMemoryIds(
                stateRead,
              ),
            seller_message_ids:
              canonicalMessages
                .filter(
                  (message) =>
                    message.direction ===
                      'outgoing',
                )
                .map(
                  (message) =>
                    message.id,
                ),
            current_crm_status:
              clientContext.identity
                .current_status,
            reference_time:
              referenceTime,
          },
        })
        : null

    return {
      client_context:
        clientContext,
      company_id:
        companyId,
      cycle_id:
        cycleId,
      conversation_key:
        conversationKey,
      reference_time:
        referenceTime,
      ledger_reference_time:
        ledgerReferenceTime,
      canonical_messages:
        canonicalMessages,
      known_message_ids:
        knownMessageIds,
      active_message_ids:
        activeMessageIds,
      state_read:
        stateRead,
      current_reading:
        currentReading,
    }
  }

  throw new CanonicalSellerStateReadError({
    code:
      'CANONICAL_SELLER_STATE_READ_FAILED',
    message:
      'Não foi possível compor o contexto comercial canônico.',
    retryable: true,
  })
}
