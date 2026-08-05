import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  fileURLToPath,
} from 'node:url'

const currentDirectory =
  path.dirname(
    fileURLToPath(
      import.meta.url,
    ),
  )

const corpusPath =
  path.resolve(
    currentDirectory,
    '../../../docs/companion-v2/corpus/phase-5-1-stateful-copilot-cases.json',
  )

const corpus =
  JSON.parse(
    fs.readFileSync(
      corpusPath,
      'utf8',
    ),
  )

function requireText(
  value,
  label,
) {
  assert.equal(
    typeof value,
    'string',
    `${label} precisa ser texto.`,
  )

  assert.ok(
    value.trim(),
    `${label} não pode ficar vazio.`,
  )
}

function getAvailableMessageIds(
  item,
) {
  const messageIds =
    new Set(
      item.new_messages.map(
        (message) =>
          message.id,
      ),
    )

  for (
    const commitment of
    item.prior_state.commitments
  ) {
    for (
      const messageId of
      commitment.evidence_message_ids
    ) {
      messageIds.add(
        messageId,
      )
    }
  }

  return messageIds
}

function assertEvidence(
  evidenceMessageIds,
  availableMessageIds,
  label,
) {
  assert.ok(
    Array.isArray(
      evidenceMessageIds,
    ),
    `${label} precisa ser uma lista.`,
  )

  assert.ok(
    evidenceMessageIds.length > 0,
    `${label} precisa possuir evidência.`,
  )

  for (
    const messageId of
    evidenceMessageIds
  ) {
    requireText(
      messageId,
      `${label}.message_id`,
    )

    assert.ok(
      availableMessageIds.has(
        messageId,
      ),
      `${label} referencia a mensagem inexistente ${messageId}.`,
    )
  }
}

test(
  'formaliza o corpus inicial da Fase 5.1',
  () => {
    assert.equal(
      corpus.corpus_version,
      'phase-5.1-stateful-copilot-corpus-v1',
    )

    assert.equal(
      corpus.status,
      'draft',
    )

    requireText(
      corpus.purpose,
      'purpose',
    )

    assert.ok(
      Array.isArray(
        corpus.cases,
      ),
    )

    assert.equal(
      corpus.cases.length,
      8,
    )
  },
)

test(
  'casos e mensagens novas possuem identidades únicas',
  () => {
    const caseIds =
      new Set()

    for (
      const item of
      corpus.cases
    ) {
      requireText(
        item.id,
        'case.id',
      )

      requireText(
        item.title,
        `${item.id}.title`,
      )

      assert.ok(
        !caseIds.has(
          item.id,
        ),
        `Caso duplicado: ${item.id}.`,
      )

      caseIds.add(
        item.id,
      )

      const messageIds =
        new Set()

      for (
        const message of
        item.new_messages
      ) {
        requireText(
          message.id,
          `${item.id}.message.id`,
        )

        requireText(
          message.text,
          `${item.id}.${message.id}.text`,
        )

        assert.ok(
          [
            'incoming',
            'outgoing',
          ].includes(
            message.direction,
          ),
          `Direção inválida em ${item.id}.${message.id}.`,
        )

        assert.ok(
          !messageIds.has(
            message.id,
          ),
          `Mensagem duplicada em ${item.id}: ${message.id}.`,
        )

        messageIds.add(
          message.id,
        )
      }
    }
  },
)

test(
  'toda conclusão esperada possui evidência declarada',
  () => {
    for (
      const item of
      corpus.cases
    ) {
      const availableMessageIds =
        getAvailableMessageIds(
          item,
        )

      const transition =
        item.expected_transition

      assertEvidence(
        transition
          .current_priority
          .evidence_message_ids,
        availableMessageIds,
        `${item.id}.current_priority`,
      )

      assertEvidence(
        transition
          .integrated_strategy
          .evidence_message_ids,
        availableMessageIds,
        `${item.id}.integrated_strategy`,
      )

      for (
        const openLoop of
        transition.new_open_loops
      ) {
        assertEvidence(
          openLoop.evidence_message_ids,
          availableMessageIds,
          `${item.id}.new_open_loops`,
        )
      }

      for (
        const signal of
        transition.new_signals
      ) {
        assertEvidence(
          signal.evidence_message_ids,
          availableMessageIds,
          `${item.id}.new_signals`,
        )
      }

      for (
        const uncertainty of
        transition.uncertainties
      ) {
        assertEvidence(
          uncertainty.evidence_message_ids,
          availableMessageIds,
          `${item.id}.uncertainties`,
        )
      }

      for (
        const commitment of
        transition.changed_commitments
      ) {
        assertEvidence(
          commitment.evidence_message_ids,
          availableMessageIds,
          `${item.id}.changed_commitments`,
        )
      }
    }
  },
)

