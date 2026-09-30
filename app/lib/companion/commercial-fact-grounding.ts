// ============================================================================
// Commercial Fact Grounding — firewall de proveniência factual.
//
// UMA política factual para todas as superfícies (Reading persistido, memória,
// Reasoning/AGORA, ANÁLISE, CLIENTE e MENSAGEM):
//
//   CLAIM → SOURCE → AUTHORITY → SUPPORT
//
// Saída derivada (resumo, Commercial Reading, Reasoning, Coaching, memória,
// mensagem gerada pela própria Yolen) NUNCA é evidência primária: ela pode
// interpretar, mas não pode promover a si própria a fato. Um fato específico
// só é afirmado quando existe uma fonte com AUTORIDADE para aquele tipo de
// afirmação:
//
//   - fatos sobre o cliente (relação pessoal, preferência, objeção, decisão,
//     necessidade, o que ele disse)  → fala real do cliente;
//   - fatos sobre a empresa (preço atual, benefício, promoção, condição,
//     disponibilidade institucional) → configuração vigente da própria empresa;
//   - histórico ("naquela conversa foi informado R$ X") → mensagem real, com o
//     enquadramento histórico explícito;
//   - agenda do próprio vendedor → instrução explícita atual do vendedor.
//
// Foto/avatar nunca é fonte factual. Instrução do vendedor controla estilo,
// técnica e objetivo, mas não fabrica fato externo (preço, promoção,
// benefício). Nada aqui chama modelo: é determinístico e auditável.
// ============================================================================

export const FACT_GROUNDING_CONTRACT_VERSION =
  'commercial-fact-grounding-v1'

// ---------------------------------------------------------------------------
// Taxonomia de fontes e autoridade
// ---------------------------------------------------------------------------

export type FactSourceType =
  // PRIMARY CUSTOMER EVIDENCE
  | 'customer_message'
  | 'customer_audio_transcription'
  | 'customer_profile'
  // PRIMARY SELLER EVIDENCE
  | 'seller_message'
  | 'seller_instruction'
  // COMPANY AUTHORITATIVE DATA
  | 'company_product'
  | 'company_fact'
  | 'company_config'
  // DERIVED EVIDENCE (nunca sustenta fato)
  | 'derived_summary'
  | 'derived_reading'
  | 'derived_reasoning'
  | 'derived_coaching'
  | 'derived_memory'
  | 'generated_message'
  // SYSTEM OBSERVATION (tempo, direção, contagem — não conteúdo)
  | 'system_observation'
  // Nunca factual
  | 'profile_avatar'

export type FactAuthority =
  | 'primary_customer'
  | 'primary_seller'
  | 'seller_instruction'
  | 'company_authoritative'
  | 'derived'
  | 'system'
  | 'none'

export const FACT_SOURCE_AUTHORITY:
  Readonly<Record<FactSourceType, FactAuthority>> = {
    customer_message: 'primary_customer',
    customer_audio_transcription: 'primary_customer',
    customer_profile: 'primary_customer',
    seller_message: 'primary_seller',
    seller_instruction: 'seller_instruction',
    company_product: 'company_authoritative',
    company_fact: 'company_authoritative',
    company_config: 'company_authoritative',
    derived_summary: 'derived',
    derived_reading: 'derived',
    derived_reasoning: 'derived',
    derived_coaching: 'derived',
    derived_memory: 'derived',
    generated_message: 'derived',
    system_observation: 'system',
    profile_avatar: 'none',
  }

export type FactClaimKind =
  | 'relationship'
  | 'price'
  | 'percentage'
  | 'promotion'
  | 'benefit'
  | 'urgency'
  | 'objection'
  | 'preference'
  | 'commitment'
  | 'customer_statement'
  | 'company_statement'
  | 'date_time'
  // Conclusão tirada de foto/avatar/imagem de perfil: nunca é evidência.
  | 'profile_inference'

export type GroundedClaimStatus =
  | 'verified'
  | 'verified_current'
  | 'historical'
  | 'derived'
  | 'inferred'
  | 'unsupported'
  | 'conflicting'

// Matriz de autoridade: quais fontes sustentam cada tipo de afirmação. As
// fontes "historical" só valem quando a frase enquadra o fato como passado
// ("naquela conversa foi informado R$ X"); nunca como estado atual.
export const CLAIM_SOURCE_AUTHORITY:
  Readonly<Record<
    FactClaimKind,
    {
      current: readonly FactSourceType[]
      historical: readonly FactSourceType[]
    }
  >> = {
    relationship: {
      current: ['customer_message', 'customer_audio_transcription', 'customer_profile'],
      historical: [],
    },
    objection: {
      current: ['customer_message', 'customer_audio_transcription'],
      historical: [],
    },
    preference: {
      current: ['customer_message', 'customer_audio_transcription', 'customer_profile'],
      historical: [],
    },
    customer_statement: {
      current: ['customer_message', 'customer_audio_transcription', 'customer_profile'],
      historical: [],
    },
    commitment: {
      current: ['customer_message', 'customer_audio_transcription'],
      historical: [],
    },
    price: {
      current: ['company_product', 'company_fact', 'company_config'],
      historical: ['seller_message', 'customer_message', 'customer_audio_transcription'],
    },
    percentage: {
      current: ['company_product', 'company_fact', 'company_config'],
      historical: ['seller_message', 'customer_message', 'customer_audio_transcription'],
    },
    promotion: {
      current: ['company_product', 'company_fact', 'company_config'],
      historical: ['seller_message'],
    },
    benefit: {
      current: ['company_product', 'company_fact', 'company_config'],
      historical: ['seller_message'],
    },
    urgency: {
      current: ['company_product', 'company_fact', 'company_config'],
      historical: [],
    },
    company_statement: {
      current: ['company_product', 'company_fact', 'company_config'],
      historical: ['seller_message'],
    },
    // Data/horário: citados na conversa (qualquer lado) ou a agenda que o
    // próprio vendedor informa agora.
    date_time: {
      current: ['customer_message', 'customer_audio_transcription', 'seller_message', 'seller_instruction', 'company_fact', 'company_config'],
      historical: [],
    },
    // Nenhuma fonte sustenta o que "parece" pela foto do perfil.
    profile_inference: {
      current: [],
      historical: [],
    },
  }

export type FactSourceRef = {
  source_type: FactSourceType
  source_id: string | null
  authority: FactAuthority
}

export type GroundedClaim = {
  claim_id: string
  kind: FactClaimKind
  text: string
  value: string
  status: GroundedClaimStatus
  sources: FactSourceRef[]
  reason: string | null
}

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------

export function comparableText(value: string | null | undefined): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/r\$/g, ' rs ')
    .replace(/[^a-z0-9%]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const ABBREVIATION =
  /(?<![\p{L}])(Dra|Dr|Sra|Srta|Sr|Profa|Prof|Av|Ltda|Jr|Eng|Arq|Cia)\.(?=\s)/gu
const ABBREVIATION_DOT = '\u2024'

export function splitClaimSentences(value: string | null | undefined): string[] {
  const text = String(value ?? '').trim()

  if (!text) {
    return []
  }

  return text
    .replace(ABBREVIATION, `$1${ABBREVIATION_DOT}`)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.split(ABBREVIATION_DOT).join('.').trim())
    .filter(Boolean)
}

const STEM_LENGTH = 5

function stemOf(token: string): string {
  return token.slice(0, STEM_LENGTH)
}

// ---------------------------------------------------------------------------
// Integridade do ledger: mensagem ausente da visão atual
// ---------------------------------------------------------------------------

export type LedgerObservationStatus =
  | 'confirmed'
  | 'absent_from_later_view'
  | 'unknown'

export type LedgerObservationInput = {
  id: string
  occurred_at: string | null
  last_observed_at: string | null
  last_device_key?: string | null
}

// Uma captura posterior que viu, NO MESMO INSTANTE, os vizinhos imediatos de
// M (a mensagem anterior e a posterior mais próximas que ela re-observou),
// mas não M, prova que M não está na conversa que o vendedor enxerga hoje:
// o DOM do chat é contíguo, então M estaria entre eles (apagada no WhatsApp
// ou capturada fora do chat correto). Ela continua no ledger como
// histórico, mas perde autoridade primária. Vizinhos vistos em instantes
// diferentes (rolagem rápida, virtualização) ou sem dado de observação não
// provam nada: "confirmed"/"unknown", nunca "absent".
const LATER_VIEW_MIN_GAP_MS = 60 * 60 * 1000
const SAME_SNAPSHOT_WINDOW_MS = 2 * 60 * 1000

export function classifyLedgerObservation(
  rows: readonly LedgerObservationInput[],
): Map<string, LedgerObservationStatus> {
  const result = new Map<string, LedgerObservationStatus>()
  const parsed = rows.map((row) => ({
    id: row.id,
    occurredAt: row.occurred_at ? Date.parse(row.occurred_at) : Number.NaN,
    observedAt: row.last_observed_at ? Date.parse(row.last_observed_at) : Number.NaN,
    device: row.last_device_key ?? null,
  }))

  for (const message of parsed) {
    if (!Number.isFinite(message.occurredAt) || !Number.isFinite(message.observedAt)) {
      result.set(message.id, 'unknown')
      continue
    }

    const laterObservations = parsed.filter(
      (other) =>
        other.id !== message.id &&
        Number.isFinite(other.occurredAt) &&
        Number.isFinite(other.observedAt) &&
        other.observedAt - message.observedAt > LATER_VIEW_MIN_GAP_MS,
    )

    const before = laterObservations
      .filter((other) => other.occurredAt < message.occurredAt)
      .sort((left, right) => right.occurredAt - left.occurredAt)[0]
    const after = laterObservations
      .filter((other) => other.occurredAt > message.occurredAt)
      .sort((left, right) => left.occurredAt - right.occurredAt)[0]

    const framed =
      Boolean(before && after) &&
      Math.abs(after.observedAt - before.observedAt) <= SAME_SNAPSHOT_WINDOW_MS &&
      (before.device === null || after.device === null || before.device === after.device)

    result.set(message.id, framed ? 'absent_from_later_view' : 'confirmed')
  }

  return result
}

