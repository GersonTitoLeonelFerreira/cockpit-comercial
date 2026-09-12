import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildUnavailableAuthoritativeDecision,
  mapDecisionKindToAllowedObjectives,
} from './authoritative-decision.ts'

import {
  COMMERCIAL_READING_DECISIONS,
} from '../../commercial-reading-contract.ts'

import {
  COMMERCIAL_OBJECTIVES,
} from '../strategy-contracts.ts'

test('buildUnavailableAuthoritativeDecision() é o estado neutro: available=false, sem restrição de objetivo, sem forçar silêncio', () => {
  const decision = buildUnavailableAuthoritativeDecision()

  assert.equal(decision.available, false)
  assert.equal(decision.decision_kind, null)
  assert.equal(decision.recommended_action, null)
  assert.equal(decision.do_not_generate, false)
  assert.deepEqual(decision.allowed_objectives, [])
  assert.deepEqual(decision.prohibited_moves, [])
})

test('mapDecisionKindToAllowedObjectives é exaustivo: todo CommercialReadingDecision mapeia para pelo menos um CommercialObjectiveV1 válido', () => {
  for (const decisionKind of COMMERCIAL_READING_DECISIONS) {
    const allowed = mapDecisionKindToAllowedObjectives(decisionKind)

    assert.ok(
      allowed.length > 0,
      `decision_kind=${decisionKind} deveria mapear para pelo menos um objetivo`,
    )

    for (const objective of allowed) {
      assert.ok(
        (COMMERCIAL_OBJECTIVES).includes(objective),
        `decision_kind=${decisionKind} mapeou para um objetivo inválido: ${objective}`,
      )
    }
  }
})

// Caso Carla: decisão já é "confirmar informação e concluir" — nunca deve
// liberar objetivos de descoberta/obtenção de contexto (isso seria "voltar
// para descoberta quando AGORA decidiu concluir", exatamente o que a FASE
// 16.9 proíbe).
test('confirm_information nunca libera advance_discovery/obtain_context/clarify_need (caso Carla: decisão já resolvida, não pode regredir para descoberta)', () => {
  const allowed = mapDecisionKindToAllowedObjectives(
    'confirm_information',
  )

  assert.ok(!allowed.includes('advance_discovery'))
  assert.ok(!allowed.includes('obtain_context'))
  assert.ok(!allowed.includes('clarify_need'))
})

test('no_intervention e give_space só liberam objetivos de não-avanço (nunca secure_next_step/confirm_decision)', () => {
  for (const decisionKind of ['no_intervention', 'give_space']) {
    const allowed = mapDecisionKindToAllowedObjectives(
      decisionKind,
    )

    assert.ok(!allowed.includes('secure_next_step'))
    assert.ok(!allowed.includes('confirm_decision'))
  }
})
