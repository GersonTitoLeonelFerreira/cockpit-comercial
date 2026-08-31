// ============================================================================
// Yolen — Message Intelligence Engine V1
// Frente 2 — Knowledge Resolver
//
// Knowledge Gap: representa explicitamente que uma informação necessária
// para sustentar uma afirmação ou movimento comercial não está comprovada
// no contexto disponível.
//
// Um gap NUNCA inventa resposta, NUNCA usa conhecimento genérico e NUNCA
// transforma ausência em conhecimento. Ele apenas documenta, com
// provenance, o que foi buscado e por que não pôde ser comprovado.
// ============================================================================

import type {
  SourceTraceV1,
} from './source-trace'

export const KNOWLEDGE_GAP_CONTRACT_VERSION =
  'knowledge-gap-v1' as const

export const KNOWLEDGE_GAP_DOMAINS = [
  'commercial_fact',
  'commercial_product',
  'commercial_objection',
  'commercial_method',
  'commercial_config',
  'commercial_reading',
  'customer_memory',
  'conversation',
] as const

export type KnowledgeGapDomain =
  (typeof KNOWLEDGE_GAP_DOMAINS)[number]

export const KNOWLEDGE_GAP_REASONS = [
  /**
   * Nenhuma fonte canônica contém a informação buscada.
   */
  'not_found',

  /**
   * Nenhuma fonte ativa está disponível para o domínio (ex.: método
   * comercial não publicado, leitura comercial ausente).
   */
  'no_active_source',

  /**
   * O fato depende de uma condição declarada que não foi comprovada
   * no contexto disponível.
   */
  'unverifiable_condition',

  /**
   * A fonte encontrada não está mais vigente na reference_time.
   */
  'expired_source',

  /**
   * A informação existe, mas em um escopo diferente do solicitado.
   */
  'scope_mismatch',

  /**
   * Duas ou mais fontes oficiais divergem sobre o mesmo fato.
   */
  'conflicting_sources',

  /**
   * A evidência citada não pode sustentar a afirmação (ex.: mensagem
   * excluída/deletada, evidência fora do ciclo atual).
   */
  'unsupported_evidence',

  /**
   * A informação foi herdada de um ciclo anterior e não possui
   * evidência suficiente no ciclo atual.
   */
  'inherited_without_current_evidence',

  /**
   * A informação depende de cotação, verificação ou aprovação adicional
   * antes de poder ser afirmada como valor definitivo.
   */
  'requires_quote_or_approval',

  /**
   * A informação foi superada por uma informação mais recente.
   */
  'superseded_by_newer_information',

  /**
   * A consulta encontrou mais de um item legítimo e a fonte não
   * permite escolher um deles silenciosamente (ex.: memória do
   * cliente consultada por `kind`, sem `memory_id`, com múltiplos
   * itens ativos do mesmo kind — coexistir não é conflito).
   */
  'ambiguous_multiple_matches',
] as const

export type KnowledgeGapReason =
  (typeof KNOWLEDGE_GAP_REASONS)[number]

/**
 * Knowledge Gap.
 *
 * Carrega provenance suficiente para mostrar o que foi buscado, por que
 * não foi possível comprovar e se alguma fonte parcial existia — sem
 * nunca preencher a ausência com inferência.
 */
export type KnowledgeGapV1 = {
  contract_version:
    typeof KNOWLEDGE_GAP_CONTRACT_VERSION

  domain:
    KnowledgeGapDomain

  reason:
    KnowledgeGapReason

  /**
   * Descrição estável do que foi buscado (ex.: "fact_key=support_hours").
   */
  sought: string

  /**
   * Explicação em linguagem natural de por que a informação não pôde
   * ser comprovada. Nunca é usada como afirmação comercial.
   */
  explanation: string

  /**
   * Fontes parciais que existiam mas não foram suficientes para
   * sustentar uma resolução (ex.: fato expirado, memória herdada sem
   * evidência atual, fontes conflitantes).
   */
  partial_sources:
    SourceTraceV1[]
}

export function createKnowledgeGapV1({
  domain,
  reason,
  sought,
  explanation,
  partial_sources = [],
}: {
  domain: KnowledgeGapDomain
  reason: KnowledgeGapReason
  sought: string
  explanation: string
  partial_sources?: SourceTraceV1[]
}): KnowledgeGapV1 {
  return {
    contract_version:
      KNOWLEDGE_GAP_CONTRACT_VERSION,
    domain,
    reason,
    sought,
    explanation,
    partial_sources: [
      ...partial_sources,
    ],
  }
}
