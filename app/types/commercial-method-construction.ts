import type {
  CommercialMethodDefinition,
  CommercialMethodDimension,
  CommercialMethodStageRequirement,
} from '@/app/lib/companion/commercial-method-contract'

import type {
  CommercialMethodBuilderData,
} from '@/app/types/commercial-method-builder'
import type {
  CommercialBuyerDecisionDraft,
} from '@/app/types/commercial-method-buyer-decision'

export const COMMERCIAL_METHOD_CONSTRUCTION_VERSION =
  'assisted-method-construction-v1' as const

/**
 * Versão do ALGORITMO de síntese (não do schema do rascunho, ver
 * COMMERCIAL_METHOD_CONSTRUCTION_VERSION acima). Carimbada por
 * suggestInitialMethodConstruction e applyBuyerDecisionArchitecture sempre
 * que produzem a estrutura de etapas a partir do diagnóstico. Um
 * method_construction sem este valor, ou com um valor mais antigo, foi
 * materializado por uma versão anterior da síntese — as respostas do
 * diagnóstico continuam válidas, mas a estrutura pode estar desatualizada
 * (ver ONDA 8 / HOTFIX — recompilação segura).
 */
export const CURRENT_METHOD_SYNTHESIS_VERSION =
  'guided-method-synthesis-v2' as const

export type CommercialMethodConstructionStatus =
  | 'not_started'
  | 'editing'
  | 'review_ready'

export type CommercialMethodConstructionStep =
  | 'structure'
  | 'stages'
  | 'principles'
  | 'review'

export type CommercialMethodConstructionStageSource =
  | 'yolen_suggestion'
  | 'manager'

export interface CommercialMethodConstructionDimensionDraft
  extends CommercialMethodDimension {
  id: string
}

export interface CommercialMethodConstructionStageDraft {
  id: string
  source: CommercialMethodConstructionStageSource
  suggestion_basis: string[]

  key: string
  name: string
  /**
   * Opcional — "por que essa etapa existe" (E02 da Jornada Guiada). Campo
   * puramente pedagógico: não é usado na materialização do
   * commercial-method-v2 (ver `normalizeStageForContract`).
   */
  purpose?: string
  objective: string
  requirement: CommercialMethodStageRequirement

  completion_criteria: string[]
  partial_completion_criteria: string[]
  skip_conditions: string[]
  recommended_questions: string[]
  common_mistakes: string[]
  deepen_when: string[]
  sufficient_when: string[]
  advance_when: string[]
  wait_when: string[]
  stop_asking_when: string[]
  dimensions: CommercialMethodConstructionDimensionDraft[]
}

export interface CommercialMethodConstructionDraft {
  construction_version:
    typeof COMMERCIAL_METHOD_CONSTRUCTION_VERSION

  /**
   * Opcional para manter compatibilidade com rascunhos anteriores a este
   * rastreamento. Ausente ou diferente de CURRENT_METHOD_SYNTHESIS_VERSION
   * significa "estrutura possivelmente desatualizada" — nunca um erro.
   */
  synthesis_version?: string

  construction_step: CommercialMethodConstructionStep
  method_name: string
  method_description: string
  principles: string[]
  active_stage_id: string | null
  stages: CommercialMethodConstructionStageDraft[]

  /**
   * Camada adaptativa da Fase 2. Ela descreve como o comprador decide para
   * calibrar a construção do método. Não faz parte do commercial-method-v2 e
   * não é consumida pelo Companion.
   *
   * Optional para manter compatibilidade com rascunhos da Fase 2 criados antes
   * desta evolução. A UI cria/preenche a camada antes de exibir a estrutura.
   */
  buyer_decision?: CommercialBuyerDecisionDraft
}

export interface CommercialMethodConstructionRecord {
  company_id: string
  ready_for_method: boolean
  diagnosis: CommercialMethodBuilderData
  status: CommercialMethodConstructionStatus
  construction: CommercialMethodConstructionDraft | null
  method_definition: CommercialMethodDefinition | null
  method_started_at: string | null
  method_updated_at: string | null
  /**
   * Espelho, em coluna própria, de construction.synthesis_version — mantido
   * apenas para consulta direta no banco. A leitura de "há atualização
   * disponível" usa construction.synthesis_version.
   */
  method_synthesis_version: string | null
  updated_at: string
}

export interface CommercialMethodConstructionSaveInput {
  status: Exclude<CommercialMethodConstructionStatus, 'not_started'>
  construction: CommercialMethodConstructionDraft
}

export interface CommercialMethodConstructionQualityItem {
  level: 'pass' | 'warning'
  message: string
  stage_id?: string
}

export interface CommercialMethodStageAssistiveSuggestions {
  context_notes: string[]
  completion_criteria: string[]
  recommended_questions: string[]
  common_mistakes: string[]
}
