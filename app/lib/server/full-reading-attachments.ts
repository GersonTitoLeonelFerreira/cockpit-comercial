// Rodada 11 (HML), item B: "Incluir na leitura".
//
// Só com a leitura completa ligada (COMPANION_FULL_READING_PANEL=on e
// VERCEL_ENV=preview). O vendedor pede para incluir um arquivo da conversa;
// a extensão obtém o arquivo (WhatsApp: pela própria página; ManyChat: pelo
// domínio de arquivos do ManyChat) e manda os bytes. O servidor nunca baixa
// um endereço: só recebe o arquivo, confere tipo, tamanho e páginas, pede
// ao modelo um resumo factual (uma vez só por arquivo) e guarda SÓ o resumo
// em companion_conversation_attachments. O arquivo não é guardado.
//
// A tabela vem da migração 20261003100000 (já aplicada). Defesa: sem a
// tabela, nada é chamado e a rota responde que a inclusão não está
// disponível agora.

import type {
  SupabaseClient,
} from '@supabase/supabase-js'

import {
  ATTACHMENT_LIMITS,
  attachmentKindFromName,
  isIncludableAttachmentKind,
  type AttachmentKind,
} from '../companion/full-reading/attachments'

import {
  ClaudeProviderError,
  callClaudeReading,
} from '../companion/full-reading/anthropic-client'

export const ATTACHMENTS_TABLE =
  'companion_conversation_attachments'

// Modelo mais barato da Anthropic que lê imagem e PDF, pela documentação
// atual: Claude Haiku 4.5. Configurável (COMPANION_ATTACHMENT_SUMMARY_MODEL).
export const DEFAULT_ATTACHMENT_SUMMARY_MODEL =
  'claude-haiku-4-5'

export function resolveAttachmentSummaryModel(
  env: Record<string, string | undefined> = process.env,
): string {
  const value =
    env.COMPANION_ATTACHMENT_SUMMARY_MODEL?.trim()

  return value && /^[a-z0-9][a-z0-9.-]{2,80}$/i.test(value)
    ? value
    : DEFAULT_ATTACHMENT_SUMMARY_MODEL
}

export const ATTACHMENT_SUMMARY_MAX_CHARS =
  1200

// Um pedido "resumindo" vale por 2 minutos; depois disso a rota caiu no
// meio e o vendedor pode tentar de novo.
export const ATTACHMENT_IN_PROGRESS_MS =
  2 * 60_000

// Rodada 12 (A4): imagem com menos de 5 KB é a prévia (miniatura) do
// WhatsApp, não a foto: recusada antes do resumo, sem custo e fora do teto
// diário. Um "incluido" antigo abaixo disso vale como falha.
export const IMAGE_MIN_BYTES =
  5 * 1024

export const IMAGE_LOW_RESOLUTION_FAILURE =
  'imagem_baixa_resolucao'

// Rodada 12 (A5): o modelo disse que não dá para ler o arquivo.
export const UNREADABLE_FAILURE =
  'arquivo_ilegivel'

export const PHOTO_NOT_LOADED_MESSAGE =
  'A foto ainda não carregou no WhatsApp. Abra a foto na conversa e clique em Incluir de novo.'

export const UNREADABLE_MESSAGE =
  'Não deu para ler o arquivo. Abra no WhatsApp e tente de novo.'

export type AttachmentStatus =
  'resumindo' | 'incluido' | 'falhou'

export type AttachmentRecord = {
  message_key: string
  kind: AttachmentKind
  file_name: string | null
  size_bytes?: number | null
  status: AttachmentStatus
  summary: string | null
  failure_code: string | null
  requested_at: string | null
  summarized_at: string | null
}

export class AttachmentIncludeError extends Error {
  code: string
  status: number

  constructor({
    code,
    status,
    message,
  }: {
    code: string
    status: number
    message: string
  }) {
    super(message)
    this.name = 'AttachmentIncludeError'
    this.code = code
    this.status = status
  }
}