// ---------------------------------------------------------------------------
// Registro de evidências
// ---------------------------------------------------------------------------

export type FactEvidenceMessage = {
  id: string
  company_id?: string | null
  direction: string
  author_kind?: string | null
  content_type?: string | null
  text: string | null
  occurred_at?: string | null
  is_deleted?: boolean
  observation?: LedgerObservationStatus
}

export type FactEvidenceCompanyItem = {
  source_type: 'company_product' | 'company_fact' | 'company_config'
  source_id: string | null
  company_id: string | null
  text: string
  active?: boolean
  // Nome de produto/categoria: pode ser citado como assunto da conversa.
  identity?: boolean
  // forbidden_claims da própria empresa: nunca afirmáveis.
  forbidden?: boolean
}

export type FactEvidenceSource = FactSourceRef & {
  text: string
  comparable: string
  occurred_at: string | null
  identity: boolean
}

export type FactEvidenceExclusion = {
  source_type: FactSourceType
  source_id: string | null
  reason:
    | 'deleted'
    | 'absent_from_later_view'
    | 'foreign_company'
    | 'inactive_or_expired'
    | 'empty'
    | 'not_primary'
}

export type FactEvidenceRegistry = {
  contract_version: typeof FACT_GROUNDING_CONTRACT_VERSION
  company_id: string | null
  sources: FactEvidenceSource[]
  excluded: FactEvidenceExclusion[]
  forbidden: FactEvidenceSource[]
  seller_instruction: string | null
  // Afirmações que o reparo retirou durante esta requisição (só trace).
  blocked: GroundedClaim[]
}

function messageSourceType(message: FactEvidenceMessage): FactSourceType | null {
  if (message.direction === 'incoming') {
    return message.content_type === 'audio'
      ? 'customer_audio_transcription'
      : 'customer_message'
  }

  if (message.direction === 'outgoing') {
    return 'seller_message'
  }

  return null
}

export function buildFactEvidenceRegistry({
  company_id,
  messages = [],
  company_items = [],
  seller_instruction = null,
  customer_profile = [],
}: {
  company_id: string | null
  messages?: readonly FactEvidenceMessage[]
  company_items?: readonly FactEvidenceCompanyItem[]
  seller_instruction?: string | null
  customer_profile?: ReadonlyArray<{ source_id: string | null; text: string }>
}): FactEvidenceRegistry {
  const sources: FactEvidenceSource[] = []
  const excluded: FactEvidenceExclusion[] = []
  const forbidden: FactEvidenceSource[] = []

  const add = (
    source_type: FactSourceType,
    source_id: string | null,
    text: string,
    occurred_at: string | null,
    identity = false,
  ) => {
    sources.push({
      source_type,
      source_id,
      authority: FACT_SOURCE_AUTHORITY[source_type],
      text,
      comparable: comparableText(text),
      occurred_at,
      identity,
    })
  }

  for (const message of messages) {
    const type = messageSourceType(message)

    if (!type) {
      continue
    }

    if (
      company_id &&
      message.company_id &&
      message.company_id !== company_id
    ) {
      excluded.push({ source_type: type, source_id: message.id, reason: 'foreign_company' })
      continue
    }

    if (message.is_deleted) {
      excluded.push({ source_type: type, source_id: message.id, reason: 'deleted' })
      continue
    }

    if (message.observation === 'absent_from_later_view') {
      excluded.push({ source_type: type, source_id: message.id, reason: 'absent_from_later_view' })
      continue
    }

    const text = String(message.text ?? '').trim()

    if (!text) {
      excluded.push({ source_type: type, source_id: message.id, reason: 'empty' })
      continue
    }

    add(type, message.id, text, message.occurred_at ?? null)
  }

  for (const item of company_items) {
    if (company_id && item.company_id !== company_id) {
      excluded.push({ source_type: item.source_type, source_id: item.source_id, reason: 'foreign_company' })
      continue
    }

    if (item.active === false) {
      excluded.push({ source_type: item.source_type, source_id: item.source_id, reason: 'inactive_or_expired' })
      continue
    }

    const text = String(item.text ?? '').trim()

    if (!text) {
      continue
    }

    if (item.forbidden) {
      forbidden.push({
        source_type: item.source_type,
        source_id: item.source_id,
        authority: FACT_SOURCE_AUTHORITY[item.source_type],
        text,
        comparable: comparableText(text),
        occurred_at: null,
        identity: false,
      })
      continue
    }

    add(item.source_type, item.source_id, text, null, item.identity === true)
  }

  for (const entry of customer_profile) {
    if (entry.text?.trim()) {
      add('customer_profile', entry.source_id, entry.text.trim(), null)
    }
  }

  return {
    contract_version: FACT_GROUNDING_CONTRACT_VERSION,
    company_id,
    sources,
    excluded,
    forbidden,
    seller_instruction: seller_instruction?.trim() || null,
    blocked: [],
  }
}

// Conhecimento vigente da empresa a partir do contexto comercial canônico
// (mesma company_id do diagnóstico). Produtos inativos e fatos expirados ou
// ainda não vigentes ficam de fora.
export function companyItemsFromCommercialContext({
  company_id,
  commercial_context,
}: {
  company_id: string | null
  commercial_context: {
    config_version_id?: string | null
    business_description?: string | null
    value_proposition?: string | null
    products?: ReadonlyArray<{
      product_id: string
      name: string | null
      category: string | null
      base_price: number | null
      active: boolean | null
      needs_addressed?: readonly string[]
      benefits?: readonly string[]
      verified_differentiators?: readonly string[]
      limitations?: readonly string[]
      contract_conditions?: readonly string[]
      payment_conditions?: readonly string[]
      allowed_claims?: readonly string[]
      forbidden_claims?: readonly string[]
    }>
    facts?: ReadonlyArray<{
      fact_key: string
      fact_value: string
      category?: string | null
      validity_status?: string | null
    }>
  } | null | undefined
}): FactEvidenceCompanyItem[] {
  if (!commercial_context) {
    return []
  }

  const items: FactEvidenceCompanyItem[] = []
  const configId = commercial_context.config_version_id ?? null

  for (const text of [commercial_context.business_description, commercial_context.value_proposition]) {
    if (text?.trim()) {
      items.push({ source_type: 'company_config', source_id: configId, company_id, text })
    }
  }

  for (const product of commercial_context.products ?? []) {
    const active = product.active !== false

    if (product.name?.trim()) {
      items.push({
        source_type: 'company_product',
        source_id: product.product_id,
        company_id,
        text: [product.name, product.category].filter(Boolean).join(' '),
        active,
        identity: true,
      })
    }

    if (typeof product.base_price === 'number' && Number.isFinite(product.base_price)) {
      items.push({
        source_type: 'company_product',
        source_id: product.product_id,
        company_id,
        text: `${product.name ?? 'Produto'} R$ ${product.base_price.toFixed(2).replace('.', ',')}`,
        active,
      })
    }

    for (const text of [
      ...(product.needs_addressed ?? []),
      ...(product.benefits ?? []),
      ...(product.verified_differentiators ?? []),
      ...(product.limitations ?? []),
      ...(product.contract_conditions ?? []),
      ...(product.payment_conditions ?? []),
      ...(product.allowed_claims ?? []),
    ]) {
      items.push({ source_type: 'company_product', source_id: product.product_id, company_id, text, active })
    }

    for (const text of product.forbidden_claims ?? []) {
      items.push({ source_type: 'company_product', source_id: product.product_id, company_id, text, active, forbidden: true })
    }
  }

  for (const fact of commercial_context.facts ?? []) {
    const status = fact.validity_status ?? 'current'

    items.push({
      source_type: 'company_fact',
      source_id: fact.fact_key,
      company_id,
      text: `${fact.fact_key.replace(/[_-]+/g, ' ')}: ${fact.fact_value}`,
      active: status === 'current' || status === 'legacy',
    })
  }

  return items
}

// Conhecimento de empresa que o Commercial Reasoning selecionou (com
// source_type/source_id do catálogo). Só entra se for da mesma empresa.
export function companyItemsFromKnowledgeReferences({
  company_id,
  references,
}: {
  company_id: string | null
  references: ReadonlyArray<{
    source_type?: string | null
    source_id?: string | null
    product_id?: string | null
    title?: string | null
    grounded_content?: string | null
  }>
}): FactEvidenceCompanyItem[] {
  return references
    .filter((reference) => reference.grounded_content?.trim())
    .map((reference) => ({
      source_type:
        reference.product_id || reference.source_type === 'product_profile'
          ? 'company_product' as const
          : reference.source_type === 'commercial_fact'
            ? 'company_fact' as const
            : 'company_config' as const,
      source_id: reference.source_id ?? reference.product_id ?? null,
      company_id,
      text: [reference.title, reference.grounded_content].filter(Boolean).join(': '),
    }))
}

// ---------------------------------------------------------------------------
// Detectores de afirmação
// ---------------------------------------------------------------------------

type DetectedClaim = {
  kind: FactClaimKind
  text: string
  value: string
  // Termos que precisam aparecer na fonte que sustenta a afirmação.
  terms?: string[]
  numeric?: number
  historical_framing?: boolean
}

const RELATION_GROUPS: ReadonlyArray<{
  group: string
  terms: readonly string[]
  possessive_required: boolean
}> = [
  { group: 'conjuge', terms: ['marido', 'esposo', 'esposa', 'conjuge'], possessive_required: false },
  { group: 'conjuge', terms: ['mulher'], possessive_required: true },
  { group: 'parceiro', terms: ['namorado', 'namorada', 'noivo', 'noiva', 'companheiro', 'companheira'], possessive_required: false },
  { group: 'parceiro', terms: ['parceiro', 'parceira'], possessive_required: true },
  { group: 'filho', terms: ['filho', 'filha', 'filhos', 'filhas', 'filhinho', 'filhinha'], possessive_required: false },
  { group: 'pais', terms: ['mae', 'mamae', 'pai', 'papai'], possessive_required: false },
  { group: 'pais', terms: ['pais'], possessive_required: true },
  { group: 'irmao', terms: ['irmao', 'irma', 'irmaos', 'irmas'], possessive_required: false },
  { group: 'avo', terms: ['avo', 'avos', 'vovo'], possessive_required: false },
  { group: 'familia_estendida', terms: ['sogro', 'sogra', 'cunhado', 'cunhada', 'genro', 'nora', 'tio', 'tia', 'primo', 'prima', 'sobrinho', 'sobrinha'], possessive_required: true },
  { group: 'socio', terms: ['socio', 'socia', 'socios'], possessive_required: false },
  { group: 'amigo', terms: ['amigo', 'amiga', 'amigos', 'amigas'], possessive_required: true },
  { group: 'trabalho', terms: ['colega', 'chefe'], possessive_required: true },
  { group: 'familia', terms: ['familia'], possessive_required: true },
]

