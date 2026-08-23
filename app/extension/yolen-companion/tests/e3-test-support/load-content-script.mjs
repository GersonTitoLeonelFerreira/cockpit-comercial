// Carrega src/content-script.js (e suas dependências reais de manifest —
// yolen-api.js, message-mutations.js, capture-batch.js,
// capture-resilience.js, capture-resilience-null-base.js,
// lead-enrichment.js) de verdade, em uma sandbox `node:vm` com um DOM real
// fornecido por `jsdom` — a única dependência nova adicionada pela E3, e
// só para teste (nunca é carregada pelo runtime da extensão).
//
// content-script.js não exporta nada: é uma IIFE que roda `start()`
// sozinha ao carregar. A única forma de observar seu comportamento sem
// alterar o arquivo é através da superfície que ele já expõe de verdade:
// mutações no DOM e mensagens que ele manda para `chrome.runtime.sendMessage`
// (que no navegador real vai para background.js). Aqui fornecemos um
// `chrome.runtime.sendMessage` falso e determinístico (mesmo espírito do
// `fake-companion-admin.mjs` usado na E2 para as rotas server) e inspecionamos
// exatamente essas duas coisas.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { JSDOM } from 'jsdom'

const SRC_DIR = fileURLToPath(new URL('../../src/', import.meta.url))

function readSource(fileName) {
  return readFileSync(`${SRC_DIR}${fileName}`, 'utf8')
}

const DEPENDENCY_FILES = [
  'yolen-api.js',
  'message-mutations.js',
  'conversation-registration-tools.js',
  'capture-batch.js',
  'capture-resilience.js',
  'capture-resilience-null-base.js',
  'lead-enrichment.js',
  'companion-client-context-view.js',
  'companion-seller-information-view.js',
]

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Constrói o HTML de uma mensagem exatamente na forma que
// content-script.js sabe ler: um nó `[data-pre-plain-text]` (o formato
// real do WhatsApp Web, "[HH:MM, DD/MM/AAAA] Remetente: "), dentro de um
// wrapper com a classe `.message-in`/`.message-out` (usada para inferir
// direção) e um `data-id` (chave estável da mensagem), com o texto num
// `[data-testid="selectable-text"]` (como o WhatsApp Web real marca o
// texto selecionável da mensagem).
export function buildMessageHtml({
  id,
  prePlainText,
  text,
  direction = 'incoming',
  deletedText = null,
}) {
  const directionClass = direction === 'outgoing' ? 'message-out' : 'message-in'
  const body = deletedText
    ? `<div>${escapeHtml(deletedText)}</div>`
    : `<span data-testid="selectable-text" class="selectable-text copyable-text"><span>${escapeHtml(text)}</span></span>`

  return `<div class="${directionClass}" data-id="${escapeHtml(id)}"><div data-pre-plain-text="${escapeHtml(prePlainText)}">${body}</div></div>`
}

// Constrói o HTML mínimo de uma página do WhatsApp Web: `#app` > `#main`
// com um `header` (contendo um título "tipo telefone", que é como
// content-script.js detecta o telefone da conversa) e a lista de
// mensagens.
export function buildWhatsAppPageHtml({ headerTitle, messagesHtml = '' }) {
  return `<!doctype html><html><body>
    <div id="app">
      <div id="main">
        <header><span title="${escapeHtml(headerTitle)}">${escapeHtml(headerTitle)}</span></header>
        <div id="conversation-body">${messagesHtml}</div>
      </div>
    </div>
  </body></html>`
}

export function defaultLeadResolution(overrides = {}) {
  return {
    ok: true,
    status: 'OWNED_BY_ME',
    lead: { id: 'lead-1', name: 'Cliente Teste', phone: '5511988887777', email: null, cpf_cnpj: null, deleted_at: null },
    cycle: { id: 'cycle-1', status: 'contato', owner_user_id: 'user-1' },
    actions: { can_analyze_conversation: true, can_apply_suggestion: true },
    flags: { is_owned_by_me: true, is_pool: false, is_closed: false },
    phone: '5511988887777',
    ...overrides,
  }
}