// Tabela ausente (defesa: banco sem a migração 20261003100000).
function isMissingTableError(
  error: { code?: unknown; message?: unknown } | null | undefined,
): boolean {
  const code =
    typeof error?.code === 'string' ? error.code : ''

  const message =
    typeof error?.message === 'string' ? error.message : ''

  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    /could not find the table|does not exist/i.test(message)
  )
}

function text(
  value: unknown,
): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : null
}

const STATUSES =
  new Set<AttachmentStatus>(['resumindo', 'incluido', 'falhou'])

function toRecord(
  row: Record<string, unknown>,
): AttachmentRecord | null {
  const messageKey =
    text(row.message_key)

  const status =
    text(row.status) as AttachmentStatus | null

  const kind =
    text(row.kind)

  if (!messageKey || !status || !STATUSES.has(status) || !kind) {
    return null
  }

  return {
    message_key: messageKey,
    kind:
      kind === 'imagem' || kind === 'pdf' || kind === 'documento'
        ? kind
        : 'documento',
    file_name: text(row.file_name),
    size_bytes:
      typeof row.size_bytes === 'number' ? row.size_bytes : null,
    status,
    summary: text(row.summary),
    failure_code: text(row.failure_code),
    requested_at: text(row.requested_at),
    summarized_at: text(row.summarized_at),
  }
}

// Registros da conversa. Sem a tabela (ou com erro), lista vazia e
// available=false: o painel mostra os arquivos sem o botão funcionar.
export async function loadConversationAttachments({
  admin,
  companyId,
  conversationKey,
}: {
  admin: SupabaseClient
  companyId: string
  conversationKey: string
}): Promise<{
  available: boolean
  records: AttachmentRecord[]
}> {
  try {
    const { data, error } =
      await admin
        .from(ATTACHMENTS_TABLE)
        .select('message_key, kind, file_name, size_bytes, status, summary, failure_code, requested_at, summarized_at')
        .eq('company_id', companyId)
        .eq('conversation_key', conversationKey)
        .limit(200)

    if (error) {
      return { available: false, records: [] }
    }

    return {
      available: true,
      records:
        ((data ?? []) as Record<string, unknown>[])
          .map(toRecord)
          .filter((record): record is AttachmentRecord => record !== null),
    }
  } catch {
    return { available: false, records: [] }
  }
}

// Rodada 12 (A4): imagem "incluida" abaixo do mínimo (a prévia) não vale.
export function isLowResolutionImage(
  record: { kind?: unknown; size_bytes?: unknown },
): boolean {
  return (
    record.kind === 'imagem' &&
    typeof record.size_bytes === 'number' &&
    record.size_bytes < IMAGE_MIN_BYTES
  )
}

// Resumos que já existiam no momento de referência de uma leitura.
export function attachmentSummariesAt(
  records: AttachmentRecord[],
  referenceTime: string,
): Map<string, string> {
  const limit =
    Date.parse(referenceTime)

  const map =
    new Map<string, string>()

  for (const record of records) {
    const at =
      record.summarized_at ? Date.parse(record.summarized_at) : NaN

    if (
      record.status === 'incluido' &&
      record.summary &&
      !isLowResolutionImage(record) &&
      !Number.isNaN(at) &&
      (Number.isNaN(limit) || at <= limit)
    ) {
      map.set(record.message_key, record.summary)
    }
  }

  return map
}

// Resumos pedidos hoje (Brasília) na empresa: contam no teto diário.
export async function countAttachmentSummariesSince({
  admin,
  companyId,
  since,
}: {
  admin: SupabaseClient
  companyId: string
  since: string
}): Promise<number> {
  try {
    const { data, error } =
      await admin
        .from(ATTACHMENTS_TABLE)
        .select('status, input_tokens')
        .eq('company_id', companyId)
        .gte('requested_at', since)
        .limit(500)

    if (error) {
      return 0
    }

    return ((data ?? []) as { status?: unknown; input_tokens?: unknown }[])
      .filter((row) =>
        row.status === 'incluido' ||
        row.status === 'resumindo' ||
        (row.status === 'falhou' && typeof row.input_tokens === 'number'))
      .length
  } catch {
    return 0
  }
}