const POSSESSIVES = new Set([
  'seu', 'sua', 'seus', 'suas', 'meu', 'minha', 'meus', 'minhas',
  'teu', 'tua', 'nosso', 'nossa', 'nossos', 'nossas', 'dele', 'dela',
])

const SECOND_PERSON_POSSESSIVES = new Set(['seu', 'sua', 'seus', 'suas', 'teu', 'tua'])

function relationGroupOf(token: string, previous: string | null): string | null {
  for (const entry of RELATION_GROUPS) {
    if (!entry.terms.includes(token)) {
      continue
    }

    if (entry.possessive_required && !(previous && POSSESSIVES.has(previous))) {
      continue
    }

    return entry.group
  }

  return null
}

function relationMentions(
  comparable: string,
): Array<{ group: string; term: string; previous: string | null }> {
  const tokens = comparable.split(' ').filter(Boolean)
  const mentions: Array<{ group: string; term: string; previous: string | null }> = []

  tokens.forEach((token, index) => {
    const previous = index > 0 ? tokens[index - 1] : null
    const previousCandidate =
      previous && (previous === 'o' || previous === 'a' || previous === 'os' || previous === 'as') && index > 1
        ? tokens[index - 2]
        : previous
    const group = relationGroupOf(token, previousCandidate)

    if (group) {
      mentions.push({ group, term: token, previous: previousCandidate })
    }
  })

  return mentions
}

const PAIR_ADDRESS = /\b(voces dois|voces duas|os dois|as duas|o casal|do casal|para o casal|casal)\b/
const FIRST_PERSON_GROUP = /\b(nos|a gente|nosso|nossa|nossos|nossas|eu e)\b/

const MONEY = /(?:r\$|rs)\s*(\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)|\b(\d+(?:[.,]\d{1,2})?)\s*reais\b/gi
const PERCENT = /(\d+(?:[.,]\d+)?)\s*%/g

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, '')
  const normalized =
    /,\d{1,2}$/.test(cleaned)
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : /\.\d{3}$/.test(cleaned)
        ? cleaned.replace(/\./g, '')
        : cleaned.replace(',', '.')
  const value = Number(normalized)

  return Number.isFinite(value) ? value : null
}

function moneyValues(text: string): number[] {
  const values: number[] = []

  for (const match of text.matchAll(MONEY)) {
    const value = parseAmount(match[1] ?? match[2] ?? '')

    if (value !== null) {
      values.push(value)
    }
  }

  return values
}

function percentValues(text: string): number[] {
  return [...text.matchAll(PERCENT)]
    .map((match) => Number(match[1].replace(',', '.')))
    .filter((value) => Number.isFinite(value))
}

const HISTORICAL_FRAMING =
  /\b(foi informad\w*|informei|informamos|te passei|passamos|mencionei|mencionad\w*|naquela|na epoca|na ocasiao|anteriormente|na conversa anterior|tinha(?:mos)? (?:passado|informado|enviado)|enviei|enviamos|te enviei|que te mandei|que enviei|era de|estava por|na ultima conversa)\b/

const PROMOTION_GROUPS: ReadonlyArray<{ kind: 'promotion' | 'benefit'; group: string; pattern: RegExp }> = [
  { kind: 'promotion', group: 'promocao', pattern: /\b(promocao|promocoes|promocional|oferta especial|condicao especial|preco especial|black friday|cupom|cupons)\b/ },
  { kind: 'promotion', group: 'desconto', pattern: /\b(desconto|descontos)\b/ },
  { kind: 'benefit', group: 'gratuito', pattern: /\b(gratis|gratuit[oa]s?|sem custo|cortesia|isent[oa]s?|isencao|brinde|brindes|bonus)\b/ },
]

const PROFILE_INFERENCE =
  /\b(foto|fotos|avatar|imagem|imagens|figurinha) (?:do|de|da) (?:perfil|contato|whatsapp)\b|\b(?:pela|na|da) (?:foto|imagem)\b|\bpelo avatar\b/

const URGENCY =
  /\b(ultimas? vagas?|so hoje|somente hoje|apenas hoje|por tempo limitado|restam|acaba(?:m)? (?:hoje|amanha)|termina(?:m)? hoje|nao perca|imperdivel|corre)\b/

const PRICE_OBJECTION_CLAIM =
  /\b(achou|acha|achava|considerou|considera|sentiu)\b.{0,40}\b(caro|cara|carissim[oa]|salgad[oa]|puxad[oa])\b|\b(preco|valor|investimento|mensalidade|custo)\b.{0,30}\b(alto|alta|pesad[oa]|caro|cara|salgad[oa]|puxad[oa])\b|\bobjecao de (?:preco|valor)\b|\b(receio|preocupacao|resistencia|objecao)\b.{0,30}\b(preco|valor|investimento|custo|mensalidade)\b/
const PRICE_OBJECTION_EVIDENCE =
  /\b(caro|cara|salgad[oa]|puxad[oa]|pesad[oa]|muito alto|alto demais|nao cabe|sem condic\w*|nao tenho condic\w*|orcamento|muito dinheiro|nao consigo pagar|fora do (?:meu )?orcamento)\b/

const PREFERENCE_TRIGGER =
  /\b(prefere|preferia|preferiu|preferencia|prefiro|costuma|gosta de|melhor (?:horario|periodo|dia|turno))\b/
const PREFERENCE_VALUE =
  /\b(manha|tarde|noite|cedo|madrugada|almoco|fim de semana|final de semana|sabado|domingo|segunda|terca|quarta|quinta|sexta|ligacao|audio|texto|email|presencial|online)\b/g

const COMMITMENT_TRIGGER =
  /\b(como combinado|conforme combinado|ficou combinado|combinamos|voce confirmou|voce aceitou|voce agendou|sua visita|na sua visita|quando voce (?:veio|esteve|visitou)|nossa reuniao|voce assinou|voce fechou)\b/
const COMMITMENT_EVIDENCE =
  /\b(combinado|combinamos|confirm\w*|sim|ok|fechado|fechou|pode ser|pode sim|beleza|perfeito|aceito|vou|vamos|bora|agendad\w*|marcad\w*|funciona|serve|da certo|ta bom|ta otimo|consigo|posso|quero)\b/

const CUSTOMER_ATTRIBUTION =
  /\b(?:voce|vc|o cliente|a cliente)\s+(?:ja\s+|tinha\s+|havia\s+|me\s+|nos\s+|ainda\s+)?(comentou|comentado|disse|dito|falou|falado|mencionou|mencionado|contou|pediu|pedido|queria|gostaria|precisava|preferiu|decidiu|escolheu|informou|demonstrou|estava avaliando|estava pensando|estava procurando|estava interessad[oa]|tinha interesse|ficou de|quer|precisa|procura|busca)\b/

const COMPANY_ATTRIBUTION =
  /\b(temos|oferecemos|disponibilizamos|contamos com|nossa academia|nossa empresa|nossa loja|nossa clinica|nosso espaco|nosso servico|nosso plano|nossos planos|o plano inclui|inclui|incluso|inclusos|inclusa|conta com|possui)\b/

// Palavras genéricas de conversa/negociação: nunca são "fato específico".
const META_WORDS = new Set([
  'conversa', 'conversamos', 'vez', 'vezes', 'momento', 'interesse', 'assunto', 'ideia',
  'tempo', 'prioridade', 'forma', 'jeito', 'coisa', 'coisas', 'parte', 'retorno',
  'contato', 'mensagem', 'mensagens', 'resposta', 'pergunta', 'duvida', 'duvidas',
  'informacao', 'informacoes', 'novidade', 'novidades', 'passo', 'etapa', 'proximo',
  'proxima', 'opcao', 'opcoes', 'possibilidade', 'disponibilidade', 'horario',
  'horarios', 'agenda', 'sentido', 'lado', 'pouco', 'algo', 'nada', 'tudo', 'todos',
  'ainda', 'agora', 'hoje', 'depois', 'antes', 'sempre', 'nunca', 'desde', 'entao',
  'isso', 'esse', 'essa', 'este', 'esta', 'aqui', 'gente', 'senhor', 'senhora',
  'voce', 'voces', 'cliente', 'clientes', 'vendedor', 'equipe', 'atendimento', 'ajuda',
  'oportunidade', 'semana', 'ultima', 'ultimo', 'obrigado', 'obrigada', 'favor', 'claro',
  'certo', 'caso', 'quanto', 'quando', 'como', 'onde', 'qual', 'quais', 'sobre', 'para',
  'pela', 'pelo', 'entre', 'final', 'inicio', 'comeco', 'retomada', 'continuidade',
  'objetivo', 'valor', 'valores', 'preco', 'precos', 'investimento', 'custo', 'custos',
  'pagamento', 'detalhes', 'detalhe', 'melhor', 'bom', 'boa', 'lugar', 'dia', 'dias',
  'hora', 'horas', 'minuto', 'minutos', 'mes', 'meses', 'resolver', 'mesmo', 'mesma',
  'outro', 'outra', 'outros', 'outras', 'muito', 'muita', 'mais', 'menos', 'grande',
  'nosso', 'nossa', 'nossos', 'nossas', 'seus', 'suas', 'minha', 'meus', 'minhas',
  'dele', 'dela', 'deles', 'delas', 'aqui', 'neste', 'nesta', 'nesse', 'nessa',
  'cada', 'qualquer', 'tambem', 'porque', 'pois', 'enquanto', 'tipo', 'jeitinho',
  'rapido', 'rapida', 'simples', 'facil', 'possivel', 'certeza', 'vontade',
  'vaga', 'vagas', 'amanha', 'manha', 'tarde', 'noite', 'segunda', 'terca', 'quarta',
  'quinta', 'sexta', 'sabado', 'domingo', 'feira', 'periodo', 'turno',
])

