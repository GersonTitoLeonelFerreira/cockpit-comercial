import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

import {
  buildSellerFacingReasoningProjection,
} from './seller-facing-reasoning-projection.ts'

function reasoning(overrides = {}) {
  return {
    contract_version:
      'commercial-reasoning-v1',
    status: 'ready',
    decision: 'follow_up',
    decision_reason:
      'A conversa precisa recuperar continuidade.',
    current_situation:
      'O cliente demonstrou intenção, mas a conversa desviou.',
    objective_now:
      'Retomar a intenção já demonstrada sem repetir a pergunta anterior.',
    do_not_do: [
      'Não repetir a mesma ação comercial sem resposta ou fato novo.',
    ],
    selected_techniques: [
      {
        intelligence_id:
          'technique.contextual_reengagement',
        title:
          'Retomada contextual',
        kind: 'technique',
        scope: 'general',
        why_applicable:
          'Existe quebra de continuidade.',
        risks: [],
      },
    ],
    company_knowledge_used: [],
    seller_assessment: {
      strengths: [],
      improvement_points: [],
    },
    comparison: {
      similarities: [],
      differences: [],
    },
    evidence_message_ids: [],
    memory_ids: [],
    limitations: [],
    ...overrides,
  }
}

test(
  'Commercial Reasoning governa a próxima ação e fallback legado não pode contradizer o especialista',
  () => {
    const projection =
      buildSellerFacingReasoningProjection({
        reasoning:
          reasoning(),
        reading: null,
        state: null,
        fallback_action:
          'Perguntar novamente qual dia e horário o cliente prefere.',
      })

    assert.equal(
      projection.next_best_action,
      'Retomar a intenção já demonstrada sem repetir a pergunta anterior.',
    )

    assert.notEqual(
      projection.next_best_action,
      'Perguntar novamente qual dia e horário o cliente prefere.',
    )
  },
)

test(
  'fallback operacional continua disponível quando o reasoning está silencioso',
  () => {
    const projection =
      buildSellerFacingReasoningProjection({
        reasoning:
          reasoning({
            status: 'silent',
          }),
        reading: null,
        state: null,
        fallback_action:
          'Preservar o estado atual.',
      })

    assert.equal(
      projection.next_best_action,
      'Preservar o estado atual.',
    )
  },
)

test(
  'AGORA usa a ação projetada pelo especialista no card principal',
  () => {
    const loader =
      readFileSync(
        new URL(
          './agora-decision-state-loader.ts',
          import.meta.url,
        ),
        'utf8',
      )

    assert.match(
      loader,
      /const expertAction =[\s\S]*reasoning\.next_best_action/,
    )

    assert.match(
      loader,
      /action:[\s\S]*expertAction \|\|[\s\S]*viewModel\.primary\.action/,
    )
  },
)