export function defaultClientContext(overrides = {}) {
  return {
    ok: true,
    data: {
      contract_version: 'companion-client-context-v1',
      generated_at: '2026-08-22T12:00:00.000Z',
      identity: {
        company_id: 'company-1',
        cycle_id: 'cycle-1',
        conversation_key: 'whatsapp:5511988887777',
        current_status: 'contato',
      },
      relationship: {
        first_known_interaction_at: '2026-08-05T08:00:00.000Z',
        relationship_age_ms: 17 * 24 * 60 * 60 * 1000,
        latest_customer_message_at: '2026-08-22T09:42:00.000Z',
        latest_seller_message_at: null,
        last_interaction_at: '2026-08-22T09:42:00.000Z',
        known_interaction_count: 3,
      },
      waiting: {
        state: 'customer_waiting_for_seller',
        waiting_since: '2026-08-22T09:42:00.000Z',
        waiting_duration_ms: 138 * 60 * 1000,
      },
      timeline: [],
      sla: {
        configured: false,
        applicable: true,
        stage: 'contato',
        stage_label: 'CONTATO',
        target_minutes: null,
        warning_minutes: null,
        danger_minutes: null,
        elapsed_minutes: 60,
        risk: null,
      },
      ...overrides,
    },
  }
}

// Uma resposta de client-context "precoce": lida antes de qualquer
// ingestão terminar, sem histórico de mensagens nem SLA configurado — o
// mesmo formato que o endpoint real devolveria se consultado sobre um
// ledger ainda vazio.
export function emptyClientContext(overrides = {}) {
  return defaultClientContext({
    relationship: {
      first_known_interaction_at: null,
      relationship_age_ms: null,
      latest_customer_message_at: null,
      latest_seller_message_at: null,
      last_interaction_at: null,
      known_interaction_count: 0,
    },
    waiting: {
      state: 'unknown',
      waiting_since: null,
      waiting_duration_ms: null,
    },
    timeline: [],
    sla: {
      configured: false,
      applicable: true,
      stage: 'contato',
      stage_label: 'CONTATO',
      target_minutes: null,
      warning_minutes: null,
      danger_minutes: null,
      elapsed_minutes: null,
      risk: null,
    },
    ...overrides,
  })
}

function createFakeBackground({
  resolutionsByPhone = {},
  clientContextResult,
  analysisResult,
} = {}) {
  const calls = []
  let loadClientContextCallCount = 0

  const handlers = {
    GET_ME: async () => ({
      ok: true,
      statusCode: 200,
      origin: 'https://cockpit-comercial-vocn.vercel.app',
      payload: {
        ok: true,
        user: { full_name: 'Vendedor Teste' },
        active_company: { name: 'Empresa Teste', role: 'member' },
      },
    }),
    RESOLVE_LEAD: async (payload) => {
      const phoneDigits = String(payload?.phone ?? '').replace(/\D/g, '')
      const resolution = resolutionsByPhone[phoneDigits] ?? defaultLeadResolution({ phone: phoneDigits })
      return { ok: true, statusCode: 200, payload: resolution }
    },
    LOAD_AUDIO_TRANSCRIPTIONS: async () => ({ ok: true, statusCode: 200, payload: { ok: true, data: [] } }),
    ANALYZE_CONVERSATION: async (requestPayload) => {
      const payload =
        typeof analysisResult === 'function'
          ? await analysisResult(requestPayload)
          : analysisResult

      return {
        ok: true,
        statusCode: 200,
        payload: payload ?? {
          ok: false,
          error: 'Análise não configurada neste cenário de teste.',
        },
      }
    },
    // `clientContextResult` pode ser um valor estático (todo chamada
    // devolve o mesmo payload, como antes) ou uma função `(callNumber) =>
    // payload` — usada pelos testes de refresh ao vivo para simular a
    // resposta mudando depois que uma ingestão é confirmada (ex.: primeira
    // chamada devolve um estado precoce/vazio, chamadas seguintes devolvem
    // o relacionamento já correto).
    LOAD_CLIENT_CONTEXT: async (requestPayload) => {
      loadClientContextCallCount += 1

      const payload = await (
        typeof clientContextResult === 'function'
          ? clientContextResult(loadClientContextCallCount, requestPayload)
          : (clientContextResult ?? defaultClientContext())
      )

      return {
        ok: true,
        statusCode: 200,
        payload,
      }
    },
  }

  const sendMessage = async (message) => {
    calls.push(message)
    const handler = handlers[message.action]
    if (handler) {
      return handler(message.payload)
    }
    return { ok: true, statusCode: 200, payload: { ok: true } }
  }

  return { sendMessage, calls }
}