test(
  'compromissos preservados ou alterados existem no estado anterior',
  () => {
    for (
      const item of
      corpus.cases
    ) {
      const priorCommitmentIds =
        new Set(
          item
            .prior_state
            .commitments
            .map(
              (commitment) =>
                commitment.id,
            ),
        )

      const preservedIds =
        new Set(
          item
            .expected_transition
            .preserved_commitment_ids,
        )

      for (
        const commitmentId of
        preservedIds
      ) {
        assert.ok(
          priorCommitmentIds.has(
            commitmentId,
          ),
          `${item.id} preserva compromisso inexistente: ${commitmentId}.`,
        )
      }

      for (
        const commitment of
        item
          .expected_transition
          .changed_commitments
      ) {
        assert.ok(
          priorCommitmentIds.has(
            commitment.id,
          ),
          `${item.id} altera compromisso inexistente: ${commitment.id}.`,
        )

        assert.ok(
          !preservedIds.has(
            commitment.id,
          ),
          `${item.id} preserva e altera simultaneamente ${commitment.id}.`,
        )
      }
    }
  },
)

test(
  'nenhum cenário autoriza escrita automática no CRM',
  () => {
    for (
      const item of
      corpus.cases
    ) {
      assert.equal(
        item
          .expected_transition
          .crm_write_allowed,
        false,
        `${item.id} não pode autorizar escrita automática.`,
      )

      assert.ok(
        item
          .expected_transition
          .forbidden_outcomes
          .length > 0,
        `${item.id} precisa declarar resultados proibidos.`,
      )
    }
  },
)

test(
  'o corpus confronta regras comerciais absolutas',
  () => {
    const coverage =
      new Set(
        corpus.cases.flatMap(
          (item) =>
            item.coverage,
        ),
      )

    const requiredCoverage = [
      'simultaneous_truths',
      'cancellation',
      'reschedule',
      'method_variation',
      'multi_question',
      'uncertainty',
      'objection_with_commitment',
      'non_commercial',
    ]

    for (
      const requirement of
      requiredCoverage
    ) {
      assert.ok(
        coverage.has(
          requirement,
        ),
        `Cobertura ausente: ${requirement}.`,
      )
    }
  },
)

test(
  'preço após demonstração integra pergunta, orçamento e compromisso',
  () => {
    const item =
      corpus.cases.find(
        (candidate) =>
          candidate.id ===
          'price_after_confirmed_demo',
      )

    assert.ok(
      item,
    )

    assert.deepEqual(
      item
        .expected_transition
        .preserved_commitment_ids,
      [
        'demo-1',
      ],
    )

    assert.ok(
      item
        .expected_transition
        .new_open_loops
        .some(
          (openLoop) =>
            openLoop.type ===
            'price_information',
        ),
    )

    assert.ok(
      item
        .expected_transition
        .new_signals
        .some(
          (signal) =>
            signal.type ===
            'declared_budget',
        ),
    )

    const forbiddenOutcomes =
      new Set(
        item
          .expected_transition
          .forbidden_outcomes,
      )

    assert.ok(
      forbiddenOutcomes.has(
        'ignore_price',
      ),
    )

    assert.ok(
      forbiddenOutcomes.has(
        'answer_price_only',
      ),
    )

    assert.ok(
      forbiddenOutcomes.has(
        'reconfirm_confirmed_demo',
      ),
    )

    assert.ok(
      forbiddenOutcomes.has(
        'invent_price',
      ),
    )
  },
)

test(
  'políticas comerciais diferentes podem produzir estratégias diferentes',
  () => {
    const consultativeCase =
      corpus.cases.find(
        (item) =>
          item.id ===
          'price_after_confirmed_demo',
      )

    const transparentCase =
      corpus.cases.find(
        (item) =>
          item.id ===
          'official_price_can_be_shared',
      )

    assert.ok(
      consultativeCase,
    )

    assert.ok(
      transparentCase,
    )

    assert.match(
      consultativeCase
        .method_policy
        .price_handling,
      /contextualizar o investimento/i,
    )

    assert.match(
      transparentCase
        .method_policy
        .price_handling,
      /Informar o preço oficial/i,
    )

    assert.ok(
      transparentCase
        .expected_transition
        .forbidden_outcomes
        .includes(
          'hide_price_against_method',
        ),
    )
  },
)
