import type { LeadStatus } from '@/app/types/sales_cycles'

// ---------------------------------------------------------------------------
// Categorias de ação
// ---------------------------------------------------------------------------
export type ActionCategory = 'activity' | 'outcome'

// ---------------------------------------------------------------------------
// Stage Action — unidade atômica da taxonomia
// ---------------------------------------------------------------------------
export interface StageAction {
  id: string               // identificador único (snake_case, com prefixo de etapa)
  label: string            // nome comercial em pt-BR
  stage: LeadStatus        // etapa a que pertence
  category: ActionCategory // tipo: atividade ou resultado
  suggestedNextStatus: LeadStatus | null  // sugestão de movimentação (null = fica na mesma etapa)
  icon?: string            // emoji ou identificador de ícone (opcional)
}

// ---------------------------------------------------------------------------
// Catálogo por etapa
// ---------------------------------------------------------------------------

export const STAGE_ACTIONS: Record<'novo' | 'contato' | 'respondeu' | 'negociacao', StageAction[]> = {
  novo: [
    { id: 'novo_abordagem_realizada',  label: 'Abordagem realizada',   stage: 'novo', category: 'activity', suggestedNextStatus: 'contato', icon: '📞' },
    { id: 'novo_ligacao_feita',        label: 'Ligação feita',         stage: 'novo', category: 'activity', suggestedNextStatus: 'contato', icon: '📱' },
    { id: 'novo_whatsapp_enviado',     label: 'WhatsApp enviado',      stage: 'novo', category: 'activity', suggestedNextStatus: 'contato', icon: '💬' },
    { id: 'novo_email_enviado',        label: 'Email enviado',         stage: 'novo', category: 'activity', suggestedNextStatus: 'contato', icon: '📧' },
    { id: 'novo_telefone_incorreto',   label: 'Telefone incorreto',    stage: 'novo', category: 'outcome',  suggestedNextStatus: null,      icon: '⚠️' },
  ],
  contato: [
    { id: 'contato_demonstrou_interesse',   label: 'Demonstrou interesse',    stage: 'contato', category: 'outcome',  suggestedNextStatus: 'respondeu',   icon: '✨' },
    { id: 'contato_pediu_informacoes',      label: 'Pediu mais informações',  stage: 'contato', category: 'outcome',  suggestedNextStatus: null,          icon: '❓' },
    { id: 'contato_respondeu_duvida',       label: 'Respondeu dúvida',        stage: 'contato', category: 'outcome',  suggestedNextStatus: 'respondeu',   icon: '💡' },
    { id: 'contato_agendamento_realizado',  label: 'Agendamento realizado',   stage: 'contato', category: 'outcome',  suggestedNextStatus: 'respondeu',   icon: '📅' },
    { id: 'contato_pediu_proposta',         label: 'Pediu proposta',          stage: 'contato', category: 'outcome',  suggestedNextStatus: 'negociacao',  icon: '📋' },
  ],
  respondeu: [
    { id: 'respondeu_qualificacao_realizada', label: 'Qualificação realizada', stage: 'respondeu', category: 'outcome',  suggestedNextStatus: 'negociacao', icon: '🎯' },
    { id: 'respondeu_proposta_apresentada',   label: 'Proposta apresentada',   stage: 'respondeu', category: 'activity', suggestedNextStatus: 'negociacao', icon: '📄' },
    { id: 'respondeu_duvida_respondida',      label: 'Dúvida respondida',      stage: 'respondeu', category: 'activity', suggestedNextStatus: null,         icon: '💬' },
    { id: 'respondeu_visita_agendada',        label: 'Visita agendada',        stage: 'respondeu', category: 'outcome',  suggestedNextStatus: null,         icon: '🏢' },
    { id: 'respondeu_negociacao_iniciada',    label: 'Negociação iniciada',    stage: 'respondeu', category: 'outcome',  suggestedNextStatus: 'negociacao', icon: '🤝' },
  ],
  negociacao: [
    { id: 'negociacao_proposta_final_enviada', label: 'Proposta final enviada',        stage: 'negociacao', category: 'activity', suggestedNextStatus: null, icon: '📨' },
    { id: 'negociacao_objecao_registrada',     label: 'Objeção registrada',            stage: 'negociacao', category: 'outcome',  suggestedNextStatus: null, icon: '🚧' },
    { id: 'negociacao_condicao_comercial',     label: 'Condição comercial discutida',  stage: 'negociacao', category: 'activity', suggestedNextStatus: null, icon: '💰' },
    { id: 'negociacao_fechamento_agendado',    label: 'Fechamento agendado',           stage: 'negociacao', category: 'outcome',  suggestedNextStatus: null, icon: '📅' },
    { id: 'negociacao_retorno_negociacao',     label: 'Retorno de negociação',         stage: 'negociacao', category: 'activity', suggestedNextStatus: null, icon: '🔄' },
  ],
}

