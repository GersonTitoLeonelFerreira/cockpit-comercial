import assert from 'node:assert/strict'
import test from 'node:test'

import {
  STATEFUL_COPILOT_CONTRACT_VERSION,
} from './stateful-copilot-contract.ts'

import {
  StatefulCopilotContractError,
  normalizeStatefulCopilotOutput,
} from './stateful-copilot-normalizer.ts'

import {
  StatefulCommercialStateReductionError,
  reduceStatefulCommercialState,
} from './stateful-commercial-state-reducer.ts'

import {
  STATEFUL_COMMERCIAL_STATE_CONTRACT_VERSION,
} from './stateful-commercial-state.ts'

// Esta suíte prova, no nível determinístico (normalizador + redutor), as
// garantias estruturais da frente EVIDÊNCIA + ESTADO + COERÊNCIA:
//
//   - um requisito pendente (need/open_loop/uncertainty) pode ser SUPERSEDED
//     (deixou de ser necessário) sem ter sido RESOLVED (cumprido);
//   - um ID nunca pode ser resolvido e substituído no mesmo ciclo;
//   - evidência associada a um requisito nunca resolve outro requisito ativo;
//   - as transições passam a existir para needs, open_loops e uncertainties,
//     que antes só suportavam "resolve" (objections já suportava as duas).
//
// A interpretação em si (o que conta como evidência explícita, intenção
// futura, mídia não interpretada etc.) é responsabilidade do prompt do
// modelo (ver stateful-copilot-execution-plan.ts). Aqui provamos que, uma
// vez que o modelo produza a leitura correta, o "banco" (redutor) aplica o
// estado corretamente — "IA interpreta, banco prova".

function emptyPatch() {
  return {
    facts_to_add: [],
    fact_ids_to_supersede: [],

    needs_to_add: [],
    need_ids_to_resolve: [],
    need_ids_to_supersede: [],

    open_loops_to_add: [],
    open_loop_ids_to_resolve: [],
    open_loop_ids_to_supersede: [],

    objections_to_add: [],
    objection_ids_to_resolve: [],
    objection_ids_to_supersede: [],

    commitments_to_upsert: [],

    signals_to_add: [],
    signal_ids_to_resolve: [],

    uncertainties_to_add: [],
    uncertainty_ids_to_resolve: [],
    uncertainty_ids_to_supersede: [],
  }
}

function buildOutput({
  previousStateVersion = null,
  analyzedMessageIds = ['m1'],
  evidenceMessageIds = analyzedMessageIds,
  patch = emptyPatch(),
  currentMoment = 'Cliente está avaliando a solução.',
  memoryIds = [],
  nextMove = 'Conduzir o próximo passo de forma consultiva.',
} = {}) {
  return {
    contract_version:
      STATEFUL_COPILOT_CONTRACT_VERSION,

    previous_state_version:
      previousStateVersion,

    analyzed_message_ids:
      analyzedMessageIds,

    commercial_role:
      'buyer',

    commercial_relevance:
      'commercial',

    interpretation: {
      what_changed: {
        summary: currentMoment,
        evidence_message_ids: evidenceMessageIds,
      },

      what_remains_valid: [],

      current_moment: {
        summary: currentMoment,
        evidence_message_ids: evidenceMessageIds,
        memory_ids: memoryIds,
      },

      customer_need: null,

      uncertainties: [],
    },

    state_patch: patch,

    strategy: {
      method_application:
        'Aplicar o método comercial configurado.',

      rationale:
        'A estratégia considera o estado acumulado e as mensagens novas.',

      next_move: nextMove,

      recommended_question: null,
      suggested_message: null,

      evidence_message_ids: evidenceMessageIds,
      memory_ids: memoryIds,
    },

    operational_suggestions: {
      crm: {
        should_change_crm_stage: false,
        recommended_status: null,
        rationale: null,
        requires_human_confirmation: true,
      },

      agenda: {
        should_change_agenda: false,
        expected_next_action_at: null,
        rationale: null,
        requires_human_confirmation: true,
      },
    },

    evidence_message_ids: evidenceMessageIds,
    memory_ids: memoryIds,
  }
}

function createMemoryId({ collection, state_version, item_index }) {
  return `${collection}-v${state_version}-${item_index}`
}

function reduceFromScratch(output) {
  return reduceStatefulCommercialState({
    previous_state: null,
    output,
    cycle_id: 'cycle-1',
    applied_at: '2026-08-27T12:00:00-03:00',
    create_memory_id: createMemoryId,
  })
}

