// Yolen — ONDA 8 / HOTFIX
//
// Recompilação segura de method_definition antigo com a síntese atual.
//
// Um review_ready pode ter sido materializado por uma versão anterior do
// algoritmo de síntese (ver CURRENT_METHOD_SYNTHESIS_VERSION). As respostas
// do diagnóstico e da arquitetura de decisão do comprador continuam
// válidas — apenas a forma como elas viram etapas pode estar desatualizada.
//
// Este módulo NUNCA sobrescreve nada sozinho: ele só calcula uma PROPOSTA
// (candidate) a partir das MESMAS respostas já confirmadas, reaproveitando
// exatamente as funções canônicas de síntese, e um diff estrutural para
// revisão humana. Aplicar a proposta é uma ação explícita de quem chama
// (ver saveCommercialMethodConstruction) — este módulo não grava nada.

import {
  suggestInitialMethodConstruction,
} from '@/app/lib/commercial-config/assisted-method-construction'
import {
  applyBuyerDecisionArchitecture,
} from '@/app/lib/commercial-config/buyer-decision-architecture'
import {
  sanitizeMethodPrinciples,
} from '@/app/lib/commercial-config/method-principles'
import type {
  CommercialMethodBuilderData,
} from '@/app/types/commercial-method-builder'
import {
  CURRENT_METHOD_SYNTHESIS_VERSION,
} from '@/app/types/commercial-method-construction'
import type {
  CommercialMethodConstructionDraft,
  CommercialMethodConstructionStageDraft,
} from '@/app/types/commercial-method-construction'

/**
 * Um method_construction está desatualizado quando nunca passou pela
 * síntese atual (sem valor) ou passou por uma versão anterior. Nunca é
 * tratado como erro — apenas como "há uma atualização disponível".
 */
export function isMethodSynthesisStale(
  construction: CommercialMethodConstructionDraft | null,
): boolean {
  if (!construction) return false
  return construction.synthesis_version !== CURRENT_METHOD_SYNTHESIS_VERSION
}

/**
 * Recompila a estrutura do método usando exclusivamente as funções
 * canônicas de síntese, sobre o diagnóstico e a decisão do comprador já
 * confirmados. Retorna null quando a decisão do comprador ainda não foi
 * confirmada (não há base suficiente para recompilar).
 *
 * Preserva, do rascunho atual:
 * - method_name / method_description (nunca sintetizados, sempre texto
 *   livre do gestor);
 * - etapas com source === 'manager' que não existam na nova síntese (a
 *   única customização que a metadata atual prova de forma inequívoca —
 *   ver ONDA 8 / HOTFIX, seção 12).
 *
 * Não tenta adivinhar edições manuais campo a campo dentro de uma etapa
 * sugerida pela Yolen: não há prova suficiente disso na metadata atual, e
 * adivinhar seria pior do que mostrar o diff e deixar o gestor decidir.
 */
export function buildMethodRecompileCandidate(
  diagnosis: CommercialMethodBuilderData,
  current: CommercialMethodConstructionDraft,
): CommercialMethodConstructionDraft | null {
  if (!current.buyer_decision?.confirmed) return null

  const fresh = applyBuyerDecisionArchitecture(
    suggestInitialMethodConstruction(diagnosis),
    diagnosis,
    current.buyer_decision,
  )

  const freshKeys = new Set(fresh.stages.map((stage) => stage.key))
  const preservedManualStages = current.stages.filter(
    (stage) => stage.source === 'manager' && !freshKeys.has(stage.key),
  )

  return {
    ...fresh,
    method_name: current.method_name,
    method_description: current.method_description,
    stages: [...fresh.stages, ...preservedManualStages],
    principles: sanitizeMethodPrinciples(fresh.principles),
  }
}

export type MethodRecompileStageChange =
  | 'added'
  | 'removed'
  | 'changed'
  | 'unchanged'

export interface MethodRecompileStageDiffEntry {
  key: string
  name: string
  change: MethodRecompileStageChange
  previous_requirement?: CommercialMethodConstructionStageDraft['requirement']
  next_requirement?: CommercialMethodConstructionStageDraft['requirement']
}

export interface MethodRecompileDiff {
  stages: MethodRecompileStageDiffEntry[]
  principles_changed: boolean
  has_changes: boolean
}

function stageFingerprint(stage: CommercialMethodConstructionStageDraft): string {
  return JSON.stringify({
    requirement: stage.requirement,
    objective: stage.objective,
    completion_criteria: [...stage.completion_criteria].sort(),
    advance_when: [...stage.advance_when].sort(),
    wait_when: [...stage.wait_when].sort(),
    skip_conditions: [...stage.skip_conditions].sort(),
  })
}

function sortedJson(values: string[]): string {
  return JSON.stringify([...values].sort())
}

/**
 * Compara a estrutura atual com a proposta recompilada. Mostra apenas
 * mudanças estruturais relevantes (etapa adicionada/removida, requirement
 * mudou, campos centrais mudaram) — não um diff palavra por palavra.
 */
export function diffMethodRecompileCandidate(
  current: CommercialMethodConstructionDraft,
  candidate: CommercialMethodConstructionDraft,
): MethodRecompileDiff {
  const currentByKey = new Map(current.stages.map((stage) => [stage.key, stage]))
  const candidateByKey = new Map(candidate.stages.map((stage) => [stage.key, stage]))

  const stages: MethodRecompileStageDiffEntry[] = []

  for (const stage of candidate.stages) {
    const previous = currentByKey.get(stage.key)

    if (!previous) {
      stages.push({
        key: stage.key,
        name: stage.name,
        change: 'added',
        next_requirement: stage.requirement,
      })
      continue
    }

    if (stageFingerprint(previous) !== stageFingerprint(stage)) {
      stages.push({
        key: stage.key,
        name: stage.name,
        change: 'changed',
        previous_requirement: previous.requirement,
        next_requirement: stage.requirement,
      })
    } else {
      stages.push({
        key: stage.key,
        name: stage.name,
        change: 'unchanged',
        previous_requirement: previous.requirement,
        next_requirement: stage.requirement,
      })
    }
  }

  for (const stage of current.stages) {
    if (!candidateByKey.has(stage.key)) {
      stages.push({
        key: stage.key,
        name: stage.name,
        change: 'removed',
        previous_requirement: stage.requirement,
      })
    }
  }

  const principlesChanged =
    sortedJson(sanitizeMethodPrinciples(current.principles)) !==
    sortedJson(sanitizeMethodPrinciples(candidate.principles))

  const hasChanges =
    stages.some((entry) => entry.change !== 'unchanged') || principlesChanged

  return {
    stages,
    principles_changed: principlesChanged,
    has_changes: hasChanges,
  }
}
