import type { LeadStatus } from '@/app/types/sales_cycles'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type StageEffect = 'keep' | 'suggest_advance'

// ---------------------------------------------------------------------------
// ActionEffect — define o comportamento/efeito de cada ação registrada
// ---------------------------------------------------------------------------
export interface ActionEffect {
  /** Referência ao StageAction.id */
  actionId: string

  /** Mantém a etapa atual ou sugere avanço para a próxima */
  stageEffect: StageEffect

  /** Etapa sugerida para avanço (null quando stageEffect === 'keep') */
  suggestedNextStatus: LeadStatus | null

  // --- Detalhe contextual ---
  /** Obrigatório preencher detalhe do resultado? */
  requiresResultDetail: boolean
  /** Placeholder contextual para o campo de detalhe */
  resultDetailPlaceholder?: string

  // --- Próxima ação ---
  /** Obrigatório definir uma próxima ação? */
  requiresNextAction: boolean
  /** Recomendado (não obrigatório) definir uma próxima ação? */
  recommendsNextAction: boolean
  /** Lista de próximas ações sugeridas */
  suggestedNextActions: string[]

  // --- Data/hora ---
  /** Obrigatório definir data/hora da próxima ação? */
  requiresNextActionDate: boolean
  /** Recomendado (não obrigatório) definir data/hora da próxima ação? */
  recommendsNextActionDate: boolean

  // --- Relação com ganho/perda ---
  /** Pode indicar caminho para ganho? */
  canLeadToWon: boolean
  /** Pode indicar caminho para perda? */
  canLeadToLost: boolean
}

// ---------------------------------------------------------------------------
// Matriz de efeitos — fonte de verdade do comportamento de cada ação
// ---------------------------------------------------------------------------

