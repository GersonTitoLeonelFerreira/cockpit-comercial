import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  GENERAL_COMMERCIAL_INTELLIGENCE_LIBRARY,
} from './commercial-intelligence-library.ts'

import {
  COACHING_QUALITY_DIMENSION_WEIGHTS,
} from './coaching-quality-eval.ts'

const CORPUS =
  JSON.parse(
    readFileSync(
      new URL(
        '../../../docs/companion-v2/corpus/coaching-engine-phase0-cases.json',
        import.meta.url,
      ),
      'utf8',
    ),
  )

const EXPECTED_IDS =
  Array.from(
    { length: 10 },
    (_, index) =>
      `C${String(index + 1).padStart(2, '0')}`,
  )

test(
  'Fase 0 formaliza exatamente os dez casos canônicos C01-C10',
  () => {
    assert.equal(
      CORPUS.version,
      'coaching-engine-phase0-corpus-v1',
    )

    assert.deepEqual(
      CORPUS.cases.map(item => item.id),
      EXPECTED_IDS,
    )

    assert.equal(
      new Set(
        CORPUS.cases.map(
          item => item.id,
        ),
      ).size,
      10,
    )
  },
)

test(
  'todo caso possui evidência conversacional e contrato de coaching mínimo',
  () => {
    for (const item of CORPUS.cases) {
      assert.ok(
        item.title,
        item.id,
      )

      assert.ok(
        item.scenario,
        item.id,
      )

      assert.ok(
        item.turns.length > 0,
        item.id,
      )

      for (const turn of item.turns) {
        assert.ok(
          ['incoming', 'outgoing']
            .includes(
              turn.direction,
            ),
          item.id,
        )

        assert.ok(
          turn.text.trim(),
          item.id,
        )
      }

      const expected =
        item.expected

      for (
        const field of [
          'client_context_confidence',
          'seller_execution_confidence',
          'client_signal',
          'seller_action',
          'method_state',
          'next_action',
          'message_strategy',
        ]
      ) {
        assert.ok(
          expected[field],
          `${item.id}: ${field}`,
        )
      }

      assert.ok(
        Array.isArray(
          expected.must_not,
        ) &&
        expected.must_not.length > 0,
        item.id,
      )
    }
  },
)

test(
  'toda técnica referenciada no corpus existe na Intelligence Library atual',
  () => {
    const knownIds =
      new Set(
        GENERAL_COMMERCIAL_INTELLIGENCE_LIBRARY
          .map(
            entry => entry.id,
          ),
      )

    for (const item of CORPUS.cases) {
      for (
        const techniqueId of
        item.expected.technique_ids
      ) {
        assert.equal(
          knownIds.has(
            techniqueId,
          ),
          true,
          `${item.id}: ${techniqueId}`,
        )
      }
    }
  },
)

test(
  'caso C02 prova que contexto pobre do cliente não reduz confiança sobre execução observável do vendedor',
  () => {
    const item =
      CORPUS.cases.find(
        entry =>
          entry.id === 'C02',
      )

    assert.equal(
      item.expected
        .client_context_confidence,
      'low',
    )

    assert.equal(
      item.expected
        .seller_execution_confidence,
      'high',
    )
  },
)

test(
  'casos de disponibilidade proíbem invenção de horário e condicionam guided choice a opção real',
  () => {
    const c01 =
      CORPUS.cases.find(
        entry =>
          entry.id === 'C01',
      )

    const c10 =
      CORPUS.cases.find(
        entry =>
          entry.id === 'C10',
      )

    assert.ok(
      c01.expected.must_not
        .includes(
          'inventar horários',
        ),
    )

    assert.ok(
      c10.expected.must_not
        .includes(
          'inventar horários',
        ),
    )

    assert.match(
      c01.expected
        .technique_condition,
      /opções reais/i,
    )

    assert.match(
      c10.expected
        .technique_condition,
      /opções reais/i,
    )
  },
)

test(
  'caso C09 formaliza o transplant test contra mensagem genérica',
  () => {
    const c09 =
      CORPUS.cases.find(
        entry =>
          entry.id === 'C09',
      )

    assert.ok(
      c09.expected.must_not
        .some(
          item =>
            /dez situações/i
              .test(item),
        ),
    )
  },
)

test(
  'rubrica versionada cobre as oito dimensões definidas para o MVP',
  () => {
    assert.deepEqual(
      Object.keys(
        COACHING_QUALITY_DIMENSION_WEIGHTS,
      ),
      [
        'context_fidelity',
        'seller_execution_diagnosis',
        'sequence_method',
        'non_obviousness',
        'technique',
        'practical_action',
        'message_quality',
        'grounding_safety',
      ],
    )
  },
)
