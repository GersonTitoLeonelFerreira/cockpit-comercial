// FASE 8 — harness de paridade automatizada WhatsApp × ManyChat.
//
// O MESMO fixture de domínio é executado pelas duas composições REAIS do
// manifest (WhatsAppAdapter e ManyChatAdapter + bootstrap + Core +
// controllers + views). As diferenças de mecânica de canal ficam só no
// fixture FÍSICO de cada canal (página, evidência de contato), nunca no
// domínio seller-facing.
//
// Captura em dois níveis:
//   NÍVEL 1 — estado canônico: cada DomainResolutionViewModel e Canonical
//             Resolution Outcome produzidos pelo controller compartilhado e
//             os ViewModels que o Core entrega às views compartilhadas
//             (observados por instrumentação só-de-teste dos módulos
//             compartilhados, sem alterar produção), mais as intenções de
//             backend do Core;
//   NÍVEL 2 — saída da view compartilhada (DOM do painel).
//
// O comparador só aceita as diferenças do registro PARITY_NORMALIZATIONS,
// cada uma com categoria (A técnico / B capability / C label física) e
// referência contratual. Status, decisão, ação, prioridade, orientação,
// mensagem, método, etapa, objeção, cliente, erro, retry, criação,
// ownership e conteúdo das quatro áreas NUNCA são normalizados.

import { loadContentScript, buildMessageHtml, waitFor } from './load-content-script.mjs'
import {
  CHANNEL_KEY,
  KEY_X,
  loadManyChatComposition,
  manyChatPageHtml,
  whatsAppPhoneContactHtml,
} from './load-manychat-composition.mjs'

export const PARITY_PHONE = '5547999990001'
export const PARITY_PHONE_TITLE = '+55 47 99999-0001'
export const PARITY_EXTERNAL_KEY = KEY_X
// Mídia de áudio do fixture: os MESMOS bytes nos dois canais; só o caminho
// físico de obtenção muda (WhatsApp: fetch do blob da página; ManyChat:
// FETCH_MANYCHAT_AUDIO_SOURCE no background).
export const PARITY_AUDIO_URL = 'https://media.parity.test/audio-1.ogg'
export const PARITY_AUDIO_BYTES = 'OggS-parity-audio'
export { CHANNEL_KEY }

// ---------------------------------------------------------------------------
// Registro auditado de normalizações (tudo o que NÃO está aqui é comparado).
// ---------------------------------------------------------------------------