const COMMON_VERBS = new Set([
  'tinha', 'tinham', 'havia', 'pode', 'podia', 'poderia', 'quer', 'queria', 'querem',
  'esta', 'estao', 'estava', 'estavam', 'sera', 'seria', 'tenha', 'possa', 'deve',
  'faz', 'fazia', 'vai', 'vao', 'vem', 'veio', 'foi', 'era', 'eram', 'sao', 'gosta',
  'sabe', 'acha', 'pensa', 'precisa', 'tem', 'temos', 'teria', 'fica', 'ficou',
  'gostaria', 'queremos', 'podemos', 'consegue', 'conseguiu', 'comentou', 'disse',
  'falou', 'pediu', 'quis', 'procura', 'busca', 'combina', 'chegou', 'faria',
])

const STOPWORDS = new Set([
  'a', 'o', 'as', 'os', 'um', 'uma', 'uns', 'umas', 'de', 'do', 'da', 'dos', 'das',
  'em', 'no', 'na', 'nos', 'nas', 'por', 'com', 'sem', 'que', 'e', 'ou', 'se', 'ao',
  'aos', 'mas', 'ja', 'ele', 'ela', 'eles', 'elas', 'eu', 'me', 'te', 'lhe', 'nao',
  'sim', 'oi', 'ola', 'pra', 'pro', 'seu', 'sua', 'meu', 'rs',
])

const VERB_SUFFIX =
  /(ar|er|ir|ou|ava|avam|ando|endo|indo|ado|ados|ada|adas|idos|idas|aria|eria|iria|ariam|eriam|iriam|asse|esse|isse|amos|emos|imos|aram|eram|iram)$/

function specificTokens(comparable: string): string[] {
  return comparable
    .split(' ')
    .filter(
      (token) =>
        token.length >= 4 &&
        !/^\d/.test(token) &&
        !STOPWORDS.has(token) &&
        !META_WORDS.has(token) &&
        !COMMON_VERBS.has(token) &&
        !VERB_SUFFIX.test(token),
    )
}

function isQuestion(sentence: string): boolean {
  return /\?\s*$/.test(sentence.trim())
}

function nounsNear(comparable: string, pattern: RegExp): string[] {
  const tokens = comparable.split(' ')
  const nouns: string[] = []

  tokens.forEach((token, index) => {
    if (!pattern.test(token)) {
      return
    }

    for (const neighbor of [
      ...tokens.slice(Math.max(0, index - 3), index),
      ...tokens.slice(index + 1, index + 4),
    ]) {
      if (specificTokens(neighbor).length > 0 && !pattern.test(neighbor)) {
        nouns.push(neighbor)
      }
    }
  })

  return [...new Set(nouns)]
}

function detectClaims(
  sentence: string,
  perspective: ClaimPerspective,
): DetectedClaim[] {
  const comparable = comparableText(sentence)
  const claims: DetectedClaim[] = []
  const historical = HISTORICAL_FRAMING.test(comparable)

  // Relação pessoal (inclui pressuposição em perguntas: "você e seu marido…").
  for (const mention of relationMentions(comparable)) {
    claims.push({
      kind: 'relationship',
      text: sentence,
      value: mention.group,
      terms: [mention.term],
    })
  }

  // "Vocês dois", "o casal": pressupõe acompanhante. "Vocês" sozinho é
  // tratamento comum a uma empresa/equipe e não afirma nada.
  if (perspective === 'customer_facing' && PAIR_ADDRESS.test(comparable)) {
    claims.push({ kind: 'relationship', text: sentence, value: 'grupo' })
  }

  for (const value of moneyValues(sentence)) {
    claims.push({ kind: 'price', text: sentence, value: String(value), numeric: value, historical_framing: historical })
  }

  for (const value of percentValues(sentence)) {
    claims.push({ kind: 'percentage', text: sentence, value: `${value}%`, numeric: value, historical_framing: historical })
  }

  for (const promotion of PROMOTION_GROUPS) {
    if (promotion.pattern.test(comparable)) {
      claims.push({
        kind: promotion.kind,
        text: sentence,
        value: promotion.group,
        terms: nounsNear(comparable, promotion.pattern),
        historical_framing: historical,
      })
    }
  }

  if (PROFILE_INFERENCE.test(comparable)) {
    claims.push({ kind: 'profile_inference', text: sentence, value: 'foto_perfil' })
  }

  if (URGENCY.test(comparable)) {
    claims.push({ kind: 'urgency', text: sentence, value: comparable.match(URGENCY)?.[1] ?? 'urgencia' })
  }

  // Perguntar não é afirmar: "Você prefere manhã ou tarde?" não atribui
  // preferência; "Foi o preço?" não cria objeção. Relação pessoal, valor,
  // promoção e urgência continuam valendo em pergunta (pressupõem o fato).
  if (!isQuestion(sentence)) {
    if (PRICE_OBJECTION_CLAIM.test(comparable)) {
      claims.push({ kind: 'objection', text: sentence, value: 'preco' })
    }

    if (PREFERENCE_TRIGGER.test(comparable)) {
      for (const match of comparable.matchAll(PREFERENCE_VALUE)) {
        claims.push({ kind: 'preference', text: sentence, value: match[1], terms: [match[1]] })
      }
    }

    if (COMMITMENT_TRIGGER.test(comparable)) {
      claims.push({ kind: 'commitment', text: sentence, value: 'compromisso_anterior', terms: specificTokens(comparable) })
    }

    // Atribuição genérica ao cliente: tudo que é específico no que a frase
    // atribui ao cliente precisa ter vindo dele.
    const attribution = comparable.match(CUSTOMER_ATTRIBUTION)
    // "Me diga qual pergunta você quer fazer", "veja se você precisa":
    // interrogativa embutida não atribui nada ao cliente.
    const embeddedQuestion =
      attribution?.index !== undefined &&
      /\b(qual|quais|que|quando|como|onde|se|quanto|quantos|quantas|porque)(?:\s+\S+){0,2}\s*$/.test(
        comparable.slice(0, attribution.index).trim(),
      )

    if (attribution && attribution.index !== undefined && !embeddedQuestion) {
      const tail = comparable.slice(attribution.index + attribution[0].length)
      const terms = specificTokens(tail)

      if (terms.length > 0) {
        claims.push({ kind: 'customer_statement', text: sentence, value: tail.trim(), terms })
      }
    }

    const company = comparable.match(COMPANY_ATTRIBUTION)

    if (company && company.index !== undefined && perspective === 'customer_facing') {
      const tail = comparable.slice(company.index + company[0].length)
      const terms = specificTokens(tail)

      if (terms.length > 0) {
        claims.push({ kind: 'company_statement', text: sentence, value: tail.trim(), terms })
      }
    }
  }

  return claims
}

// ---------------------------------------------------------------------------
// Suporte
// ---------------------------------------------------------------------------

export type ClaimPerspective = 'customer_facing' | 'seller_facing'

function sourcesOfTypes(
  registry: FactEvidenceRegistry,
  types: readonly FactSourceType[],
  restrictTo?: ReadonlySet<string> | null,
): FactEvidenceSource[] {
  return registry.sources.filter(
    (source) =>
      types.includes(source.source_type) &&
      (!restrictTo ||
        source.authority === 'company_authoritative' ||
        (source.source_id !== null && restrictTo.has(source.source_id))),
  )
}

function refOf(source: FactEvidenceSource): FactSourceRef {
  return {
    source_type: source.source_type,
    source_id: source.source_id,
    authority: source.authority,
  }
}

// Derivados por fonte calculados uma única vez (a mesma fonte é consultada
// por todas as afirmações de todos os itens: sem cache era N×M).
const SOURCE_STEMS = new WeakMap<FactEvidenceSource, Set<string>>()
const SOURCE_RELATIONS = new WeakMap<FactEvidenceSource, ReturnType<typeof relationMentions>>()
const REGISTRY_CUSTOMER_STEMS = new WeakMap<FactEvidenceRegistry, Set<string>>()
const SOURCE_MONEY = new WeakMap<FactEvidenceSource, number[]>()
const SOURCE_PERCENT = new WeakMap<FactEvidenceSource, number[]>()

function sourceStems(source: FactEvidenceSource): Set<string> {
  let stems = SOURCE_STEMS.get(source)

  if (!stems) {
    stems = tokenStems(source.comparable)
    SOURCE_STEMS.set(source, stems)
  }

  return stems
}

function sourceRelations(source: FactEvidenceSource): ReturnType<typeof relationMentions> {
  let relations = SOURCE_RELATIONS.get(source)

  if (!relations) {
    relations = relationMentions(source.comparable)
    SOURCE_RELATIONS.set(source, relations)
  }

  return relations
}

function tokenStems(comparable: string): Set<string> {
  return new Set(comparable.split(' ').filter(Boolean).map(stemOf))
}

function coversTerms(sources: readonly FactEvidenceSource[], terms: readonly string[]): FactEvidenceSource[] {
  return sources.filter((source) => {
    const stems = sourceStems(source)
    return terms.every((term) => stems.has(stemOf(term)))
  })
}

const CUSTOMER_TYPES: readonly FactSourceType[] = [
  'customer_message',
  'customer_audio_transcription',
  'customer_profile',
]
const COMPANY_TYPES: readonly FactSourceType[] = ['company_product', 'company_fact', 'company_config']
const PRIMARY_MESSAGE_TYPES: readonly FactSourceType[] = [
  'customer_message',
  'customer_audio_transcription',
  'seller_message',
]

function claimId(kind: FactClaimKind, value: string, text: string): string {
  let hash = 0

  for (const char of `${kind}|${value}|${text}`) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  }

  return `${kind}:${comparableText(value).slice(0, 32).replace(/\s+/g, '_')}:${hash.toString(16)}`
}