export const ACTION_EFFECTS: Record<string, ActionEffect> = {

  // ── ETAPA: NOVO ────────────────────────────────────────────────────────────

  novo_abordagem_realizada: {
    actionId: 'novo_abordagem_realizada',
    stageEffect: 'suggest_advance',
    suggestedNextStatus: 'contato',
    requiresResultDetail: false,
    requiresNextAction: false,
    recommendsNextAction: true,
    suggestedNextActions: ['Aguardar retorno', 'Nova tentativa', 'Whats follow-up'],
    requiresNextActionDate: false,
    recommendsNextActionDate: true,
    canLeadToWon: false,
    canLeadToLost: false,
  },

  novo_ligacao_feita: {
    actionId: 'novo_ligacao_feita',
    stageEffect: 'suggest_advance',
    suggestedNextStatus: 'contato',
    requiresResultDetail: false,
    requiresNextAction: false,
    recommendsNextAction: true,
    suggestedNextActions: ['Ligar novamente', 'Whats follow-up', 'Aguardar retorno'],
    requiresNextActionDate: false,
    recommendsNextActionDate: true,
    canLeadToWon: false,
    canLeadToLost: false,
  },

  novo_whatsapp_enviado: {
    actionId: 'novo_whatsapp_enviado',
    stageEffect: 'suggest_advance',
    suggestedNextStatus: 'contato',
    requiresResultDetail: false,
    requiresNextAction: false,
    recommendsNextAction: true,
    suggestedNextActions: ['Aguardar retorno', 'Ligar', 'Nova mensagem'],
    requiresNextActionDate: false,
    recommendsNextActionDate: true,
    canLeadToWon: false,
    canLeadToLost: false,
  },

  novo_email_enviado: {
    actionId: 'novo_email_enviado',
    stageEffect: 'suggest_advance',
    suggestedNextStatus: 'contato',
    requiresResultDetail: false,
    requiresNextAction: false,
    recommendsNextAction: true,
    suggestedNextActions: ['Aguardar retorno', 'Ligar', 'Whats follow-up'],
    requiresNextActionDate: false,
    recommendsNextActionDate: true,
    canLeadToWon: false,
    canLeadToLost: false,
  },

  novo_telefone_incorreto: {
    actionId: 'novo_telefone_incorreto',
    stageEffect: 'keep',
    suggestedNextStatus: null,
    requiresResultDetail: true,
    resultDetailPlaceholder: 'Descreva o problema com o contato (ex: número fora de serviço, não existe…)',
    requiresNextAction: false,
    recommendsNextAction: false,
    suggestedNextActions: [],
    requiresNextActionDate: false,
    recommendsNextActionDate: false,
    canLeadToWon: false,
    canLeadToLost: true,
  },

  // ── ETAPA: CONTATO ─────────────────────────────────────────────────────────

  contato_demonstrou_interesse: {
    actionId: 'contato_demonstrou_interesse',
    stageEffect: 'suggest_advance',
    suggestedNextStatus: 'respondeu',
    requiresResultDetail: false,
    requiresNextAction: false,
    recommendsNextAction: true,
    suggestedNextActions: ['Qualificar necessidade', 'Enviar informações', 'Agendar reunião'],
    requiresNextActionDate: false,
    recommendsNextActionDate: true,
    canLeadToWon: false,
    canLeadToLost: false,
  },

  contato_pediu_informacoes: {
    actionId: 'contato_pediu_informacoes',
    stageEffect: 'keep',
    suggestedNextStatus: null,
    requiresResultDetail: false,
    requiresNextAction: false,
    recommendsNextAction: true,
    suggestedNextActions: ['Enviar informações', 'Agendar retorno', 'Preparar proposta'],
    requiresNextActionDate: false,
    recommendsNextActionDate: true,
    canLeadToWon: false,
    canLeadToLost: false,
  },

  contato_respondeu_duvida: {
    actionId: 'contato_respondeu_duvida',
    stageEffect: 'suggest_advance',
    suggestedNextStatus: 'respondeu',
    requiresResultDetail: false,
    requiresNextAction: false,
    recommendsNextAction: true,
    suggestedNextActions: ['Qualificar lead', 'Enviar proposta', 'Agendar visita'],
    requiresNextActionDate: false,
    recommendsNextActionDate: false,
    canLeadToWon: false,
    canLeadToLost: false,
  },

  contato_agendamento_realizado: {
    actionId: 'contato_agendamento_realizado',
    stageEffect: 'suggest_advance',
    suggestedNextStatus: 'respondeu',
    requiresResultDetail: false,
    requiresNextAction: false,
    recommendsNextAction: true,
    suggestedNextActions: ['Confirmar agendamento', 'Preparar material', 'Lembrete véspera'],
    requiresNextActionDate: true,
    recommendsNextActionDate: true,
    canLeadToWon: false,
    canLeadToLost: false,
  },

  contato_pediu_proposta: {
    actionId: 'contato_pediu_proposta',
    stageEffect: 'suggest_advance',
    suggestedNextStatus: 'negociacao',
    requiresResultDetail: true,
    resultDetailPlaceholder: 'Descreva o que o lead solicitou na proposta (produto, prazo, condições…)',
    requiresNextAction: true,
    recommendsNextAction: false,
    suggestedNextActions: ['Enviar proposta', 'Agendar reunião de apresentação', 'Preparar proposta personalizada'],
    requiresNextActionDate: false,
    recommendsNextActionDate: true,
    canLeadToWon: false,
    canLeadToLost: false,
  },

  // ── ETAPA: RESPONDEU ───────────────────────────────────────────────────────

  respondeu_qualificacao_realizada: {
    actionId: 'respondeu_qualificacao_realizada',
    stageEffect: 'suggest_advance',
    suggestedNextStatus: 'negociacao',
    requiresResultDetail: true,
    resultDetailPlaceholder: 'Registre o resultado da qualificação (budget, autoridade, necessidade, prazo…)',
    requiresNextAction: true,
    recommendsNextAction: false,
    suggestedNextActions: ['Enviar proposta', 'Agendar reunião de negociação', 'Enviar contrato'],
    requiresNextActionDate: false,
    recommendsNextActionDate: true,
    canLeadToWon: false,
    canLeadToLost: false,
  },

  respondeu_proposta_apresentada: {
    actionId: 'respondeu_proposta_apresentada',
    stageEffect: 'suggest_advance',
    suggestedNextStatus: 'negociacao',
    requiresResultDetail: true,
    resultDetailPlaceholder: 'Descreva a proposta apresentada (valores, condições, prazo de resposta…)',
    requiresNextAction: true,
    recommendsNextAction: false,
    suggestedNextActions: ['Aguardar retorno', 'Follow-up proposta', 'Agendar fechamento'],
    requiresNextActionDate: false,
    recommendsNextActionDate: true,
    canLeadToWon: false,
    canLeadToLost: false,
  },

  respondeu_duvida_respondida: {
    actionId: 'respondeu_duvida_respondida',
    stageEffect: 'keep',
    suggestedNextStatus: null,
    requiresResultDetail: false,
    requiresNextAction: false,
    recommendsNextAction: true,
    suggestedNextActions: ['Aguardar retorno', 'Enviar proposta', 'Agendar reunião'],
    requiresNextActionDate: false,
    recommendsNextActionDate: false,
    canLeadToWon: false,
    canLeadToLost: false,
  },

  respondeu_visita_agendada: {
    actionId: 'respondeu_visita_agendada',
    stageEffect: 'keep',
    suggestedNextStatus: null,
    requiresResultDetail: false,
    requiresNextAction: false,
    recommendsNextAction: true,
    suggestedNextActions: ['Confirmar visita', 'Preparar apresentação', 'Lembrete véspera'],
    requiresNextActionDate: true,
    recommendsNextActionDate: true,
    canLeadToWon: false,
    canLeadToLost: false,
  },

  respondeu_negociacao_iniciada: {
    actionId: 'respondeu_negociacao_iniciada',
    stageEffect: 'suggest_advance',
    suggestedNextStatus: 'negociacao',
    requiresResultDetail: true,
    resultDetailPlaceholder: 'Descreva como a negociação foi iniciada (contexto, demanda, expectativas…)',
    requiresNextAction: true,
    recommendsNextAction: false,
    suggestedNextActions: ['Enviar proposta', 'Agendar reunião', 'Definir condições'],
    requiresNextActionDate: false,
    recommendsNextActionDate: true,
    canLeadToWon: false,
    canLeadToLost: false,
  },

  // ── ETAPA: NEGOCIAÇÃO ──────────────────────────────────────────────────────

  negociacao_proposta_final_enviada: {
    actionId: 'negociacao_proposta_final_enviada',
    stageEffect: 'keep',
    suggestedNextStatus: null,
    requiresResultDetail: true,
    resultDetailPlaceholder: 'Descreva a proposta final (valores, validade, condições de pagamento…)',
    requiresNextAction: true,
    recommendsNextAction: false,
    suggestedNextActions: ['Aguardar retorno', 'Follow-up proposta', 'Agendar fechamento'],
    requiresNextActionDate: false,
    recommendsNextActionDate: true,
    canLeadToWon: true,
    canLeadToLost: false,
  },

  negociacao_objecao_registrada: {
    actionId: 'negociacao_objecao_registrada',
    stageEffect: 'keep',
    suggestedNextStatus: null,
    requiresResultDetail: true,
    resultDetailPlaceholder: 'Descreva a objeção levantada e como foi tratada',
    requiresNextAction: true,
    recommendsNextAction: false,
    suggestedNextActions: ['Revisar objeção', 'Ajustar proposta', 'Contra-argumentar'],
    requiresNextActionDate: false,
    recommendsNextActionDate: true,
    canLeadToWon: false,
    canLeadToLost: true,
  },

  negociacao_condicao_comercial: {
    actionId: 'negociacao_condicao_comercial',
    stageEffect: 'keep',
    suggestedNextStatus: null,
    requiresResultDetail: true,
    resultDetailPlaceholder: 'Descreva a condição comercial discutida (desconto, prazo, parcelamento…)',
    requiresNextAction: false,
    recommendsNextAction: true,
    suggestedNextActions: ['Ajustar proposta', 'Enviar proposta final', 'Agendar fechamento'],
    requiresNextActionDate: false,
    recommendsNextActionDate: true,
    canLeadToWon: true,
    canLeadToLost: false,
  },

  negociacao_fechamento_agendado: {
    actionId: 'negociacao_fechamento_agendado',
    stageEffect: 'keep',
    suggestedNextStatus: null,
    requiresResultDetail: false,
    requiresNextAction: false,
    recommendsNextAction: true,
    suggestedNextActions: ['Confirmar fechamento', 'Preparar contrato', 'Lembrete véspera'],
    requiresNextActionDate: true,
    recommendsNextActionDate: true,
    canLeadToWon: true,
    canLeadToLost: false,
  },

  negociacao_retorno_negociacao: {
    actionId: 'negociacao_retorno_negociacao',
    stageEffect: 'keep',
    suggestedNextStatus: null,
    requiresResultDetail: false,
    requiresNextAction: true,
    recommendsNextAction: false,
    suggestedNextActions: ['Follow-up', 'Reapresentar proposta', 'Agendar nova reunião'],
    requiresNextActionDate: false,
    recommendsNextActionDate: true,
    canLeadToWon: false,
    canLeadToLost: false,
  },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Retorna o efeito de uma ação pelo ID, ou undefined se não encontrado */
export function getActionEffect(actionId: string): ActionEffect | undefined {
  return ACTION_EFFECTS[actionId]
}
