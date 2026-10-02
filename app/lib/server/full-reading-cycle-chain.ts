import 'server-only'

// Leitura completa de uma oportunidade nova (ciclo sucessor).
//
// "Nova oportunidade" cria um ciclo novo com origin_cycle_id do ciclo
// fechado; as mensagens já capturadas continuam gravadas no ciclo de
// origem (a ingestão nunca reescreve uma mensagem conhecida). Para a
// leitura do ciclo novo não nascer vazia, ela lê a MESMA conversa nos
// ciclos da cadeia origin_cycle_id e marca na transcrição onde a
// oportunidade nova começou ("Nova oportunidade aberta em ... · tipo ...
// · nota"). Só leitura: nada é gravado aqui.

import type {
  SupabaseClient,
} from '@supabase/supabase-js'

import type {
  NormalizedLedgerMessage,
} from '../companion/stateful-copilot-real-context-loader'

import {
  formatTranscriptTimestamp,
  type FullReadingTranscriptMarker,
} from '../companion/full-reading/transcript'

import {
  SUCCESSOR_OPPORTUNITY_TYPE_LABELS,
  isSuccessorOpportunityType,
} from '../companion/successor-opportunity'

// Uma cadeia real tem 1 ou 2 elos; o teto evita laço com dado ruim.
export const FULL_READING_CYCLE_CHAIN_MAX_DEPTH =
  5

export type FullReadingCycleLink = {
  id: string
  origin_cycle_id: string | null
  created_at: string | null
  opportunity_type: string | null
}

function text(
  value: unknown,
): string | null {
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : null
}

// [ciclo atual, origem, origem da origem, ...]
export async function loadFullReadingCycleChain({
  admin,
  companyId,
  cycleId,
  maxDepth = FULL_READING_CYCLE_CHAIN_MAX_DEPTH,
}: {
  admin: SupabaseClient
  companyId: string
  cycleId: string
  maxDepth?: number
}): Promise<FullReadingCycleLink[]> {
  const chain: FullReadingCycleLink[] = []
  const seen = new Set<string>()
  let nextId: string | null = cycleId

  while (nextId && !seen.has(nextId) && chain.length < maxDepth) {
    seen.add(nextId)

    const { data, error } =
      await admin
        .from('sales_cycles')
        .select('id, origin_cycle_id, created_at, opportunity_type')
        .eq('id', nextId)
        .eq('company_id', companyId)
        .maybeSingle()

    if (error || !data) {
      break
    }

    const row =
      data as Record<string, unknown>

    const link = {
      id: String(row.id),
      origin_cycle_id: text(row.origin_cycle_id),
      created_at: text(row.created_at),
      opportunity_type: text(row.opportunity_type),
    }

    chain.push(link)
    nextId = link.origin_cycle_id
  }

  return chain
}

// Nota digitada em "Nova oportunidade" (cycle_created.metadata.note).
export async function loadSuccessorNotes({
  admin,
  companyId,
  cycleIds,
}: {
  admin: SupabaseClient
  companyId: string
  cycleIds: string[]
}): Promise<Map<string, string>> {
  const notes = new Map<string, string>()

  if (cycleIds.length === 0) {
    return notes
  }

  const { data, error } =
    await admin
      .from('cycle_events')
      .select('cycle_id, metadata')
      .eq('company_id', companyId)
      .eq('event_type', 'cycle_created')
      .in('cycle_id', cycleIds)

  if (error || !Array.isArray(data)) {
    return notes
  }

  for (const row of data as { cycle_id?: unknown; metadata?: unknown }[]) {
    const metadata =
      row.metadata && typeof row.metadata === 'object'
        ? (row.metadata as Record<string, unknown>)
        : null

    const note =
      text(metadata?.note)

    if (typeof row.cycle_id === 'string' && note) {
      notes.set(row.cycle_id, note.replace(/\s+/g, ' ').slice(0, 300))
    }
  }

  return notes
}

// Um marco por elo que nasceu de outro ciclo.
export function buildSuccessorMarkers(
  chain: FullReadingCycleLink[],
  notes: Map<string, string> = new Map(),
): FullReadingTranscriptMarker[] {
  return chain
    .filter((link) => link.origin_cycle_id && link.created_at)
    .map((link) => {
      const typeLabel =
        isSuccessorOpportunityType(link.opportunity_type)
          ? SUCCESSOR_OPPORTUNITY_TYPE_LABELS[link.opportunity_type]
          : null

      const note =
        notes.get(link.id) ?? null

      const date =
        formatTranscriptTimestamp(link.created_at as string).slice(0, 10)

      return {
        occurred_at: link.created_at as string,
        text: [
          `Nova oportunidade aberta em ${date}`,
          typeLabel ? `tipo ${typeLabel}` : null,
          note,
        ]
          .filter(Boolean)
          .join(' · '),
      }
    })
    .sort((left, right) => Date.parse(left.occurred_at) - Date.parse(right.occurred_at))
}

// Mesma mensagem em mais de um ciclo (não deveria acontecer, a ingestão não
// regrava mensagem conhecida): fica a versão mais nova.
export function mergeChainMessages(
  lists: NormalizedLedgerMessage[][],
): NormalizedLedgerMessage[] {
  const byKey = new Map<string, NormalizedLedgerMessage>()

  for (const list of lists) {
    for (const message of list) {
      const current =
        byKey.get(message.message_key)

      if (!current || message.version > current.version) {
        byKey.set(message.message_key, message)
      }
    }
  }

  return [...byKey.values()]
}
