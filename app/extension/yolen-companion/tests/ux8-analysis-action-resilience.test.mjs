import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { JSDOM } from 'jsdom'

const RUNTIME_SOURCE = readFileSync(
  fileURLToPath(
    new URL(
      '../src/ux8-interaction-consistency-runtime.js',
      import.meta.url,
    ),
  ),
  'utf8',
)

function createDom() {
  return new JSDOM(
    `<!doctype html>
      <html>
        <body>
          <div
            id="yolen-companion-panel"
            data-yolen-ux-build="UX8"
          >
            <div data-yolen-region="seller-information-architecture">
              <button
                type="button"
                data-yolen-action="analyze-conversation"
              >
                Tentar novamente
              </button>
            </div>
          </div>
          <button id="outside" type="button">Outro</button>
        </body>
      </html>`,
    {
      url: 'https://web.whatsapp.com/',
      runScripts: 'outside-only',
      pretendToBeVisual: true,
    },
  )
}

function getAnalyzeButton(document) {
  return document.querySelector(
    '[data-yolen-action="analyze-conversation"]',
  )
}

test(
  'retry continua acionável quando full innerHTML replacement perde o listener direto',
  async () => {
    const dom = createDom()
    const { window } = dom
    const { document } = window

    window.eval(
      RUNTIME_SOURCE,
    )

    const originalButton =
      getAnalyzeButton(document)

    let analyzeCalls = 0

    const contentScriptHandler = () => {
      analyzeCalls += 1
    }

    // Reproduz wireOnce(content-script.js): primeiro marca o node como
    // ligado, depois instala a closure privada de analyzeCurrentConversation.
    originalButton.__yolenWiredEvents =
      new Set(['click'])
    originalButton.addEventListener(
      'click',
      contentScriptHandler,
    )

    await Promise.resolve()

    assert.equal(
      window
        .YolenCompanionUx8InteractionConsistencyRuntime
        .hasCapturedAnalyzeHandler(),
      true,
      'o runtime precisa capturar a closure real antes do primeiro rerender',
    )

    originalButton.click()

    assert.equal(
      analyzeCalls,
      1,
      'botão original deve continuar usando somente o handler direto',
    )

    const panel =
      document.getElementById(
        'yolen-companion-panel',
      )

    // Reproduz exatamente o efeito dos runtimes de estabilidade: o HTML
    // inteiro do painel é reaplicado, criando um botão visualmente idêntico
    // mas sem propriedades JS e sem listener do content-script.
    panel.innerHTML = `
      <div data-yolen-region="seller-information-architecture">
        <button
          type="button"
          data-yolen-action="analyze-conversation"
        >
          Tentar novamente
        </button>
      </div>
    `

    const replacedButton =
      getAnalyzeButton(document)

    assert.notEqual(
      replacedButton,
      originalButton,
    )
    assert.equal(
      replacedButton.__yolenWiredEvents,
      undefined,
      'o node recriado não pode herdar a marca do wireOnce',
    )

    replacedButton.click()

    assert.equal(
      analyzeCalls,
      2,
      'o fallback delegado precisa reutilizar a closure real no botão recriado',
    )

    document
      .getElementById('outside')
      .click()

    assert.equal(
      analyzeCalls,
      2,
      'ações fora do botão de análise nunca podem disparar o fallback',
    )

    dom.window.close()
  },
)

test(
  'fallback não duplica clique quando o botão recriado já foi religado pelo content-script',
  async () => {
    const dom = createDom()
    const { window } = dom
    const { document } = window

    window.eval(
      RUNTIME_SOURCE,
    )

    const originalButton =
      getAnalyzeButton(document)

    let analyzeCalls = 0
    const contentScriptHandler = () => {
      analyzeCalls += 1
    }

    originalButton.__yolenWiredEvents =
      new Set(['click'])
    originalButton.addEventListener(
      'click',
      contentScriptHandler,
    )

    await Promise.resolve()

    const panel =
      document.getElementById(
        'yolen-companion-panel',
      )

    panel.innerHTML = `
      <button
        type="button"
        data-yolen-action="analyze-conversation"
      >
        Tentar novamente
      </button>
    `

    const rewiredButton =
      getAnalyzeButton(document)

    rewiredButton.__yolenWiredEvents =
      new Set(['click'])
    rewiredButton.addEventListener(
      'click',
      contentScriptHandler,
    )

    rewiredButton.click()

    assert.equal(
      analyzeCalls,
      1,
      'node já religado deve executar uma única vez, sem fallback duplicado',
    )

    dom.window.close()
  },
)