// ---------------------------------------------------------------------------
// Ações de fallback (para status desconhecido)
// ---------------------------------------------------------------------------
export const FALLBACK_ACTIONS: StageAction[] = [
  STAGE_ACTIONS.novo[0],    // Abordagem realizada
  STAGE_ACTIONS.novo[1],    // Ligação feita
  STAGE_ACTIONS.contato[2], // Respondeu dúvida
  STAGE_ACTIONS.contato[3], // Agendamento realizado
  STAGE_ACTIONS.respondeu[1], // Proposta apresentada
  STAGE_ACTIONS.novo[4],    // Telefone incorreto
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Retorna ações disponíveis para uma etapa */
export function getActionsForStage(status: string): StageAction[] {
  const key = status as keyof typeof STAGE_ACTIONS
  return STAGE_ACTIONS[key] ?? FALLBACK_ACTIONS
}

/** Encontra uma ação pelo ID em qualquer etapa */
export function findActionById(actionId: string): StageAction | undefined {
  for (const actions of Object.values(STAGE_ACTIONS)) {
    const found = actions.find(a => a.id === actionId)
    if (found) return found
  }
  return FALLBACK_ACTIONS.find(a => a.id === actionId)
}

/** Retorna label comercial de uma ação pelo ID */
export function getActionLabel(actionId: string): string {
  return findActionById(actionId)?.label ?? actionId.replace(/_/g, ' ')
}

/** Labels das etapas em pt-BR */
export const STAGE_LABELS: Record<string, string> = {
  novo: 'Novo',
  contato: 'Contato',
  respondeu: 'Respondeu',
  negociacao: 'Negociação',
  ganho: 'Ganho',
  perdido: 'Perdido',
}

/** Retorna label pt-BR da etapa */
export function getStageLabel(status: string | null | undefined): string {
  if (!status) return '—'
  return STAGE_LABELS[status] ?? status.charAt(0).toUpperCase() + status.slice(1)
}

// ---------------------------------------------------------------------------
// Mapeamento de IDs legados → IDs novos (retrocompatibilidade)
// ---------------------------------------------------------------------------
export const LEGACY_ACTION_MAP: Record<string, string> = {
  // QuickActionModal legacy IDs
  quick_approach_contact: 'novo_abordagem_realizada',
  quick_call_done: 'novo_ligacao_feita',
  quick_whats_sent: 'novo_whatsapp_enviado',
  quick_email_sent: 'novo_email_enviado',
  quick_bad_data: 'novo_telefone_incorreto',
  quick_showed_interest: 'contato_demonstrou_interesse',
  quick_asked_info: 'contato_pediu_informacoes',
  quick_answered_doubt: 'contato_respondeu_duvida',
  quick_scheduled: 'contato_agendamento_realizado',
  quick_asked_proposal: 'contato_pediu_proposta',
  quick_qualified: 'respondeu_qualificacao_realizada',
  quick_proposal_presented: 'respondeu_proposta_apresentada',
  quick_doubt_answered: 'respondeu_duvida_respondida',
  quick_visit_scheduled: 'respondeu_visita_agendada',
  quick_negotiation_started: 'respondeu_negociacao_iniciada',
  quick_final_proposal_sent: 'negociacao_proposta_final_enviada',
  quick_objection_registered: 'negociacao_objecao_registrada',
  quick_commercial_condition: 'negociacao_condicao_comercial',
  quick_closing_scheduled: 'negociacao_fechamento_agendado',
  quick_proposal: 'respondeu_proposta_apresentada',
  // QuickActions.tsx legacy types
  whatsapp: 'novo_whatsapp_enviado',
  ligacao: 'novo_ligacao_feita',
  sem_resposta: 'novo_abordagem_realizada',
}

/** Resolve um ID de ação (legado ou novo) para o ID normalizado */
export function resolveActionId(actionId: string): string {
  return LEGACY_ACTION_MAP[actionId] ?? actionId
}

/** Resolve e retorna o label de qualquer ID (legado ou novo) */
export function resolveActionLabel(actionId: string): string {
  const resolved = resolveActionId(actionId)
  return getActionLabel(resolved)
}