function reduceOnTopOf(previousState, output, appliedAt = '2026-08-27T13:00:00-03:00') {
  return reduceStatefulCommercialState({
    previous_state: previousState,
    output,
    cycle_id: previousState.cycle_id,
    applied_at: appliedAt,
    create_memory_id: createMemoryId,
  })
}

// ---------------------------------------------------------------------------
// Redutor — Teste I (multissetorial): SUPERSEDED/NOT_REQUIRED sem conclusão
// ---------------------------------------------------------------------------

test(
  'indústria: uma amostra pendente pode ser substituída (superseded) sem prova de que foi entregue',
  () => {
    const initial = reduceFromScratch(
      buildOutput({
        patch: {
          ...emptyPatch(),
          needs_to_add: [
            {
              kind: 'pending_requirement',
              summary: 'Amostra física precisa ser enviada para avaliação.',
              confidence: 'high',
              evidence_message_ids: ['m1'],
            },
          ],
        },
      }),
    )

    const sampleNeedId = initial.needs[0].id

    assert.equal(
      initial.needs[0].memory_status,
      'active',
    )

    const next = reduceOnTopOf(
      initial,
      buildOutput({
        previousStateVersion: initial.version,
        analyzedMessageIds: ['m2'],
        patch: {
          ...emptyPatch(),
          need_ids_to_supersede: [sampleNeedId],
          needs_to_add: [
            {
              kind: 'pending_requirement',
              summary: 'Homologação direta substituiu a exigência de amostra física.',
              confidence: 'high',
              evidence_message_ids: ['m2'],
            },
          ],
        },
      }),
    )

    const supersededSample = next.needs.find(
      (need) => need.id === sampleNeedId,
    )

    assert.equal(
      supersededSample.memory_status,
      'superseded',
    )

    assert.equal(
      supersededSample.closed_in_state_version,
      next.version,
    )

    const homologationNeed = next.needs.find(
      (need) => need.id !== sampleNeedId,
    )

    assert.equal(
      homologationNeed.memory_status,
      'active',
    )
  },
)

test(
  'SaaS B2B: um loop aberto de aprovação jurídica superado pela mudança de processo não vira "resolvido"',
  () => {
    const initial = reduceFromScratch(
      buildOutput({
        patch: {
          ...emptyPatch(),
          open_loops_to_add: [
            {
              kind: 'legal_approval_pending',
              summary: 'Aguardando aprovação jurídica do contrato padrão.',
              evidence_message_ids: ['m1'],
            },
          ],
        },
      }),
    )

    const legalLoopId = initial.open_loops[0].id

    const next = reduceOnTopOf(
      initial,
      buildOutput({
        previousStateVersion: initial.version,
        analyzedMessageIds: ['m2'],
        patch: {
          ...emptyPatch(),
          open_loop_ids_to_supersede: [legalLoopId],
        },
      }),
    )

    const legalLoop = next.open_loops.find(
      (loop) => loop.id === legalLoopId,
    )

    assert.equal(
      legalLoop.memory_status,
      'superseded',
    )
  },
)

test(
  'clínica: uma incerteza sobre o exame deixa de ser necessária (superseded) quando o agendamento é substituído',
  () => {
    const initial = reduceFromScratch(
      buildOutput({
        patch: {
          ...emptyPatch(),
          uncertainties_to_add: [
            {
              kind: 'unclear_exam_completion',
              summary: 'Não está claro se o exame pré-consulta foi concluído.',
              confidence: 'low',
              evidence_message_ids: ['m1'],
            },
          ],
        },
      }),
    )

    const uncertaintyId = initial.uncertainties[0].id

    const next = reduceOnTopOf(
      initial,
      buildOutput({
        previousStateVersion: initial.version,
        analyzedMessageIds: ['m2'],
        patch: {
          ...emptyPatch(),
          uncertainty_ids_to_supersede: [uncertaintyId],
        },
      }),
    )

    assert.equal(
      next.uncertainties[0].memory_status,
      'superseded',
    )
  },
)

// ---------------------------------------------------------------------------
// Redutor — Testes G/S (multissetorial): evidência nunca resolve a pendência
// errada quando há múltiplas pendências ativas simultâneas
// ---------------------------------------------------------------------------

