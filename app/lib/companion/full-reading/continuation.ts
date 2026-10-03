// Leitura de continuação (rodada 9, E).
//
// Com uma leitura anterior válida da mesma versão do prompt, a próxima não
// relê a conversa inteira: recebe a decisão anterior (já salva), as últimas
// 10 mensagens que a leitura anterior já tinha visto (contexto) e tudo o
// que entrou depois (novas). O modelo devolve a decisão completa de hoje.
//
// "Já tinha visto" é o ledger no momento de referência da leitura anterior
// (a leitura lê o ledger até o reference_time). Mensagem que mudou desde
// então (ex.: áudio que ganhou transcrição) entra entre as novas, marcada
// como atualizada.
//
// A leitura volta a ser completa quando a captura trouxe uma mensagem mais
// antiga que a última vista (o vendedor rolou a conversa para cima) ou
// quando entraram mais de 40 mensagens novas; os outros gatilhos (sem
// leitura anterior, prompt novo, cadeia mudou, kanban reaberto, 5
// continuações seguidas, pedido do vendedor ou do modelo) são decididos
// por quem chama.

import {
  classifyLedgerEvent,
} from './conversation-events'

import {
  buildFullReadingTranscriptEntries,
  describeMessageContent,
  type FullReadingTranscriptMarker,
  type FullReadingTranscriptMessage,
} from './transcript'

export const CONTINUATION_CONTEXT_MESSAGES =
  10

export const CONTINUATION_MAX_NEW_MESSAGES =
  40

// Depois de 5 continuações seguidas, a próxima leitura é completa.
export const CONTINUATION_MAX_CONSECUTIVE =
  5

// Motivos de leitura completa (sistema.motivo e log).
export type FullReadingFullReason =
  | 'sem_leitura_anterior'
  | 'versao_do_prompt'
  | 'mensagem_antiga'
  | 'muitas_mensagens_novas'
  | 'cadeia_mudou'
  | 'kanban_reaberto'
  | 'continuacao_pediu'
  | 'continuacoes_seguidas'
  | 'pedido_do_vendedor'
  | 'modo_pedido'
  // Rodada 10 (C1): a continuação não sairia mais barata.
  | 'continuacao_mais_cara'

function keyOf(
  message: FullReadingTranscriptMessage,
): string {
  return message.message_key ?? message.id
}

function signature(
  message: FullReadingTranscriptMessage,
): string {
  return JSON.stringify([
    message.content_type ?? '',
    message.text_content ?? '',
    message.audio_transcription ?? '',
    message.is_deleted === true,
    message.deletion_reason ?? '',
    message.author_kind ?? '',
    message.direction ?? '',
    // Rodada 11: arquivo incluído depois da leitura anterior entra entre as
    // novas, marcado como atualizado.
    message.attachment_summary ?? '',
  ])
}

function timeOf(
  value: string,
): number {
  const parsed =
    Date.parse(value)

  return Number.isNaN(parsed)
    ? 0
    : parsed
}

// Mensagem de verdade (não evento, com conteúdo para a transcrição).
export function isTranscriptRealMessage(
  message: FullReadingTranscriptMessage,
): boolean {
  return (
    classifyLedgerEvent(message) === null &&
    describeMessageContent(message) !== null
  )
}

function byTime(
  left: FullReadingTranscriptMessage,
  right: FullReadingTranscriptMessage,
): number {
  return (
    timeOf(left.occurred_at) - timeOf(right.occurred_at) ||
    left.id.localeCompare(right.id, 'en', { numeric: true })
  )
}

export type ContinuationSplit = {
  // Últimas mensagens já vistas (mais os eventos entre elas).
  context: FullReadingTranscriptMessage[]
  // Mensagens novas ou que mudaram desde a leitura anterior.
  fresh: FullReadingTranscriptMessage[]
  updated_keys: Set<string>
  new_message_count: number
  // A captura trouxe mensagem nova mais antiga que a última vista.
  older_than_seen: boolean
  last_seen_at: string | null
}