// ---------------------------------------------------------------------------
// Arquivo recebido
// ---------------------------------------------------------------------------

export type ReceivedAttachment = {
  kind: AttachmentKind
  media_type: string
  bytes: Uint8Array
  page_count: number | null
}

const IMAGE_MEDIA_TYPES =
  new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

const BASE64_PATTERN =
  /^[A-Za-z0-9+/]+={0,2}$/

// Páginas do PDF pelos objetos /Type /Page (sem /Pages).
export function countPdfPages(
  bytes: Uint8Array,
): number {
  const latin =
    Buffer.from(bytes).toString('latin1')

  return (latin.match(/\/Type\s*\/Page(?![a-z])/g) ?? []).length
}

function isPdf(
  bytes: Uint8Array,
): boolean {
  return (
    bytes.length > 4 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  )
}

export function readReceivedAttachment({
  kind,
  mediaType,
  contentBase64,
}: {
  kind: unknown
  mediaType: unknown
  contentBase64: unknown
}): ReceivedAttachment {
  const fail = (code: string, message: string, status = 400): never => {
    throw new AttachmentIncludeError({ code, status, message })
  }

  if (kind !== 'imagem' && kind !== 'pdf' && kind !== 'documento') {
    fail('ATTACHMENT_KIND_INVALID', 'Tipo de arquivo inválido.')
  }

  const safeKind =
    kind as AttachmentKind

  if (!isIncludableAttachmentKind(safeKind)) {
    fail('ATTACHMENT_KIND_NOT_SUPPORTED', 'Só imagem e PDF podem ser incluídos na leitura.')
  }

  if (typeof contentBase64 !== 'string' || contentBase64.length === 0) {
    fail('ATTACHMENT_CONTENT_MISSING', 'O arquivo não chegou.')
  }

  const base64 =
    (contentBase64 as string).replace(/\s+/g, '')

  // Antes de decodificar: base64 ocupa ~4/3 do arquivo.
  if (base64.length > Math.ceil((ATTACHMENT_LIMITS.upload_max_bytes * 4) / 3) + 4) {
    fail('ATTACHMENT_TOO_LARGE', 'O arquivo é grande demais para enviar.', 413)
  }

  if (!BASE64_PATTERN.test(base64)) {
    fail('ATTACHMENT_CONTENT_INVALID', 'O arquivo chegou corrompido.')
  }

  const bytes =
    new Uint8Array(Buffer.from(base64, 'base64'))

  if (bytes.length === 0) {
    fail('ATTACHMENT_CONTENT_INVALID', 'O arquivo chegou corrompido.')
  }

  if (bytes.length > ATTACHMENT_LIMITS.upload_max_bytes) {
    fail('ATTACHMENT_TOO_LARGE', 'O arquivo é grande demais para enviar.', 413)
  }

  if (safeKind === 'pdf') {
    if (!isPdf(bytes)) {
      fail('ATTACHMENT_CONTENT_INVALID', 'O arquivo não é um PDF.')
    }

    const pages =
      countPdfPages(bytes)

    if (pages > ATTACHMENT_LIMITS.pdf_max_pages) {
      fail('ATTACHMENT_TOO_MANY_PAGES', `O PDF tem mais de ${ATTACHMENT_LIMITS.pdf_max_pages} páginas.`, 413)
    }

    return {
      kind: 'pdf',
      media_type: 'application/pdf',
      bytes,
      page_count: pages || null,
    }
  }

  const media =
    typeof mediaType === 'string'
      ? mediaType.split(';')[0].trim().toLowerCase()
      : ''

  if (!IMAGE_MEDIA_TYPES.has(media)) {
    fail('ATTACHMENT_CONTENT_INVALID', 'Formato de imagem não aceito.')
  }

  return {
    kind: 'imagem',
    media_type: media,
    bytes,
    page_count: null,
  }
}

