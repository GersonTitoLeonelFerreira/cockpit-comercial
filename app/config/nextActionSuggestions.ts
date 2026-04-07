// ---------------------------------------------------------------------------
// nextActionSuggestions.ts — Lógica centralizada de sugestão de próxima ação
//                            (Fase 2.4)
//
// Fonte de verdade para:
// - Quais próximas ações sugerir após cada ação registrada
// - Quando a próxima ação é obrigatória vs recomendada vs opcional
// - Quando a data/hora é obrigatória vs recomendada vs opcional
// - Prazos padrão recomendados por sugestão
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type NextActionRequirement = 'required' | 'recommended' | 'optional'

export interface NextActionSuggestion {
  label: string                  // texto da sugestão (ex: "Aguardar retorno")
  defaultDeadlineHours?: number  // prazo padrão em horas (ex: 24 = amanhã)
}

export interface NextActionConfig {
  actionId: string                         // referência ao StageAction.id
  nextActionRequirement: NextActionRequirement
  dateRequirement: NextActionRequirement
  suggestions: NextActionSuggestion[]      // lista ordenada de sugestões
  defaultSuggestionIndex?: number          // qual sugestão pré-selecionar (0-based)
}

// ---------------------------------------------------------------------------
// Matriz completa de configurações de próxima ação
// ---------------------------------------------------------------------------

