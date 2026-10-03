// Rodada 11 (HML), item B2: arquivos no painel.
//
// - ANÁLISE: "Arquivos na conversa (N)", com "Incluir na leitura" em cada
//   imagem ou PDF ainda não incluído.
// - AGORA: quando a leitura sugere incluir um arquivo (arquivos_sugeridos),
//   uma linha curta: "A leitura sugere incluir: PDF de 01/10 16:59 —
//   <motivo>".
//
// Textos sem código interno. Os limites (B4) aparecem antes do envio
// quando o tamanho ou as páginas estão no cartão do arquivo; a extensão
// confere de novo com o arquivo na mão.

import {
  ATTACHMENT_LIMITS,
  isIncludableAttachmentKind,
  type AttachmentKind,
} from '../companion/full-reading/attachments'

import {
  formatTranscriptTimestamp,
} from '../companion/full-reading/transcript'

export type FullReadingAttachmentInput = {
  message_key: string
  ref: string
  kind: AttachmentKind
  name: string | null
  size_label: string | null
  pages: number | null
  occurred_at: string
  from: 'cliente' | 'vendedor' | 'automacao'
  status: 'nao_incluido' | 'resumindo' | 'incluido' | 'falhou'
}

export type FullReadingAttachmentItemView = {
  message_key: string
  kind: AttachmentKind
  kind_label: string
  name: string | null
  when_label: string
  from_label: string
  size_label: string | null
  status: FullReadingAttachmentInput['status']
  status_text: string | null
  can_include: boolean
  include_label: string | null
}

export type FullReadingAttachmentsView = {
  title: string
  items: FullReadingAttachmentItemView[]
  note: string | null
}

export type FullReadingAttachmentSuggestionView = {
  message_key: string
  kind: AttachmentKind
  text: string
  can_include: boolean
}

const KIND_LABELS: Record<AttachmentKind, string> = {
  imagem: 'Imagem',
  pdf: 'PDF',
  documento: 'Documento',
}

const FROM_LABELS: Record<FullReadingAttachmentInput['from'], string> = {
  cliente: 'Cliente',
  vendedor: 'Vendedor',
  automacao: 'Automação',
}

export const ATTACHMENTS_UNAVAILABLE_NOTE =
  'A inclusão de arquivos ainda não está disponível.'

function whenLabel(
  occurredAt: string,
): string {
  const [day, time] =
    formatTranscriptTimestamp(occurredAt).split(' ')

  return day && time
    ? `${day.slice(0, 5)} ${time}`
    : ''
}

// "1,2 MB" → bytes (aproximado).
export function sizeLabelToBytes(
  label: string | null,
): number | null {
  const match =
    (label ?? '').match(/^(\d+(?:[.,]\d+)?)\s*(bytes|kB|MB|GB)$/i)

  if (!match) {
    return null
  }

  const value =
    Number(match[1].replace(',', '.'))

  const unit =
    match[2].toLowerCase()

  const factor =
    unit === 'gb'
      ? 1024 ** 3
      : unit === 'mb'
        ? 1024 ** 2
        : unit === 'kb'
          ? 1024
          : 1

  return Number.isFinite(value)
    ? Math.round(value * factor)
    : null
}

// Por que o arquivo não pode ser enviado (null quando pode).
export function attachmentLimitText(
  item: Pick<FullReadingAttachmentInput, 'kind' | 'size_label' | 'pages'>,
): string | null {
  if (!isIncludableAttachmentKind(item.kind)) {
    return 'Este tipo de arquivo não pode ser incluído na leitura.'
  }

  const bytes =
    sizeLabelToBytes(item.size_label)

  if (item.kind === 'imagem') {
    return bytes !== null && bytes > ATTACHMENT_LIMITS.image_max_bytes
      ? 'Imagem acima de 5 MB: não é enviada.'
      : null
  }

  if (item.pages !== null && item.pages > ATTACHMENT_LIMITS.pdf_max_pages) {
    return `PDF com mais de ${ATTACHMENT_LIMITS.pdf_max_pages} páginas: não é enviado.`
  }

  if (bytes !== null && bytes > ATTACHMENT_LIMITS.pdf_max_bytes) {
    return 'PDF acima de 10 MB: não é enviado.'
  }

  if (bytes !== null && bytes > ATTACHMENT_LIMITS.upload_max_bytes) {
    return 'PDF acima de 3 MB: ainda não pode ser enviado.'
  }

  return null
}

function statusText(
  item: FullReadingAttachmentInput,
  limit: string | null,
): string | null {
  switch (item.status) {
    case 'incluido':
      return 'Incluído na leitura'
    case 'resumindo':
      return 'Lendo o arquivo…'
    case 'falhou':
      return limit ?? 'Não consegui ler o arquivo.'
    default:
      return limit
  }
}

export function buildAttachmentsView({
  attachments,
  available,
}: {
  attachments: FullReadingAttachmentInput[]
  available: boolean
}): FullReadingAttachmentsView | null {
  if (attachments.length === 0) {
    return null
  }

  const items =
    attachments.map((item) => {
      const limit =
        attachmentLimitText(item)

      const canInclude =
        available &&
        limit === null &&
        (item.status === 'nao_incluido' || item.status === 'falhou')

      return {
        message_key: item.message_key,
        kind: item.kind,
        kind_label: KIND_LABELS[item.kind],
        name: item.name,
        when_label: whenLabel(item.occurred_at),
        from_label: FROM_LABELS[item.from],
        size_label: item.size_label,
        status: item.status,
        status_text: statusText(item, limit),
        can_include: canInclude,
        include_label:
          canInclude
            ? item.status === 'falhou'
              ? 'Tentar de novo'
              : 'Incluir na leitura'
            : null,
      }
    })

  return {
    title: `Arquivos na conversa (${items.length})`,
    items,
    note:
      available || !items.some((item) => isIncludableAttachmentKind(item.kind))
        ? null
        : ATTACHMENTS_UNAVAILABLE_NOTE,
  }
}

export function buildAttachmentSuggestionView({
  suggestions,
  attachments,
  available,
}: {
  suggestions: unknown
  attachments: FullReadingAttachmentInput[]
  available: boolean
}): FullReadingAttachmentSuggestionView | null {
  if (!Array.isArray(suggestions)) {
    return null
  }

  for (const suggestion of suggestions) {
    const ref =
      typeof (suggestion as { ref?: unknown })?.ref === 'string'
        ? (suggestion as { ref: string }).ref
        : ''

    const motivo =
      typeof (suggestion as { motivo?: unknown })?.motivo === 'string'
        ? (suggestion as { motivo: string }).motivo.replace(/\s+/g, ' ').trim()
        : ''

    const item =
      attachments.find((attachment) => attachment.ref === ref)

    if (!item || item.status === 'incluido' || item.status === 'resumindo') {
      continue
    }

    const when =
      whenLabel(item.occurred_at)

    return {
      message_key: item.message_key,
      kind: item.kind,
      text:
        `A leitura sugere incluir: ${KIND_LABELS[item.kind]}${when ? ` de ${when}` : ''}${motivo ? ` — ${motivo}` : ''}`,
      can_include:
        available && attachmentLimitText(item) === null,
    }
  }

  return null
}

export function attachmentsViewKey(
  attachments: FullReadingAttachmentInput[],
): string {
  return attachments
    .map((item) => `${item.ref}:${item.status}`)
    .join(',')
}