export const PARITY_NORMALIZATIONS = Object.freeze([
  Object.freeze({
    id: 'A1-conversation-key',
    category: 'A',
    field: 'chave técnica da conversa (conversation_key / captureConversationKey)',
    pattern: /manychat:(?:unknown|whatsapp|instagram|messenger|telegram):[A-Za-z0-9%._-]+|phone:\d{10,15}|title:[^"'<>&\\]+/g,
    replacement: '<conversation-key>',
    contract: 'Contrato §7 getConversationKey: identificador técnico do canal; a decisão usa a chave só como escopo',
  }),
  Object.freeze({
    id: 'A3-render-clock',
    category: 'A',
    field: 'relógio da renderização (Date.now() passado à view para tempos relativos)',
    pattern: /(?<=[,\[])1[7-9]\d{11}(?=[\],])/g,
    replacement: '<render-now>',
    contract: 'Tempo de execução, não domínio: datas do domínio chegam em ISO e seguem comparadas',
  }),
  Object.freeze({
    id: 'C1-platform-display-name',
    category: 'C',
    field: 'nome de exibição do canal interpolado em copy canônica',
    pattern: /\b(?:WhatsApp|ManyChat)\b/g,
    replacement: '<canal>',
    contract: 'Contrato §5 platform.displayName: único dado de canal permitido em copy do Core',
  }),
])

// B1 — capability física canProvideDisplayName (Q4, contrato §8): sem
// lead_display.name, o cabeçalho mostra o nome visível que o adapter
// fornece (WhatsApp: título da conversa; ManyChat não comprova nome →
// copy canônica "Conversa aberta"). Só esse elemento, só sem nome de lead.
export const DISPLAY_NAME_NORMALIZATION = Object.freeze({
  id: 'B1-conversation-display-name',
  category: 'B',
  field: 'texto de .yolen-lead-name quando o ViewModel não tem lead_display.name',
  contract: 'Q4 / contrato §8 canProvideDisplayName: WhatsApp true, ManyChat false (FASE 6)',
  placeholder: '<conversation-display-name>',
})

function escapeHtmlText(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function normalizeRenderFingerprint(html) {
  return html
    ? html
        .replace(/data-yolen-render-key="[^"]*"/g, `data-yolen-render-key="${DERIVED_FINGERPRINT_NORMALIZATION.placeholder}"`)
        // A2 no atributo de ação do enriquecimento: só o segmento final de
        // ids de evidência (ciclo, campo, valor e comparação seguem).
        .replace(/(data-yolen-enrichment-key="[^"]*?::(?:missing|different|new_lead))::[^"]*"/g, `$1::${MESSAGE_KEY_NORMALIZATION.placeholder}"`)
    : html
}

function normalizeDisplayName(html, runtime, hasLeadName) {
  if (!html || hasLeadName) return html
  const candidates = [runtime.physicalDisplayName, 'Conversa aberta'].filter(Boolean)
  let value = html
  for (const name of candidates) {
    value = value.split(`<div class="yolen-lead-name">${escapeHtmlText(name)}</div>`).join(`<div class="yolen-lead-name">${DISPLAY_NAME_NORMALIZATION.placeholder}</div>`)
  }
  return value
}

export function normalizeParityText(text) {
  let value = String(text ?? '')
  for (const rule of PARITY_NORMALIZATIONS) {
    value = value.replace(rule.pattern, rule.replacement)
  }
  return value
}

// Ações de transporte que só um canal possui (mecânica física, B):
// identidade segura e fonte de áudio do ManyChat. RESOLVE_LEAD é comparado
// no nível canônico (a evidência enviada difere por capability, §10.4).
// COMPARE_LEAD_ENRICHMENT_CANDIDATES é a rota privilegiada de privacidade do
// canal sanitizado (B3, contrato §19.3/§24): o mesmo resultado
// missing/same/different que o WhatsApp calcula localmente, comparado pela
// view resultante e pelo APPLY_LEAD_ENRICHMENT.
export const CHANNEL_TRANSPORT_ACTIONS = Object.freeze([
  'GET_MANYCHAT_SAFE_IDENTITY',
  'FETCH_MANYCHAT_AUDIO_SOURCE',
  'RESOLVE_LEAD',
  'COMPARE_LEAD_ENRICHMENT_CANDIDATES',
])

// Campos voláteis de tempo de captura (relógio da execução, não domínio).
const VOLATILE_KEYS = new Set(['observed_at', 'idempotency_key', 'interaction_id'])

// A2 — identificador técnico de mensagem (id nativo da plataforma escopado
// pela conversa: WhatsApp data-id, ManyChat data-mid). Regra por CAMPO: só
// o valor destes campos é substituído; texto, autoria, direção e horário
// da mensagem continuam comparados.
export const MESSAGE_KEY_NORMALIZATION = Object.freeze({
  id: 'A2-message-key',
  category: 'A',
  fields: Object.freeze(['message_key', 'evidence_message_ids', 'message_keys', 'audio_target_key']),
  contract: 'Contrato §7 getMessages: id nativo da plataforma, escopado pela conversa',
  placeholder: '<message-key>',
})

// A6 — prefixo técnico do nome do arquivo de áudio enviado à transcrição
// (`${platform.id}-audio-N.webm`, companion-core.js). Regra por CAMPO e só
// o prefixo `platform.id`: índice, extensão, mime, ciclo, bytes e alvo
// seguem comparados.
export const AUDIO_FILE_NAME_NORMALIZATION = Object.freeze({
  id: 'A6-audio-file-name-platform',
  category: 'A',
  field: 'file_name',
  pattern: /^(?:whatsapp|manychat)-(?=audio-\d+\.)/,
  contract: 'Contrato §5 platform.id: identificador técnico do canal; metadado do arquivo, sem efeito seller-facing',
  placeholder: '<platform-id>-',
})

function cloneForCapture(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') {
    return typeof value === 'function' ? undefined : value
  }
  if (seen.has(value)) return '[circular]'
  seen.add(value)
  if (Array.isArray(value)) return value.map((item) => cloneForCapture(item, seen))
  if (typeof value.nodeType === 'number') return '[dom-node]'
  const out = {}
  for (const key of Object.keys(value).sort()) {
    const cloned = cloneForCapture(value[key], seen)
    if (cloned !== undefined) out[key] = cloned
  }
  return out
}

function stripVolatile(value) {
  if (Array.isArray(value)) return value.map(stripVolatile)
  if (value === null || typeof value !== 'object') return value
  const out = {}
  for (const [key, item] of Object.entries(value)) {
    if (VOLATILE_KEYS.has(key)) continue
    if (DERIVED_FINGERPRINT_NORMALIZATION.fields.includes(key)) {
      out[key] = DERIVED_FINGERPRINT_NORMALIZATION.placeholder
      continue
    }
    if (key === AUDIO_FILE_NAME_NORMALIZATION.field && typeof item === 'string') {
      out[key] = item.replace(AUDIO_FILE_NAME_NORMALIZATION.pattern, AUDIO_FILE_NAME_NORMALIZATION.placeholder)
      continue
    }
    if (MESSAGE_KEY_NORMALIZATION.fields.includes(key)) {
      out[key] = Array.isArray(item) ? item.map(() => MESSAGE_KEY_NORMALIZATION.placeholder) : MESSAGE_KEY_NORMALIZATION.placeholder
      continue
    }
    if (key === 'messages' && Array.isArray(item)) {
      // Mensagens: id técnico (A2) e rótulo do autor (B2); todo o resto
      // (texto, direção, horário, áudio, autoria) é comparado.
      out[key] = item.map((message) => {
        const normalized = stripVolatile(message)
        if (normalized && typeof normalized === 'object' && !Array.isArray(normalized)) {
          if ('id' in normalized) normalized.id = MESSAGE_KEY_NORMALIZATION.placeholder
          for (const field of MESSAGE_SENDER_NORMALIZATION.fields) {
            if (field in normalized) normalized[field] = MESSAGE_SENDER_NORMALIZATION.placeholder
          }
        }
        return normalized
      })
      continue
    }
    out[key] = stripVolatile(item)
  }
  return out
}

// ---------------------------------------------------------------------------
// Instrumentação só-de-teste dos módulos compartilhados (nível 1).
// ---------------------------------------------------------------------------

const VIEW_TARGETS = Object.freeze({
  YolenCompanionSellerInformationView: [
    'renderAgoraViewModelSnapshot',
    'renderAnalysisViewModel',
    'renderCustomerViewModel',
    'buildAnalysisViewModelFromReading',
    'buildCustomerViewModelFromReading',
  ],
  YolenCompanionClientContextView: ['renderClientContextSection', 'renderRelationshipCard'],
  YolenCompanionLeadSummaryView: ['renderLeadSummarySection', 'renderMethodGuidance'],
})

export function createParityRecorder() {
  const recorder = {
    installed: false,
    resolutions: [],
    views: {},
  }

  function wrapGlobal(sandbox, name, members, onCall) {
    const original = sandbox[name]
    if (!original) return
    const wrapped = { ...original }
    for (const member of members) {
      if (typeof original[member] !== 'function') continue
      wrapped[member] = (...args) => {
        const result = original[member](...args)
        onCall(member, args, result)
        return result
      }
    }
    const frozen = Object.freeze(wrapped)
    sandbox[name] = frozen
    sandbox.window[name] = frozen
  }

  function afterEachFile({ sandbox }) {
    // Instala uma única vez, quando o bootstrap compartilhado já existe e
    // antes do content script do canal criar o Core.
    if (recorder.installed || !sandbox.YolenCompanionBootstrap) return
    recorder.installed = true

    wrapGlobal(sandbox, 'YolenCompanionLeadResolutionController', ['deriveCanonicalResolutionOutcome'], (member, args, result) => {
      recorder.resolutions.push({ viewModel: cloneForCapture(args[0]), outcome: cloneForCapture(result) })
    })

    for (const [name, members] of Object.entries(VIEW_TARGETS)) {
      wrapGlobal(sandbox, name, members, (member, args) => {
        recorder.views[member] = recorder.views[member] || []
        recorder.views[member].push(cloneForCapture(args))
      })
    }
  }

  return { recorder, afterEachFile }
}

// ---------------------------------------------------------------------------
// Fixtures físicos por canal (mecânica do canal; domínio fica de fora).
// ---------------------------------------------------------------------------

export function whatsAppParityPage({ title = PARITY_PHONE_TITLE, messages = [], draft = '' } = {}) {
  const messagesHtml = messages
    .map((message) =>
      message.audio
        ? `<div class="message-in" data-id="${message.mid}"><div data-pre-plain-text="[20:30, 14/09/2026] Cliente: "><audio src="${PARITY_AUDIO_URL}"></audio></div></div>`
        : buildMessageHtml({
            id: message.mid,
            prePlainText: '[20:30, 14/09/2026] Cliente: ',
            text: message.text,
            direction: message.direction ?? 'incoming',
          }),
    )
    .join('')

  return `<!doctype html><html><body>
    <div id="app"><div id="main">
      <header><span title="${title}">${title}</span></header>
      <div id="conversation-body">${messagesHtml}</div>
      <footer><div contenteditable="true" role="textbox" data-lexical-editor="true">${draft}</div></footer>
    </div></div>
  </body></html>`
}

export function manyChatParityPage({ messages = [], phone = PARITY_PHONE, draft = '' } = {}) {
  return manyChatPageHtml({
    messages: messages.map((message) => ({
      mid: message.mid,
      text: message.text,
      audioUrl: message.audio ? PARITY_AUDIO_URL : undefined,
      classes: message.direction === 'outgoing' ? '_typeOut_x' : '_typeIn_x',
      title: '2026-09-14T20:30:00',
    })),
    contactHtml: phone ? whatsAppPhoneContactHtml(phone) : '',
    draft,
  })
}

// ---------------------------------------------------------------------------
// Execução do MESMO domínio nos dois canais.
// ---------------------------------------------------------------------------

// domain: {
//   resolution            — payload de resolve-lead do lead (o MESMO objeto)
//   linkedByIdentity      — no ManyChat, o contato já está vinculado ao lead
//                           (mecânica do canal; no WhatsApp a evidência é o
//                           telefone). Default: true quando há lead.
//   evidence              — 'phone' (padrão) | 'none'
//   messages              — mensagens visíveis do domínio
//   backend               — respostas do backend (decision state etc.)
// }
export function startParityChannel(channel, domain, extra = {}) {
  const { recorder, afterEachFile } = createParityRecorder()
  const evidence = domain.evidence ?? 'phone'
  const messages = domain.messages ?? [{ mid: 'm1', text: 'Quanto custa o plano anual?' }]
  const resolution = domain.resolution
  const hasLead = Boolean(resolution?.lead && resolution?.cycle)
  const linkedByIdentity = domain.linkedByIdentity ?? hasLead
  const resolutionsByPhone = resolution ? { [PARITY_PHONE]: resolution } : {}

  const shared = {
    ...(domain.backend ?? {}),
    ...extra,
    afterEachFile,
  }

  // domain.audioSource(): 'ok' | 'fail' | Promise desses — disponibilidade
  // FÍSICA da mídia (mesma semântica nos dois canais).
  const audioSource = domain.audioSource ?? (() => 'ok')
  const audioFetches = []

  if (channel === 'whatsapp') {
    const runtime = loadContentScript({
      ...shared,
      initialHtml: whatsAppParityPage({
        title: evidence === 'phone' ? PARITY_PHONE_TITLE : 'Cliente Sem Telefone',
        messages,
        draft: domain.draft ?? '',
      }),
      resolutionsByPhone: typeof domain.resolutionsByPhone === 'function' ? domain.resolutionsByPhone() : resolutionsByPhone,
      fetchImpl: async (url) => {
        if (String(url) !== PARITY_AUDIO_URL) {
          return { ok: true, status: 200, json: async () => ({ ok: true }) }
        }
        audioFetches.push(String(url))
        const result = await audioSource()
        return {
          ok: result === 'ok',
          status: result === 'ok' ? 200 : 502,
          blob: async () => new runtime.dom.window.Blob([PARITY_AUDIO_BYTES], { type: 'audio/ogg' }),
          json: async () => ({ ok: result === 'ok' }),
        }
      },
    })
    // jsdom não tem layout: o WhatsAppAdapter só considera mídia visível com
    // área > 0 (mecânica física do canal).
    runtime.dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({
      width: 120, height: 32, top: 0, left: 0, right: 120, bottom: 32,
    })
    return { channel, ...runtime, recorder, audioFetches, physicalDisplayName: evidence === 'phone' ? PARITY_PHONE_TITLE : 'Cliente Sem Telefone' }
  }

  const identityResolutions =
    evidence !== 'none' && linkedByIdentity && resolution ? { [PARITY_EXTERNAL_KEY]: resolution } : {}

  const runtime = loadManyChatComposition({
    ...shared,
    pageHtml: manyChatParityPage({ messages, phone: evidence === 'phone' ? PARITY_PHONE : null, draft: domain.draft ?? '' }),
    currentIdentity: () => (evidence === 'none' ? null : PARITY_EXTERNAL_KEY),
    resolutionsByIdentity: domain.resolutionsByIdentity ? domain.resolutionsByIdentity() : identityResolutions,
    resolutionsByPhone: typeof domain.resolutionsByPhone === 'function' ? domain.resolutionsByPhone() : resolutionsByPhone,
    fetchAudioSource: async (url) => {
      audioFetches.push(String(url))
      const result = await audioSource()
      return result === 'ok'
        ? { ok: true, statusCode: 200, payload: { ready: true, audio_base64: Buffer.from(PARITY_AUDIO_BYTES).toString('base64'), mime_type: 'audio/ogg' } }
        : { ok: false, statusCode: 502, payload: { ready: false, reason: 'download_failed' } }
    },
  })
  return { channel, ...runtime, recorder, audioFetches, physicalDisplayName: null }
}

export function panelOf(runtime) {
  return runtime.document.getElementById('yolen-companion-panel')
}

export function panelText(runtime) {
  return (panelOf(runtime)?.textContent || '').replace(/\s+/g, ' ')
}

// Estado canônico comprometido: descarta só o passo interno de fallback
// (§10.4 caso B: CONTACT_NOT_LINKED com requires_phone_fallback), que é
// mecânica de evidência do canal e nunca chega ao estado do Core.
export function committedResolutions(runtime) {
  return runtime.recorder.resolutions.filter((entry) => entry.outcome?.requires_phone_fallback !== true)
}

// Intenção EFETIVA do Core que chega ao backend: no canal sanitizado é a
// mensagem depois do módulo real de privacidade do background (lead_id e
// CAS reinjetados, §19.3/§24); no WhatsApp não há essa camada.
export function coreIntents(runtime) {
  return (runtime.transported ?? runtime.calls)
    .filter((call) => !CHANNEL_TRANSPORT_ACTIONS.includes(call.action))
    .map((call) => ({ action: call.action, payload: stripVolatile(cloneForCapture(call.payload ?? null)) }))
}

// B2 — mesmo motivo de B1 (Q4 canProvideDisplayName) nas mensagens enviadas
// à análise: `sender` é o rótulo visível do autor que o WhatsApp exibe no
// chat; o ManyChat não comprova nome (null). Autoria/direção seguem
// comparadas. Só este campo, só dentro de `messages`.
export const MESSAGE_SENDER_NORMALIZATION = Object.freeze({
  id: 'B2-message-sender-display-name',
  category: 'B',
  fields: Object.freeze(['sender']),
  contract: 'Q4 / contrato §8 canProvideDisplayName (WhatsApp true, ManyChat false)',
  placeholder: '<sender-display-name>',
})

// A5 — impressões digitais DERIVADAS de conteúdo já comparado: o atributo
// data-yolen-render-key é hashText() do próprio HTML da área (comparado
// integralmente, só com C1 normalizado) e message_snapshot_hash é o hash de
// id técnico + horário + direção + texto + áudio das mensagens (o array de
// mensagens é comparado integralmente, só com A2 normalizado).
export const DERIVED_FINGERPRINT_NORMALIZATION = Object.freeze({
  id: 'A5-derived-fingerprint',
  category: 'A',
  fields: Object.freeze(['message_snapshot_hash', 'data-yolen-render-key']),
  contract: 'Derivados técnicos de conteúdo comparado; não carregam decisão',
  placeholder: '<fingerprint>',
})

// A4 — repetição de intenção idêntica causada pela cadência física de
// eventos do canal (ex.: segundo INGEST idêntico, recarga idêntica de um
// loader). O conjunto de intenções DISTINTAS (ação + payload) é comparado
// integralmente; contagens que importam ao contrato (um único CREATE, um
// único vínculo, nenhuma transcrição stale) têm asserção própria nos testes.
export const INTENT_REPETITION_NORMALIZATION = Object.freeze({
  id: 'A4-idempotent-intent-repetition',
  category: 'A',
  field: 'número de repetições de uma intenção de backend idêntica',
  contract: 'Contrato §7 observeHostChanges: a cadência de eventos é física; o Core reage com operações idempotentes',
})

function sortIntents(intents) {
  return Array.from(new Set(intents.map((intent) => normalizeParityText(JSON.stringify(intent))))).sort()
}

// cycleId (opcional): com várias conversas, o estado canônico comparado é
// o da conversa na tela. Uma resolução tardia de outra conversa pode ser
// DERIVADA e descartada pelo Core (ex.: passo de identidade do §10.4) —
// nunca comprometida, o que o nível 2 (DOM) verifica.
// cycleId: escopo canônico da conversa atual (A→B→A). unresolved: a conversa
// atual não tem resolução (ex.: sem evidência de contato) — nenhuma
// resolução de outra conversa entra no snapshot.
export function captureParitySnapshot(runtime, { cycleId, unresolved = false } = {}) {
  const panel = panelOf(runtime)
  const lastViewArgs = {}
  for (const [member, calls] of Object.entries(runtime.recorder.views)) {
    lastViewArgs[member] = calls.at(-1)
  }

  const committed = committedResolutions(runtime)
  const resolution = unresolved
    ? null
    : (cycleId
      ? committed.filter((entry) => entry.viewModel?.cycle?.id === cycleId).at(-1)
      : committed.at(-1)) ?? null
  const hasLeadName = Boolean(resolution?.viewModel?.lead_display?.name)

  return {
    canonical: {
      resolution,
      viewInputs: lastViewArgs,
    },
    intents: sortIntents(coreIntents(runtime)),
    // Guarda contra A1+A4 mascararem instabilidade de escopo: o número de
    // chaves de conversa DISTINTAS usadas pelo Core (bruto, antes de
    // normalizar) precisa ser igual nos dois canais.
    conversationKeyCount: new Set(
      runtime.calls
        .map((call) => call.payload?.conversation_key)
        .filter((key) => typeof key === 'string' && key),
    ).size,
    view: {
      html: panel ? normalizeRenderFingerprint(normalizeDisplayName(panel.innerHTML, runtime, hasLeadName)) : null,
      areas: Object.fromEntries(
        ['now', 'message', 'analysis', 'client'].map((area) => [
          area,
          normalizeRenderFingerprint(panel?.querySelector(`[data-yolen-seller-panel="${area}"]`)?.innerHTML ?? null),
        ]),
      ),
      actions: panel
        ? Array.from(panel.querySelectorAll('[data-yolen-action]')).map((element) => element.getAttribute('data-yolen-action'))
        : [],
    },
  }
}

// ---------------------------------------------------------------------------
// Comparador (sem allowlist de divergência).
// ---------------------------------------------------------------------------

function normalizeDeep(value) {
  return normalizeParityText(JSON.stringify(value ?? null))
}

function firstDifference(left, right) {
  let index = 0
  while (index < left.length && left[index] === right[index]) index += 1
  return {
    whatsapp: left.slice(Math.max(0, index - 60), index + 120),
    manychat: right.slice(Math.max(0, index - 60), index + 120),
  }
}

export function compareParitySnapshots(whatsapp, manychat, { levels = ['canonical', 'intents', 'view'] } = {}) {
  const differences = []

  const check = (level, path, left, right) => {
    const a = normalizeDeep(left)
    const b = normalizeDeep(right)
    if (a !== b) differences.push({ level, path, ...firstDifference(a, b) })
  }

  if (levels.includes('canonical')) {
    check('canonical', 'resolution', whatsapp.canonical.resolution, manychat.canonical.resolution)
    const members = new Set([...Object.keys(whatsapp.canonical.viewInputs), ...Object.keys(manychat.canonical.viewInputs)])
    for (const member of members) {
      check('canonical', `viewInputs.${member}`, whatsapp.canonical.viewInputs[member], manychat.canonical.viewInputs[member])
    }
  }

  if (levels.includes('intents')) {
    check('intents', 'backend', whatsapp.intents, manychat.intents)
    check('intents', 'conversationKeyCount', whatsapp.conversationKeyCount, manychat.conversationKeyCount)
  }

  if (levels.includes('view')) {
    check('view', 'actions', whatsapp.view.actions, manychat.view.actions)
    for (const area of Object.keys(whatsapp.view.areas)) {
      check('view', `areas.${area}`, whatsapp.view.areas[area], manychat.view.areas[area])
    }
    check('view', 'panel', whatsapp.view.html, manychat.view.html)
  }

  return differences
}

export async function waitForBoth(runtimes, predicate, options = {}) {
  for (const runtime of runtimes) {
    await waitFor(() => predicate(runtime), { timeoutMs: 20000, ...options })
  }
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Espera até nenhuma nova chamada de background por `quietMs`.
export async function waitForQuiet(runtimes, quietMs = 900, timeoutMs = 20000) {
  const started = Date.now()
  let last = runtimes.map((runtime) => runtime.calls.length).join(',')
  let stableSince = Date.now()
  while (Date.now() - started < timeoutMs) {
    await sleep(100)
    const now = runtimes.map((runtime) => runtime.calls.length).join(',')
    if (now !== last) {
      last = now
      stableSince = Date.now()
    } else if (Date.now() - stableSince >= quietMs) {
      return
    }
  }
}

// ---------------------------------------------------------------------------
// Duas conversas (A→B→A) com o MESMO domínio por conversa nos dois canais.
// Mecânica física: WhatsApp troca cabeçalho/mensagens (telefone no título);
// ManyChat troca a rota, a identidade segura e a coluna de contato.
// ---------------------------------------------------------------------------

export const PARITY_CONVERSATIONS = Object.freeze({
  A: Object.freeze({ phone: '5547999990001', title: '+55 47 99999-0001', url: 'https://app.manychat.com/fb3678277/chat/438324835', key: KEY_X }),
  B: Object.freeze({ phone: '5547999990002', title: '+55 47 99999-0002', url: 'https://app.manychat.com/fb3678277/chat/999999999', key: `manychat:contact:v1:sha256:${'b'.repeat(64)}` }),
})

// conversations: { A: { resolution, messages, evidence? }, B: { ... } }
// evidence 'none': conversa sem telefone e sem identidade segura (título
// não telefônico no WhatsApp; sem identidade/contato no ManyChat).
// resolutions podem ser funções (payload) => resolution (para respostas
// tardias controladas pelo teste).
export function startParityConversations(channel, conversations, extra = {}) {
  const { recorder, afterEachFile } = createParityRecorder()
  const byPhone = {}
  const byIdentity = {}
  for (const [id, conversation] of Object.entries(conversations)) {
    if (conversation.evidence === 'none') continue
    const physical = PARITY_CONVERSATIONS[id]
    byPhone[physical.phone] = conversation.resolution
    byIdentity[physical.key] = conversation.resolution
  }
  const first = conversations.A
  const shared = { ...extra, afterEachFile }

  if (channel === 'whatsapp') {
    const runtime = loadContentScript({
      ...shared,
      initialHtml: whatsAppParityPage({ title: PARITY_CONVERSATIONS.A.title, messages: first.messages ?? [] }),
      resolutionsByPhone: byPhone,
    })
    return {
      channel,
      ...runtime,
      recorder,
      conversations,
      get physicalDisplayName() {
        return runtime.document.querySelector('#main header span[title]')?.getAttribute('title') ?? null
      },
    }
  }

  let currentId = 'A'
  const runtime = loadManyChatComposition({
    ...shared,
    url: PARITY_CONVERSATIONS.A.url,
    pageHtml: manyChatParityPage({ messages: first.messages ?? [], phone: PARITY_CONVERSATIONS.A.phone }),
    currentIdentity: () => (conversations[currentId]?.evidence === 'none' ? null : PARITY_CONVERSATIONS[currentId].key),
    resolutionsByIdentity: byIdentity,
    resolutionsByPhone: byPhone,
  })
  return {
    channel,
    ...runtime,
    recorder,
    physicalDisplayName: null,
    get current() {
      return currentId
    },
    set current(value) {
      currentId = value
    },
    conversations,
  }
}

export function switchParityConversation(runtime, id) {
  const physical = PARITY_CONVERSATIONS[id]
  const messages = runtime.conversations[id].messages ?? []
  const document = runtime.document

  const withoutEvidence = runtime.conversations[id].evidence === 'none'

  if (runtime.channel === 'whatsapp') {
    const title = withoutEvidence ? `Cliente Sem Telefone ${id}` : physical.title
    const span = document.querySelector('#main header span[title]')
    span.setAttribute('title', title)
    span.textContent = title
    document.querySelector('#conversation-body').innerHTML = messages
      .map((message) =>
        buildMessageHtml({ id: `${id}-${message.mid}`, prePlainText: '[20:30, 14/09/2026] Cliente: ', text: message.text }),
      )
      .join('')
    return
  }

  runtime.current = id
  const list = document.querySelector('div[data-test-id="chat-messages-list"]')
  const fresh = new runtime.window.DOMParser().parseFromString(
    manyChatParityPage({ messages: messages.map((message) => ({ ...message, mid: `${id}-${message.mid}` })), phone: withoutEvidence ? null : physical.phone }),
    'text/html',
  )
  list.innerHTML = fresh.querySelector('div[data-test-id="chat-messages-list"]').innerHTML
  document.querySelector('section.userColumnContent_1').innerHTML = fresh.querySelector('section.userColumnContent_1').innerHTML
  runtime.window.history.pushState({}, '', physical.url)
}