// ---------------------------------------------------------------------------
// Resumo
// ---------------------------------------------------------------------------

export const ATTACHMENT_SUMMARY_SYSTEM_PROMPT = [
  'Você resume um arquivo que apareceu numa conversa de vendas, para o vendedor entender o que o arquivo traz.',
  '',
  'A primeira linha da resposta é só uma destas: LEGIVEL: sim, LEGIVEL: parcial ou LEGIVEL: nao. Use nao quando não der para ler o conteúdo (foto borrada, pequena demais, escura ou cortada); nesse caso não escreva mais nada. Depois da primeira linha, o resumo.',
  '',
  'Escreva em português do Brasil, em texto corrido, no máximo 5 frases curtas:',
  '- o que é o arquivo (ex.: proposta, comprovante, print de conversa, print de e-mail, foto de produto, contrato, boleto);',
  '- datas, valores, prazos, nomes de plano, produto ou serviço que aparecem nele;',
  '- o que importa para a conversa de vendas.',
  '',
  'Regras:',
  '- Só o que está no arquivo. Não invente nem complete o que não dá para ler; se algo estiver ilegível, diga que está ilegível.',
  "- Em confirmações, promessas, prazos e valores, cite a frase do arquivo entre aspas simples, do jeito que está escrita, sem interpretar abreviações nem expressões (um prazo escrito 'até o fim do mês' fica assim, entre aspas simples).",
  '- Nunca escreva CPF, RG, CNH, CNPJ, número de documento, número de cartão, código de segurança, dados bancários (agência, conta, chave Pix), senha nem código de barras. Se aparecerem, diga só que o arquivo traz esse tipo de dado, sem o número.',
  '- Não escreva endereço completo nem telefone; o bairro e a cidade bastam.',
  '- Sem markdown, sem listas, sem títulos.',
].join('\n')

// Defesa extra: números com formato de documento ou cartão saem do resumo.
export function redactSensitiveNumbers(
  value: string,
): string {
  return value
    // CPF e CNPJ (com ou sem pontuação).
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[dado pessoal omitido]')
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '[dado pessoal omitido]')
    // Cartão (13 a 19 dígitos, com espaços ou traços).
    .replace(/\b(?:\d[ -]?){12,18}\d\b/g, '[dado pessoal omitido]')
    // Agência/conta.
    .replace(/\b(ag[eê]ncia|ag\.?|conta(?:\s+corrente)?|c\/c)\s*:?\s*[\d.-]{3,}/gi, '$1 [dado bancário omitido]')
}

export type AttachmentLegibility =
  'sim' | 'parcial' | 'nao'

// Rodada 12 (A5): a primeira linha "LEGIVEL: ..." sai do resumo. Sem ela,
// vale "sim".
export function splitLegibilityLine(
  value: string,
): {
  legibility: AttachmentLegibility
  text: string
} {
  const lines =
    value.replace(/\r\n?/g, '\n').split('\n')

  const firstIndex =
    lines.findIndex((line) => line.trim().length > 0)

  const match =
    firstIndex >= 0
      ? lines[firstIndex].trim().replace(/[*_`]/g, '').match(/^LEG[IÍ]VEL\s*:\s*(sim|parcial|n[aã]o)\b\.?$/i)
      : null

  if (!match) {
    return { legibility: 'sim', text: value }
  }

  const word =
    match[1].toLowerCase()

  return {
    legibility:
      word === 'parcial'
        ? 'parcial'
        : word === 'sim'
          ? 'sim'
          : 'nao',
    text:
      lines.slice(firstIndex + 1).join('\n'),
  }
}

export function normalizeAttachmentSummary(
  value: string,
): string {
  const clean =
    redactSensitiveNumbers(
      value
        .replace(/[#*_`>]+/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )

  return clean.length > ATTACHMENT_SUMMARY_MAX_CHARS
    ? `${clean.slice(0, ATTACHMENT_SUMMARY_MAX_CHARS - 1).trimEnd()}…`
    : clean
}

