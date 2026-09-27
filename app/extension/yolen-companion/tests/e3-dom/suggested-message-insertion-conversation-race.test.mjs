// UX-04 — as ações de composer deixaram de pertencer à ANÁLISE.
// Este arquivo mantém a cobertura das corridas A→B que importam para a
// ação seller-facing que continua existindo: MENSAGEM → Incluir.
// O caminho legado data-yolen-action="insert-suggested-message" permanece
// como implementação interna histórica, mas não é mais uma superfície de UI.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildMessageHtml,
  defaultAgoraDecisionState,
  defaultLeadResolution,
  loadContentScript,
  resolveLeadCalls,
  waitFor,
} from '../e3-test-support/load-content-script.mjs'

const CONVERSATION_A_TITLE = '+55 11 98888-7777'
const CONVERSATION_B_TITLE = '+55 21 97777-6666'
const PHONE_A = '5511988887777'
const PHONE_B = '5521977776666'
const CYCLE_A = 'cycle-race-a'
const CYCLE_B = 'cycle-race-b'
const MARKER_A = 'MENSAGEM_DA_ABA_MENSAGEM_DA_CONVERSA_A'
const SUMMARY_A = 'Cliente A perguntou sobre o preço do plano.'
const SUMMARY_B = 'Cliente B pediu para remarcar a demonstração.'

function pageHtml({ draft = '' } = {}) {
  const messagesHtml = buildMessageHtml({
    id: 'msg-a1',
    prePlainText: '[10:00, 21/08/2026] Cliente A: ',
    text: 'O preço ficou acima do que eu esperava.',
  })

  return `<!doctype html><html><body>
    <div id="app">
      <div id="main">
        <header><span title="${CONVERSATION_A_TITLE}">${CONVERSATION_A_TITLE}</span></header>
        <div id="conversation-body">${messagesHtml}</div>
        <footer>
          <div contenteditable="true" role="textbox" data-lexical-editor="true">${draft}</div>
          <button type="button" aria-label="Enviar"><span data-icon="send"></span></button>
        </footer>
      </div>
    </div>
  </body></html>`
}

function scenarioOptions(overrides = {}) {
  return {
    initialHtml: pageHtml(),
    resolutionsByPhone: {
      [PHONE_A]: defaultLeadResolution({
        phone: PHONE_A,
        cycle: {
          id: CYCLE_A,
          status: 'contato',
          owner_user_id: 'user-1',
        },
      }),
      [PHONE_B]: defaultLeadResolution({
        phone: PHONE_B,
        cycle: {
          id: CYCLE_B,
          status: 'contato',
          owner_user_id: 'user-1',
        },
      }),
    },
    decisionStateResult: defaultAgoraDecisionState(),
    leadSummaryResult: (_callCount, requestPayload) => ({
      ok: true,
      data: {
        identity: {
          company_id: 'company-1',
          lead_id: 'lead-1',
          cycle_id: requestPayload?.cycle_id,
          conversation_key: requestPayload?.conversation_key,
        },
        summary: {
          summary:
            requestPayload?.cycle_id === CYCLE_B
              ? SUMMARY_B
              : SUMMARY_A,
          version: 1,
          updated_at: '2026-08-25T12:00:00.000Z',
        },
        working_summary:
          requestPayload?.cycle_id === CYCLE_B
            ? SUMMARY_B
            : SUMMARY_A,
      },
    }),
    messageGenerationResult: {
      status: 'ready',
      message: MARKER_A,
      error: null,
    },
    ...overrides,
  }
}

function click(document, target) {
  target.dispatchEvent(
    new document.defaultView.MouseEvent(
      'click',
      {
        bubbles: true,
        cancelable: true,
      },
    ),
  )
}

function input(document, target) {
  target.dispatchEvent(
    new document.defaultView.Event(
      'input',
      { bubbles: true },
    ),
  )
}

function composerOf(document) {
  return document.querySelector(
    '#main footer [contenteditable="true"]',
  )
}

function installExecCommand(document, { delayMs = 0 } = {}) {
  document.execCommand = (
    command,
    _showUi,
    value,
  ) => {
    const composer =
      composerOf(document)

    if (command === 'delete') {
      composer.textContent = ''
      return true
    }

    if (command !== 'insertText') {
      return false
    }

    const write = () => {
      composer.textContent =
        `${composer.textContent}${value}`
    }

    if (delayMs > 0) {
      setTimeout(write, delayMs)
    } else {
      write()
    }

    return true
  }
}

