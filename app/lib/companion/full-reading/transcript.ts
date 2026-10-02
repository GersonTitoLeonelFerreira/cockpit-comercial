// Leitura completa — transcrição legível da conversa inteira.
//
// Transforma o ledger canônico (última versão de cada mensagem) num texto
// cronológico que um modelo com raciocínio consegue ler do começo ao fim:
//
//   [23/09/2026 11:08] VENDEDOR: texto
//   [23/09/2026 11:09] CLIENTE: texto
//
// Regras:
// - Ordem: horário da mensagem e, no mesmo horário, a ordem de ingestão.
//   A captura grava o horário com precisão de minuto; dentro do mesmo
//   minuto a ordem pode não ser a real (o prompt avisa o modelo disso).
// - Exclusão explícita confirmada pelo WhatsApp vira "[mensagem apagada]".
// - Sumiço do DOM (rolagem/virtualização do WhatsApp Web) NÃO é exclusão:
//   se ainda houver texto, a mensagem entra normalmente; sem texto, sai.
// - Áudio entra pela transcrição; mídia sem texto vira um marcador.
// - Nada é inventado: o texto é o capturado, só com as quebras de linha
//   trocadas por " / " para manter uma mensagem por linha.
// - Rodada 9: evento interno do ManyChat gravado como mensagem do robô não
//   é mensagem. Os úteis (atribuição, conversa fechada ou reaberta,
//   automação pausada) viram uma linha EVENTO, sem autoria; os outros ficam
//   fora. Evento nunca conta como mensagem.

import {
  classifyLedgerEvent,
  type LedgerEventKind,
} from './conversation-events'

import type {
  NormalizedLedgerAuthorKind,
  NormalizedLedgerMessage,
} from '../stateful-copilot-real-context-loader'

export const FULL_READING_TRANSCRIPT_TIME_ZONE =
  'America/Sao_Paulo'

// Teto de segurança (~75 mil tokens). As conversas reais hoje ficam muito
// abaixo disso; acima do teto, as mensagens mais antigas são omitidas e o
// corte é declarado no próprio texto.
export const FULL_READING_TRANSCRIPT_MAX_CHARS =
  300_000

export type FullReadingTranscriptMessage = Pick<
  NormalizedLedgerMessage,
  | 'id'
  | 'direction'
  | 'author_kind'
  | 'occurred_at'
  | 'content_type'
  | 'text_content'
  | 'audio_transcription'
  | 'is_deleted'
  | 'deletion_reason'
> & {
  message_key?: string
}

// Marco que não é mensagem (ex.: "Nova oportunidade aberta em ..."): entra
// na ordem do tempo, numa linha própria, e não conta como mensagem.
export type FullReadingTranscriptMarker = {
  occurred_at: string
  text: string
}

export type FullReadingTranscript = {
  text: string
  message_count: number
  omitted_message_count: number
  first_message_at: string | null
  last_message_at: string | null
}

