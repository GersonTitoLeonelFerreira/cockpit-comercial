// ---------------------------------------------------------------------------
// analyticsDimensions.ts — Definições de dimensões analíticas (Fase 2.5)
//
// Cataloga as dimensões usadas para análise operacional dos eventos,
// fornecendo metadados que guiam relatórios, filtros e agrupamentos.
// Cada dimensão corresponde a um campo em AnalyticsEvent (analyticsBase.ts).
// ---------------------------------------------------------------------------

import type { AnalyticsEvent, EventSource } from '@/app/config/analyticsBase'
import { EVENT_SOURCE_LABELS } from '@/app/config/analyticsBase'
import type { EventKind } from '@/app/config/eventClassification'

// ---------------------------------------------------------------------------
// Tipos de dimensão
// ---------------------------------------------------------------------------

export type DimensionType = 'string' | 'boolean' | 'number' | 'datetime' | 'enum'

/**
 * Metadados de uma dimensão analítica.
 * Guia a construção de filtros, agrupamentos e rótulos em relatórios.
 */
export interface AnalyticsDimension {
  /** Chave correspondente no AnalyticsEvent */
  key: keyof AnalyticsEvent
  /** Rótulo em pt-BR para exibição */
  label: string
  /** Descrição do significado da dimensão */
  description: string
  /** Tipo de dado da dimensão */
  type: DimensionType
  /** Pode ser usada como eixo de agrupamento em relatórios? */
  groupable: boolean
  /** Pode ser usada como filtro? */
  filterable: boolean
  /** Tipos de evento para os quais esta dimensão é tipicamente relevante */
  relevantKinds?: EventKind[]
}

// ---------------------------------------------------------------------------
// Catálogo completo de dimensões
// ---------------------------------------------------------------------------

export const ANALYTICS_DIMENSIONS: AnalyticsDimension[] = [

  // ── Etapa ─────────────────────────────────────────────────────────────────
  {
    key: 'stage_current',
    label: 'Etapa atual',
    description: 'Etapa do lead no momento do evento',
    type: 'string',
    groupable: true,
    filterable: true,
  },
  {
    key: 'stage_from',
    label: 'Etapa de origem',
    description: 'Etapa anterior à movimentação',
    type: 'string',
    groupable: true,
    filterable: true,
    relevantKinds: ['stage_move'],
  },
  {
    key: 'stage_to',
    label: 'Etapa de destino',
    description: 'Etapa para a qual o lead foi movido',
    type: 'string',
    groupable: true,
    filterable: true,
    relevantKinds: ['stage_move'],
  },
  {
    key: 'is_real_stage_move',
    label: 'Movimentação real de etapa',
    description: 'Indica se houve troca real de etapa (from_stage ≠ to_stage)',
    type: 'boolean',
    groupable: false,
    filterable: true,
  },

  // ── Ação ──────────────────────────────────────────────────────────────────
  {
    key: 'action_key',
    label: 'Ação registrada',
    description: 'ID normalizado da ação no catálogo (ex: novo_ligacao_feita)',
    type: 'string',
    groupable: true,
    filterable: true,
    relevantKinds: ['activity'],
  },
  {
    key: 'action_label',
    label: 'Nome da ação',
    description: 'Rótulo comercial da ação (ex: Ligação feita)',
    type: 'string',
    groupable: true,
    filterable: true,
    relevantKinds: ['activity'],
  },
  {
    key: 'action_stage',
    label: 'Etapa da ação',
    description: 'Etapa à qual a ação pertence no catálogo',
    type: 'string',
    groupable: true,
    filterable: true,
    relevantKinds: ['activity'],
  },
  {
    key: 'action_category',
    label: 'Categoria da ação',
    description: "Tipo da ação: 'activity' (contato, ligação) ou 'outcome' (resultado, decisão)",
    type: 'enum',
    groupable: true,
    filterable: true,
    relevantKinds: ['activity'],
  },

  // ── Classificação semântica ───────────────────────────────────────────────
  {
    key: 'event_kind',
    label: 'Tipo de evento',
    description: 'Classificação semântica: atividade, movimentação, próxima ação, ganho, perda',
    type: 'enum',
    groupable: true,
    filterable: true,
  },
  {
    key: 'event_type',
    label: 'Tipo técnico do evento',
    description: 'event_type conforme registrado no banco',
    type: 'string',
    groupable: true,
    filterable: true,
  },

  // ── Efeito ────────────────────────────────────────────────────────────────
  {
    key: 'event_effect',
    label: 'Efeito da ação',
    description: "Se a ação mantém a etapa ('keep') ou sugere avanço ('suggest_advance')",
    type: 'enum',
    groupable: true,
    filterable: true,
    relevantKinds: ['activity'],
  },
  {
    key: 'can_lead_to_won',
    label: 'Pode preceder ganho',
    description: 'Indica se esta ação é tipicamente precursora de fechamento como ganho',
    type: 'boolean',
    groupable: false,
    filterable: true,
    relevantKinds: ['activity'],
  },
  {
    key: 'can_lead_to_lost',
    label: 'Pode preceder perda',
    description: 'Indica se esta ação é tipicamente precursora de perda',
    type: 'boolean',
    groupable: false,
    filterable: true,
    relevantKinds: ['activity'],
  },

  // ── Próxima ação ──────────────────────────────────────────────────────────
  {
    key: 'next_action_key',
    label: 'Próxima ação',
    description: 'Próxima ação definida ou sugerida neste evento',
    type: 'string',
    groupable: true,
    filterable: true,
    relevantKinds: ['next_action', 'activity'],
  },
  {
    key: 'next_action_set',
    label: 'Próxima ação definida',
    description: 'Indica se uma próxima ação foi definida neste evento',
    type: 'boolean',
    groupable: false,
    filterable: true,
  },

  // ── Resultado ─────────────────────────────────────────────────────────────
  {
    key: 'result_detail',
    label: 'Detalhe do resultado',
    description: 'Informação adicional registrada pelo vendedor',
    type: 'string',
    groupable: false,
    filterable: false,
  },
  {
    key: 'win_reason',
    label: 'Motivo do ganho',
    description: 'Razão ou contexto do fechamento como ganho',
    type: 'string',
    groupable: true,
    filterable: true,
    relevantKinds: ['won'],
  },
  {
    key: 'lost_reason',
    label: 'Motivo da perda',
    description: 'Razão declarada para perda do lead',
    type: 'string',
    groupable: true,
    filterable: true,
    relevantKinds: ['lost'],
  },

  // ── Origem ────────────────────────────────────────────────────────────────
  {
    key: 'source',
    label: 'Origem do evento',
    description: 'De onde o evento foi registrado (ex: quick_action, kanban_drag, lead_detail)',
    type: 'string',
    groupable: true,
    filterable: true,
  },
  {
    key: 'channel',
    label: 'Canal',
    description: 'Canal de comunicação utilizado (ex: whatsapp, copy)',
    type: 'string',
    groupable: true,
    filterable: true,
    relevantKinds: ['activity'],
  },

  // ── Temporal ──────────────────────────────────────────────────────────────
  {
    key: 'occurred_at',
    label: 'Data/hora do evento',
    description: 'Quando o evento ocorreu',
    type: 'datetime',
    groupable: false,
    filterable: true,
  },

  // ── Identificação ─────────────────────────────────────────────────────────
  {
    key: 'actor_id',
    label: 'Responsável',
    description: 'ID do usuário que registrou o evento',
    type: 'string',
    groupable: true,
    filterable: true,
  },
  {
    key: 'company_id',
    label: 'Empresa',
    description: 'ID da empresa',
    type: 'string',
    groupable: true,
    filterable: true,
  },
  {
    key: 'cycle_id',
    label: 'Ciclo de venda',
    description: 'ID do ciclo de venda',
    type: 'string',
    groupable: true,
    filterable: true,
  },
  {
    key: 'lead_id',
    label: 'Lead',
    description: 'ID do lead',
    type: 'string',
    groupable: true,
    filterable: true,
  },
]