export const NEXT_ACTION_CONFIGS: Record<string, NextActionConfig> = {

  // ── ETAPA: NOVO ────────────────────────────────────────────────────────────

  novo_abordagem_realizada: {
    actionId: 'novo_abordagem_realizada',
    nextActionRequirement: 'recommended',
    dateRequirement: 'recommended',
    suggestions: [
      { label: 'Aguardar retorno',       defaultDeadlineHours: 24 },
      { label: 'Nova tentativa',          defaultDeadlineHours: 48 },
      { label: 'WhatsApp follow-up',      defaultDeadlineHours: 24 },
    ],
    defaultSuggestionIndex: 0,
  },

  novo_ligacao_feita: {
    actionId: 'novo_ligacao_feita',
    nextActionRequirement: 'recommended',
    dateRequirement: 'recommended',
    suggestions: [
      { label: 'Ligar novamente',         defaultDeadlineHours: 24 },
      { label: 'WhatsApp follow-up',      defaultDeadlineHours: 4  },
      { label: 'Aguardar retorno',        defaultDeadlineHours: 24 },
    ],
    defaultSuggestionIndex: 0,
  },

  novo_whatsapp_enviado: {
    actionId: 'novo_whatsapp_enviado',
    nextActionRequirement: 'recommended',
    dateRequirement: 'recommended',
    suggestions: [
      { label: 'Aguardar retorno',        defaultDeadlineHours: 24 },
      { label: 'Ligar',                   defaultDeadlineHours: 4  },
      { label: 'Nova mensagem',           defaultDeadlineHours: 48 },
    ],
    defaultSuggestionIndex: 0,
  },

  novo_email_enviado: {
    actionId: 'novo_email_enviado',
    nextActionRequirement: 'recommended',
    dateRequirement: 'recommended',
    suggestions: [
      { label: 'Aguardar retorno',        defaultDeadlineHours: 48 },
      { label: 'Ligar',                   defaultDeadlineHours: 24 },
      { label: 'WhatsApp follow-up',      defaultDeadlineHours: 24 },
    ],
    defaultSuggestionIndex: 0,
  },

  novo_telefone_incorreto: {
    actionId: 'novo_telefone_incorreto',
    nextActionRequirement: 'optional',
    dateRequirement: 'optional',
    suggestions: [
      { label: 'Verificar outro contato' },
      { label: 'Buscar telefone alternativo' },
    ],
    defaultSuggestionIndex: 0,
  },

  // ── ETAPA: CONTATO ─────────────────────────────────────────────────────────

  contato_demonstrou_interesse: {
    actionId: 'contato_demonstrou_interesse',
    nextActionRequirement: 'recommended',
    dateRequirement: 'recommended',
    suggestions: [
      { label: 'Qualificar necessidade',  defaultDeadlineHours: 24 },
      { label: 'Enviar informações',      defaultDeadlineHours: 4  },
      { label: 'Agendar reunião',         defaultDeadlineHours: 48 },
    ],
    defaultSuggestionIndex: 0,
  },

  contato_pediu_informacoes: {
    actionId: 'contato_pediu_informacoes',
    nextActionRequirement: 'recommended',
    dateRequirement: 'recommended',
    suggestions: [
      { label: 'Enviar informações',      defaultDeadlineHours: 4  },
      { label: 'Agendar retorno',         defaultDeadlineHours: 24 },
      { label: 'Preparar proposta',       defaultDeadlineHours: 48 },
    ],
    defaultSuggestionIndex: 0,
  },

  contato_respondeu_duvida: {
    actionId: 'contato_respondeu_duvida',
    nextActionRequirement: 'recommended',
    dateRequirement: 'optional',
    suggestions: [
      { label: 'Qualificar lead',         defaultDeadlineHours: 24 },
      { label: 'Enviar proposta',         defaultDeadlineHours: 48 },
      { label: 'Agendar visita',          defaultDeadlineHours: 72 },
    ],
    defaultSuggestionIndex: 0,
  },

  contato_agendamento_realizado: {
    actionId: 'contato_agendamento_realizado',
    nextActionRequirement: 'required',
    dateRequirement: 'required',
    suggestions: [
      { label: 'Confirmar agendamento',   defaultDeadlineHours: 24 },
      { label: 'Preparar material',       defaultDeadlineHours: 48 },
      { label: 'Lembrete véspera',        defaultDeadlineHours: 24 },
    ],
    defaultSuggestionIndex: 0,
  },

  contato_pediu_proposta: {
    actionId: 'contato_pediu_proposta',
    nextActionRequirement: 'required',
    dateRequirement: 'recommended',
    suggestions: [
      { label: 'Enviar proposta',                    defaultDeadlineHours: 24 },
      { label: 'Agendar apresentação',               defaultDeadlineHours: 48 },
      { label: 'Preparar proposta personalizada',    defaultDeadlineHours: 48 },
    ],
    defaultSuggestionIndex: 0,
  },

  // ── ETAPA: RESPONDEU ───────────────────────────────────────────────────────

  respondeu_qualificacao_realizada: {
    actionId: 'respondeu_qualificacao_realizada',
    nextActionRequirement: 'required',
    dateRequirement: 'recommended',
    suggestions: [
      { label: 'Enviar proposta',         defaultDeadlineHours: 24 },
      { label: 'Agendar negociação',      defaultDeadlineHours: 48 },
      { label: 'Enviar contrato',         defaultDeadlineHours: 24 },
    ],
    defaultSuggestionIndex: 0,
  },

  respondeu_proposta_apresentada: {
    actionId: 'respondeu_proposta_apresentada',
    nextActionRequirement: 'required',
    dateRequirement: 'recommended',
    suggestions: [
      { label: 'Aguardar retorno',        defaultDeadlineHours: 48 },
      { label: 'Follow-up proposta',      defaultDeadlineHours: 72 },
      { label: 'Agendar fechamento',      defaultDeadlineHours: 72 },
    ],
    defaultSuggestionIndex: 0,
  },

  respondeu_duvida_respondida: {
    actionId: 'respondeu_duvida_respondida',
    nextActionRequirement: 'recommended',
    dateRequirement: 'optional',
    suggestions: [
      { label: 'Aguardar retorno',        defaultDeadlineHours: 24 },
      { label: 'Enviar proposta',         defaultDeadlineHours: 48 },
      { label: 'Agendar reunião',         defaultDeadlineHours: 48 },
    ],
    defaultSuggestionIndex: 0,
  },

  respondeu_visita_agendada: {
    actionId: 'respondeu_visita_agendada',
    nextActionRequirement: 'required',
    dateRequirement: 'required',
    suggestions: [
      { label: 'Confirmar visita',        defaultDeadlineHours: 24 },
      { label: 'Preparar apresentação',   defaultDeadlineHours: 48 },
      { label: 'Lembrete véspera',        defaultDeadlineHours: 24 },
    ],
    defaultSuggestionIndex: 0,
  },

  respondeu_negociacao_iniciada: {
    actionId: 'respondeu_negociacao_iniciada',
    nextActionRequirement: 'required',
    dateRequirement: 'recommended',
    suggestions: [
      { label: 'Enviar proposta',         defaultDeadlineHours: 24 },
      { label: 'Agendar reunião',         defaultDeadlineHours: 48 },
      { label: 'Definir condições',       defaultDeadlineHours: 48 },
    ],
    defaultSuggestionIndex: 0,
  },

  // ── ETAPA: NEGOCIAÇÃO ──────────────────────────────────────────────────────

  negociacao_proposta_final_enviada: {
    actionId: 'negociacao_proposta_final_enviada',
    nextActionRequirement: 'required',
    dateRequirement: 'recommended',
    suggestions: [
      { label: 'Aguardar retorno',        defaultDeadlineHours: 48 },
      { label: 'Follow-up proposta',      defaultDeadlineHours: 72 },
      { label: 'Agendar fechamento',      defaultDeadlineHours: 72 },
    ],
    defaultSuggestionIndex: 0,
  },

  negociacao_objecao_registrada: {
    actionId: 'negociacao_objecao_registrada',
    nextActionRequirement: 'required',
    dateRequirement: 'recommended',
    suggestions: [
      { label: 'Revisar objeção',         defaultDeadlineHours: 24 },
      { label: 'Ajustar proposta',        defaultDeadlineHours: 48 },
      { label: 'Contra-argumentar',       defaultDeadlineHours: 24 },
    ],
    defaultSuggestionIndex: 0,
  },

  negociacao_condicao_comercial: {
    actionId: 'negociacao_condicao_comercial',
    nextActionRequirement: 'recommended',
    dateRequirement: 'recommended',
    suggestions: [
      { label: 'Ajustar proposta',        defaultDeadlineHours: 24 },
      { label: 'Enviar proposta final',   defaultDeadlineHours: 48 },
      { label: 'Agendar fechamento',      defaultDeadlineHours: 72 },
    ],
    defaultSuggestionIndex: 0,
  },

  negociacao_fechamento_agendado: {
    actionId: 'negociacao_fechamento_agendado',
    nextActionRequirement: 'required',
    dateRequirement: 'required',
    suggestions: [
      { label: 'Confirmar fechamento',    defaultDeadlineHours: 24 },
      { label: 'Preparar contrato',       defaultDeadlineHours: 48 },
      { label: 'Lembrete véspera',        defaultDeadlineHours: 24 },
    ],
    defaultSuggestionIndex: 0,
  },

  negociacao_retorno_negociacao: {
    actionId: 'negociacao_retorno_negociacao',
    nextActionRequirement: 'required',
    dateRequirement: 'recommended',
    suggestions: [
      { label: 'Follow-up',              defaultDeadlineHours: 24 },
      { label: 'Reapresentar proposta',  defaultDeadlineHours: 48 },
      { label: 'Agendar nova reunião',   defaultDeadlineHours: 48 },
    ],
    defaultSuggestionIndex: 0,
  },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Retorna a configuração de próxima ação para um actionId, ou undefined */
export function getNextActionConfig(actionId: string): NextActionConfig | undefined {
  return NEXT_ACTION_CONFIGS[actionId]
}

/** Retorna a lista de sugestões para um actionId (vazia se não configurado) */
export function getNextActionSuggestions(actionId: string): NextActionSuggestion[] {
  return NEXT_ACTION_CONFIGS[actionId]?.suggestions ?? []
}
