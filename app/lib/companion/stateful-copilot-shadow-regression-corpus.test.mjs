import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const currentDirectory =
  path.dirname(
    fileURLToPath(import.meta.url),
  )

const corpusPath =
  path.resolve(
    currentDirectory,
    '../../../docs/companion-v2/corpus/phase-5-2-shadow-regressions.json',
  )

const corpus =
  JSON.parse(
    fs.readFileSync(
      corpusPath,
      'utf8',
    ),
  )

test(
  'formaliza as regressões contextuais reais da Fase 5.2',
  () => {
    assert.equal(
      corpus.corpus_version,
      'phase-5.2-shadow-regressions-v1',
    )

    assert.equal(
      corpus.status,
      'active',
    )

    assert.equal(
      corpus.cases.length,
      3,
    )
  },
)

test(
  'todas as respostas curtas exigem contexto anterior',
  () => {
    for (const item of corpus.cases) {
      assert.ok(item.context.length > 0)
      assert.equal(
        item.new_message.direction,
        'incoming',
      )
      assert.equal(
        item.expected.context_required,
        true,
      )
    }
  },
)

test(
  'respostas contextuais curtas não inventam CRM Agenda ou compromisso',
  () => {
    for (const item of corpus.cases) {
      assert.equal(
        item.expected.must_not_change_crm,
        true,
      )
      assert.equal(
        item.expected.must_not_change_agenda,
        true,
      )
      assert.equal(
        item.expected.must_not_invent_commitment,
        true,
      )
    }
  },
)

test(
  'os parados resolve a referência para leads parados sem perguntar novamente',
  () => {
    const item =
      corpus.cases.find(
        candidate =>
          candidate.id ===
          'short_reply_os_parados',
      )

    assert.ok(item)

    assert.equal(
      item.expected.meaning,
      'leads_parados_are_current_priority',
    )

    assert.equal(
      item.expected.must_not_ask_meaning_again,
      true,
    )
  },
)