// ---------------------------------------------------------------------------
// Grupos de dimensões para composição de relatórios
// ---------------------------------------------------------------------------

/**
 * Agrupa as dimensões por tema para facilitar a construção de relatórios
 * e a apresentação de filtros na interface.
 */
export const DIMENSION_GROUPS = {
  stage:       ['stage_current', 'stage_from', 'stage_to', 'is_real_stage_move'],
  action:      ['action_key', 'action_label', 'action_stage', 'action_category'],
  event:       ['event_kind', 'event_type'],
  effect:      ['event_effect', 'can_lead_to_won', 'can_lead_to_lost'],
  next_action: ['next_action_key', 'next_action_set'],
  result:      ['result_detail', 'win_reason', 'lost_reason'],
  source:      ['source', 'channel'],
  temporal:    ['occurred_at'],
  identity:    ['actor_id', 'company_id', 'cycle_id', 'lead_id'],
} satisfies Record<string, (keyof AnalyticsEvent)[]>

export type DimensionGroup = keyof typeof DIMENSION_GROUPS

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DIMENSION_MAP = new Map(ANALYTICS_DIMENSIONS.map(d => [d.key, d]))

/** Retorna os metadados de uma dimensão pelo campo-chave */
export function getDimension(key: keyof AnalyticsEvent): AnalyticsDimension | undefined {
  return DIMENSION_MAP.get(key)
}

/** Retorna todas as dimensões que podem ser usadas como eixo de agrupamento */
export function getGroupableDimensions(): AnalyticsDimension[] {
  return ANALYTICS_DIMENSIONS.filter(d => d.groupable)
}

/** Retorna todas as dimensões que podem ser usadas como filtro */
export function getFilterableDimensions(): AnalyticsDimension[] {
  return ANALYTICS_DIMENSIONS.filter(d => d.filterable)
}

/** Retorna as dimensões de um grupo específico */
export function getDimensionsForGroup(group: DimensionGroup): AnalyticsDimension[] {
  const keys = DIMENSION_GROUPS[group] as (keyof AnalyticsEvent)[]
  return keys.map(k => DIMENSION_MAP.get(k)).filter(Boolean) as AnalyticsDimension[]
}

/** Labels pt-BR para os grupos de dimensões */
export const DIMENSION_GROUP_LABELS: Record<DimensionGroup, string> = {
  stage:       'Etapa',
  action:      'Ação',
  event:       'Tipo de evento',
  effect:      'Efeito',
  next_action: 'Próxima ação',
  result:      'Resultado',
  source:      'Origem',
  temporal:    'Temporal',
  identity:    'Identificação',
}

// Re-export para conveniência
export { EVENT_SOURCE_LABELS }
export type { EventSource }
