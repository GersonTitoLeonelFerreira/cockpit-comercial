import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const reportExport = require('../src/manychat-mainworld-report-export.js')

test('parseReport aceita somente JSON de objeto', () => {
  assert.deepEqual(
    reportExport.parseReport('{"stage":"returned_to_baseline_evaluated","pass":true}'),
    { stage: 'returned_to_baseline_evaluated', pass: true },
  )
  assert.equal(reportExport.parseReport('[]'), null)
  assert.equal(reportExport.parseReport('inválido'), null)
})

test('downloadReport gera arquivo JSON seguro com nome determinístico', () => {
  let clicked = 0
  let appended = 0
  let removed = 0
  let anchor = null

  const documentRef = {
    body: {
      appendChild(node) {
        appended += 1
        anchor = node
      },
    },
    createElement(tag) {
      assert.equal(tag, 'a')
      return {
        href: '',
        download: '',
        style: {},
        click() {
          clicked += 1
        },
        remove() {
          removed += 1
        },
      }
    },
  }

  const ok = reportExport.downloadReport(
    {
      schema_version: 'yolen-manychat-mainworld-identity-result-v1',
      stage: 'returned_to_baseline_evaluated',
      pass: true,
      proven_locators: ['fiber1.memoizedProps.contact.contactId'],
    },
    documentRef,
  )

  assert.equal(ok, true)
  assert.equal(appended, 1)
  assert.equal(clicked, 1)
  assert.equal(removed, 1)
  assert.equal(anchor.download, 'yolen-manychat-mainworld-identity-report.json')
  assert.match(anchor.href, /^data:application\/json;charset=utf-8,/)
  assert.doesNotMatch(anchor.href, /raw_identity_value/)
})