function ground(
  claim: DetectedClaim,
  registry: FactEvidenceRegistry,
  perspective: ClaimPerspective,
  restrictTo: ReadonlySet<string> | null,
): GroundedClaim {
  const done = (
    status: GroundedClaimStatus,
    sources: FactEvidenceSource[],
    reason: string | null = null,
  ): GroundedClaim => ({
    claim_id: claimId(claim.kind, claim.value, claim.text),
    kind: claim.kind,
    text: claim.text,
    value: claim.value,
    status,
    sources: sources.slice(0, 3).map(refOf),
    reason,
  })

  switch (claim.kind) {
    case 'relationship': {
      const customerSources = sourcesOfTypes(registry, CUSTOMER_TYPES, null)

      if (claim.value === 'grupo') {
        const supported = customerSources.filter(
          (source) =>
            FIRST_PERSON_GROUP.test(source.comparable) ||
            sourceRelations(source).length > 0,
        )

        return supported.length > 0
          ? done('verified', supported)
          : done('unsupported', [], 'no_customer_mention_of_companions')
      }

      const supported = customerSources.filter((source) =>
        sourceRelations(source).some(
          (mention) =>
            mention.group === claim.value &&
            !(mention.previous && SECOND_PERSON_POSSESSIVES.has(mention.previous)),
        ),
      )

      return supported.length > 0
        ? done('verified', supported)
        : done('unsupported', [], 'relationship_not_declared_by_customer')
    }

    case 'price':
    case 'percentage': {
      const cache = claim.kind === 'price' ? SOURCE_MONEY : SOURCE_PERCENT
      const parse = claim.kind === 'price' ? moneyValues : percentValues
      const valuesOf = (source: FactEvidenceSource) => {
        let values = cache.get(source)

        if (!values) {
          values = parse(source.text)
          cache.set(source, values)
        }

        return values
      }
      const matches = (source: FactEvidenceSource) =>
        valuesOf(source).some((value) => Math.abs(value - (claim.numeric ?? Number.NaN)) < 0.005)

      const company = sourcesOfTypes(registry, COMPANY_TYPES).filter(matches)

      if (company.length > 0) {
        return done('verified_current', company)
      }

      const historical = sourcesOfTypes(registry, PRIMARY_MESSAGE_TYPES, restrictTo).filter(matches)

      if (historical.length > 0) {
        // Seller-facing (ANÁLISE/AGORA) narra o que aconteceu; na MENSAGEM o
        // valor só volta com enquadramento histórico explícito.
        if (perspective === 'seller_facing' || claim.historical_framing) {
          return done('historical', historical)
        }

        return done('conflicting', historical, 'historical_value_used_as_current')
      }

      return done('unsupported', [], 'no_authoritative_value')
    }

    case 'promotion':
    case 'benefit':
    case 'urgency':
    case 'company_statement': {
      const pattern = PROMOTION_GROUPS.find((entry) => entry.group === claim.value)?.pattern ?? null
      const terms = claim.terms ?? []
      const matchesSource = (source: FactEvidenceSource) =>
        (pattern ? pattern.test(source.comparable) : claim.kind === 'urgency'
          ? URGENCY.test(source.comparable)
          : true) &&
        terms.every((term) => sourceStems(source).has(stemOf(term)))

      const company = sourcesOfTypes(registry, COMPANY_TYPES).filter(matchesSource)

      if (company.length > 0) {
        return done('verified_current', company)
      }

      // Seller-facing narra a conversa ("o cliente perguntou sobre desconto",
      // "você ofereceu a aula gratuita"): basta a menção real na conversa.
      // Customer-facing só reaproveita o que a própria empresa já disse, e
      // com enquadramento histórico.
      const history = sourcesOfTypes(
        registry,
        perspective === 'seller_facing' ? PRIMARY_MESSAGE_TYPES : ['seller_message'],
        restrictTo,
      ).filter(matchesSource)

      if (history.length > 0 && (perspective === 'seller_facing' || claim.historical_framing)) {
        return done('historical', history)
      }

      return done('unsupported', [], claim.kind === 'company_statement' ? 'company_claim_without_official_source' : `${claim.kind}_without_official_source`)
    }

    case 'objection': {
      const supported = sourcesOfTypes(registry, ['customer_message', 'customer_audio_transcription'])
        .filter((source) => PRICE_OBJECTION_EVIDENCE.test(source.comparable))

      return supported.length > 0
        ? done('verified', supported)
        : done('unsupported', [], 'objection_not_expressed_by_customer')
    }

    case 'preference': {
      const supported = coversTerms(sourcesOfTypes(registry, CUSTOMER_TYPES), claim.terms ?? [])

      return supported.length > 0
        ? done('verified', supported)
        : done('unsupported', [], 'preference_not_expressed_by_customer')
    }

    case 'commitment': {
      const customer = sourcesOfTypes(registry, ['customer_message', 'customer_audio_transcription'])
        .filter((source) => COMMITMENT_EVIDENCE.test(source.comparable))

      return customer.length > 0
        ? done('verified', customer)
        : done('unsupported', [], 'commitment_not_confirmed_by_customer')
    }

    case 'customer_statement': {
      const terms = claim.terms ?? []
      const customer = sourcesOfTypes(registry, CUSTOMER_TYPES)
      let known = REGISTRY_CUSTOMER_STEMS.get(registry)

      if (!known) {
        known = new Set<string>()

        for (const source of [...customer, ...registry.sources.filter((entry) => entry.identity)]) {
          for (const stem of sourceStems(source)) {
            known.add(stem)
          }
        }

        REGISTRY_CUSTOMER_STEMS.set(registry, known)
      }

      const knownStems = known

      const covered = terms.filter((term) => knownStems.has(stemOf(term)))
      const ratio = terms.length === 0 ? 1 : covered.length / terms.length
      const coveredStems = covered.map(stemOf)
      const supporting: FactEvidenceSource[] = []

      // Só as 3 primeiras fontes entram no trace: para ao achá-las.
      for (const source of customer) {
        if (supporting.length >= 3) {
          break
        }

        if (coveredStems.some((stem) => sourceStems(source).has(stem))) {
          supporting.push(source)
        }
      }

      return ratio >= 0.6
        ? done('verified', supporting)
        : done('unsupported', supporting, `customer_did_not_say: ${terms.filter((term) => !knownStems.has(stemOf(term))).join(', ')}`)
    }

    case 'profile_inference':
      return done('unsupported', [], 'profile_photo_is_never_evidence')

    case 'date_time':
    default:
      return done('verified', [])
  }
}

// Afirmações factuais de um texto, cada uma com status e fontes.
export function groundClaims(
  text: string | null | undefined,
  registry: FactEvidenceRegistry,
  {
    perspective = 'customer_facing',
    cited_source_ids = null,
  }: {
    perspective?: ClaimPerspective
    cited_source_ids?: readonly string[] | null
  } = {},
): GroundedClaim[] {
  const restrictTo = cited_source_ids ? new Set(cited_source_ids) : null

  return splitClaimSentences(text).flatMap((sentence) => {
    const claims = detectClaims(sentence, perspective)
      .map((claim) => ground(claim, registry, perspective, restrictTo))

    // Afirmação que a própria empresa proíbe (forbidden_claims) nunca passa.
    const sentenceStems = tokenStems(comparableText(sentence))
    const forbidden = registry.forbidden.find((source) => {
      const terms = specificTokens(source.comparable)
      return terms.length > 0 && terms.every((term) => sentenceStems.has(stemOf(term)))
    })

    if (forbidden) {
      claims.push({
        claim_id: claimId('company_statement', 'forbidden', sentence),
        kind: 'company_statement',
        text: sentence,
        value: forbidden.text,
        status: 'unsupported',
        sources: [refOf(forbidden)],
        reason: 'forbidden_by_company',
      })
    }

    return claims
  })
}

const ACCEPTED_STATUSES: ReadonlySet<GroundedClaimStatus> = new Set([
  'verified',
  'verified_current',
  'historical',
])

export function isAcceptedClaim(claim: GroundedClaim): boolean {
  return ACCEPTED_STATUSES.has(claim.status)
}

export function unsupportedClaims(claims: readonly GroundedClaim[]): GroundedClaim[] {
  return claims.filter((claim) => !isAcceptedClaim(claim))
}

const KIND_LABELS: Readonly<Record<FactClaimKind, string>> = {
  relationship: 'relação pessoal',
  price: 'valor',
  percentage: 'percentual',
  promotion: 'promoção/desconto',
  benefit: 'benefício/gratuidade',
  urgency: 'urgência/escassez',
  objection: 'objeção',
  preference: 'preferência',
  commitment: 'compromisso anterior',
  customer_statement: 'algo atribuído ao cliente',
  company_statement: 'algo atribuído à empresa',
  date_time: 'data/horário',
  profile_inference: 'conclusão tirada da foto/perfil',
}

// Correção concreta para o redator (nunca seller-facing).
export function describeUnsupportedClaims(claims: readonly GroundedClaim[]): string | null {
  const unsupported = unsupportedClaims(claims)

  if (unsupported.length === 0) {
    return null
  }

  const parts = unsupported.slice(0, 4).map((claim) => {
    const quote = claim.text.length > 90 ? `${claim.text.slice(0, 87)}…` : claim.text

    return `${KIND_LABELS[claim.kind]} sem fonte primária ou oficial em "${quote}"`
  })

  return `A mensagem afirmou fato sem evidência válida (${parts.join('; ')}). Não afirme nada que o cliente não disse nem condição que a empresa não confirmou; reescreva só com o que está na conversa real.`
}

// ---------------------------------------------------------------------------
// Reparo determinístico: remove a afirmação sem suporte, preservando o resto
// ---------------------------------------------------------------------------