test(
  'imobiliária: evidência do documento resolve somente o documento, aprovação financeira continua pendente',
  () => {
    const initial = reduceFromScratch(
      buildOutput({
        patch: {
          ...emptyPatch(),
          needs_to_add: [
            {
              kind: 'pending_requirement',
              summary: 'Documentação do imóvel pendente de envio.',
              confidence: 'high',
              evidence_message_ids: ['m1'],
            },
            {
              kind: 'pending_requirement',
              summary: 'Aprovação financeira do crédito pendente.',
              confidence: 'high',
              evidence_message_ids: ['m1'],
            },
          ],
        },
      }),
    )

    const [documentNeedId, financialNeedId] =
      initial.needs.map((need) => need.id)

    const next = reduceOnTopOf(
      initial,
      buildOutput({
        previousStateVersion: initial.version,
        analyzedMessageIds: ['m2'],
        patch: {
          ...emptyPatch(),
          need_ids_to_resolve: [documentNeedId],
        },
      }),
    )

    const documentNeed = next.needs.find(
      (need) => need.id === documentNeedId,
    )

    const financialNeed = next.needs.find(
      (need) => need.id === financialNeedId,
    )

    assert.equal(documentNeed.memory_status, 'resolved')
    assert.equal(financialNeed.memory_status, 'active')

    assert.deepEqual(
      financialNeed.evidence_message_ids,
      ['m1'],
    )
  },
)

test(
  'varejo: confirmação de pagamento não resolve a pendência de retirada do produto',
  () => {
    const initial = reduceFromScratch(
      buildOutput({
        patch: {
          ...emptyPatch(),
          needs_to_add: [
            {
              kind: 'pending_requirement',
              summary: 'Pagamento do pedido pendente.',
              confidence: 'high',
              evidence_message_ids: ['m1'],
            },
            {
              kind: 'pending_requirement',
              summary: 'Retirada do produto na loja pendente.',
              confidence: 'high',
              evidence_message_ids: ['m1'],
            },
          ],
        },
      }),
    )

    const [paymentNeedId, pickupNeedId] =
      initial.needs.map((need) => need.id)

    const next = reduceOnTopOf(
      initial,
      buildOutput({
        previousStateVersion: initial.version,
        analyzedMessageIds: ['m2'],
        patch: {
          ...emptyPatch(),
          need_ids_to_resolve: [paymentNeedId],
        },
      }),
    )

    assert.equal(
      next.needs.find((need) => need.id === paymentNeedId).memory_status,
      'resolved',
    )

    assert.equal(
      next.needs.find((need) => need.id === pickupNeedId).memory_status,
      'active',
    )
  },
)

// ---------------------------------------------------------------------------
// Redutor — segurança: fechar duas vezes o mesmo item, ou substituir o que
// já foi resolvido, continua proibido depois da nova capacidade de supersede
// ---------------------------------------------------------------------------

test(
  'não é possível substituir (supersede) um requisito que já foi resolvido',
  () => {
    const initial = reduceFromScratch(
      buildOutput({
        patch: {
          ...emptyPatch(),
          needs_to_add: [
            {
              kind: 'pending_requirement',
              summary: 'Confirmação de endereço de entrega.',
              confidence: 'high',
              evidence_message_ids: ['m1'],
            },
          ],
        },
      }),
    )

    const needId = initial.needs[0].id

    const resolved = reduceOnTopOf(
      initial,
      buildOutput({
        previousStateVersion: initial.version,
        analyzedMessageIds: ['m2'],
        patch: {
          ...emptyPatch(),
          need_ids_to_resolve: [needId],
        },
      }),
    )

    assert.throws(
      () =>
        reduceOnTopOf(
          resolved,
          buildOutput({
            previousStateVersion: resolved.version,
            analyzedMessageIds: ['m3'],
            patch: {
              ...emptyPatch(),
              need_ids_to_supersede: [needId],
            },
          }),
          '2026-08-27T14:00:00-03:00',
        ),
      (error) => {
        assert.ok(
          error instanceof StatefulCommercialStateReductionError,
        )

        assert.equal(
          error.code,
          'MEMORY_ALREADY_CLOSED',
        )

        return true
      },
    )
  },
)

test(
  'contrato de estado comercial permanece na versão phase-5.1-commercial-state-v1 (mudança é aditiva no patch, não no estado persistido)',
  () => {
    assert.equal(
      STATEFUL_COMMERCIAL_STATE_CONTRACT_VERSION,
      'phase-5.1-commercial-state-v1',
    )
  },
)

