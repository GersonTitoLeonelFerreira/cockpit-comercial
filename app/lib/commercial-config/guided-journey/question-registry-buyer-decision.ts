/**
 * Registro de perguntas — Capítulo 4 (parte "arquitetura de decisão"):
 * quem aprova, critérios de decisão, processo formal, justificativa de
 * investimento, urgência real e compromissos do comprador.
 *
 * Opera sobre a camada já existente `CommercialBuyerDecisionDraft`
 * (`app/lib/commercial-config/buyer-decision-architecture.ts`, criada na
 * Fase 2). Reaproveita integralmente `getBuyerDecisionVisibility` como
 * roteamento — a Yolen já calibra isso pela forma como o negócio foi
 * descrito nos capítulos 1-3 (B2C simples pula estas perguntas quase
 * inteiras; B2B complexo recebe profundidade adicional).
 *
 * Este registro só fica disponível depois que a construção assistida do
 * método é iniciada (a mesma condição já existente na Fase 2), pois o
 * rascunho `CommercialBuyerDecisionDraft` vive dentro do workspace de
 * construção, não no rascunho de diagnóstico.
 */

import {
  getBuyerDecisionVisibility,
} from '@/app/lib/commercial-config/buyer-decision-architecture'
import type {
  CommercialMethodBuilderData,
} from '@/app/types/commercial-method-builder'
import type {
  CommercialBuyerDecisionDraft,
} from '@/app/types/commercial-method-buyer-decision'
import type { GuidedQuestion } from './types'

export interface BuyerDecisionContext {
  diagnosis: CommercialMethodBuilderData
  decision: CommercialBuyerDecisionDraft
}

function withDecision(
  context: BuyerDecisionContext,
  updater: (decision: CommercialBuyerDecisionDraft) => CommercialBuyerDecisionDraft,
): BuyerDecisionContext {
  return { ...context, decision: updater(context.decision) }
}

const PARTICIPANT_ROLES = ['Gestor', 'Diretor', 'Sócio', 'Financeiro', 'TI', 'Jurídico', 'Compras', 'Usuário']
const DECISION_CRITERIA = [
  'Preço',
  'Resultado esperado',
  'Prazo',
  'Confiança',
  'Localização',
  'Integração',
  'Segurança',
  'Facilidade de uso',
  'Suporte',
  'Condições comerciais',
]
const FORMAL_PROCESS_STEPS = ['Compras', 'Financeiro', 'Jurídico', 'TI', 'Segurança', 'Diretoria', 'Cadastro de fornecedor']
const URGENCY_DRIVERS = [
  'Renovação',
  'Início de operação',
  'Fim de contrato atual',
  'Abertura de unidade',
  'Evento',
  'Prazo regulatório',
  'Meta interna',
]
const FORMALIZATION_OPTIONS = ['Pagamento', 'Contrato', 'Assinatura', 'Cadastro', 'Matrícula', 'Documentos', 'Aprovação']