export function splitContinuationMessages({
  previous,
  current,
  contextSize = CONTINUATION_CONTEXT_MESSAGES,
}: {
  previous: FullReadingTranscriptMessage[]
  current: FullReadingTranscriptMessage[]
  contextSize?: number
}): ContinuationSplit {
  const seen =
    new Map(previous.map((message) => [keyOf(message), message]))

  const seenSorted =
    [...previous].sort(byTime)

  const seenReal =
    seenSorted.filter(isTranscriptRealMessage)

  const lastSeen =
    seenReal[seenReal.length - 1] ?? null

  const firstContext =
    seenReal.length > contextSize
      ? seenReal[seenReal.length - contextSize]
      : seenReal[0] ?? null

  const context =
    firstContext
      ? seenSorted.slice(seenSorted.indexOf(firstContext))
      : []

  const fresh: FullReadingTranscriptMessage[] = []
  const updatedKeys = new Set<string>()
  let newMessageCount = 0
  let olderThanSeen = false

  for (const message of [...current].sort(byTime)) {
    const key =
      keyOf(message)

    const before =
      seen.get(key)

    if (before && signature(before) === signature(message)) {
      continue
    }

    fresh.push(message)

    if (!isTranscriptRealMessage(message)) {
      continue
    }

    newMessageCount += 1

    if (before) {
      updatedKeys.add(key)
      continue
    }

    // Mesmo minuto da última vista não é "mais antiga" (a captura grava o
    // minuto).
    if (lastSeen && timeOf(message.occurred_at) < timeOf(lastSeen.occurred_at)) {
      olderThanSeen = true
    }
  }

  return {
    context,
    fresh,
    updated_keys: updatedKeys,
    new_message_count: newMessageCount,
    older_than_seen: olderThanSeen,
    last_seen_at: lastSeen?.occurred_at ?? null,
  }
}

// Gatilhos de leitura completa que dependem das mensagens.
export function continuationFullReason(
  split: ContinuationSplit,
): FullReadingFullReason | null {
  if (split.context.length === 0) {
    return 'sem_leitura_anterior'
  }

  if (split.older_than_seen) {
    return 'mensagem_antiga'
  }

  if (split.new_message_count > CONTINUATION_MAX_NEW_MESSAGES) {
    return 'muitas_mensagens_novas'
  }

  return null
}

export type ContinuationTranscripts = {
  context_text: string
  new_text: string
  context_message_count: number
  new_message_count: number
}

export function buildContinuationTranscripts(
  split: ContinuationSplit,
  {
    markers = [],
    timeZone,
  }: {
    markers?: FullReadingTranscriptMarker[]
    timeZone?: string
  } = {},
): ContinuationTranscripts {
  const contextStart =
    split.context[0]?.occurred_at ?? null

  const lastSeen =
    split.last_seen_at

  const contextMarkers =
    markers.filter(
      (marker) =>
        contextStart !== null &&
        timeOf(marker.occurred_at) >= timeOf(contextStart) &&
        (lastSeen === null || timeOf(marker.occurred_at) <= timeOf(lastSeen)),
    )

  const newMarkers =
    markers.filter(
      (marker) =>
        lastSeen !== null &&
        timeOf(marker.occurred_at) > timeOf(lastSeen),
    )

  const contextEntries =
    buildFullReadingTranscriptEntries(split.context, {
      timeZone,
      markers: contextMarkers,
    })

  const newEntries =
    buildFullReadingTranscriptEntries(split.fresh, {
      timeZone,
      markers: newMarkers,
      decorate: (message, content) =>
        split.updated_keys.has(keyOf(message))
          ? `(atualizada) ${content}`
          : content,
    })

  return {
    context_text: contextEntries.map((entry) => entry.line).join('\n'),
    new_text: newEntries.map((entry) => entry.line).join('\n'),
    context_message_count:
      contextEntries.filter((entry) => entry.kind === 'message').length,
    new_message_count:
      newEntries.filter((entry) => entry.kind === 'message').length,
  }
}