// ---------------------------------------------------------------------------
// Normalizador — um requisito não pode ser resolvido e substituído no mesmo
// ciclo (needs, open_loops e uncertainties, espelhando a checagem que já
// existia para objections)
// ---------------------------------------------------------------------------

const normalizationContext = {
  available_message_ids: ['m1'],

  customer_message_ids: ['m1'],

  available_products: [],

  previous_communication_observations: [],

  available_memory_ids: [
    'need-active-1',
    'open-loop-active-1',
    'uncertainty-active-1',
  ],

  active_memory_ids: [
    'need-active-1',
    'open-loop-active-1',
    'uncertainty-active-1',
  ],

  negotiation_evidence_detected: true,

  expected_previous_state_version: 3,

  current_crm_status: 'negociacao',

  prohibited_statuses: ['ganho', 'perdido'],

  reference_time: '2026-08-27T12:00:00-03:00',
}

function buildNormalizerOutput(patchOverrides) {
  return {
    contract_version: STATEFUL_COPILOT_CONTRACT_VERSION,

    previous_state_version: 3,

    analyzed_message_ids: ['m1'],

    commercial_role: 'buyer',
    commercial_relevance: 'commercial',

    interpretation: {
      what_changed: {
        summary: 'Atualização de teste.',
        evidence_message_ids: ['m1'],
      },

      what_remains_valid: [],

      current_moment: {
        summary: 'Momento de teste.',
        evidence_message_ids: ['m1'],
        memory_ids: [],
      },

      customer_need: null,

      uncertainties: [],
    },

    state_patch: {
      ...emptyPatch(),
      ...patchOverrides,
    },

    strategy: {
      method_application: 'Aplicar o método comercial configurado.',
      rationale: 'Racional de teste.',
      next_move: 'Próximo passo de teste.',
      recommended_question: null,
      suggested_message: null,
      evidence_message_ids: ['m1'],
      memory_ids: [],
    },

    operational_suggestions: {
      crm: {
        should_change_crm_stage: false,
        recommended_status: null,
        rationale: null,
        requires_human_confirmation: true,
      },

      agenda: {
        should_change_agenda: false,
        expected_next_action_at: null,
        rationale: null,
        requires_human_confirmation: true,
      },
    },

    evidence_message_ids: ['m1'],
    memory_ids: [],
  }
}

function expectConflictError(callback, expectedCode) {
  assert.throws(
    callback,
    (error) => {
      assert.ok(
        error instanceof StatefulCopilotContractError,
      )

      assert.equal(
        error.code,
        expectedCode,
      )

      return true
    },
  )
}

test(
  'normalizador rejeita necessidade resolvida e substituída no mesmo ciclo',
  () => {
    expectConflictError(
      () =>
        normalizeStatefulCopilotOutput(
          buildNormalizerOutput({
            need_ids_to_resolve: ['need-active-1'],
            need_ids_to_supersede: ['need-active-1'],
          }),
          normalizationContext,
        ),
      'CONFLICTING_NEED_CLOSURE',
    )
  },
)

test(
  'normalizador rejeita loop aberto resolvido e substituído no mesmo ciclo',
  () => {
    expectConflictError(
      () =>
        normalizeStatefulCopilotOutput(
          buildNormalizerOutput({
            open_loop_ids_to_resolve: ['open-loop-active-1'],
            open_loop_ids_to_supersede: ['open-loop-active-1'],
          }),
          normalizationContext,
        ),
      'CONFLICTING_OPEN_LOOP_CLOSURE',
    )
  },
)

test(
  'normalizador rejeita incerteza resolvida e substituída no mesmo ciclo',
  () => {
    expectConflictError(
      () =>
        normalizeStatefulCopilotOutput(
          buildNormalizerOutput({
            uncertainty_ids_to_resolve: ['uncertainty-active-1'],
            uncertainty_ids_to_supersede: ['uncertainty-active-1'],
          }),
          normalizationContext,
        ),
      'CONFLICTING_UNCERTAINTY_CLOSURE',
    )
  },
)

test(
  'normalizador aceita substituir uma necessidade sem resolvê-la',
  () => {
    const normalized = normalizeStatefulCopilotOutput(
      buildNormalizerOutput({
        need_ids_to_supersede: ['need-active-1'],
      }),
      normalizationContext,
    )

    assert.deepEqual(
      normalized.state_patch.need_ids_to_supersede,
      ['need-active-1'],
    )

    assert.deepEqual(
      normalized.state_patch.need_ids_to_resolve,
      [],
    )
  },
)
