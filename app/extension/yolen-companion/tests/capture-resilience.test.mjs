import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import captureResilience from '../src/capture-resilience.js'

const {
  createCaptureCoordinator,
  isRetryableResult,
  normalizeWhatsAppPrePlainText,
  resolveLeadWithRetry,
} = captureResilience

function successfulMessageResult(
  messageKey,
  canonicalVersion,
) {
  return {
    message_key: messageKey,
    synced: true,
    canonical_version:
      canonicalVersion,
    reason: null,
  }
}

function capturePayload(
  baseVersion,
  overrides = {},
) {
  return {
    conversation_key:
      'phone:5547999999999',
    messages: [
      {
        message_key: 'message-001',
        base_version: baseVersion,
        text_content:
          'Mensagem atualizada',
        is_deleted: false,
        ...overrides,
      },
    ],
  }
}

test('normaliza timestamp US time-first com PM e segundos opcionais', () => {
  assert.equal(
    normalizeWhatsAppPrePlainText(
      '[10:30 PM, 8/4/2026] Cliente:',
    ),
    '[22:30, 04/08/2026] Cliente:',
  )

  assert.equal(
    normalizeWhatsAppPrePlainText(
      '[10:30:45 PM, 8/4/2026] Cliente:',
    ),
    '[22:30:45, 04/08/2026] Cliente:',
  )
})

test('normaliza timestamp US date-first e converte corretamente 12 AM e 12 PM', () => {
  assert.equal(
    normalizeWhatsAppPrePlainText(
      '[8/4/2026, 12:00 AM] Cliente:',
    ),
    '[00:00, 04/08/2026] Cliente:',
  )

  assert.equal(
    normalizeWhatsAppPrePlainText(
      '[8/4/2026, 12:00 PM] Cliente:',
    ),
    '[12:00, 04/08/2026] Cliente:',
  )
})

test('preserva timestamp pt-BR e rejeita componentes US inválidos', () => {
  const ptBr =
    '[22:30, 04/08/2026] Cliente:'

  const invalid =
    '[13:70 PM, 15/40/2026] Cliente:'

  assert.equal(
    normalizeWhatsAppPrePlainText(
      ptBr,
    ),
    ptBr,
  )

  assert.equal(
    normalizeWhatsAppPrePlainText(
      invalid,
    ),
    invalid,
  )
})

// FASE 5: a normalização deixou de ser um patch global em
// Element.prototype.getAttribute. O adapter WhatsApp recebe
// normalizeWhatsAppPrePlainText por dependência explícita e a aplica ao ler
// o cabeçalho `data-pre-plain-text` de cada mensagem.
test('adapter entrega timestamp normalizado ao Core sem patch global de getAttribute', async () => {
  const { JSDOM } = await import('jsdom')
  const vm = await import('node:vm')

  const dom = new JSDOM(
    `<!doctype html><html><body>
      <div id="main">
        <div class="message-in" data-id="msg-1">
          <div data-pre-plain-text="[9:15 PM, 8/4/2026] Cliente: ">
            <span class="selectable-text copyable-text"><span>Olá</span></span>
          </div>
        </div>
      </div>
    </body></html>`,
    { url: 'https://web.whatsapp.com/' },
  )

  const nativeGetAttribute =
    dom.window.Element.prototype.getAttribute

  const sandbox = {
    window: dom.window,
    document: dom.window.document,
    Node: dom.window.Node,
    Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement,
    console,
  }
  sandbox.globalThis = sandbox
  vm.createContext(sandbox)
  for (const file of ['message-mutations.js', 'whatsapp-adapter.js']) {
    vm.runInContext(
      readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8'),
      sandbox,
    )
  }

  const rawReads = []
  const adapter = sandbox.YolenCompanionWhatsAppAdapter.create({
    normalizePrePlainText(value) {
      rawReads.push(value)
      return normalizeWhatsAppPrePlainText(value)
    },
  })

  const entries = adapter.readVisibleMessageEntries({
    observedAt: '2026-08-04T21:16:00.000Z',
    getPreviousMessage: () => null,
  })

  assert.equal(
    dom.window.Element.prototype.getAttribute,
    nativeGetAttribute,
    'nenhum patch global no protótipo do DOM',
  )
  assert.ok(
    rawReads.includes('[9:15 PM, 8/4/2026] Cliente: '),
    'o adapter normaliza o valor cru lido do DOM',
  )
  assert.equal(entries.length, 1)
  assert.equal(entries[0].message.timestampLabel, '04/08/2026 21:15')
  assert.equal(entries[0].message.dateKey, '2026-08-04')
})