function removeRelationshipPhrases(sentence: string, claims: readonly GroundedClaim[]): string {
  let result = sentence

  for (const claim of claims) {
    if (claim.kind !== 'relationship') {
      continue
    }

    const terms = claim.value === 'grupo'
      ? ['vocês dois', 'vocês duas', 'vocês', 'vcs']
      : RELATION_GROUPS.filter((entry) => entry.group === claim.value).flatMap((entry) => entry.terms)

    for (const term of terms) {
      const word = term.replace(/a/g, '[aáâã]').replace(/e/g, '[eéê]').replace(/i/g, '[ií]').replace(/o/g, '[oóôõ]').replace(/u/g, '[uú]')
      // "com seu marido", "e seu marido" depois de "você", "para você e seu marido".
      result = result
        .replace(new RegExp(`\\s*(?:,\\s*)?\\b(?:junto\\s+)?com\\s+(?:o\\s+|a\\s+)?(?:seu|sua|seus|suas)\\s+${word}\\b`, 'giu'), '')
        .replace(new RegExp(`\\b(voc[eê]|ele|ela)\\s+e\\s+(?:o\\s+|a\\s+)?(?:seu|sua|seus|suas)\\s+${word}\\b`, 'giu'), '$1')
        .replace(new RegExp(`\\s*\\b(?:para|pra|de|com)\\s+(?:o\\s+|a\\s+|os\\s+|as\\s+)?(?:seu\\s+|sua\\s+|seus\\s+|suas\\s+)?${word}(?:\\s+dois|\\s+duas)?\\b`, 'giu'), '')
    }
  }

  return result.replace(/\s+([,.!?])/g, '$1').replace(/\s{2,}/g, ' ').trim()
}

// Sentença a sentença: remove só o trecho/sentença com afirmação sem
// suporte. Devolve null quando nada útil sobra.
export function stripUnsupportedClaims(
  text: string,
  registry: FactEvidenceRegistry,
  { perspective = 'customer_facing' }: { perspective?: ClaimPerspective } = {},
): string | null {
  const kept: string[] = []
  // Se um acompanhante sem suporte sai da mensagem, o tratamento plural que
  // dependia dele ("para vocês") sai junto.
  const relationshipRemoved = unsupportedClaims(
    groundClaims(text, registry, { perspective }),
  ).some((claim) => claim.kind === 'relationship')
  const withoutPlural = (sentence: string) =>
    relationshipRemoved
      ? sentence
          .replace(/\s*\b(?:para|pra|de|com)\s+voc[eê]s(?:\s+dois|\s+duas)?\b/giu, '')
          .replace(/\s+([,.!?])/g, '$1')
          .replace(/\s{2,}/g, ' ')
          .trim()
      : sentence

  for (const original of splitClaimSentences(text)) {
    const sentence = withoutPlural(original)
    const claims = groundClaims(sentence, registry, { perspective })
    const bad = unsupportedClaims(claims)

    if (bad.length === 0) {
      kept.push(sentence)
      continue
    }

    // O acompanhante sem suporte costuma arrastar junto a atribuição ao
    // cliente ("você comentou que queria vir com seu marido"): tira-se o
    // trecho da relação e a frase só fica se todo o resto tiver suporte.
    if (bad.some((claim) => claim.kind === 'relationship')) {
      const repaired = removeRelationshipPhrases(
        sentence,
        bad.filter((claim) => claim.kind === 'relationship'),
      )

      if (
        repaired &&
        repaired !== sentence &&
        unsupportedClaims(groundClaims(repaired, registry, { perspective })).length === 0 &&
        // Concordância: "Você ainda querem" não é reparo.
        !/\bvoc[eê]\s+(?:\S+\s+){0,2}(querem|podem|estão|estao|vão|vao|têm|tem\s+interesse\s+em\s+vocês)\b/iu.test(repaired)
      ) {
        kept.push(repaired)
      }
    }
  }

  const result = kept.join(' ').replace(/\s{2,}/g, ' ').trim()

  return result || null
}

// Texto derivado seller-facing: sentenças com afirmação sem suporte são
// retiradas (ficam no trace); inferência sem fato específico passa.
export function sanitizeDerivedText(
  text: string | null | undefined,
  registry: FactEvidenceRegistry,
  {
    cited_source_ids = null,
    fallback = null,
  }: {
    cited_source_ids?: readonly string[] | null
    fallback?: string | null
  } = {},
): { text: string | null; blocked: GroundedClaim[] } {
  if (!text?.trim()) {
    return { text: text ?? null, blocked: [] }
  }

  const blocked: GroundedClaim[] = []
  const kept: string[] = []

  for (const sentence of splitClaimSentences(text)) {
    const bad = unsupportedClaims(
      groundClaims(sentence, registry, { perspective: 'seller_facing', cited_source_ids }),
    ).filter((claim) => claim.kind !== 'customer_statement')

    if (bad.length > 0) {
      blocked.push(...bad)
      continue
    }

    kept.push(sentence)
  }

  if (blocked.length === 0) {
    return { text, blocked }
  }

  return { text: kept.join(' ').trim() || fallback, blocked }
}

// ---------------------------------------------------------------------------
// Itens derivados com evidence_message_ids (Reading, memória)
// ---------------------------------------------------------------------------

export type DerivedItemCategory =
  | 'customer_fact'
  | 'seller_fact'
  | 'any_fact'
  | 'gap'
  | 'narrative'

export type DerivedItemGrounding = {
  status: 'verified' | 'derived' | 'unsupported'
  blocked: GroundedClaim[]
  reason: string | null
}

// Memória comercial vista pelo firewall: cada item só vale pelo que as
// SUAS mensagens sustentam. Memória removida pelo gate não sustenta nada.
export type FactMemoryIndex = {
  evidence: ReadonlyMap<string, readonly string[]>
  removed: ReadonlySet<string>
}

const EMPTY_MEMORY_INDEX: FactMemoryIndex = {
  evidence: new Map(),
  removed: new Set(),
}

export function groundDerivedItem(
  item: {
    texts: ReadonlyArray<string | null | undefined>
    evidence_message_ids?: readonly string[] | null
    memory_ids?: readonly string[] | null
  },
  category: DerivedItemCategory,
  registry: FactEvidenceRegistry,
  memory: FactMemoryIndex = EMPTY_MEMORY_INDEX,
): DerivedItemGrounding {
  const bySourceId = new Map(
    registry.sources
      .filter((source) => source.source_id !== null && PRIMARY_MESSAGE_TYPES.includes(source.source_type))
      .map((source) => [source.source_id as string, source]),
  )
  const excludedIds = new Set(
    registry.excluded
      .filter((entry) => entry.source_id !== null)
      .map((entry) => entry.source_id as string),
  )

  // Memória não é evidência: citar memória equivale a citar as mensagens
  // que ELA cita. Memória removida pelo gate conta como citação inválida.
  const citedMemory = (item.memory_ids ?? []).map(String)
  const cited = [
    ...(item.evidence_message_ids ?? []).map(String),
    ...citedMemory.flatMap((id) => [...(memory.evidence.get(id) ?? [])].map(String)),
  ]
  const valid = [...new Set(cited)]
    .map((id) => bySourceId.get(id))
    .filter((source): source is FactEvidenceSource => Boolean(source))
  const citedExcluded =
    cited.some((id) => excludedIds.has(id)) ||
    citedMemory.some((id) => memory.removed.has(id))

  const blocked = item.texts.flatMap((text) =>
    unsupportedClaims(groundClaims(text, registry, { perspective: 'seller_facing' }))
      .filter((claim) => claim.kind !== 'customer_statement'),
  )

  if (blocked.length > 0) {
    return { status: 'unsupported', blocked, reason: 'specific_claim_without_primary_support' }
  }

  // Tudo o que foi citado deixou de ser evidência válida (mensagem apagada,
  // ausente da conversa que o vendedor vê hoje, de outra empresa, ou
  // memória que caiu no gate): o item perde a base factual.
  if (valid.length === 0 && citedExcluded) {
    return {
      status: category === 'gap' ? 'derived' : 'unsupported',
      blocked,
      reason: 'cited_evidence_no_longer_valid',
    }
  }

  if (category === 'customer_fact') {
    const customer = valid.filter((source) => CUSTOMER_TYPES.includes(source.source_type))

    if (valid.length > 0 && customer.length === 0) {
      // "Foi o preço?" do vendedor não prova nada sobre o cliente.
      return { status: 'unsupported', blocked, reason: 'customer_fact_cited_only_seller_messages' }
    }

    if (customer.length === 0) {
      return { status: 'derived', blocked, reason: 'no_primary_citation' }
    }

    // Citação válida, mas nada do que o item afirma aparece no que o
    // cliente disse: é interpretação ("valoriza flexibilidade"), não fato.
    const itemTerms = item.texts.flatMap((text) => specificTokens(comparableText(text)))
    const citedStems = new Set(customer.flatMap((source) => [...sourceStems(source)]))

    if (itemTerms.length > 0 && !itemTerms.some((term) => citedStems.has(stemOf(term)))) {
      return { status: 'derived', blocked, reason: 'interpretation_of_customer_words' }
    }

    return { status: 'verified', blocked, reason: null }
  }

  if (category === 'seller_fact') {
    return valid.some((source) => source.source_type === 'seller_message')
      ? { status: 'verified', blocked, reason: null }
      : { status: 'derived', blocked, reason: 'no_seller_citation' }
  }

  return valid.length > 0
    ? { status: 'verified', blocked, reason: null }
    : { status: 'derived', blocked, reason: 'no_primary_citation' }
}

// ---------------------------------------------------------------------------
// Gate de superfície: Commercial Reading e memória persistidos
// ---------------------------------------------------------------------------
//
// A leitura persistida foi escrita por um modelo a partir do ledger daquele
// momento. Antes de chegar a qualquer superfície (AGORA, ANÁLISE, CLIENTE,
// MENSAGEM), cada item é reavaliado contra as evidências VÁLIDAS de agora:
//
//   - verified: cita evidência primária com autoridade para aquele tipo de
//     afirmação e o conteúdo aparece nela;
//   - derived: interpretação/síntese sem fato específico sem suporte — pode
//     aparecer, mas como inferência ("O que inferimos");
//   - unsupported: afirma fato específico sem fonte ou só cita evidência que
//     deixou de ser válida — sai da superfície e fica no trace.
//
// Nada é reescrito no banco: o gate é aplicado na leitura, sempre.

