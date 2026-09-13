// ============================================================================
// Message Intelligence Engine V2 — Authoritative Decision
//
// FASE 16.9: MENSAGEM deixa de decidir uma estratégia comercial própria.
// A decisão (o quê fazer agora, com que objetivo, respeitando que
// restrições de método) já foi tomada pela mesma cadeia canônica que
// alimenta AGORA/ANÁLISE (Commercial Reading -> Decision State ->
// Communication Context, FASE 16.3F). Este módulo define o formato,
// server-agnostic, em que essa decisão chega ao V2: nem execution-plan.ts
// nem executor.ts conhecem DecisionState/CommunicationContext
// diretamente (esses tipos vivem em app/lib/server/, e app/lib/companion/
// nunca importa de app/lib/server/ — a adaptação concreta acontece em
// app/lib/server/message-intelligence-v2-authoritative-decision-adapter.ts).
//
// `available: false` significa "sem decisão autoritativa disponível agora"
// (sem Decision State, escopo divergente, ou falha best-effort) — o V2
// degrada para o comportamento anterior a esta fase (decide com cautela a
// partir do próprio contexto), nunca para uma falha dura. `available: true`
// é o caminho normal em produção e É onde os hard gates abaixo se aplicam.
// ============================================================================

import {
  COMMERCIAL_OBJECTIVES,
  type CommercialObjectiveV1,
} from '../strategy-contracts'

import type {
  CommercialReadingDecision,
} from '../../commercial-reading-contract'

export type MessageIntelligenceV2AuthoritativeDecision = {
  available: boolean

  // `null` quando `available=false`. Nunca reinterpretado pelo V2 — é o
  // mesmo valor que decidiu AGORA.
  decision_kind: CommercialReadingDecision | null

  // O que fazer agora, em texto — já é o mesmo `best_approach.reason` (ou
  // `recovery_guidance.recommended_move`) que a FASE 16.9 corrigiu para
  // deixar de ser um template genérico em canonical-decision-state-source.ts.
  // A mensagem deve EXECUTAR isto, nunca substituir por um passo diferente.
  recommended_action: string | null

  // Por que essa é a ação certa agora — contexto para a redação, nunca
  // para redecidir.
  reason: string | null

  // Rótulo determinístico e curto do objetivo da comunicação (ex.:
  // "Confirmar informação com o cliente."), já resolvido por
  // canonical-communication-context-source.ts — nunca por este módulo.
  communication_goal: string | null

  // Restrição de abordagem do método (ex.: "Aprofundar a descoberta antes
  // de avançar"), quando aplicável. Orienta o TOM/abordagem da mensagem,
  // nunca substitui recommended_action.
  method_note: string | null

  // Quando true, a decisão autoritativa já é "não comunicar agora" (sessão
  // pessoal, silêncio deliberado, decisão principal suprimida). O V2 é
  // hard-gated para intervention_needed=false/suggested_message=null neste
  // caso — não é uma preferência de prompt.
  do_not_generate: boolean

  // Subconjunto de CommercialObjectiveV1 estruturalmente compatível com
  // decision_kind (ver mapDecisionKindToAllowedObjectives). Quando
  // available=true e a lista não está vazia, recommended_commercial_objective
  // do modelo é hard-gated a pertencer a este conjunto — o modelo não pode
  // escolher um objetivo de categoria diferente da decisão já tomada (ex.:
  // não pode "voltar para descoberta" quando a decisão já é de conclusão).
  allowed_objectives: CommercialObjectiveV1[]

  // Movimentos explicitamente proibidos pela decisão atual (ex.: reabrir
  // objeção já suprimida) — reaproveitado verbatim de
  // CommunicationContext.prohibited_moves.
  prohibited_moves: string[]

  evidence_message_ids: string[]
  memory_ids: string[]
}

export function buildUnavailableAuthoritativeDecision(): MessageIntelligenceV2AuthoritativeDecision {
  return {
    available: false,
    decision_kind: null,
    recommended_action: null,
    reason: null,
    communication_goal: null,
    method_note: null,
    do_not_generate: false,
    allowed_objectives: [],
    prohibited_moves: [],
    evidence_message_ids: [],
    memory_ids: [],
  }
}

// Mapa exaustivo e determinístico decision_kind -> objetivos estruturalmente
// compatíveis. Propositalmente permissivo dentro de cada categoria (mais de
// um objetivo pode ser uma formulação razoável da mesma decisão) e
// propositalmente EXCLUDENTE entre categorias distintas — a lista nunca
// inclui um objetivo de uma fase da venda anterior à que a decisão já
// resolveu (ex.: decisões de conclusão nunca liberam 'advance_discovery').
// Isto não é o V2 "escolhendo uma técnica" de novo: é uma checagem
// estrutural de que a categoria declarada pelo modelo não contradiz a
// categoria da decisão já tomada — o mesmo tipo de derivação determinística
// já usado em commercial-reading-contract.ts (ex. deriveCurrentMethodStage).
const ALLOWED_OBJECTIVES_BY_DECISION: Record<
  CommercialReadingDecision,
  readonly CommercialObjectiveV1[]
> = {
  respond: ['answer_factually'],
  clarify: ['clarify_need', 'answer_factually'],
  ask: ['obtain_context', 'clarify_need'],
  deepen_discovery: ['advance_discovery', 'obtain_context'],
  present_solution: ['secure_next_step', 'answer_factually'],
  compare: ['confirm_decision_criteria', 'reduce_decision_risk'],
  demonstrate_value: ['secure_next_step', 'answer_factually'],
  handle_objection: ['address_objection', 'reduce_decision_risk'],
  send_material: ['secure_next_step', 'answer_factually'],
  confirm_information: ['secure_next_step', 'confirm_decision', 'answer_factually'],
  propose_call: ['secure_next_step'],
  propose_meeting: ['secure_next_step'],
  propose_visit: ['secure_next_step'],
  negotiate: ['reduce_decision_risk', 'secure_next_step'],
  ask_for_decision: ['confirm_decision', 'secure_next_step'],
  set_commitment: ['confirm_commitment', 'secure_next_step'],
  wait: ['respect_timing'],
  give_space: ['respect_timing', 'no_commercial_action'],
  follow_up: ['recover_process', 'secure_next_step'],
  escalate: ['recover_process'],
  close: ['confirm_decision', 'secure_next_step'],
  no_intervention: ['no_commercial_action'],
  insufficient_information: ['obtain_context'],
}

export function mapDecisionKindToAllowedObjectives(
  decision_kind: CommercialReadingDecision,
): CommercialObjectiveV1[] {
  const mapped =
    ALLOWED_OBJECTIVES_BY_DECISION[decision_kind]

  if (!mapped) {
    // Exaustivo por construção (todo valor de CommercialReadingDecision
    // está na tabela acima); se um novo valor for adicionado ao enum sem
    // atualizar a tabela, falhar aberto (nenhuma restrição) em vez de
    // quebrar o V2 é a escolha mais segura — o gate correspondente em
    // executor.ts só se aplica quando a lista não está vazia.
    return [
      ...COMMERCIAL_OBJECTIVES,
    ]
  }

  return [...mapped]
}
