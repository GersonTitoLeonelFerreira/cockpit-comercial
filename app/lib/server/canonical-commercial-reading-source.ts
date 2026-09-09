import 'server-only'

import type {
  SupabaseClient,
} from '@supabase/supabase-js'

import {
  COMMERCIAL_READING_CONTRACT_VERSION,
  normalizeCommercialReading,
  type CommercialReading,
  type CommercialReadingNormalizationContext,
} from '@/app/lib/companion/commercial-reading-contract'

import {
  STATEFUL_COPILOT_CONTRACT_VERSION,
} from '@/app/lib/companion/stateful-copilot-contract'

import {
  STATEFUL_COMMUNICATION_CONTRACT_VERSION,
} from '@/app/lib/companion/stateful-communication-contract'

import type {
  StatefulCopilotStateReadResult,
} from '@/app/lib/companion/stateful-copilot-supabase-reader'

const CANONICAL_COMMERCIAL_READING_EVENT_FIELDS = [
  'id',
  'state_record_id',
  'company_id',
  'cycle_id',
  'conversation_key',
  'candidate_state_version',
  'output_contract_version',
  'normalized_output',
  'generated_at',
].join(',')

type JsonRecord =
  Record<string, unknown>

export type CanonicalCommercialReadingSource = {
  company_id: string
  cycle_id: string
  conversation_key: string

  state_record_id: string
  state_version: number

  reading: CommercialReading

  source_event_id: string
  generated_at: string
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

/**
 * Lê a Commercial Reading correspondente EXATAMENTE à versão de estado
 * atualmente persistida para a conversa.
 *
 * A fonte de verdade continua sendo o evento stateful já persistido em
 * companion_commercial_state_events. Este reader não sintetiza uma nova
 * leitura e não escolhe simplesmente o evento "mais recente": ele exige
 * state_record_id + candidate_state_version iguais ao state_read atual.
 *
 * Antes de promover o payload persistido, o reader também reaplica o
 * normalizador canônico de Commercial Reading contra a fotografia atual
 * de mensagens, memórias, CRM e reference_time. Isso impede que payload
 * corrompido ou provenance que deixou de pertencer ao contexto atual seja
 * tratado como leitura canônica apenas por possuir contract_version válido.
 *
 * Ausência, ambiguidade, contrato incompatível, provenance inválida ou erro
 * de leitura falham fechado para null. O restante do MIE já possui fallback
 * para o estado comercial persistido, então uma leitura indisponível não
 * deve derrubar o fluxo seller-facing.
 */
export async function loadCanonicalCommercialReadingSource({
  admin,
  company_id,
  cycle_id,
  conversation_key,
  reference_time,
  state_read,
  validation_context,
}: {
  admin: SupabaseClient
  company_id: string
  cycle_id: string
  conversation_key: string
  reference_time: string
  state_read: StatefulCopilotStateReadResult
  validation_context:
    CommercialReadingNormalizationContext
}): Promise<CanonicalCommercialReadingSource | null> {
  if (state_read.mode !== 'found') {
    return null
  }

  const referenceTime =
    normalizeDateOrNull(reference_time)

  if (!referenceTime) {
    return null
  }

  if (
    normalizeDateOrNull(
      validation_context.reference_time,
    ) !== referenceTime
  ) {
    return null
  }

  try {
    const {
      data: events,
      error,
    } =
      await admin
        .from(
          'companion_commercial_state_events',
        )
        .select(
          CANONICAL_COMMERCIAL_READING_EVENT_FIELDS,
        )
        .eq(
          'company_id',
          company_id,
        )
        .eq(
          'cycle_id',
          cycle_id,
        )
        .eq(
          'conversation_key',
          conversation_key,
        )
        .eq(
          'state_record_id',
          state_read.state_record_id,
        )
        .eq(
          'candidate_state_version',
          state_read.state_version,
        )
        .eq(
          'output_contract_version',
          STATEFUL_COPILOT_CONTRACT_VERSION,
        )
        .lte(
          'generated_at',
          referenceTime,
        )
        .limit(2)

    if (
      error ||
      !Array.isArray(events) ||
      events.length !== 1
    ) {
      return null
    }

    const event =
      events[0]

    if (!isRecord(event)) {
      return null
    }

    const generatedAt =
      normalizeDateOrNull(
        event.generated_at,
      )

    if (
      event.company_id !== company_id ||
      event.cycle_id !== cycle_id ||
      event.conversation_key !== conversation_key ||
      event.state_record_id !== state_read.state_record_id ||
      event.candidate_state_version !== state_read.state_version ||
      event.output_contract_version !==
        STATEFUL_COPILOT_CONTRACT_VERSION ||
      typeof event.id !== 'string' ||
      !event.id ||
      !generatedAt
    ) {
      return null
    }

    const normalizedOutput =
      isRecord(event.normalized_output)
        ? event.normalized_output
        : null

    if (
      !normalizedOutput ||
      normalizedOutput.contract_version !==
        STATEFUL_COPILOT_CONTRACT_VERSION
    ) {
      return null
    }

    const communication =
      isRecord(
        normalizedOutput.communication,
      )
        ? normalizedOutput.communication
        : null

    if (
      !communication ||
      communication.contract_version !==
        STATEFUL_COMMUNICATION_CONTRACT_VERSION
    ) {
      return null
    }

    const commercialReading =
      isRecord(
        communication.commercial_reading,
      )
        ? communication.commercial_reading
        : null

    if (
      !commercialReading ||
      commercialReading.contract_version !==
        COMMERCIAL_READING_CONTRACT_VERSION
    ) {
      return null
    }

    const reading =
      normalizeCommercialReading(
        commercialReading,
        validation_context,
      )

    return {
      company_id,
      cycle_id,
      conversation_key,
      state_record_id:
        state_read.state_record_id,
      state_version:
        state_read.state_version,
      reading,
      source_event_id:
        event.id,
      generated_at:
        generatedAt,
    }
  } catch (error) {
    console.error(
      '[CANONICAL_COMMERCIAL_READING] lookup or validation failed, continuing without canonical reading',
      {
        company_id,
        cycle_id,
        conversation_key,
        state_record_id:
          state_read.state_record_id,
        state_version:
          state_read.state_version,
        error,
      },
    )

    return null
  }
}