export type FactGroundingStatus = 'verified' | 'derived'

export type FactProvenanceRemoval = {
  path: string
  summary: string
  reason: string
  claims: FactTraceEntry[]
}

export type FactProvenanceReport = {
  removed: FactProvenanceRemoval[]
  repaired: Array<{ path: string; before: string; after: string }>
  excluded_evidence: FactEvidenceExclusion[]
}

type EvidenceLike = {
  evidence_message_ids?: string[]
  memory_ids?: string[]
  grounding_status?: FactGroundingStatus
}

function repairDerivedText(
  text: string,
  registry: FactEvidenceRegistry,
): { text: string | null; changed: boolean } {
  const bad = unsupportedClaims(groundClaims(text, registry, { perspective: 'seller_facing' }))
    .filter((claim) => claim.kind !== 'customer_statement')

  if (bad.length === 0) {
    return { text, changed: false }
  }

  const repaired = stripUnsupportedClaims(text, registry, { perspective: 'seller_facing' })

  return { text: repaired, changed: true }
}

// Um item com evidências: repara o texto (remove só o trecho sem suporte),
// classifica e devolve null quando o item deve sair da superfície.
function gateEvidenceItem<T extends EvidenceLike>(
  item: T,
  textKeys: ReadonlyArray<keyof T & string>,
  category: DerivedItemCategory,
  path: string,
  registry: FactEvidenceRegistry,
  memory: FactMemoryIndex,
  report: FactProvenanceReport,
): T | null {
  const next = { ...item }

  for (const key of textKeys) {
    const value = next[key]

    if (typeof value !== 'string' || !value.trim()) {
      continue
    }

    const repaired = repairDerivedText(value, registry)

    if (!repaired.changed) {
      continue
    }

    if (!repaired.text) {
      report.removed.push({
        path,
        summary: value,
        reason: 'specific_claim_without_primary_support',
        claims: factTraceEntries(
          unsupportedClaims(groundClaims(value, registry, { perspective: 'seller_facing' })),
        ),
      })
      return null
    }

    report.repaired.push({ path: `${path}.${key}`, before: value, after: repaired.text })
    ;(next as Record<string, unknown>)[key] = repaired.text
  }

  const grounding = groundDerivedItem(
    {
      texts: textKeys.map((key) => {
        const value = next[key]
        return typeof value === 'string' ? value : null
      }),
      evidence_message_ids: next.evidence_message_ids ?? [],
      memory_ids: next.memory_ids ?? [],
    },
    category,
    registry,
    memory,
  )

  if (grounding.status === 'unsupported') {
    const summary = textKeys
      .map((key): unknown => next[key])
      .find((value): value is string => typeof value === 'string') ?? ''

    report.removed.push({
      path,
      summary,
      reason: grounding.reason ?? 'unsupported',
      claims: factTraceEntries(grounding.blocked),
    })
    return null
  }

  next.grounding_status = grounding.status

  // Citação a evidência que deixou de valer não fica pendurada no item.
  if (next.evidence_message_ids?.length) {
    const excluded = new Set(registry.excluded.map((entry) => entry.source_id))
    next.evidence_message_ids = next.evidence_message_ids.filter((id) => !excluded.has(String(id)))
  }

  return next
}

function gateList<T extends EvidenceLike>(
  items: readonly T[] | null | undefined,
  textKeys: ReadonlyArray<keyof T & string>,
  category: DerivedItemCategory,
  path: string,
  registry: FactEvidenceRegistry,
  memory: FactMemoryIndex,
  report: FactProvenanceReport,
): T[] {
  return (items ?? []).flatMap((item, index) => {
    const gated = gateEvidenceItem(item, textKeys, category, `${path}[${index}]`, registry, memory, report)
    return gated ? [gated] : []
  })
}

// Texto livre sem evidência própria (razão, explicação): só perde as
// frases com fato específico sem suporte.
function gateFreeText(
  text: string | null | undefined,
  path: string,
  registry: FactEvidenceRegistry,
  report: FactProvenanceReport,
  fallback: string | null = null,
): string | null {
  if (typeof text !== 'string' || !text.trim()) {
    return text ?? null
  }

  const repaired = repairDerivedText(text, registry)

  if (!repaired.changed) {
    return text
  }

  if (repaired.text) {
    report.repaired.push({ path, before: text, after: repaired.text })
    return repaired.text
  }

  report.removed.push({
    path,
    summary: text,
    reason: 'specific_claim_without_primary_support',
    claims: factTraceEntries(
      unsupportedClaims(groundClaims(text, registry, { perspective: 'seller_facing' })),
    ),
  })
  return fallback
}

// Texto que o cliente receberia: vale a regra customer-facing (relação,
// valor, benefício e condição precisam de fonte com autoridade).
export function gateCustomerFacingText(
  text: string | null | undefined,
  path: string,
  registry: FactEvidenceRegistry,
  report: FactProvenanceReport,
): string | null {
  if (typeof text !== 'string' || !text.trim()) {
    return text ?? null
  }

  const claims = groundClaims(text, registry, { perspective: 'customer_facing' })

  if (unsupportedClaims(claims).length === 0) {
    return text
  }

  const repaired = stripUnsupportedClaims(text, registry, { perspective: 'customer_facing' })

  if (repaired && repaired.split(/\s+/).length >= 5) {
    report.repaired.push({ path, before: text, after: repaired })
    return repaired
  }

  report.removed.push({
    path,
    summary: text,
    reason: 'customer_facing_claim_without_authoritative_source',
    claims: factTraceEntries(unsupportedClaims(claims)),
  })
  return null
}

export function emptyFactProvenanceReport(
  registry: FactEvidenceRegistry | null = null,
): FactProvenanceReport {
  return {
    removed: [],
    repaired: [],
    excluded_evidence: registry ? [...registry.excluded] : [],
  }
}

// Memória comercial (StatefulCommercialState): item cuja única base
// deixou de ser válida, ou que afirma fato específico sem suporte, sai da
// cadeia factual ativa. O índice resultante é o que a leitura pode citar.
type MemoryItemLike = {
  id: string
  kind?: string
  summary: string
  value?: string | null
  evidence_message_ids: string[]
  memory_status?: string
}

type MemoryStateLike = {
  current_moment: { summary: string; evidence_message_ids: string[] }
  current_priority: { summary: string; evidence_message_ids: string[] }
  facts: MemoryItemLike[]
  needs: MemoryItemLike[]
  open_loops: MemoryItemLike[]
  objections: MemoryItemLike[]
  commitments: MemoryItemLike[]
  signals: MemoryItemLike[]
  uncertainties: MemoryItemLike[]
}

const MEMORY_COLLECTIONS = [
  ['facts', 'customer_fact'],
  ['needs', 'customer_fact'],
  ['open_loops', 'narrative'],
  ['objections', 'customer_fact'],
  ['commitments', 'customer_fact'],
  ['signals', 'narrative'],
  ['uncertainties', 'gap'],
] as const

type MemoryItemCategory = (typeof MEMORY_COLLECTIONS)[number][1]

// Um item de memória: repara o texto e decide se continua na cadeia ativa.
function gateMemoryItem<T extends Omit<MemoryItemLike, 'id'>>(
  item: T,
  category: MemoryItemCategory,
  path: string,
  registry: FactEvidenceRegistry,
  report: FactProvenanceReport,
): T | null {
  let repairedItem: T = item

  for (const key of ['summary', 'value'] as const) {
    const value = repairedItem[key]

    if (typeof value !== 'string' || !value.trim()) {
      continue
    }

    const repaired = repairDerivedText(value, registry)

    if (!repaired.changed) {
      continue
    }

    if (!repaired.text) {
      report.removed.push({
        path,
        summary: [item.summary, item.value].filter(Boolean).join(' — '),
        reason: 'specific_claim_without_primary_support',
        claims: factTraceEntries(
          unsupportedClaims(groundClaims(value, registry, { perspective: 'seller_facing' })),
        ),
      })
      return null
    }

    report.repaired.push({ path: `${path}.${key}`, before: value, after: repaired.text })
    repairedItem = { ...repairedItem, [key]: repaired.text }
  }

  const grounding = groundDerivedItem(
    {
      texts: [repairedItem.summary, repairedItem.value ?? null],
      evidence_message_ids: repairedItem.evidence_message_ids,
    },
    category,
    registry,
  )

  if (grounding.status === 'unsupported') {
    report.removed.push({
      path,
      summary: [item.summary, item.value].filter(Boolean).join(' — '),
      reason: grounding.reason ?? 'unsupported',
      claims: factTraceEntries(grounding.blocked),
    })
    return null
  }

  return repairedItem
}

export function gateCommercialStateProvenance<S extends MemoryStateLike>(
  state: S,
  registry: FactEvidenceRegistry,
  report: FactProvenanceReport = emptyFactProvenanceReport(registry),
): { state: S; memory: FactMemoryIndex; report: FactProvenanceReport } {
  const evidence = new Map<string, readonly string[]>()
  const removed = new Set<string>()
  const next = { ...state } as S

  for (const [collection, category] of MEMORY_COLLECTIONS) {
    const kept: MemoryItemLike[] = []

    for (const [index, item] of state[collection].entries()) {
      const gated = gateMemoryItem(item, category, `state.${collection}[${index}]`, registry, report)

      if (!gated) {
        removed.add(item.id)
        continue
      }

      evidence.set(item.id, gated.evidence_message_ids)
      kept.push(gated)
    }

    ;(next as Record<string, unknown>)[collection] = kept
  }

  for (const key of ['current_moment', 'current_priority'] as const) {
    const summary = gateFreeText(state[key].summary, `state.${key}.summary`, registry, report, 'Leitura em revisão.')

    ;(next as Record<string, unknown>)[key] = { ...state[key], summary: summary ?? 'Leitura em revisão.' }
  }

  return { state: next, memory: { evidence, removed }, report }
}

// Cycle Memory (memória do ciclo, lida por ANÁLISE e pela decisão do
// AGORA): os itens desta conversa passam pelo mesmo gate. Itens de outra
// conversa do ciclo são julgados pela evidência DELA — não por esta.
type CycleMemoryItemLike = Omit<MemoryItemLike, 'id'> & {
  memory_id: string
  provenance: { conversation_key: string }
}

