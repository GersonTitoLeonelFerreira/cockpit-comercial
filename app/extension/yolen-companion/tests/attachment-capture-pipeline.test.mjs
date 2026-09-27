import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

import { JSDOM } from 'jsdom'

const require = createRequire(import.meta.url)
const messageTools = require('../src/message-mutations.js')
const captureBatch = require('../src/capture-batch.js')

test('PDF descrito em memória atravessa leitura de mensagem e lote canônico como texto factual', () => {
  const dom = new JSDOM(`
    <!doctype html>
    <html>
      <body>
        <div class="message-out" data-id="msg-pdf-1">
          <div data-pre-plain-text="[10:31, 12/09/2026] Rayane: ">
            <div data-testid="document">
              <span title="GRADE ATUALIZADA EM 12-08-26 (1).pdf">
                GRADE ATUALIZADA EM 12-08-26 (1).pdf
              </span>
            </div>
          </div>
        </div>
      </body>
    </html>
  `)

  const messageNode = dom.window.document.querySelector(
    '[data-pre-plain-text]',
  )

  // FASE 5 / Q6: evidência descrita em memória, sem escrita no DOM.
  const text =
    messageTools.describeBubbleAttachmentEvidence(messageNode)
      ?.evidenceText

  assert.equal(
    messageNode.querySelectorAll('[data-yolen-attachment-evidence]').length,
    0,
  )

  assert.equal(
    text,
    '[Arquivo: GRADE ATUALIZADA EM 12-08-26 (1).pdf]',
  )

  const messages = captureBatch.buildCaptureMessages({
    activeMessages: [
      {
        id: 'msg-pdf-1',
        timestampMs: Date.parse('2026-09-12T13:31:00.000Z'),
        observedAt: '2026-09-12T13:31:05.000Z',
        direction: 'outgoing',
        text,
        hasAudio: false,
      },
    ],
  })

  assert.equal(messages.length, 1)
  assert.equal(messages[0].message_key, 'msg-pdf-1')
  assert.equal(messages[0].direction, 'outgoing')
  assert.equal(messages[0].content_type, 'text')
  assert.equal(
    messages[0].text_content,
    '[Arquivo: GRADE ATUALIZADA EM 12-08-26 (1).pdf]',
  )
  assert.equal(messages[0].audio_transcription, null)
  assert.equal(messages[0].is_deleted, false)
})
