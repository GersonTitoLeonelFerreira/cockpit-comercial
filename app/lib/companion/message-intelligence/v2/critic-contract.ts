// ============================================================================
// Message Intelligence Engine V2 — Semantic Critic
// Contrato de saída.
//
// Chamada separada, pequena e estruturada — não é agente, não usa tools,
// não redige a mensagem final. Sua única responsabilidade é avaliar
// semanticamente a candidate já produzida e validada deterministicamente
// pelo modelo principal, complementando (nunca substituindo) os gates
// determinísticos de evidência/schema/fatos protegidos/commitment/gates
// canônicos, que continuam intactos em executor.ts.
// ============================================================================

// v2: adiciona seller_intent_not_executed (boolean + reason code) — uma
// candidate pode não contradizer seller_intent e ainda assim não a
// executar materialmente. Mudança incompatível do Structured Output
// (novo campo obrigatório em modo strict), daí o incremento de versão.
export const MESSAGE_INTELLIGENCE_V2_CRITIC_CONTRACT_VERSION =
  'message-intelligence-v2-critic-v2' as const

export const MESSAGE_INTELLIGENCE_V2_CRITIC_VERDICTS = [
  'pass',
  'repair',
  'block',
] as const

export type MessageIntelligenceV2CriticVerdict =
  (typeof MESSAGE_INTELLIGENCE_V2_CRITIC_VERDICTS)[number]

export const MESSAGE_INTELLIGENCE_V2_CRITIC_REASON_CODES = [
  'missing_grounded_claim',
  'claim_source_mismatch',
  'semantic_mismatch',
  'repeated_resolved_question',
  'commitment_assumption',
  'seller_intent_became_fact',
  'seller_intent_not_executed',
  'method_violation',
  'unsupported_claim',
  'other',
] as const

export type MessageIntelligenceV2CriticReasonCode =
  (typeof MESSAGE_INTELLIGENCE_V2_CRITIC_REASON_CODES)[number]

export const MESSAGE_INTELLIGENCE_V2_CRITIC_MODEL_OUTPUT_FIELDS = [
  'verdict',
  'reason_codes',
  'unsupported_claim_indexes',
  'missing_grounded_claim',
  'claim_source_mismatch',
  'semantic_mismatch',
  'repeated_resolved_question',
  'commitment_assumption',
  'seller_intent_became_fact',
  'seller_intent_not_executed',
  'method_violation',
  'concise_feedback',
] as const

export type MessageIntelligenceV2CriticModelOutputField =
  (typeof MESSAGE_INTELLIGENCE_V2_CRITIC_MODEL_OUTPUT_FIELDS)[number]

// Conclusões booleanas resumidas e auditáveis — não chain-of-thought.
export type MessageIntelligenceV2CriticModelOutput = {
  verdict: MessageIntelligenceV2CriticVerdict

  reason_codes:
    MessageIntelligenceV2CriticReasonCode[]

  unsupported_claim_indexes: number[]

  missing_grounded_claim: boolean
  claim_source_mismatch: boolean
  semantic_mismatch: boolean
  repeated_resolved_question: boolean
  commitment_assumption: boolean
  seller_intent_became_fact: boolean
  seller_intent_not_executed: boolean
  method_violation: boolean

  concise_feedback: string | null
}

export type MessageIntelligenceV2CriticOutput =
  MessageIntelligenceV2CriticModelOutput & {
    contract_version:
      typeof MESSAGE_INTELLIGENCE_V2_CRITIC_CONTRACT_VERSION
  }

export class MessageIntelligenceV2CriticContractError
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
      'MessageIntelligenceV2CriticContractError'

    this.code = code
    this.path = path
  }
}