export async function summarizeAttachment({
  attachment,
  fileName,
  apiKey,
  model,
  fetchImpl,
  logger,
}: {
  attachment: ReceivedAttachment
  fileName: string | null
  apiKey: string
  model: string
  fetchImpl?: typeof fetch
  logger?: (line: string) => void
}): Promise<{
  summary: string
  legibility: AttachmentLegibility
  model: string
  input_tokens: number | null
  output_tokens: number | null
}> {
  const data =
    Buffer.from(attachment.bytes).toString('base64')

  const block =
    attachment.kind === 'pdf'
      ? {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data },
        }
      : {
          type: 'image',
          source: { type: 'base64', media_type: attachment.media_type, data },
        }

  const response =
    await callClaudeReading({
      apiKey,
      model,
      system: ATTACHMENT_SUMMARY_SYSTEM_PROMPT,
      userText:
        fileName
          ? `Resuma este arquivo (${attachmentKindFromName(fileName) === 'pdf' ? 'PDF' : 'arquivo'} "${fileName.replace(/["\n]/g, ' ')}").`
          : 'Resuma este arquivo.',
      userContent: [block],
      thinking: 'off',
      maxTokens: 600,
      effort: null,
      outputSchema: null,
      timeoutMs: 60_000,
      fetchImpl,
      logger,
      usageLog: {
        route: '/api/companion/full-reading/attachments',
        purpose: 'attachment_summary',
      },
    })

  const { legibility, text: body } =
    splitLegibilityLine(response.text)

  const summary =
    legibility === 'nao'
      ? ''
      : normalizeAttachmentSummary(body)

  if (!summary && legibility !== 'nao') {
    throw new ClaudeProviderError({
      code: 'EMPTY_PROVIDER_RESPONSE',
      message: 'O modelo não devolveu o resumo.',
    })
  }

  return {
    summary,
    legibility,
    model: response.model ?? model,
    input_tokens: response.input_tokens,
    output_tokens: response.output_tokens,
  }
}

// ---------------------------------------------------------------------------
// Inclusão (rota)
// ---------------------------------------------------------------------------

export type IncludeAttachmentInput = {
  admin: SupabaseClient
  scope: {
    company_id: string
    cycle_id: string
    conversation_key: string
  }
  userId: string
  messageKey: unknown
  fileName: unknown
  sizeBytes: unknown
  kind: unknown
  mediaType: unknown
  contentBase64: unknown
  apiKey: string
  model: string
  dailyCap: number
  since: string
  countRunsToday: () => Promise<number>
  fetchImpl?: typeof fetch
  now?: () => string
}

export type IncludeAttachmentResult = {
  status: 'incluido' | 'ja_incluido'
  message_key: string
  summary: string
}

function normalizeMessageKey(
  value: unknown,
): string {
  const key =
    typeof value === 'string' ? value.trim() : ''

  if (!key || key.length > 500) {
    throw new AttachmentIncludeError({
      code: 'ATTACHMENT_MESSAGE_INVALID',
      status: 400,
      message: 'Arquivo não identificado.',
    })
  }

  return key
}

