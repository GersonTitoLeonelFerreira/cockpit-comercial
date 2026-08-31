// ============================================================================
// Yolen — Message Intelligence Engine V1
// Frente 2 — Knowledge Resolver
//
// KnowledgeResolutionV1 — contrato principal.
//
// Princípio central: IA interpreta. Banco comprova.
//
// O Knowledge Resolver nunca transforma ausência de informação em
// conhecimento, e nunca transforma hipótese, indício, memória antiga,
// informação herdada ou Commercial Reading em verdade oficial quando a
// fonte canônica não permite isso.
//
// Este contrato não escolhe estratégia comercial, não escreve mensagem ao
// cliente e não decide governança. Ele apenas resolve o que a Yolen sabe,
// não sabe, ou sabe de forma condicionada/conflitante/proibida.
// ============================================================================

import type {
  MessageIntelligenceSourceType,
} from './source-trace'

import type {
  SourceTraceV1,
} from './source-trace'

import type {
  KnowledgeGapV1,
} from './knowledge-gap'

export const KNOWLEDGE_RESOLUTION_CONTRACT_VERSION =
  'knowledge-resolution-v1' as const

/**
 * Distinções semânticas de conhecimento. Nunca reduzir para um booleano
 * `known`.
 */
export const KNOWLEDGE_STATUSES = [
  /**
   * A informação está comprovada, vigente e aplicável ao escopo
   * solicitado.
   */
  'resolved',

  /**
   * Nenhuma fonte canônica comprova a informação buscada.
   */
  'missing',

  /**
   * Duas ou mais fontes oficiais divergem sobre a mesma informação.
   * Nenhuma é escolhida silenciosamente.
   */
  'conflicting',

  /**
   * A fonte encontrada não está mais vigente na reference_time do
   * snapshot (vencida ou ainda não iniciada).
   */
  'expired',

  /**
   * A informação existe oficialmente, mas em um escopo diferente do
   * solicitado (outro produto, outra variante, outra referência).
   */
  'out_of_scope',

  /**
   * A informação depende de uma condição declarada que não foi
   * comprovada no contexto disponível.
   */
  'condition_unproven',

  /**
   * A informação existe, mas sua afirmação plena depende de uma etapa
   * adicional (ex.: cotação, verificação) antes de poder ser tratada
   * como valor definitivo.
   */
  'approval_required',

  /**
   * A informação é uma afirmação explicitamente proibida pela fonte
   * canônica. É conhecimento — o proibido — não ausência.
   */
  'forbidden',

  /**
   * Existe algum indício ou memória, mas a evidência disponível é
   * insuficiente (herdada sem comprovação atual, ou apoiada em
   * evidência que não pode sustentar a afirmação) para tratá-la como
   * fato atual.
   */
  'insufficient_evidence',
] as const

export type KnowledgeStatus =
  (typeof KNOWLEDGE_STATUSES)[number]

/**
 * Ordem de precedência de autoridade das fontes.
 *
 * Commercial Reading é uma fonte derivada: pode ser usada como contexto
 * interpretativo, mas nunca ganha autoridade superior a ledger, memória
 * de estado, fatos, produtos, objeções, método ou configuração
 * publicados. Fontes não listadas são tratadas com a mesma autoridade
 * mínima que commercial_reading.
 */
const CANONICAL_SOURCE_AUTHORITY_ORDER: readonly MessageIntelligenceSourceType[] = [
  'conversation_message',
  'cycle',
  'request',
  'state_memory',
  'state_snapshot',
  'commercial_fact',
  'commercial_product',
  'commercial_objection',
  'commercial_method',
  'commercial_config',
  'product_catalog',
]

export function isCanonicalSourceType(
  sourceType: MessageIntelligenceSourceType,
): boolean {
  return (
    sourceType !== 'commercial_reading'
  )
}

export function sourceAuthorityRank(
  sourceType: MessageIntelligenceSourceType,
): number {
  const index =
    CANONICAL_SOURCE_AUTHORITY_ORDER.indexOf(
      sourceType,
    )

  if (index >= 0) {
    return index
  }

  // commercial_reading (e qualquer fonte não canônica) nunca supera uma
  // fonte canônica.
  return CANONICAL_SOURCE_AUTHORITY_ORDER.length
}

export type KnowledgeResolutionCandidateV1<TValue> = {
  value: TValue
  provenance: SourceTraceV1[]
}