type CycleMemoryLike = Record<(typeof MEMORY_COLLECTIONS)[number][0], CycleMemoryItemLike[]>

export function gateCycleMemoryProvenance<M extends CycleMemoryLike>(
  memory: M,
  registry: FactEvidenceRegistry,
  conversation_key: string,
  report: FactProvenanceReport = emptyFactProvenanceReport(registry),
): { memory: M; report: FactProvenanceReport } {
  const next = { ...memory } as M

  for (const [collection, category] of MEMORY_COLLECTIONS) {
    ;(next as Record<string, unknown>)[collection] = memory[collection].flatMap((item, index) => {
      if (item.provenance?.conversation_key !== conversation_key) {
        return [item]
      }

      const gated = gateMemoryItem(item, category, `cycle_memory.${collection}[${index}]`, registry, report)
      return gated ? [gated] : []
    })
  }

  return { memory: next, report }
}

// Commercial Reading persistido → versão servida às superfícies.
type ReadingLike = {
  conversation_summary: {
    initial_context: EvidenceLike & { summary: string } | null
    evolution: EvidenceLike & { summary: string } | null
    important_events: Array<EvidenceLike & { summary: string }>
    current_state: EvidenceLike & { summary: string }
    last_customer_request_or_decision: EvidenceLike & { summary: string } | null
  }
  customer: Record<string, unknown> & {
    communication: {
      events: Array<EvidenceLike & { summary: string }>
      patterns: Array<EvidenceLike & { summary: string }>
    }
  }
  commercial_evolution: Array<EvidenceLike & { explanation: string }>
  method: {
    stages: Array<EvidenceLike & { explanation: string }>
    adherence: EvidenceLike & Record<string, unknown>
    recovery_guidance: (EvidenceLike & Record<string, unknown>) | null
  }
  seller_strengths: Array<EvidenceLike & { summary: string; why_it_matters: string }>
  improvement_points: Array<EvidenceLike & { summary: string; why_it_matters: string; impact: string; how_to_improve: string }>
  risks: {
    customer_objections: Array<EvidenceLike & { summary: string }>
    service_risks: Array<EvidenceLike & { summary: string }>
  }
  best_approach: EvidenceLike & { reason: string }
  communication: {
    recommended_question: string | null
    recommended_message: string | null
  }
}

const CUSTOMER_FACT_LISTS = [
  'objectives',
  'problems',
  'impacts',
  'needs',
  'interests',
  'decision_criteria',
  'preferences',
  'objections',
  'discussed_products',
  'competitors',
  'commitments',
] as const

const CUSTOMER_GAP_LISTS = ['open_questions', 'uncertainties', 'missing_discovery'] as const
const CUSTOMER_HISTORY_LISTS = ['resolved_information', 'superseded_information'] as const

export function gateCommercialReadingProvenance<R extends ReadingLike>(
  reading: R,
  registry: FactEvidenceRegistry,
  memory: FactMemoryIndex = EMPTY_MEMORY_INDEX,
  report: FactProvenanceReport = emptyFactProvenanceReport(registry),
): { reading: R; report: FactProvenanceReport } {
  const item = <T extends EvidenceLike>(
    value: T | null,
    keys: ReadonlyArray<keyof T & string>,
    category: DerivedItemCategory,
    path: string,
  ) => (value ? gateEvidenceItem(value, keys, category, path, registry, memory, report) : null)
  const list = <T extends EvidenceLike>(
    values: readonly T[] | null | undefined,
    keys: ReadonlyArray<keyof T & string>,
    category: DerivedItemCategory,
    path: string,
  ) => gateList(values, keys, category, path, registry, memory, report)

  // Leitura fora do formato esperado não é "verificada" por omissão: sem
  // as seções básicas, ela sai inteira pelo caminho de erro de quem chama.
  if (!reading?.conversation_summary?.current_state || !reading.customer || !reading.method) {
    throw new Error('commercial_reading_shape_unexpected')
  }

  const summary = reading.conversation_summary
  const currentState =
    item(summary.current_state, ['summary'], 'narrative', 'conversation_summary.current_state') ??
    {
      ...summary.current_state,
      summary: 'Parte do histórico desta conversa não está mais visível; a leitura foi limitada ao que continua confirmado.',
      evidence_message_ids: [],
      memory_ids: [],
      grounding_status: 'derived' as const,
    }

  const customer: Record<string, unknown> = { ...reading.customer }

  for (const key of CUSTOMER_FACT_LISTS) {
    customer[key] = list(
      reading.customer[key] as Array<EvidenceLike & { summary: string; name?: string }>,
      ['summary', 'name'],
      'customer_fact',
      `customer.${key}`,
    )
  }

  for (const key of CUSTOMER_GAP_LISTS) {
    customer[key] = list(
      reading.customer[key] as Array<EvidenceLike & { summary: string }>,
      ['summary'],
      'gap',
      `customer.${key}`,
    )
  }

  for (const key of CUSTOMER_HISTORY_LISTS) {
    customer[key] = list(
      reading.customer[key] as Array<EvidenceLike & { summary: string }>,
      ['summary'],
      'narrative',
      `customer.${key}`,
    )
  }

  customer.primary_product_interest = item(
    reading.customer.primary_product_interest as (EvidenceLike & { summary: string; name?: string }) | null,
    ['summary', 'name'],
    'customer_fact',
    'customer.primary_product_interest',
  )
  customer.communication = {
    events: list(reading.customer.communication?.events, ['summary'], 'narrative', 'customer.communication.events'),
    patterns: list(reading.customer.communication?.patterns, ['summary'], 'narrative', 'customer.communication.patterns'),
  }

  const adherence = reading.method.adherence
  const recovery = reading.method.recovery_guidance

  const gated = {
    ...reading,
    conversation_summary: {
      initial_context: item(summary.initial_context, ['summary'], 'narrative', 'conversation_summary.initial_context'),
      evolution: item(summary.evolution, ['summary'], 'narrative', 'conversation_summary.evolution'),
      important_events: list(summary.important_events, ['summary'], 'narrative', 'conversation_summary.important_events'),
      current_state: currentState,
      last_customer_request_or_decision: item(
        summary.last_customer_request_or_decision,
        ['summary'],
        'customer_fact',
        'conversation_summary.last_customer_request_or_decision',
      ),
    },
    customer,
    commercial_evolution: list(reading.commercial_evolution, ['explanation'], 'narrative', 'commercial_evolution'),
    method: {
      ...reading.method,
      stages: (reading.method.stages ?? []).map((stage, index) => ({
        ...stage,
        explanation:
          gateFreeText(stage.explanation, `method.stages[${index}].explanation`, registry, report, '') ?? '',
      })),
      adherence: adherence && {
        ...adherence,
        ...Object.fromEntries(
          ['summary', 'what_happened', 'why_it_matters', 'missing_information']
            .filter((key) => typeof adherence[key] === 'string')
            .map((key) => [key, gateFreeText(adherence[key] as string, `method.adherence.${key}`, registry, report)]),
        ),
      },
      recovery_guidance: recovery
        ? {
            ...recovery,
            ...Object.fromEntries(
              ['objective', 'missing_information', 'recommended_move']
                .filter((key) => typeof recovery[key] === 'string')
                .map((key) => [key, gateFreeText(recovery[key] as string, `method.recovery_guidance.${key}`, registry, report, '')]),
            ),
            optional_question:
              typeof recovery.optional_question === 'string'
                ? gateCustomerFacingText(recovery.optional_question, 'method.recovery_guidance.optional_question', registry, report)
                : recovery.optional_question ?? null,
          }
        : recovery,
    },
    seller_strengths: list(reading.seller_strengths, ['summary', 'why_it_matters'], 'seller_fact', 'seller_strengths'),
    improvement_points: list(
      reading.improvement_points,
      ['summary', 'why_it_matters', 'impact', 'how_to_improve'],
      'seller_fact',
      'improvement_points',
    ),
    risks: {
      customer_objections: list(reading.risks?.customer_objections, ['summary'], 'customer_fact', 'risks.customer_objections'),
      service_risks: list(reading.risks?.service_risks, ['summary'], 'narrative', 'risks.service_risks'),
    },
    best_approach: reading.best_approach && {
      ...reading.best_approach,
      reason:
        gateFreeText(reading.best_approach.reason, 'best_approach.reason', registry, report, '') ?? '',
    },
    communication: reading.communication && {
      ...reading.communication,
      recommended_question: gateCustomerFacingText(
        reading.communication.recommended_question,
        'communication.recommended_question',
        registry,
        report,
      ),
      recommended_message: gateCustomerFacingText(
        reading.communication.recommended_message,
        'communication.recommended_message',
        registry,
        report,
      ),
    },
  }

  return { reading: gated as unknown as R, report }
}

// Mensagens ausentes da conversa atual/apagadas saem da entrada do
// raciocínio (tempo, intenção, pedido pendente) — a mesma exclusão que a
// evidência factual aplica.
export function excludedPrimaryMessageIds(registry: FactEvidenceRegistry): Set<string> {
  return new Set(
    registry.excluded
      .filter(
        (entry) =>
          entry.source_id !== null &&
          (entry.reason === 'absent_from_later_view' || entry.reason === 'foreign_company') &&
          PRIMARY_MESSAGE_TYPES.includes(entry.source_type),
      )
      .map((entry) => entry.source_id as string),
  )
}

// ---------------------------------------------------------------------------
// Trace (HML)
// ---------------------------------------------------------------------------

export type FactTraceEntry = {
  claim: string
  kind: FactClaimKind
  value: string
  status: GroundedClaimStatus
  sources: string[]
  reason: string | null
}

export function factTraceEntries(claims: readonly GroundedClaim[]): FactTraceEntry[] {
  return claims.map((claim) => ({
    claim: claim.text,
    kind: claim.kind,
    value: claim.value,
    status: claim.status,
    sources: claim.sources.map((source) => `${source.source_type}:${source.source_id ?? '-'}`),
    reason: claim.reason,
  }))
}
