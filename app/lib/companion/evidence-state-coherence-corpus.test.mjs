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
    '../../../docs/companion-v2/corpus/evidence-state-coherence-cases.json',
  )

const corpus =
  JSON.parse(
    fs.readFileSync(
      corpusPath,
      'utf8',
    ),
  )

const REQUIRED_LETTERS = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J',
  'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T',
]

function requireNonEmptyText(
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

function requireNonEmptyStringArray(
  value,
  label,
) {
  assert.ok(
    Array.isArray(value),
    `${label} precisa ser uma lista.`,
  )

  assert.ok(
    value.length > 0,
    `${label} precisa possuir ao menos um item.`,
  )

  for (const item of value) {
    requireNonEmptyText(
      item,
      `${label}[]`,
    )
  }
}

test(
  'formaliza o corpus da matriz A-T de evidência, estado e coerência',
  () => {
    assert.equal(
      corpus.corpus_version,
      'evidence-state-coherence-corpus-v1',
    )

    requireNonEmptyText(
      corpus.purpose,
      'purpose',
    )

    assert.ok(
      Array.isArray(corpus.sectors) &&
        corpus.sectors.length >= 5,
      'sectors precisa cobrir pelo menos cinco setores distintos.',
    )

    assert.ok(
      Array.isArray(corpus.cases),
    )

    assert.equal(
      corpus.cases.length,
      20,
      'a matriz obrigatória possui exatamente vinte testes (A a T).',
    )
  },
)

test(
  'cada letra obrigatória A-T aparece exatamente uma vez',
  () => {
    const lettersFound =
      corpus.cases.map(
        (item) => item.letter,
      )

    for (const letter of REQUIRED_LETTERS) {
      const occurrences =
        lettersFound.filter(
          (found) => found === letter,
        ).length

      assert.equal(
        occurrences,
        1,
        `A letra ${letter} precisa aparecer exatamente uma vez no corpus.`,
      )
    }

    for (const letter of lettersFound) {
      assert.ok(
        REQUIRED_LETTERS.includes(letter),
        `Letra inesperada no corpus: ${letter}.`,
      )
    }
  },
)

test(
  'casos possuem identidade única, setor declarado e referência de regra',
  () => {
    const caseIds = new Set()

    for (const item of corpus.cases) {
      requireNonEmptyText(item.id, 'case.id')
      requireNonEmptyText(item.title, `${item.id}.title`)

      assert.ok(
        !caseIds.has(item.id),
        `Caso duplicado: ${item.id}.`,
      )

      caseIds.add(item.id)

      assert.ok(
        corpus.sectors.includes(item.sector),
        `${item.id} referencia um setor não declarado em sectors: ${item.sector}.`,
      )

      requireNonEmptyStringArray(
        item.rule_reference,
        `${item.id}.rule_reference`,
      )
    }
  },
)

test(
  'todo caso descreve o que deve e o que não deve acontecer, com evidência de mensagens válidas',
  () => {
    for (const item of corpus.cases) {
      assert.ok(
        item.prior_state &&
          typeof item.prior_state === 'object',
        `${item.id} precisa declarar prior_state.`,
      )

      requireNonEmptyText(
        item.prior_state.summary,
        `${item.id}.prior_state.summary`,
      )

      assert.ok(
        Array.isArray(item.new_messages),
        `${item.id}.new_messages precisa ser uma lista.`,
      )

      const messageIds = new Set()

      for (const message of item.new_messages) {
        requireNonEmptyText(
          message.id,
          `${item.id}.message.id`,
        )

        assert.ok(
          !messageIds.has(message.id),
          `Mensagem duplicada em ${item.id}: ${message.id}.`,
        )

        messageIds.add(message.id)

        assert.ok(
          [
            'incoming',
            'outgoing',
          ].includes(message.direction),
          `Direção inválida em ${item.id}.${message.id}.`,
        )

        requireNonEmptyText(
          message.text,
          `${item.id}.${message.id}.text`,
        )
      }

      requireNonEmptyStringArray(
        item.expected_behavior?.must,
        `${item.id}.expected_behavior.must`,
      )

      requireNonEmptyStringArray(
        item.expected_behavior?.must_not,
        `${item.id}.expected_behavior.must_not`,
      )

      const evidenceMentions =
        [
          ...item.expected_behavior.must,
          ...item.expected_behavior.must_not,
        ]
          .join(' ')

      for (const message of item.new_messages) {
        if (
          evidenceMentions.includes(
            message.id,
          )
        ) {
          assert.ok(
            messageIds.has(message.id),
            `${item.id} referencia evidência ${message.id} fora das mensagens declaradas.`,
          )
        }
      }
    }
  },
)

test(
  'nenhum caso descreve regra por palavra-chave de setor: cada requisito é tratado como pending_requirement genérico',
  () => {
    for (const item of corpus.cases) {
      const mustText =
        item.expected_behavior.must.join(' ').toLowerCase()

      const mustNotText =
        item.expected_behavior.must_not.join(' ').toLowerCase()

      for (const forbidden of ['if message contains', 'regex', 'palavra-chave']) {
        assert.ok(
          !mustText.includes(forbidden) &&
            !mustNotText.includes(forbidden),
          `${item.id} não pode descrever a regra esperada como casamento de palavra-chave.`,
        )
      }
    }
  },
)

test(
  'o teste de silêncio (M) não exige nenhuma mensagem nova como evidência',
  () => {
    const silenceCase =
      corpus.cases.find(
        (item) => item.letter === 'M',
      )

    assert.ok(silenceCase)

    assert.deepEqual(
      silenceCase.new_messages,
      [],
    )
  },
)

test(
  'a matriz cobre pelo menos cinco setores diferentes entre os vinte casos',
  () => {
    const sectorsUsed =
      new Set(
        corpus.cases.map(
          (item) => item.sector,
        ),
      )

    assert.ok(
      sectorsUsed.size >= 5,
      `A matriz precisa cobrir ao menos cinco setores distintos, encontrou ${sectorsUsed.size}.`,
    )
  },
)