export async function includeConversationAttachment(
  input: IncludeAttachmentInput,
): Promise<IncludeAttachmentResult> {
  const now =
    input.now ?? (() => new Date().toISOString())

  const messageKey =
    normalizeMessageKey(input.messageKey)

  const attachment =
    readReceivedAttachment({
      kind: input.kind,
      mediaType: input.mediaType,
      contentBase64: input.contentBase64,
    })

  // A mensagem precisa existir no ledger desta conversa (não se inclui
  // arquivo de outra conversa nem inventado).
  const { data: ledgerRows, error: ledgerError } =
    await input.admin
      .from('conversation_messages')
      .select('message_key')
      .eq('company_id', input.scope.company_id)
      .eq('conversation_key', input.scope.conversation_key)
      .eq('message_key', messageKey)
      .limit(1)

  if (ledgerError) {
    throw new AttachmentIncludeError({
      code: 'ATTACHMENT_LOOKUP_FAILED',
      status: 500,
      message: 'Não consegui conferir o arquivo agora.',
    })
  }

  if (!Array.isArray(ledgerRows) || ledgerRows.length === 0) {
    throw new AttachmentIncludeError({
      code: 'ATTACHMENT_MESSAGE_NOT_FOUND',
      status: 404,
      message: 'Este arquivo ainda não chegou à Yolen. Tente de novo em instantes.',
    })
  }

  // Tabela (migração) e registro existente: resumo é feito uma vez só.
  const { data: existingRows, error: existingError } =
    await input.admin
      .from(ATTACHMENTS_TABLE)
      .select('id, status, summary, requested_at, kind, size_bytes')
      .eq('company_id', input.scope.company_id)
      .eq('conversation_key', input.scope.conversation_key)
      .eq('message_key', messageKey)
      .limit(1)

  if (existingError) {
    if (isMissingTableError(existingError)) {
      throw new AttachmentIncludeError({
        code: 'ATTACHMENTS_UNAVAILABLE',
        status: 409,
        message: 'A inclusão de arquivos não está disponível agora.',
      })
    }

    throw new AttachmentIncludeError({
      code: 'ATTACHMENT_LOOKUP_FAILED',
      status: 500,
      message: 'Não consegui conferir o arquivo agora.',
    })
  }

  const existing =
    (existingRows ?? [])[0] as { id?: unknown; status?: unknown; summary?: unknown; requested_at?: unknown; kind?: unknown; size_bytes?: unknown } | undefined

  // Rodada 12 (A4): "incluido" antigo com a prévia da foto vale como falha
  // (pode incluir de novo; a linha é atualizada).
  if (
    existing?.status === 'incluido' &&
    typeof existing.summary === 'string' &&
    !isLowResolutionImage(existing)
  ) {
    return {
      status: 'ja_incluido',
      message_key: messageKey,
      summary: existing.summary,
    }
  }

  if (
    existing?.status === 'resumindo' &&
    typeof existing.requested_at === 'string' &&
    Date.parse(now()) - Date.parse(existing.requested_at) < ATTACHMENT_IN_PROGRESS_MS
  ) {
    throw new AttachmentIncludeError({
      code: 'ATTACHMENT_IN_PROGRESS',
      status: 409,
      message: 'Este arquivo já está sendo lido.',
    })
  }

  const writeRow = (values: Record<string, unknown>) =>
    existing
      ? input.admin
          .from(ATTACHMENTS_TABLE)
          .update(values)
          .eq('company_id', input.scope.company_id)
          .eq('conversation_key', input.scope.conversation_key)
          .eq('message_key', messageKey)
      : input.admin
          .from(ATTACHMENTS_TABLE)
          .insert(values)

  const fileNameValue =
    typeof input.fileName === 'string' && input.fileName.trim()
      ? input.fileName.trim().slice(0, 300)
      : null

  // Rodada 12 (A4): a prévia da foto (menos de 5 KB) é recusada antes do
  // resumo: sem chamada, sem custo e fora do teto diário.
  if (attachment.kind === 'imagem' && attachment.bytes.length < IMAGE_MIN_BYTES) {
    await writeRow({
      company_id: input.scope.company_id,
      cycle_id: input.scope.cycle_id,
      conversation_key: input.scope.conversation_key,
      message_key: messageKey,
      kind: attachment.kind,
      file_name: fileNameValue,
      size_bytes: attachment.bytes.length,
      page_count: null,
      status: 'falhou',
      summary: null,
      failure_code: IMAGE_LOW_RESOLUTION_FAILURE,
      model: null,
      input_tokens: null,
      output_tokens: null,
      included_by: input.userId,
      requested_at: now(),
      summarized_at: null,
    })

    throw new AttachmentIncludeError({
      code: 'ATTACHMENT_IMAGE_LOW_RESOLUTION',
      status: 422,
      message: PHOTO_NOT_LOADED_MESSAGE,
    })
  }

  // Teto diário: leituras de hoje + resumos de arquivo de hoje.
  const used =
    (await input.countRunsToday()) +
    (await countAttachmentSummariesSince({
      admin: input.admin,
      companyId: input.scope.company_id,
      since: input.since,
    }))

  if (used >= input.dailyCap) {
    throw new AttachmentIncludeError({
      code: 'DAILY_CAP_REACHED',
      status: 429,
      message: 'Limite diário de leituras atingido.',
    })
  }

  const fileName =
    fileNameValue

  const sizeBytes =
    Number.isInteger(input.sizeBytes) && (input.sizeBytes as number) >= 0
      ? (input.sizeBytes as number)
      : attachment.bytes.length

  const base = {
    company_id: input.scope.company_id,
    cycle_id: input.scope.cycle_id,
    conversation_key: input.scope.conversation_key,
    message_key: messageKey,
    kind: attachment.kind,
    file_name: fileName,
    size_bytes: sizeBytes,
    page_count: attachment.page_count,
    status: 'resumindo',
    summary: null,
    failure_code: null,
    model: input.model,
    included_by: input.userId,
    requested_at: now(),
    summarized_at: null,
  }

  const { error: claimError } =
    await writeRow(base)

  if (claimError) {
    throw new AttachmentIncludeError({
      code:
        isMissingTableError(claimError)
          ? 'ATTACHMENTS_UNAVAILABLE'
          : 'ATTACHMENT_SAVE_FAILED',
      status:
        isMissingTableError(claimError) ? 409 : 500,
      message:
        isMissingTableError(claimError)
          ? 'A inclusão de arquivos não está disponível agora.'
          : 'Não consegui registrar o arquivo agora.',
    })
  }

  const finish = (values: Record<string, unknown>) =>
    input.admin
      .from(ATTACHMENTS_TABLE)
      .update(values)
      .eq('company_id', input.scope.company_id)
      .eq('conversation_key', input.scope.conversation_key)
      .eq('message_key', messageKey)

  try {
    const result =
      await summarizeAttachment({
        attachment,
        fileName,
        apiKey: input.apiKey,
        model: input.model,
        fetchImpl: input.fetchImpl,
      })

    // Rodada 12 (A5): ilegível — falha, sem resumo para a leitura; conta no
    // teto diário (houve chamada).
    if (result.legibility === 'nao') {
      await finish({
        status: 'falhou',
        failure_code: UNREADABLE_FAILURE,
        summary: null,
        model: result.model,
        input_tokens: result.input_tokens,
        output_tokens: result.output_tokens,
        summarized_at: null,
      })

      throw new AttachmentIncludeError({
        code: 'ATTACHMENT_UNREADABLE',
        status: 422,
        message: UNREADABLE_MESSAGE,
      })
    }

    const { error: saveError } =
      await finish({
        status: 'incluido',
        summary: result.summary,
        model: result.model,
        input_tokens: result.input_tokens,
        output_tokens: result.output_tokens,
        summarized_at: now(),
      })

    if (saveError) {
      throw new AttachmentIncludeError({
        code: 'ATTACHMENT_SAVE_FAILED',
        status: 500,
        message: 'Não consegui registrar o resumo agora.',
      })
    }

    return {
      status: 'incluido',
      message_key: messageKey,
      summary: result.summary,
    }
  } catch (error) {
    if (error instanceof AttachmentIncludeError) {
      throw error
    }

    const code =
      error instanceof ClaudeProviderError ? error.code : 'ATTACHMENT_SUMMARY_FAILED'

    await finish({
      status: 'falhou',
      failure_code: code.slice(0, 80),
    })

    throw new AttachmentIncludeError({
      code,
      status: 502,
      message: 'Não consegui ler o arquivo agora.',
    })
  }
}