test('rebaseia plano mais novo somente após avanço confirmado neste dispositivo', () => {
  const coordinator =
    createCaptureCoordinator()

  coordinator.recordResponse(
    'phone:5547999999999',
    [
      successfulMessageResult(
        'message-001',
        '1',
      ),
    ],
  )

  const firstEdit =
    coordinator.preparePayload(
      capturePayload('1'),
    )

  assert.equal(
    firstEdit.messages[0]
      .base_version,
    '1',
  )

  coordinator.recordResponse(
    'phone:5547999999999',
    [
      successfulMessageResult(
        'message-001',
        '2',
      ),
    ],
  )

  const queuedSecondEdit =
    coordinator.preparePayload(
      capturePayload('1', {
        text_content:
          'Segunda edição rápida',
      }),
    )

  assert.equal(
    queuedSecondEdit.messages[0]
      .base_version,
    '2',
  )

  const queuedDeletion =
    coordinator.preparePayload(
      capturePayload('1', {
        text_content: null,
        is_deleted: true,
      }),
    )

  assert.equal(
    queuedDeletion.messages[0]
      .base_version,
    '2',
  )
})

test('conflito externo não atualiza a versão local nem entra em rebase automático', () => {
  const coordinator =
    createCaptureCoordinator()

  coordinator.recordResponse(
    'phone:5547999999999',
    [
      successfulMessageResult(
        'message-001',
        '7',
      ),
    ],
  )

  coordinator.recordResponse(
    'phone:5547999999999',
    [
      {
        message_key:
          'message-001',
        synced: false,
        canonical_version: '8',
        reason: 'VERSION_CONFLICT',
      },
    ],
  )

  const payload =
    coordinator.preparePayload(
      capturePayload('7'),
    )

  assert.equal(
    payload.messages[0]
      .base_version,
    '7',
  )
})

test('repete resolução transitória com backoff e encerra ao obter sucesso', async () => {
  let attempts = 0
  const delays = []

  const result =
    await resolveLeadWithRetry(
      async () => {
        attempts += 1

        if (attempts < 3) {
          return {
            ok: false,
            statusCode: 500,
            payload: {
              ok: false,
              error:
                'Falha temporária',
            },
          }
        }

        return {
          ok: true,
          statusCode: 200,
          payload: {
            ok: true,
            status: 'OWNED_BY_ME',
          },
        }
      },
      {
        phone: '5547999999999',
      },
      {
        baseDelayMs: 10,
        maxAttempts: 5,
        maxDelayMs: 100,
        sleepFn: async (
          delayMs,
        ) => {
          delays.push(delayMs)
        },
      },
    )

  assert.equal(attempts, 3)
  assert.deepEqual(
    delays,
    [10, 20],
  )
  assert.equal(result.ok, true)
})

test('não repete erro definitivo de resolução', async () => {
  let attempts = 0

  const result =
    await resolveLeadWithRetry(
      async () => {
        attempts += 1

        return {
          ok: false,
          statusCode: 400,
          payload: {
            ok: false,
            error: 'Telefone inválido',
          },
        }
      },
      {},
      {
        maxAttempts: 5,
        sleepFn: async () => {
          throw new Error(
            'Não deveria aguardar retry.',
          )
        },
      },
    )

  assert.equal(attempts, 1)
  assert.equal(result.statusCode, 400)
  assert.equal(
    isRetryableResult(result),
    false,
  )
})

test('manifesto carrega a resiliência antes do content script', () => {
  const manifest = JSON.parse(
    readFileSync(
      new URL(
        '../manifest.json',
        import.meta.url,
      ),
      'utf8',
    ),
  )

  // Desde a correção de arquitetura do identity bridge (P0 — Real WhatsApp
  // Active Chat Identity), há dois blocos casando com web.whatsapp.com: o
  // novo bloco MAIN world (só whatsapp-identity-bridge.js) e o bloco
  // ISOLATED de sempre — este teste precisa do isolado.
  const whatsappScripts =
    manifest.content_scripts.find(
      (entry) =>
        entry.matches.includes(
          'https://web.whatsapp.com/*',
        ) && entry.world !== 'MAIN',
    ).js

  const resilienceIndex =
    whatsappScripts.indexOf(
      'src/capture-resilience.js',
    )

  const contentScriptIndex =
    whatsappScripts.indexOf(
      'src/content-script.js',
    )

  assert.notEqual(
    resilienceIndex,
    -1,
  )
  assert.ok(
    resilienceIndex <
      contentScriptIndex,
  )
})