function setWhatsAppConversation(
  document,
  {
    title,
    messageId,
    text,
  },
) {
  const header =
    document.querySelector(
      'header span[title]',
    )

  header.setAttribute(
    'title',
    title,
  )
  header.textContent = title

  document
    .getElementById(
      'conversation-body',
    )
    .innerHTML =
      buildMessageHtml({
        id: messageId,
        prePlainText:
          `[11:00, 21/08/2026] ${title}: `,
        text,
      })
}

function sleep(ms) {
  return new Promise(
    (resolve) => setTimeout(resolve, ms),
  )
}

async function openMessageAndGenerate(
  document,
  calls,
) {
  await waitFor(
    () => resolveLeadCalls(calls).length > 0,
  )

  await waitFor(
    () =>
      document.querySelector(
        '[data-yolen-seller-area="message"]',
      ),
  )

  click(
    document,
    document.querySelector(
      '[data-yolen-seller-area="message"]',
    ),
  )

  await waitFor(
    () =>
      document.querySelector(
        '[data-yolen-seller-message-intent]',
      ),
  )

  const intentField =
    document.querySelector(
      '[data-yolen-seller-message-intent]',
    )

  intentField.value =
    'Quero responder sobre o preço.'
  input(
    document,
    intentField,
  )

  click(
    document,
    document.querySelector(
      '[data-yolen-seller-message-action="generate"]',
    ),
  )

  return waitFor(
    () =>
      document.querySelector(
        '[data-yolen-seller-message-action="insert"]',
      ),
    { timeoutMs: 12000 },
  )
}

test('UX-04: ANÁLISE não expõe mais ações de Inserir/Copiar', async () => {
  const { document, calls } =
    loadContentScript(
      scenarioOptions(),
    )

  await waitFor(
    () => resolveLeadCalls(calls).length > 0,
  )

  assert.equal(
    document.querySelector(
      '[data-yolen-action="insert-suggested-message"]',
    ),
    null,
  )
  assert.equal(
    document.querySelector(
      '[data-yolen-action="copy-suggested-message"]',
    ),
    null,
  )
})

test('MENSAGEM: com o WhatsApp já em B e o Core ainda em A, Incluir não escreve a mensagem de A em B', async () => {
  const { document, calls } =
    loadContentScript(
      scenarioOptions(),
    )

  installExecCommand(document)

  const insertButton =
    await openMessageAndGenerate(
      document,
      calls,
    )

  setWhatsAppConversation(
    document,
    {
      title:
        CONVERSATION_B_TITLE,
      messageId: 'msg-b1',
      text: 'Mensagem de B',
    },
  )

  click(
    document,
    insertButton,
  )
  await sleep(80)

  assert.doesNotMatch(
    composerOf(document).textContent,
    new RegExp(MARKER_A),
    'a mensagem de A não pode ser escrita no campo da conversa B',
  )
})

test('MENSAGEM: rascunho ocupado é preservado e nunca exige substituição automática', async () => {
  const { document, calls } =
    loadContentScript(
      scenarioOptions({
        initialHtml:
          pageHtml({
            draft:
              'Rascunho do vendedor',
          }),
      }),
    )

  installExecCommand(document)

  const insertButton =
    await openMessageAndGenerate(
      document,
      calls,
    )

  click(
    document,
    insertButton,
  )

  await sleep(120)

  assert.equal(
    composerOf(document).textContent,
    'Rascunho do vendedor',
  )
  assert.match(
    document
      .getElementById(
        'yolen-companion-panel',
      )
      .textContent,
    /já contém texto/,
  )
})

test('MENSAGEM: incluir preenche o composer e nunca dispara envio automático', async () => {
  const { document, calls } =
    loadContentScript(
      scenarioOptions(),
    )

  installExecCommand(document)

  let sendClicks = 0

  document
    .querySelector(
      '#main footer button[aria-label="Enviar"]',
    )
    .addEventListener(
      'click',
      () => {
        sendClicks += 1
      },
    )

  const insertButton =
    await openMessageAndGenerate(
      document,
      calls,
    )

  click(
    document,
    insertButton,
  )

  await waitFor(
    () =>
      composerOf(document)
        .textContent
        .includes(MARKER_A),
  )

  assert.equal(
    sendClicks,
    0,
    'Incluir nunca envia automaticamente',
  )

  click(
    document,
    document.querySelector(
      '#main footer button[aria-label="Enviar"]',
    ),
  )

  assert.equal(
    sendClicks,
    1,
    'o envio acontece somente pela ação humana no canal',
  )
})
