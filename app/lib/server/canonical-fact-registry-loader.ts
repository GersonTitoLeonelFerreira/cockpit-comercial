import 'server-only'

import type {
  SupabaseClient,
} from '@supabase/supabase-js'

import {
  buildFactEvidenceRegistry,
  classifyLedgerObservation,
  companyItemsFromCommercialContext,
  type FactEvidenceCompanyItem,
  type FactEvidenceMessage,
  type FactEvidenceRegistry,
  type LedgerObservationStatus,
} from '@/app/lib/companion/commercial-fact-grounding'

import {
  buildCompanionDiagnosticInput,
} from '@/app/lib/companion/diagnostic-input'

import {
  loadCommercialConfig,
  type PreloadedCommercialConfig,
} from './companion-diagnostic-snapshot'

import {
  loadCanonicalLedgerAtReferenceTime,
  type StatefulCopilotRealContextSupabaseClient,
} from '@/app/lib/companion/stateful-copilot-real-context-loader'

// ---------------------------------------------------------------------------
// Integridade de observação do ledger → registro de evidências factuais.
//
// `conversation_message_reconciliation_state` guarda, por mensagem, a última
// vez (e o dispositivo) em que a extensão a viu na tela. Uma mensagem que
// uma captura posterior "emoldurou" (viu mensagens anteriores E posteriores
// na mesma sessão) sem vê-la não está na conversa que o vendedor enxerga
// hoje: continua no ledger, mas perde autoridade de evidência primária.
//
// Fail-open: sem dados de observação, nada é excluído por este critério
// (as demais regras — apagada, outra empresa — continuam valendo).
//
// Conhecimento da empresa: a MESMA configuração comercial publicada que o
// Diagnostic Snapshot usa (produtos ativos, fatos vigentes, forbidden
// claims), sempre da company_id do escopo. Sem ela, nenhuma afirmação de
// preço/benefício/condição atual tem fonte — o gate fica mais estrito,
// nunca mais permissivo.
// ---------------------------------------------------------------------------

const MAX_OBSERVATION_ROWS = 1000

type LedgerMessageLike = {
  id: string
  company_id: string
  direction: string
  author_kind?: string | null
  content_type: string
  occurred_at: string
  text_content: string | null
  audio_transcription: string | null
  is_deleted: boolean
}

export async function loadLedgerObservation({
  admin,
  companyId,
  conversationKey,
  messages,
}: {
  admin: SupabaseClient
  companyId: string
  conversationKey: string
  messages: readonly LedgerMessageLike[]
}): Promise<Map<string, LedgerObservationStatus>> {
  if (messages.length === 0) {
    return new Map()
  }

  try {
    const { data, error } = await admin
      .from('conversation_message_reconciliation_state')
      .select('current_message_id, last_observed_at, last_device_key')
      .eq('company_id', companyId)
      .eq('conversation_key', conversationKey)
      .limit(MAX_OBSERVATION_ROWS + 1)

    if (error || !Array.isArray(data) || data.length > MAX_OBSERVATION_ROWS) {
      return new Map()
    }

    const byMessageId = new Map(
      data
        .filter((row) => row && row.current_message_id !== null && row.current_message_id !== undefined)
        .map((row) => [String(row.current_message_id), row]),
    )

    return classifyLedgerObservation(
      messages.map((message) => {
        const row = byMessageId.get(message.id)

        return {
          id: message.id,
          occurred_at: message.occurred_at,
          last_observed_at: typeof row?.last_observed_at === 'string' ? row.last_observed_at : null,
          last_device_key: typeof row?.last_device_key === 'string' ? row.last_device_key : null,
        }
      }),
    )
  } catch {
    return new Map()
  }
}

export function factMessagesFromLedger(
  messages: readonly LedgerMessageLike[],
  observation: ReadonlyMap<string, LedgerObservationStatus>,
): FactEvidenceMessage[] {
  return messages.map((message) => ({
    id: message.id,
    company_id: message.company_id,
    direction: message.direction,
    author_kind: message.author_kind ?? null,
    content_type: message.content_type,
    text:
      message.content_type === 'audio'
        ? message.audio_transcription
        : message.text_content,
    occurred_at: message.occurred_at,
    is_deleted: message.is_deleted,
    observation: observation.get(message.id) ?? 'unknown',
  }))
}

export function buildLedgerFactRegistry({
  companyId,
  messages,
  observation,
  companyItems = [],
  sellerInstruction = null,
}: {
  companyId: string
  messages: readonly LedgerMessageLike[]
  observation: ReadonlyMap<string, LedgerObservationStatus>
  companyItems?: readonly FactEvidenceCompanyItem[]
  sellerInstruction?: string | null
}): FactEvidenceRegistry {
  return buildFactEvidenceRegistry({
    company_id: companyId,
    messages: factMessagesFromLedger(messages, observation),
    company_items: companyItems,
    seller_instruction: sellerInstruction,
  })
}

export async function loadCompanyFactItems({
  admin,
  companyId,
  cycleId,
  conversationKey,
  referenceTime,
  onConfigLoaded,
}: {
  admin: SupabaseClient
  companyId: string
  cycleId: string
  conversationKey: string
  referenceTime: string
  // Entrega a configuração lida para reuso na mesma requisição.
  onConfigLoaded?: (config: PreloadedCommercialConfig) => void
}): Promise<FactEvidenceCompanyItem[]> {
  try {
    const config = await loadCommercialConfig({ admin, companyId })
    onConfigLoaded?.({ ...config, company_id: companyId })
    const { bundle, products } = config

    if (!bundle) {
      return []
    }

    const input = buildCompanionDiagnosticInput({
      company_id: companyId,
      cycle_id: cycleId,
      conversation_key: conversationKey,
      current_crm_status: null,
      reference_time: referenceTime,
      messages: [],
      commercial_config: bundle,
      products,
    })

    return companyItemsFromCommercialContext({
      company_id: companyId,
      commercial_context: input.commercial_context,
    })
  } catch {
    return []
  }
}

// Registro completo de uma conversa (ledger no instante de referência +
// observação atual + conhecimento publicado da empresa). null quando não há
// como julgar (falha de leitura ou conversa sem mensagens): quem chama
// decide o que fazer, nunca "tudo verificado".
export async function loadConversationFactRegistry({
  admin,
  companyId,
  cycleId,
  conversationKey,
  referenceTime,
}: {
  admin: SupabaseClient
  companyId: string
  cycleId: string
  conversationKey: string
  referenceTime: string
}): Promise<FactEvidenceRegistry | null> {
  try {
    const { canonicalMessages } = await loadCanonicalLedgerAtReferenceTime({
      client: admin as unknown as StatefulCopilotRealContextSupabaseClient,
      companyId,
      cycleId,
      conversationKey,
      referenceTime,
    })

    if (!Array.isArray(canonicalMessages) || canonicalMessages.length === 0) {
      return null
    }

    const [observation, companyItems] = await Promise.all([
      loadLedgerObservation({ admin, companyId, conversationKey, messages: canonicalMessages }),
      loadCompanyFactItems({ admin, companyId, cycleId, conversationKey, referenceTime }),
    ])

    return buildLedgerFactRegistry({
      companyId,
      messages: canonicalMessages,
      observation,
      companyItems,
    })
  } catch {
    return null
  }
}