export function loadContentScript({
  initialHtml,
  resolutionsByPhone,
  clientContextResult,
  analysisResult,
} = {}) {
  const dom = new JSDOM(initialHtml, { url: 'https://web.whatsapp.com/', pretendToBeVisual: true })
  const background = createFakeBackground({
    resolutionsByPhone,
    clientContextResult,
    analysisResult,
  })

  const fakeChrome = {
    runtime: {
      sendMessage: background.sendMessage,
      onMessage: { addListener() {} },
    },
    storage: {
      local: {
        get: (key, callback) => (callback ? callback({}) : Promise.resolve({})),
        set: (value, callback) => (callback ? callback() : Promise.resolve()),
      },
    },
  }

  const sandbox = {
    window: dom.window,
    document: dom.window.document,
    MutationObserver: dom.window.MutationObserver,
    Element: dom.window.Element,
    Node: dom.window.Node,
    HTMLElement: dom.window.HTMLElement,
    Text: dom.window.Text,
    URL: dom.window.URL,
    navigator: dom.window.navigator,
    location: dom.window.location,
    chrome: fakeChrome,
    console,
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }),
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Promise,
    crypto: globalThis.crypto,
  }
  sandbox.globalThis = sandbox
  vm.createContext(sandbox)

  for (const dependency of DEPENDENCY_FILES) {
    vm.runInContext(readSource(dependency), sandbox, { filename: dependency })
  }
  vm.runInContext(readSource('content-script.js'), sandbox, { filename: 'content-script.js' })

  return {
    dom,
    document: sandbox.document,
    calls: background.calls,
  }
}

export function ingestCalls(calls) {
  return calls.filter((call) => call.action === 'INGEST_CAPTURE_MESSAGES')
}

export function resolveLeadCalls(calls) {
  return calls.filter((call) => call.action === 'RESOLVE_LEAD')
}

export function clientContextCalls(calls) {
  return calls.filter((call) => call.action === 'LOAD_CLIENT_CONTEXT')
}

export function analysisCalls(calls) {
  return calls.filter((call) => call.action === 'ANALYZE_CONVERSATION')
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Espera até que `predicate()` seja verdadeiro, tentando de novo a cada
// `intervalMs`, com um teto de `timeoutMs`. Usado em vez de um
// `sleep` fixo porque o pipeline real (debounce do MutationObserver de
// 600ms + agendamento de captura) não tem uma duração fixa exata — sondar
// até a condição ser satisfeita é mais robusto do que adivinhar quanto
// tempo esperar.
export async function waitFor(predicate, { timeoutMs = 8000, intervalMs = 100 } = {}) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const result = predicate()
    if (result) {
      return result
    }
    await sleep(intervalMs)
  }

  throw new Error(`waitFor: condição não satisfeita dentro de ${timeoutMs}ms`)
}

// IMPORTANTE: content-script.js roda `start()` ao carregar, que agenda
// temporizadores recorrentes (debounce do MutationObserver, verificações
// periódicas etc.) por design — o script foi feito para rodar indefinidamente
// numa aba real do navegador. Isso é comportamento correto e não deve (nem
// pode, sem alterar o arquivo) ser desligado. Consequência para os testes:
// o loop de eventos do Node nunca fica ocioso sozinho depois de carregar o
// content-script.js, então `node --test` NUNCA sai por conta própria ao
// final dos testes que usam este harness — ele fica pendurado
// indefinidamente sem a flag `--test-force-exit` do próprio Node
// (suportada nativamente para exatamente este cenário: handles/timers
// pendentes intencionais que não impedem os testes de já terem passado).
//
// Por isso os arquivos que usam este harness ficam fora do glob padrão de
// `npm run test:companion` (que só pega `tests/*.test.mjs`, não
// subdiretórios) e devem ser executados explicitamente, por exemplo:
//   node --test --test-force-exit app/extension/yolen-companion/tests/e3-dom/*.test.mjs
//
// (Tentamos primeiro forçar a saída chamando `process.exit()` num hook
// `after()` dentro do próprio arquivo de teste, mas isso truncou a saída
// TAP do último teste do arquivo quando rodado junto de outro arquivo — a
// flag nativa do Node evita essa corrida porque só age depois que o test
// runner já reportou tudo.)