export const BUYER_DECISION_QUESTIONS: GuidedQuestion<BuyerDecisionContext>[] = [
  {
    id: 'Q53',
    chapterId: 'decision',
    title: 'Além da pessoa que conversa com o vendedor, existe alguém que precisa aprovar ou pode impedir a contratação?',
    answerType: 'yes_no_sometimes',
    showWhen: (context) => getBuyerDecisionVisibility(context.diagnosis).show_approval_and_blockers,
    getValue: (context) => context.decision.approval_or_blocker,
    setValue: (context, value) =>
      withDecision(context, (decision) => ({
        ...decision,
        approval_or_blocker: value as typeof decision.approval_or_blocker,
      })),
    activatesPrinciples: ['multi_approver'],
    writesTo: 'decision.approval_or_blocker',
  },
  {
    id: 'Q54',
    chapterId: 'decision',
    title: 'Quem normalmente participa?',
    answerType: 'multiple_choice',
    options: PARTICIPANT_ROLES.map((role) => ({ value: role, label: role })),
    showWhen: (context) =>
      getBuyerDecisionVisibility(context.diagnosis).show_approval_and_blockers &&
      context.decision.approval_or_blocker !== 'no' &&
      context.decision.approval_or_blocker !== '',
    getValue: (context) => context.decision.participant_roles,
    setValue: (context, value) =>
      withDecision(context, (decision) => ({ ...decision, participant_roles: value as string[] })),
    writesTo: 'decision.participant_roles',
  },
  {
    id: 'Q54b',
    chapterId: 'decision',
    title: 'Existe algum outro participante importante?',
    answerType: 'multiline_list',
    showWhen: (context) =>
      getBuyerDecisionVisibility(context.diagnosis).show_approval_and_blockers &&
      context.decision.approval_or_blocker !== 'no' &&
      context.decision.approval_or_blocker !== '',
    getValue: (context) => context.decision.other_participant_roles,
    setValue: (context, value) =>
      withDecision(context, (decision) => ({ ...decision, other_participant_roles: value as string[] })),
    writesTo: 'decision.other_participant_roles',
  },
  {
    id: 'Q57',
    chapterId: 'decision',
    title: 'Quando o cliente compara opções, o que normalmente pesa mais?',
    answerType: 'multiple_choice',
    options: DECISION_CRITERIA.map((item) => ({ value: item, label: item })),
    showWhen: (context) => getBuyerDecisionVisibility(context.diagnosis).show_decision_criteria,
    getValue: (context) => context.decision.decision_criteria,
    setValue: (context, value) =>
      withDecision(context, (decision) => ({ ...decision, decision_criteria: value as string[] })),
    writesTo: 'decision.decision_criteria',
  },
  {
    id: 'Q57b',
    chapterId: 'decision',
    title: 'Existe outro critério importante que não apareceu?',
    answerType: 'multiline_list',
    showWhen: (context) => getBuyerDecisionVisibility(context.diagnosis).show_decision_criteria,
    getValue: (context) => context.decision.other_decision_criteria,
    setValue: (context, value) =>
      withDecision(context, (decision) => ({ ...decision, other_decision_criteria: value as string[] })),
    writesTo: 'decision.other_decision_criteria',
  },
  {
    id: 'Q59',
    chapterId: 'decision',
    title: 'Antes da contratação, o cliente costuma precisar passar por alguma área ou processo interno?',
    answerType: 'yes_no_sometimes',
    showWhen: (context) => getBuyerDecisionVisibility(context.diagnosis).show_formal_process,
    getValue: (context) => context.decision.formal_process,
    setValue: (context, value) =>
      withDecision(context, (decision) => ({ ...decision, formal_process: value as typeof decision.formal_process })),
    activatesPrinciples: ['formal_buying_process'],
    writesTo: 'decision.formal_process',
  },
  {
    id: 'Q59b',
    chapterId: 'decision',
    title: 'Quais processos ou áreas normalmente participam?',
    answerType: 'multiple_choice',
    options: FORMAL_PROCESS_STEPS.map((item) => ({ value: item, label: item })),
    showWhen: (context) =>
      getBuyerDecisionVisibility(context.diagnosis).show_formal_process &&
      context.decision.formal_process !== 'no' &&
      context.decision.formal_process !== '',
    getValue: (context) => context.decision.formal_process_steps,
    setValue: (context, value) =>
      withDecision(context, (decision) => ({ ...decision, formal_process_steps: value as string[] })),
    writesTo: 'decision.formal_process_steps',
  },
  {
    id: 'Q59c',
    chapterId: 'decision',
    title: 'Existe outro processo interno importante?',
    answerType: 'multiline_list',
    showWhen: (context) =>
      getBuyerDecisionVisibility(context.diagnosis).show_formal_process &&
      context.decision.formal_process !== 'no' &&
      context.decision.formal_process !== '',
    getValue: (context) => context.decision.other_formal_process_steps,
    setValue: (context, value) =>
      withDecision(context, (decision) => ({ ...decision, other_formal_process_steps: value as string[] })),
    writesTo: 'decision.other_formal_process_steps',
  },
  {
    id: 'Q60',
    chapterId: 'decision',
    title: 'O cliente precisa justificar internamente por que esse investimento vale a pena?',
    answerType: 'yes_no_sometimes',
    showWhen: (context) => getBuyerDecisionVisibility(context.diagnosis).show_investment_justification,
    getValue: (context) => context.decision.investment_justification,
    setValue: (context, value) =>
      withDecision(context, (decision) => ({
        ...decision,
        investment_justification: value as typeof decision.investment_justification,
      })),
    writesTo: 'decision.investment_justification',
  },
  {
    id: 'Q60b',
    chapterId: 'decision',
    title: 'O que costuma pesar nessa justificativa interna?',
    answerType: 'long_text',
    showWhen: (context) =>
      getBuyerDecisionVisibility(context.diagnosis).show_investment_justification &&
      context.decision.investment_justification !== 'no' &&
      context.decision.investment_justification !== '',
    getValue: (context) => context.decision.investment_justification_notes,
    setValue: (context, value) =>
      withDecision(context, (decision) => ({ ...decision, investment_justification_notes: value as string })),
    writesTo: 'decision.investment_justification_notes',
  },
  {
    id: 'Q61',
    chapterId: 'decision',
    title: 'Existe normalmente alguma data, evento ou consequência real que influencia quando o cliente precisa decidir?',
    helper: 'Não invente urgência: só marque isso se realmente existir na sua operação.',
    answerType: 'yes_no_sometimes',
    showWhen: (context) => getBuyerDecisionVisibility(context.diagnosis).show_real_urgency,
    getValue: (context) => context.decision.real_urgency,
    setValue: (context, value) =>
      withDecision(context, (decision) => ({ ...decision, real_urgency: value as typeof decision.real_urgency })),
    writesTo: 'decision.real_urgency',
  },
  {
    id: 'Q62',
    chapterId: 'decision',
    title: 'O que normalmente cria esse prazo?',
    answerType: 'multiple_choice',
    options: URGENCY_DRIVERS.map((item) => ({ value: item, label: item })),
    showWhen: (context) =>
      getBuyerDecisionVisibility(context.diagnosis).show_real_urgency &&
      context.decision.real_urgency !== 'no' &&
      context.decision.real_urgency !== '',
    getValue: (context) => context.decision.urgency_drivers,
    setValue: (context, value) =>
      withDecision(context, (decision) => ({ ...decision, urgency_drivers: value as string[] })),
    writesTo: 'decision.urgency_drivers',
  },
  {
    id: 'Q62b',
    chapterId: 'decision',
    title: 'Existe outro motivo que costuma criar prazo?',
    answerType: 'multiline_list',
    showWhen: (context) =>
      getBuyerDecisionVisibility(context.diagnosis).show_real_urgency &&
      context.decision.real_urgency !== 'no' &&
      context.decision.real_urgency !== '',
    getValue: (context) => context.decision.other_urgency_drivers,
    setValue: (context, value) =>
      withDecision(context, (decision) => ({ ...decision, other_urgency_drivers: value as string[] })),
    writesTo: 'decision.other_urgency_drivers',
  },
  {
    id: 'Q_event_success',
    chapterId: 'decision',
    title: 'O que precisa acontecer nesses momentos para eles realmente ajudarem a venda a avançar?',
    helper: 'Para cada momento (tour, demo, proposta...) que você já indicou existir, descreva o que precisa ficar comprovado.',
    answerType: 'event_criteria_list',
    showWhen: (context) => getBuyerDecisionVisibility(context.diagnosis).show_event_purpose,
    getValue: (context) => context.decision.event_success_criteria,
    setValue: (context, value) =>
      withDecision(context, (decision) => ({
        ...decision,
        event_success_criteria: value as typeof decision.event_success_criteria,
      })),
    isAnswered: (context) => {
      const items = context.decision.event_success_criteria
      if (items.length === 0) return false
      return items.every((item) => item.criteria.length > 0)
    },
    writesTo: 'decision.event_success_criteria',
  },
  {
    id: 'Q64_commitments',
    chapterId: 'decision',
    title: 'Quais compromissos o cliente costuma assumir antes da compra definitiva?',
    helper: 'Ex.: confirmar orçamento internamente, marcar uma data, apresentar a proposta para outra pessoa decidir.',
    answerType: 'multiline_list',
    getValue: (context) => context.decision.buyer_commitment_signals,
    setValue: (context, value) =>
      withDecision(context, (decision) => ({ ...decision, buyer_commitment_signals: value as string[] })),
    writesTo: 'decision.buyer_commitment_signals',
  },
  {
    id: 'Q67_formalization',
    chapterId: 'decision',
    title: 'O que ainda precisa acontecer para formalizar a venda?',
    answerType: 'multiple_choice',
    options: FORMALIZATION_OPTIONS.map((item) => ({ value: item, label: item })),
    getValue: (context) => context.decision.formalization_steps,
    setValue: (context, value) =>
      withDecision(context, (decision) => ({ ...decision, formalization_steps: value as string[] })),
    writesTo: 'decision.formalization_steps',
  },
  {
    id: 'Q_customization',
    chapterId: 'decision',
    title: 'A solução se adapta a cada cliente ou é praticamente igual para todos?',
    answerType: 'single_choice',
    options: [
      { value: 'standard', label: 'Praticamente igual' },
      { value: 'some_adjustments', label: 'Alguns ajustes' },
      { value: 'highly_customized', label: 'Muito personalizada' },
    ],
    // O diagnóstico (Q03) já pergunta exatamente isso com a mesma escala.
    // Só perguntar de novo se o diagnóstico não respondeu.
    showWhen: (context) => !context.diagnosis.company_profile.offer.customization_depth,
    getValue: (context) => context.decision.solution_customization,
    setValue: (context, value) =>
      withDecision(context, (decision) => ({
        ...decision,
        solution_customization: value as typeof decision.solution_customization,
      })),
    writesTo: 'decision.solution_customization',
  },
  {
    id: 'Q_operation_intensity',
    chapterId: 'decision',
    title: 'Como é o ritmo geral das vendas: muitas e rápidas, equilibrado, ou poucas e mais complexas?',
    answerType: 'single_choice',
    options: [
      { value: 'high_volume_short', label: 'Muitas vendas curtas' },
      { value: 'balanced', label: 'Equilibrado' },
      { value: 'few_complex', label: 'Poucas oportunidades, mais complexas' },
    ],
    // O diagnóstico (Q14) já pergunta exatamente isso com a mesma escala.
    // Só perguntar de novo se o diagnóstico não respondeu.
    showWhen: (context) => !context.diagnosis.company_profile.buyer_behavior?.workload_pattern,
    getValue: (context) => context.decision.operation_intensity,
    setValue: (context, value) =>
      withDecision(context, (decision) => ({
        ...decision,
        operation_intensity: value as typeof decision.operation_intensity,
      })),
    writesTo: 'decision.operation_intensity',
  },
]