/**
 * Unidade atômica de resolução de conhecimento.
 *
 * Todo domínio (fato, produto, objeção, leitura comercial, memória do
 * cliente) produz instâncias deste contrato, variando `TValue` e
 * `TSubject`.
 */
export type KnowledgeResolutionV1<
  TValue,
  TSubject = Record<string, unknown>,
> = {
  contract_version:
    typeof KNOWLEDGE_RESOLUTION_CONTRACT_VERSION

  domain:
    KnowledgeGapV1['domain']

  subject:
    TSubject

  status:
    KnowledgeStatus

  /**
   * Só é não-nulo quando a informação pode ser afirmada (resolved,
   * forbidden ou approval_required). Nunca é preenchido por inferência.
   */
  value:
    TValue | null

  /**
   * Candidatos concorrentes preservados sem escolha silenciosa —
   * populado em `conflicting` e, para transparência, em `expired`.
   */
  candidates:
    KnowledgeResolutionCandidateV1<TValue>[]

  /**
   * Não-nulo sempre que a informação não pôde ser plenamente
   * comprovada.
   */
  gap:
    KnowledgeGapV1 | null

  provenance:
    SourceTraceV1[]
}

export class KnowledgeResolutionContractError
  extends Error {
  readonly code: string

  constructor(
    code: string,
    message: string,
  ) {
    super(message)

    this.name =
      'KnowledgeResolutionContractError'

    this.code = code
  }
}

function fail(
  code: string,
  message: string,
): never {
  throw new KnowledgeResolutionContractError(
    code,
    message,
  )
}

const STATUSES_REQUIRING_NULL_VALUE = new Set<
  KnowledgeStatus
>([
  'missing',
  'conflicting',
  'condition_unproven',
  'out_of_scope',
  'insufficient_evidence',
])

const STATUSES_REQUIRING_GAP = new Set<
  KnowledgeStatus
>([
  'missing',
  'conflicting',
  'expired',
  'out_of_scope',
  'condition_unproven',
  'approval_required',
  'insufficient_evidence',
])

/**
 * Constrói e valida uma KnowledgeResolutionV1, garantindo que os status
 * semânticos nunca sejam reduzidos a um booleano `known` e que ausência
 * nunca seja preenchida com valor.
 */
export function createKnowledgeResolutionV1<
  TValue,
  TSubject = Record<string, unknown>,
>({
  domain,
  subject,
  status,
  value = null,
  candidates = [],
  gap = null,
  provenance = [],
}: {
  domain: KnowledgeGapV1['domain']
  subject: TSubject
  status: KnowledgeStatus
  value?: TValue | null
  candidates?: KnowledgeResolutionCandidateV1<TValue>[]
  gap?: KnowledgeGapV1 | null
  provenance?: SourceTraceV1[]
}): KnowledgeResolutionV1<TValue, TSubject> {
  if (
    !KNOWLEDGE_STATUSES.includes(status)
  ) {
    fail(
      'INVALID_KNOWLEDGE_STATUS',
      `status "${status}" não é uma distinção de conhecimento suportada.`,
    )
  }

  if (
    STATUSES_REQUIRING_NULL_VALUE.has(status) &&
    value !== null
  ) {
    fail(
      'KNOWLEDGE_VALUE_NOT_ALLOWED',
      `status "${status}" não pode carregar um value afirmado.`,
    )
  }

  if (
    status === 'resolved' &&
    value === null
  ) {
    fail(
      'KNOWLEDGE_VALUE_REQUIRED',
      'status "resolved" precisa carregar um value comprovado.',
    )
  }

  if (
    status === 'conflicting' &&
    candidates.length < 2
  ) {
    fail(
      'KNOWLEDGE_CONFLICT_REQUIRES_CANDIDATES',
      'status "conflicting" precisa preservar ao menos dois candidatos.',
    )
  }

  if (
    STATUSES_REQUIRING_GAP.has(status) &&
    gap === null
  ) {
    fail(
      'KNOWLEDGE_GAP_REQUIRED',
      `status "${status}" precisa documentar um Knowledge Gap.`,
    )
  }

  if (
    status === 'resolved' &&
    gap !== null
  ) {
    fail(
      'KNOWLEDGE_GAP_NOT_ALLOWED',
      'status "resolved" não pode carregar um Knowledge Gap.',
    )
  }

  return {
    contract_version:
      KNOWLEDGE_RESOLUTION_CONTRACT_VERSION,
    domain,
    subject,
    status,
    value,
    candidates: [
      ...candidates,
    ],
    gap,
    provenance: [
      ...provenance,
    ],
  }
}
