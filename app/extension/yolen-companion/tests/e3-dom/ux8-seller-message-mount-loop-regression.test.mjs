// P1 (PR #271, achado Codex) — "Stop the composer remove/reinsert loop when
// the mount disappears": dentro do shell UX8, quando o contexto seller já
// existe mas [data-yolen-seller-message-mount] fica temporariamente
// ausente, seller-message-runtime.js não pode cair para o fallback legado
// (inserir o composer depois do guidance slot) — ux8-interaction-
// -consistency-runtime.js remove qualquer composer fora do mount dedicado a
// cada mutation, e os dois runtimes reinserindo/removendo o mesmo composer
// formavam um loop de MutationObserver/microtasks.
//
// Carrega os DOIS runtimes reais (seller-message-runtime.js e
// ux8-interaction-consistency-runtime.js) na MESMA sandbox, na mesma ordem
// relativa do manifest.json, para provar o comportamento combinado — um
// teste isolado de cada runtime não veria a disputa entre os dois.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import vm from 'node:vm'
import { JSDOM } from 'jsdom'

const SRC_DIR = fileURLToPath(new URL('../../src/', import.meta.url))
const SELLER_MESSAGE_RUNTIME_SOURCE = readFileSync(
  `${SRC_DIR}seller-message-runtime.js`,
  'utf8',
)
const UX8_RUNTIME_SOURCE = readFileSync(
  `${SRC_DIR}ux8-interaction-consistency-runtime.js`,
  'utf8',
)

const BOX_SELECTOR = '[data-yolen-seller-message-box]'
const MOUNT_SELECTOR = '[data-yolen-seller-message-mount]'
const REGION_SELECTOR =
  '[data-yolen-region="seller-information-architecture"]'

function buildHarness() {
  const dom = new JSDOM(
    `<!doctype html><html><body>
      <aside id="yolen-companion-panel" data-yolen-ux-build="UX8">
        <div data-yolen-region="seller-information-architecture">
          <div data-yolen-method-guidance-slot>
            <div class="yolen-method-guidance-label">Orientação da Yolen</div>
          </div>
          <input data-yolen-textarea="lead-summary" value="Cliente aceitou continuar a conversa.">
          <div data-yolen-seller-message-mount></div>
        </div>
      </aside>
    </body></html>`,
    {
      url: 'https://web.whatsapp.com/',
      pretendToBeVisual: true,
    },
  )

  const api = {
    getBaseUrl() {
      return 'https://cockpit-comercial-vocn.vercel.app'
    },
    async loadLeadSummary() {
      return {
        ok: true,
        payload: {
          ok: true,
          data: {
            working_summary:
              'Cliente aceitou continuar a conversa.',
            method_guidance: {
              status: 'ready',
              method_name: 'Método publicado',
              stage_name: 'Descoberta',
              next_step:
                'Entender melhor a necessidade.',
            },
          },
        },
      }
    },
  }

  const sandbox = {
    YolenCompanionApi: api,
    chrome: {
      runtime: {
        async sendMessage() {
          return {
            ok: true,
            payload: {
              ok: true,
              data: {
                status: 'ready',
                message: 'Mensagem gerada.',
                error: null,
              },
            },
          }
        },
      },
    },
    document: dom.window.document,
    navigator: dom.window.navigator,
    MutationObserver: dom.window.MutationObserver,
    InputEvent: dom.window.InputEvent,
    queueMicrotask,
    Promise,
    Map,
    Math,
    String,
    Boolean,
  }
  sandbox.globalThis = sandbox

  vm.createContext(sandbox)
  vm.runInContext(SELLER_MESSAGE_RUNTIME_SOURCE, sandbox, {
    filename: 'seller-message-runtime.js',
  })
  vm.runInContext(UX8_RUNTIME_SOURCE, sandbox, {
    filename: 'ux8-interaction-consistency-runtime.js',
  })

  return {
    api,
    dom,
    document: dom.window.document,
  }
}