function normalizeWhitespace(
  value: string,
): string {
  return value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join(' / ')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

function readText(
  value: string | null,
): string {
  if (typeof value !== 'string') {
    return ''
  }

  return normalizeWhitespace(value)
}

export function formatTranscriptTimestamp(
  isoTimestamp: string,
  timeZone: string =
    FULL_READING_TRANSCRIPT_TIME_ZONE,
): string {
  const date =
    new Date(isoTimestamp)

  if (Number.isNaN(date.getTime())) {
    return 'horário desconhecido'
  }

  const parts =
    new Intl.DateTimeFormat(
      'pt-BR',
      {
        timeZone,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      },
    ).formatToParts(date)

  const part = (
    type: Intl.DateTimeFormatPartTypes,
  ): string =>
    parts.find(
      (item) => item.type === type,
    )?.value ?? ''

  return `${part('day')}/${part('month')}/${part('year')} ${part('hour')}:${part('minute')}`
}

function authorLabel(
  authorKind: NormalizedLedgerAuthorKind,
  direction: string,
): string {
  switch (authorKind) {
    case 'customer':
      return 'CLIENTE'
    case 'human_agent':
      return 'VENDEDOR'
    case 'automation':
      return 'AUTOMAÇÃO'
    default:
      return direction === 'incoming'
        ? 'CLIENTE (autoria incerta)'
        : 'EMPRESA (autoria incerta)'
  }
}

// Retorna o conteúdo da linha ou null quando a mensagem deve ficar de fora.
export function describeMessageContent(
  message: FullReadingTranscriptMessage,
): string | null {
  const text =
    readText(message.text_content)

  const transcription =
    readText(message.audio_transcription)

  if (message.is_deleted) {
    if (
      message.deletion_reason ===
      'explicit_deletion'
    ) {
      return '[mensagem apagada]'
    }

    // Sumiço do DOM não prova exclusão: mantém o que foi capturado.
    if (text.length === 0 && transcription.length === 0) {
      return null
    }
  }

  const contentType =
    (message.content_type || 'text').toLowerCase()

  if (contentType === 'audio') {
    if (transcription.length > 0) {
      return `[áudio] ${transcription}`
    }

    return text.length > 0
      ? `[áudio] ${text}`
      : '[áudio sem transcrição]'
  }

  if (text.length === 0) {
    return transcription.length > 0
      ? `[áudio] ${transcription}`
      : '[mídia ou mensagem sem texto capturado]'
  }

  if (contentType !== 'text') {
    return `[${contentType}] ${text}`
  }

  return text
}

function compareMessages(
  left: FullReadingTranscriptMessage,
  right: FullReadingTranscriptMessage,
): number {
  const leftTime =
    Date.parse(left.occurred_at)

  const rightTime =
    Date.parse(right.occurred_at)

  const safeLeft =
    Number.isNaN(leftTime) ? 0 : leftTime

  const safeRight =
    Number.isNaN(rightTime) ? 0 : rightTime

  if (safeLeft !== safeRight) {
    return safeLeft - safeRight
  }

  return left.id.localeCompare(
    right.id,
    'en',
    { numeric: true },
  )
}

// Linha da transcrição: mensagem, evento do atendimento ou marco.
export type FullReadingTranscriptEntry = {
  line: string
  occurred_at: string
  kind: 'message' | 'event' | 'marker'
  event_kind?: LedgerEventKind
  message?: FullReadingTranscriptMessage
}

function isOpenCloseEvent(
  kind: LedgerEventKind | undefined,
): boolean {
  return kind === 'closed' || kind === 'reopened'
}

// Linhas em ordem do tempo. describe permite marcar a linha (leitura de
// continuação: "(atualizada)").
export function buildFullReadingTranscriptEntries(
  messages: FullReadingTranscriptMessage[],
  options: {
    timeZone?: string
    markers?: FullReadingTranscriptMarker[]
    decorate?: (message: FullReadingTranscriptMessage, content: string) => string
  } = {},
): FullReadingTranscriptEntry[] {
  const timeZone =
    options.timeZone ??
    FULL_READING_TRANSCRIPT_TIME_ZONE

  const ordered =
    [...messages].sort(compareMessages)

  const entries: FullReadingTranscriptEntry[] = []

  for (const message of ordered) {
    const event =
      classifyLedgerEvent(message)

    if (event) {
      if (!event.text || message.is_deleted) {
        continue
      }

      // Fechada/reaberta seguidas (sem mensagem no meio): só a última.
      const previous =
        entries[entries.length - 1]

      if (
        isOpenCloseEvent(event.kind) &&
        previous?.kind === 'event' &&
        isOpenCloseEvent(previous.event_kind)
      ) {
        entries.pop()
      }

      entries.push({
        line: `[${formatTranscriptTimestamp(message.occurred_at, timeZone)}] EVENTO: ${event.text}`,
        occurred_at: message.occurred_at,
        kind: 'event',
        event_kind: event.kind,
        message,
      })

      continue
    }

    const content =
      describeMessageContent(message)

    if (content === null) {
      continue
    }

    const shown =
      options.decorate
        ? options.decorate(message, content)
        : content

    entries.push({
      line: `[${formatTranscriptTimestamp(message.occurred_at, timeZone)}] ${authorLabel(message.author_kind, message.direction)}: ${shown}`,
      occurred_at: message.occurred_at,
      kind: 'message',
      message,
    })
  }

  // Marcos entram depois das mensagens do mesmo instante (ou antes da
  // primeira mensagem posterior a eles).
  for (const marker of options.markers ?? []) {
    const markerTime =
      Date.parse(marker.occurred_at)

    const text =
      readText(marker.text)

    if (Number.isNaN(markerTime) || !text) {
      continue
    }

    const index =
      entries.findIndex(
        (item) => Date.parse(item.occurred_at) > markerTime,
      )

    const entry: FullReadingTranscriptEntry = {
      line: `[${formatTranscriptTimestamp(marker.occurred_at, timeZone)}] —— ${text} ——`,
      occurred_at: marker.occurred_at,
      kind: 'marker',
    }

    if (index === -1) {
      entries.push(entry)
    } else {
      entries.splice(index, 0, entry)
    }
  }

  return entries
}

export function buildFullReadingTranscript(
  messages: FullReadingTranscriptMessage[],
  options: {
    timeZone?: string
    maxChars?: number
    markers?: FullReadingTranscriptMarker[]
  } = {},
): FullReadingTranscript {
  const maxChars =
    options.maxChars ??
    FULL_READING_TRANSCRIPT_MAX_CHARS

  const lines =
    buildFullReadingTranscriptEntries(messages, {
      timeZone: options.timeZone,
      markers: options.markers,
    })

  // Mantém as mensagens mais recentes quando a conversa passa do teto.
  let totalChars = 0
  let startIndex = lines.length

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const nextTotal =
      totalChars + lines[index].line.length + 1

    if (nextTotal > maxChars) {
      break
    }

    totalChars = nextTotal
    startIndex = index
  }

  const kept =
    lines.slice(startIndex)

  const keptMessages =
    kept.filter((item) => item.kind === 'message')

  const omitted =
    lines.filter((item) => item.kind === 'message').length - keptMessages.length

  const body =
    kept.map((item) => item.line).join('\n')

  const text =
    omitted > 0
      ? `[${omitted} mensagens mais antigas foram omitidas por tamanho]\n${body}`
      : body

  return {
    text,
    message_count: keptMessages.length,
    omitted_message_count: omitted,
    first_message_at:
      keptMessages[0]?.occurred_at ?? null,
    last_message_at:
      keptMessages[keptMessages.length - 1]?.occurred_at ?? null,
  }
}
