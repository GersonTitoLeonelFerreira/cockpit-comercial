// ============================================================================
// Message Intelligence Engine V2 — LLM-first, evidence-governed generation
// Contrato de saída do modelo.
//
// Responsabilidade deste contrato: separar (A) conclusões semânticas
// auditáveis, (B) evidências/fontes usadas, (C) a mensagem customer-facing
// e (D) uma auto-revisão de segurança — sem pedir ou armazenar
// chain-of-thought. O modelo interpreta e redige; a validação determinística
// (execution-plan/executor) prova.
// ============================================================================

import type {
  CommercialObjectiveV1,
} from '../strategy-contracts'

export const MESSAGE_INTELLIGENCE_V2_GENERATION_CONTRACT_VERSION =
  'message-intelligence-v2-generation-v1' as const

export const MESSAGE_INTELLIGENCE_V2_TURN_RELEVANCE_VALUES = [
  'commercial',
  'non_commercial',
  'uncertain',
] as const

export type MessageIntelligenceV2TurnRelevance =
  (typeof MESSAGE_INTELLIGENCE_V2_TURN_RELEVANCE_VALUES)[number]

export const MESSAGE_INTELLIGENCE_V2_EVIDENCE_SOURCES = [
  'message',
  'memory',
  'product',
  'fact',
  'method',
] as const

export type MessageIntelligenceV2EvidenceSource =
  (typeof MESSAGE_INTELLIGENCE_V2_EVIDENCE_SOURCES)[number]

export type MessageIntelligenceV2GroundedClaimV1 = {
  claim: string

  supported_by: {
    source: MessageIntelligenceV2EvidenceSource
    id: string
  }
}

export type MessageIntelligenceV2SafetySelfCheckV1 = {
  no_unsupported_commercial_claim: boolean
  no_commitment_assumed_beyond_evidence: boolean
  no_resolved_question_repeated: boolean
}

export const MESSAGE_INTELLIGENCE_V2_MODEL_OUTPUT_FIELDS = [
  'intervention_needed',
  'current_turn_relevance',
  'customer_meaning',
  'seller_intent_interpretation',
  'recommended_commercial_objective',
  'method_alignment_summary',
  'evidence_message_ids',
  'evidence_memory_ids',
  'grounded_claims',
  'safety_self_check',
  'suggested_message',
] as const

export type MessageIntelligenceV2ModelOutputField =
  (typeof MESSAGE_INTELLIGENCE_V2_MODEL_OUTPUT_FIELDS)[number]

// Campo por campo, exatamente o que o modelo deve retornar. Nenhum campo de
// raciocínio passo a passo — apenas conclusões resumidas e auditáveis.
export type MessageIntelligenceV2ModelOutput = {
  intervention_needed: boolean

  // Só é usado como sinal de execução quando commercial_role/relevance
  // canônicos estiverem ausentes ou não resolverem o turno atual. Nunca é
  // persistido como verdade de banco.
  current_turn_relevance:
    MessageIntelligenceV2TurnRelevance

  customer_meaning: string
  seller_intent_interpretation: string

  recommended_commercial_objective:
    CommercialObjectiveV1 | null

  method_alignment_summary: string | null

  evidence_message_ids: string[]
  evidence_memory_ids: string[]

  grounded_claims:
    MessageIntelligenceV2GroundedClaimV1[]

  // Sinal auxiliar do próprio modelo. Nunca é aceito como prova — a
  // validação determinística sempre reexecuta as checagens reais.
  safety_self_check:
    MessageIntelligenceV2SafetySelfCheckV1

  suggested_message: string | null
}

export type MessageIntelligenceV2Output =
  MessageIntelligenceV2ModelOutput & {
    contract_version:
      typeof MESSAGE_INTELLIGENCE_V2_GENERATION_CONTRACT_VERSION
  }

export class MessageIntelligenceV2OutputContractError
  extends Error {
  readonly code: string
  readonly path: string

  constructor(
    code: string,
    path: string,
    message: string,
  ) {
    super(message)

    this.name =
      'MessageIntelligenceV2OutputContractError'

    this.code = code
    this.path = path
  }
}