async function flushDom(times = 4) {
  for (let index = 0; index < times; index += 1) {
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await Promise.resolve()
  }
}

test(
  'UX8: mount dedicado some com contexto seller ativo — composer não recria no fallback legado, guidance permanece, sem loop, e composer volta quando o mount reaparece',
  async () => {
    const { api, dom, document } = buildHarness()

    // 1) Contexto seller já existe: o composer monta dentro do mount
    // dedicado normalmente.
    await api.loadLeadSummary({
      cycle_id: 'cycle-1',
      conversation_key: 'whatsapp:5511999999999',
    })
    await flushDom()

    const mount = document.querySelector(MOUNT_SELECTOR)
    const boxBefore = document.querySelector(BOX_SELECTOR)

    assert.ok(
      boxBefore,
      'com contexto seller válido e mount presente, o composer deveria montar',
    )
    assert.equal(
      boxBefore.parentElement,
      mount,
      'o composer inicial deve viver dentro do mount dedicado',
    )

    // 2) O mount dedicado desaparece (ex.: WhatsApp/UX8 reconstrói a região
    // e o mount fica temporariamente inelegível).
    mount.remove()
    await flushDom()

    assert.equal(
      document.querySelector(BOX_SELECTOR),
      null,
      'sem o mount dedicado, o composer não pode existir em lugar nenhum (nada de fallback legado dentro do shell UX8)',
    )

    // 3) A orientação da Yolen (guidance) permanece visível mesmo sem o
    // composer.
    const guidanceLabel = document.querySelector(
      '[data-yolen-method-guidance-slot] .yolen-method-guidance-label',
    )

    assert.ok(
      guidanceLabel,
      'o guidance slot deve continuar existindo',
    )
    assert.equal(
      guidanceLabel.textContent,
      'Orientação da Yolen',
    )

    // 4) Mutations adicionais (irrelevantes ao composer) não podem
    // reacender um loop de criação/remoção do composer entre os dois
    // runtimes. Um MutationObserver externo conta quantas vezes um
    // composer chega a ser inserido no documento a partir daqui — no
    // cenário do bug esse contador cresceria a cada ciclo do loop.
    let boxInsertions = 0

    const watcher = new dom.window.MutationObserver(
      (mutationsList) => {
        for (const mutation of mutationsList) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType !== 1) {
              continue
            }

            if (
              node.matches?.(BOX_SELECTOR) ||
              node.querySelector?.(BOX_SELECTOR)
            ) {
              boxInsertions += 1
            }
          }
        }
      },
    )

    watcher.observe(document.documentElement, {
      childList: true,
      subtree: true,
    })

    const region = document.querySelector(REGION_SELECTOR)

    for (let index = 0; index < 5; index += 1) {
      const marker = document.createElement('div')
      marker.textContent = `mutação irrelevante ${index}`
      region.appendChild(marker)
      await flushDom()
    }

    assert.equal(
      boxInsertions,
      0,
      'nenhuma mutation irrelevante deveria ter feito o composer reaparecer — não pode haver loop de remove/recriação',
    )
    assert.equal(
      document.querySelector(BOX_SELECTOR),
      null,
      'o composer continua ausente enquanto o mount dedicado não volta',
    )

    // 5) Quando o mount dedicado volta, o composer pode ser reconstruído
    // normalmente.
    const newMount = document.createElement('div')
    newMount.setAttribute(
      'data-yolen-seller-message-mount',
      '',
    )
    region.appendChild(newMount)

    await flushDom()

    assert.equal(
      boxInsertions,
      1,
      'o composer deve ser recriado exatamente uma vez quando o mount dedicado reaparece',
    )

    const boxAfter = document.querySelector(BOX_SELECTOR)

    assert.ok(
      boxAfter,
      'o composer deve existir de novo depois do mount voltar',
    )
    assert.equal(
      boxAfter.parentElement,
      newMount,
      'o composer reconstruído deve viver dentro do novo mount dedicado',
    )

    watcher.disconnect()
  },
)
