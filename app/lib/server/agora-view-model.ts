import 'server-only'

import {
  COMMERCIAL_READING_DECISIONS,
  type CommercialReadingDecision,
} from '@/app/lib/companion/commercial-reading-contract'

import type {
  DecisionState,
  DecisionStateInterventionCard,
  DecisionStateInterventionPriority,
  DecisionStateInterventionSource,
} from './canonical-decision-state-source'

// ---------------------------------------------------------------------------
// FASE 16.5 — AGORA seller-facing view model.
//
// Único ponto de tradução entre Decision State (fonte de verdade da
// decisão/prioridade, FASE 16.3E) e a apresentação seller-facing da aba
// AGORA. Este módulo não recalcula prioridade, não reordena candidatos,
// não decide o que é "urgente" e não gera texto novo — cada um desses
// julgamentos já foi feito por `loadCanonicalDecisionState()`. Ele só:
//
// - traduz `decision_kind` (os 23 valores possíveis de
//   `CommercialReadingDecision`, reaproveitados por
//   `primary_decision.kind`) em uma das 7 categorias de apresentação
//   abaixo (tom/ícone) — mapa exaustivo, nunca um `switch` com
//   `default` silencioso (achado da auditoria: a UI hoje mantém duas
//   tabelas de prioridade/tie-break locais e independentes de Decision
//   State, `ATTENTION_PRIORITY_RANK`/`ATTENTION_SOURCE_RANK` em
//   companion-seller-information-view.js — exatamente a duplicação que
//   este módulo substitui);
// - decide quando a decisão principal deve renderizar como card visível
//   vs. estado silencioso — `no_intervention` nunca vira card
//   artificial, mesmo com Commercial Reading rica por trás (mandato
//   §9/§10);
// - preserva `source`/`priority`/`evidence_message_ids`/`memory_ids`
//   como provenance interna (mandato §22), sem expor jargão interno
//   (nomes de `source`, `decision_kind` cru) no texto seller-facing;
// - nunca inventa texto: todo `headline`/`action` vem de
//   `summary`/`reason`/`recommended_action` já computados por Decision
//   State para o candidato vencedor — a única cópia própria deste
//   módulo é a frase fixa e conservadora usada quando `decisionState`
//   é `null` (mandato §23), que não descreve nenhuma decisão
//   comercial, só a ausência de contexto.
// ---------------------------------------------------------------------------

export const AGORA_VIEW_MODEL_STATUSES = [
  'no_intervention',
  'give_space',
  'respond',
  'follow_up',
  'handle_objection',
  'escalate',
  'deepen_discovery',
] as const

export type AgoraViewModelStatus =
  (typeof AGORA_VIEW_MODEL_STATUSES)[number]

// Mapa exaustivo dos 23 valores de `CommercialReadingDecision` (o tipo
// que `primary_decision.kind`/`interventions[].kind` reutilizam) para
// uma das 7 categorias de apresentação acima — usado só para
// tom/ícone, nunca para reordenar ou repriorizar (isso continua
// exclusivo de Decision State).
const DECISION_KIND_TO_STATUS: Record<
  CommercialReadingDecision,
  AgoraViewModelStatus
> = {
  no_intervention: 'no_intervention',
  give_space: 'give_space',

  // Ação direta recomendada agora — tanto os candidatos priorizados
  // (`respond`, `confirm_information`) quanto o passthrough de
  // `best_approach` sem nenhum candidato operacional/risco a sobrepor
  // (as demais ações "de avanço" da leitura: apresentar, comparar,
  // demonstrar valor, enviar material, propor call/reunião/visita,
  // negociar, pedir decisão, fechar). Todas são "o próximo movimento
  // recomendado agora", não um risco nem uma retomada de follow-up.
  respond: 'respond',
  ask: 'respond',
  clarify: 'respond',
  confirm_information: 'respond',
  present_solution: 'respond',
  compare: 'respond',
  demonstrate_value: 'respond',
  send_material: 'respond',
  propose_call: 'respond',
  propose_meeting: 'respond',
  propose_visit: 'respond',
  negotiate: 'respond',
  ask_for_decision: 'respond',
  close: 'respond',

  follow_up: 'follow_up',
  set_commitment: 'follow_up',

  // `wait` é uma recomendação deliberada de NÃO agir agora — o próprio
  // contrato de leitura comercial só permite canal `wait`/`none` para
  // esta decisão, e Communication Context a trata como não exigindo
  // comunicação nenhuma. Mapear para `follow_up` diria ao vendedor para
  // "retomar contato", exatamente o oposto do que Decision State
  // recomendou (achado do Codex, PR #283). `no_intervention` é a
  // categoria de tom mais próxima — informativa, nunca urgente — sem
  // reusar o kind `no_intervention` em si (que continua exclusivo do
  // silêncio central tratado em `buildAgoraViewModel`).
  wait: 'no_intervention',

  handle_objection: 'handle_objection',

  escalate: 'escalate',

  // Lacuna de descoberta/informação insuficiente para decidir o
  // próximo passo — método/coaching traduzido em decisão prática
  // (mandato §15/§16), não em checklist ou jargão de estágio.
  deepen_discovery: 'deepen_discovery',
  insufficient_information: 'deepen_discovery',
}

