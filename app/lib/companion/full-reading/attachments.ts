// Rodada 11 (HML): arquivos e áudio na leitura completa.
//
// A captura (extensão, só com a leitura completa ligada) grava a mídia no
// ledger como texto com uma marca:
//
//   - áudio: "[duração 0:42]" no texto do áudio;
//   - arquivo: "[Arquivo: Proposta.pdf | tipo: pdf | tamanho: 1,2 MB |
//     páginas: 3]" (imagem sem nome: "[Arquivo | tipo: imagem]"), com a
//     legenda nas linhas de cima. A marca antiga, "[Arquivo: nome]", também
//     vale (o tipo sai da extensão do nome).
//
// A leitura nunca adivinha o conteúdo de um arquivo: ele aparece como
// "[arquivo não incluído: tipo, nome]" até o vendedor pedir "Incluir na
// leitura"; depois, como "[arquivo incluído: <resumo>]". Cada arquivo tem
// uma referência curta e estável (arq-xxxxxx), derivada da chave da
// mensagem, para a leitura sugerir qual incluir sem ver a chave (que, no
// WhatsApp, carrega o telefone).

export const ATTACHMENT_KINDS =
  ['imagem', 'pdf', 'documento'] as const

export type AttachmentKind =
  (typeof ATTACHMENT_KINDS)[number]

// Limites (B4). O envio passa pela rota do Companion, e o corpo de uma
// requisição na Vercel tem teto de ~4,5 MB: em base64 o arquivo enviado
// fica em até 3 MB. A imagem é reduzida na extensão antes de enviar; o PDF
// acima de 3 MB ainda não pode ser enviado.
export const ATTACHMENT_LIMITS = Object.freeze({
  image_max_bytes: 5 * 1024 * 1024,
  pdf_max_bytes: 10 * 1024 * 1024,
  pdf_max_pages: 20,
  upload_max_bytes: 3 * 1024 * 1024,
})

export type ParsedAttachment = {
  kind: AttachmentKind
  name: string | null
  size_label: string | null
  pages: number | null
  caption: string
}

const IMAGE_NAME =
  /\.(?:jpe?g|png|webp|gif|heic|heif|bmp)$/i

export function attachmentKindFromName(
  name: string | null,
): AttachmentKind {
  const value =
    (name ?? '').trim()

  if (/\.pdf$/i.test(value)) {
    return 'pdf'
  }

  return IMAGE_NAME.test(value)
    ? 'imagem'
    : 'documento'
}

const MARKER_LINE =
  /^\[Arquivo(?::\s*([^|\]]*?))?\s*((?:\|[^|\]]*)*)\]$/

export function parseAttachmentMarker(
  text: string | null | undefined,
): ParsedAttachment | null {
  if (typeof text !== 'string' || !text.includes('[Arquivo')) {
    return null
  }

  const lines =
    text
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map((line) => line.trim())

  let markerIndex = -1

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (MARKER_LINE.test(lines[index])) {
      markerIndex = index
      break
    }
  }

  if (markerIndex < 0) {
    return null
  }

  const match =
    lines[markerIndex].match(MARKER_LINE)

  if (!match) {
    return null
  }

  const name =
    (match[1] ?? '').trim() || null

  let kind: AttachmentKind | null = null
  let sizeLabel: string | null = null
  let pages: number | null = null

  for (const part of (match[2] ?? '').split('|')) {
    const [rawKey, ...rest] =
      part.split(':')

    const key =
      (rawKey ?? '').trim().toLowerCase()

    const value =
      rest.join(':').trim()

    if (key === 'tipo' && (ATTACHMENT_KINDS as readonly string[]).includes(value)) {
      kind = value as AttachmentKind
    } else if (key === 'tamanho' && value) {
      sizeLabel = value
    } else if ((key === 'páginas' || key === 'paginas') && /^\d+$/.test(value)) {
      pages = Number(value)
    }
  }

  // Marca antiga ("[Arquivo: nome]") sem nome não é arquivo.
  if (!name && !kind) {
    return null
  }

  return {
    kind: kind ?? attachmentKindFromName(name),
    name,
    size_label: sizeLabel,
    pages,
    caption:
      lines
        .filter((line, index) => index !== markerIndex && line.length > 0)
        .join('\n'),
  }
}

export function attachmentKindLabel(
  kind: AttachmentKind,
): string {
  return kind === 'pdf'
    ? 'PDF'
    : kind
}

// Só imagem e PDF vão para o resumo (o modelo lê os dois); documento de
// outro tipo (planilha, texto do Word) aparece na lista, sem o botão.
export function isIncludableAttachmentKind(
  kind: AttachmentKind,
): boolean {
  return kind === 'imagem' || kind === 'pdf'
}

// Referência curta e estável (FNV-1a de 32 bits, base 36).
export function attachmentRef(
  messageKey: string,
): string {
  let hash = 0x811c9dc5

  for (let index = 0; index < messageKey.length; index += 1) {
    hash ^= messageKey.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }

  return `arq-${hash.toString(36).padStart(6, '0')}`
}

const DURATION_MARKER =
  /^\[duração ((?:\d{1,2}:)?\d{1,3}:[0-5]\d)\]$/

export function parseAudioDurationMarker(
  text: string | null | undefined,
): string | null {
  if (typeof text !== 'string') {
    return null
  }

  const match =
    text.trim().match(DURATION_MARKER)

  return match ? match[1] : null
}

// Conteúdo da linha da transcrição para um arquivo.
export function describeAttachmentLine({
  attachment,
  ref,
  summary,
}: {
  attachment: ParsedAttachment
  ref: string
  summary: string | null
}): string {
  const caption =
    attachment.caption
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join(' / ')

  const head =
    summary
      ? `[arquivo incluído: ${summary.replace(/\s+/g, ' ').trim()}]`
      : `[arquivo não incluído: ${[
          attachmentKindLabel(attachment.kind),
          attachment.name,
        ]
          .filter(Boolean)
          .join(', ')}]`

  return [
    head,
    `(ref: ${ref})`,
    caption ? `Legenda: ${caption}` : '',
  ]
    .filter(Boolean)
    .join(' ')
}