// Checagem de exaustividade em tempo de execução: se
// `COMMERCIAL_READING_DECISIONS` (commercial-reading-contract.ts) ganhar
// um novo valor sem que este módulo seja atualizado, falha alto e cedo
// em vez de cair silenciosamente em `undefined` — nunca um `default`
// que inventa uma categoria de apresentação.
for (const decision of COMMERCIAL_READING_DECISIONS) {
  if (!(decision in DECISION_KIND_TO_STATUS)) {
    throw new Error(
      `AGORA_VIEW_MODEL_MISSING_STATUS_MAPPING: '${decision}' não está mapeado em DECISION_KIND_TO_STATUS.`,
    )
  }
}

export type AgoraViewModelSignal = {
  status: AgoraViewModelStatus
  priority: DecisionStateInterventionPriority | null

  headline: string
  action: string

  provenance: {
    decision_kind: CommercialReadingDecision
    source: DecisionStateInterventionSource | null
    evidence_message_ids: string[]
    memory_ids: string[]
  }
}

export const AGORA_VIEW_MODEL_SILENT_REASONS = [
  // `decisionState` é `null` — sem contexto suficiente para calcular
  // qualquer decisão (reference_time inválido, ou o chamador não
  // conseguiu montar o Decision State). Nunca vira recomendação
  // comercial inventada (mandato §23).
  'unavailable',

  // `decisionState.primary_decision.kind === 'no_intervention'` —
  // Decision State avaliou e concluiu que não há nada relevante agora.
  // Estado positivo e esperado, não erro (mandato §9, cenário 10 do
  // roadmap).
  'nothing_to_do',
] as const

export type AgoraViewModelSilentReason =
  (typeof AGORA_VIEW_MODEL_SILENT_REASONS)[number]

export type AgoraViewModel = {
  // `true` quando AGORA não deve renderizar nenhum card comercial —
  // mandato §9/§23: melhor ficar quieto do que inventar utilidade.
  silent: boolean

  // Só preenchido quando `silent` é `true` — distingue "sem contexto"
  // (`unavailable`, pode justificar um estado neutro tipo
  // "carregando/indisponível" na UI) de "avaliado e não há nada a
  // fazer" (`nothing_to_do`, estado positivo). Nenhum dos dois textos é
  // gerado aqui — é responsabilidade da UI escolher a cópia neutra
  // apropriada para cada um; este módulo nunca inventa uma frase
  // seller-facing para um estado silencioso.
  silent_reason: AgoraViewModelSilentReason | null

  primary: AgoraViewModelSignal | null

  // Máximo 2 — já garantido por construção pelo próprio Decision State
  // (`DecisionState.interventions` nunca excede 2, mandato §10/§21).
  // Este presenter só preserva essa garantia, nunca a recalcula.
  secondary: AgoraViewModelSignal[]

  reference_time: string | null
}

function toSignal({
  kind,
  source,
  priority,
  summary,
  recommended_action,
  evidence_message_ids,
  memory_ids,
}: {
  kind: CommercialReadingDecision
  source: DecisionStateInterventionSource | null
  priority: DecisionStateInterventionPriority | null
  summary: string
  recommended_action: string
  evidence_message_ids: string[]
  memory_ids: string[]
}): AgoraViewModelSignal {
  // `summary` é o "motivo curto" (mandato §7 item B) — concreto e
  // específico por construção, porque vem do candidato real que
  // Decision State elegeu (objeção real, compromisso real, risco
  // real), nunca de um template genérico. `recommended_action` é a
  // "ação recomendada" (item C), pela mesma razão. `reason` (o
  // detalhamento mais longo de Decision State) não é usado aqui —
  // AGORA é curto por design (mandato §4); o campo continua disponível
  // em `DecisionState` para um consumidor que precise expandir.
  return {
    status: DECISION_KIND_TO_STATUS[kind],
    priority,

    headline: summary,
    action: recommended_action,

    provenance: {
      decision_kind: kind,
      source,
      evidence_message_ids,
      memory_ids,
    },
  }
}

function interventionCardToSignal(
  card: DecisionStateInterventionCard,
): AgoraViewModelSignal {
  return toSignal(card)
}

/**
 * Traduz o Decision State canônico (FASE 16.3E) na apresentação
 * seller-facing da aba AGORA (FASE 16.5): no máximo 1 decisão principal
 * + no máximo 2 sinais secundários (mandato §4).
 *
 * `decisionState: null` é o único caso que produz o estado silencioso
 * `unavailable` — nunca uma recomendação comercial inventada (mandato
 * §23). `primary_decision.kind === 'no_intervention'` produz o estado
 * silencioso `nothing_to_do` — Decision State já avaliou e concluiu que
 * não há nada relevante; AGORA nunca fabrica um card só para preencher
 * espaço (mandato §9).
 *
 * Função pura e síncrona — nenhum acesso a banco, nenhuma
 * reclassificação de prioridade/urgência. Toda decisão já foi tomada
 * por `loadCanonicalDecisionState()`.
 */
export function buildAgoraViewModel(
  decisionState: DecisionState | null,
): AgoraViewModel {
  if (!decisionState) {
    return {
      silent: true,
      silent_reason: 'unavailable',
      primary: null,
      secondary: [],
      reference_time: null,
    }
  }

  const primary =
    decisionState.primary_decision

  if (primary.kind === 'no_intervention') {
    return {
      silent: true,
      silent_reason: 'nothing_to_do',
      primary: null,
      secondary: [],
      reference_time: decisionState.reference_time,
    }
  }

  return {
    silent: false,
    silent_reason: null,
    primary: toSignal(primary),

    secondary:
      decisionState.interventions
        .slice(0, 2)
        .map(interventionCardToSignal),

    reference_time: decisionState.reference_time,
  }
}
