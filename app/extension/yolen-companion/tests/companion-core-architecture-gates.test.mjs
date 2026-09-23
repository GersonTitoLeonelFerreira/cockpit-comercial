// FASE 3 — Architecture gates + migration baseline do Yolen Companion.
//
// Transforma o contrato autoritativo
// (docs/companion-universal/COMPANION_CORE_ARCHITECTURE_CONTRACT.md v1.1.0,
// §30 "Required architecture gates" e §30.1 "ARCHITECTURE MIGRATION
// BASELINE") em travas executáveis:
//
// - scanArchitectureViolations() detecta violações A1–A18 em src/ (e no
//   manifest/harness quando aplicável), nunca em testes ou documentos;
// - cada violação tem identidade semântica gate + arquivo + símbolo/região
//   (nunca número de linha);
// - a baseline LEGADA (fixtures/companion-core-architecture-baseline.mjs)
//   lista só dívida concreta herdada de b5d877;
// - NEW_VIOLATIONS (detectado − baseline) precisa ser 0;
// - STALE_BASELINE (baseline − detectado) também precisa ser 0: quem
//   remove uma violação remove a entrada no mesmo commit, então a baseline
//   só pode diminuir e termina vazia.
//
// Sem parser AST nem dependência nova: leitura de source, remoção de
// comentários com um lexer mínimo e regex controladas. Os self-tests no fim
// do arquivo provam que cada detector estrutural realmente acusa violações
// sintéticas (e não acusa os casos legítimos documentados).

import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  ARCHITECTURE_BASE_SHA,
  CONTRACT_VERSION,
  LEGACY_ARCHITECTURE_BASELINE,
} from './fixtures/companion-core-architecture-baseline.mjs'

const EXTENSION_ROOT = fileURLToPath(new URL('../', import.meta.url))
const REPO_ROOT = path.join(EXTENSION_ROOT, '..', '..', '..')
const SRC_DIR = path.join(EXTENSION_ROOT, 'src')
const TESTS_DIR = path.join(EXTENSION_ROOT, 'tests')
const HARNESS_DIR = path.join(TESTS_DIR, 'e3-test-support')
const CONTRACT_PATH = path.join(
  REPO_ROOT,
  'docs',
  'companion-universal',
  'COMPANION_CORE_ARCHITECTURE_CONTRACT.md',
)

export const GATE_IDS = Object.freeze(
  Array.from({ length: 18 }, (_, index) => `A${index + 1}`),
)

// Gates que o contrato exige PASS desde já — nenhuma entrada de baseline é
// aceita para eles (FASE 3, seções 28–31 da missão).
const GATES_WITHOUT_BASELINE = Object.freeze(['A15', 'A16', 'A17', 'A18'])

// ---------------------------------------------------------------------------
// Lexer mínimo: remove comentários preservando strings, template literals e
// regex literals, e acha o fechamento de blocos { } sem parser completo.
// ---------------------------------------------------------------------------

const REGEX_PREFIX_CHARS = new Set([
  '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-',
  '*', '%', '<', '>', '~', '^',
])
const REGEX_PREFIX_KEYWORDS = /(?:^|[^\w$])(?:return|typeof|case|do|else|in|of|new|delete|void|throw|yield|await)$/

function previousSignificant(code, index) {
  let cursor = index - 1
  while (cursor >= 0 && /\s/.test(code[cursor])) cursor -= 1
  return cursor
}

function isRegexStart(code, index) {
  const previous = previousSignificant(code, index)
  if (previous < 0) return true
  const char = code[previous]
  if (REGEX_PREFIX_CHARS.has(char)) return true
  return REGEX_PREFIX_KEYWORDS.test(code.slice(Math.max(0, previous - 10), previous + 1))
}

// Devolve o índice logo depois do literal que começa em `index`, ou -1 se
// não há literal ali. Entende '...', "...", `...${...}...` e /regex/.
function skipLiteral(code, index) {
  const char = code[index]

  if (char === '\'' || char === '"') {
    let cursor = index + 1
    while (cursor < code.length) {
      if (code[cursor] === '\\') {
        cursor += 2
        continue
      }
      if (code[cursor] === char || code[cursor] === '\n') return cursor + 1
      cursor += 1
    }
    return code.length
  }

  if (char === '`') {
    let cursor = index + 1
    while (cursor < code.length) {
      if (code[cursor] === '\\') {
        cursor += 2
        continue
      }
      if (code[cursor] === '`') return cursor + 1
      if (code[cursor] === '$' && code[cursor + 1] === '{') {
        cursor = skipBalanced(code, cursor + 1)
        continue
      }
      cursor += 1
    }
    return code.length
  }

  if (char === '/' && code[index + 1] !== '/' && code[index + 1] !== '*' && isRegexStart(code, index)) {
    let cursor = index + 1
    let inClass = false
    while (cursor < code.length) {
      const current = code[cursor]
      if (current === '\\') {
        cursor += 2
        continue
      }
      if (current === '\n') return -1
      if (current === '[') inClass = true
      else if (current === ']') inClass = false
      else if (current === '/' && !inClass) {
        cursor += 1
        while (/[a-z]/i.test(code[cursor] ?? '')) cursor += 1
        return cursor
      }
      cursor += 1
    }
    return -1
  }

  return -1
}

// `openIndex` aponta para '{'. Devolve o índice logo depois do '}' que o
// fecha (ignorando chaves dentro de strings/templates/regex).
function skipBalanced(code, openIndex) {
  let depth = 0
  let cursor = openIndex
  while (cursor < code.length) {
    const literalEnd = skipLiteral(code, cursor)
    if (literalEnd !== -1) {
      cursor = literalEnd
      continue
    }
    const char = code[cursor]
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return cursor + 1
    }
    cursor += 1
  }
  return code.length
}

// Substitui comentários por espaços (mantendo quebras de linha) para que
// menções em comentário nunca virem violação e os índices continuem
// alinhados com o source original.
export function stripComments(code) {
  let output = ''
  let cursor = 0
  while (cursor < code.length) {
    if (code[cursor] === '/' && code[cursor + 1] === '/') {
      while (cursor < code.length && code[cursor] !== '\n') {
        output += ' '
        cursor += 1
      }
      continue
    }
    if (code[cursor] === '/' && code[cursor + 1] === '*') {
      const end = code.indexOf('*/', cursor + 2)
      const stop = end === -1 ? code.length : end + 2
      output += code.slice(cursor, stop).replace(/[^\n]/g, ' ')
      cursor = stop
      continue
    }
    const literalEnd = skipLiteral(code, cursor)
    if (literalEnd !== -1) {
      output += code.slice(cursor, literalEnd)
      cursor = literalEnd
      continue
    }
    output += code[cursor]
    cursor += 1
  }
  return output
}

// Funções nomeadas (declarações, expressões nomeadas e `const x = (...) =>
// {`), cada uma com o intervalo do corpo. Usado para achar REGIÕES de
// decisão em vez de blacklist no arquivo inteiro.
export function findFunctions(code) {
  const functions = []
  const declaration = /\bfunction\b\s*\*?\s*([A-Za-z_$][\w$]*)?\s*\(/g
  let match
  while ((match = declaration.exec(code)) !== null) {
    const paramsOpen = match.index + match[0].length - 1
    const bodyOpen = findBodyOpen(code, paramsOpen)
    if (bodyOpen === -1) continue
    functions.push({
      name: match[1] ?? '<anonymous>',
      start: bodyOpen,
      end: skipBalanced(code, bodyOpen),
    })
  }
  const arrow = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^()]*\)|[A-Za-z_$][\w$]*)\s*=>\s*\{/g
  while ((match = arrow.exec(code)) !== null) {
    const bodyOpen = match.index + match[0].length - 1
    functions.push({ name: match[1], start: bodyOpen, end: skipBalanced(code, bodyOpen) })
  }
  return functions.sort((a, b) => a.start - b.start)
}

function findBodyOpen(code, paramsOpen) {
  let depth = 0
  let cursor = paramsOpen
  while (cursor < code.length) {
    const literalEnd = skipLiteral(code, cursor)
    if (literalEnd !== -1) {
      cursor = literalEnd
      continue
    }
    const char = code[cursor]
    if (char === '(') depth += 1
    else if (char === ')') {
      depth -= 1
      if (depth === 0) {
        const next = code.slice(cursor + 1).search(/\S/)
        if (next === -1) return -1
        const index = cursor + 1 + next
        return code[index] === '{' ? index : -1
      }
    }
    cursor += 1
  }
  return -1
}

// Corpo da função SEM o corpo das funções aninhadas: a decisão é atribuída
// à região mais interna que realmente a contém.
function ownBody(code, fn, allFunctions) {
  let body = code.slice(fn.start, fn.end)
  for (const inner of allFunctions) {
    if (inner === fn || inner.start <= fn.start || inner.end > fn.end) continue
    const relativeStart = inner.start - fn.start
    const relativeEnd = inner.end - fn.start
    body =
      body.slice(0, relativeStart) +
      body.slice(relativeStart, relativeEnd).replace(/[^\n]/g, ' ') +
      body.slice(relativeEnd)
  }
  return body
}

function firstMatchEvidence(code, regex) {
  const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`
  const matcher = new RegExp(regex.source, flags)
  const match = matcher.exec(code)
  if (!match) return null
  const lineStart = code.lastIndexOf('\n', match.index) + 1
  const lineEnd = code.indexOf('\n', match.index)
  return code
    .slice(lineStart, lineEnd === -1 ? code.length : lineEnd)
    .trim()
    .slice(0, 160)
}

// ---------------------------------------------------------------------------
// Árvore de source (real ou sintética) consumida pelos detectores.
// ---------------------------------------------------------------------------

function listFilesRecursive(directory) {
  if (!existsSync(directory)) return []
  const entries = []
  for (const name of readdirSync(directory)) {
    const full = path.join(directory, name)
    if (statSync(full).isDirectory()) entries.push(...listFilesRecursive(full))
    else entries.push(full)
  }
  return entries
}

export function loadRealSourceTree() {
  const src = new Map()
  for (const name of readdirSync(SRC_DIR).sort()) {
    if (name.endsWith('.js')) src.set(name, readFileSync(path.join(SRC_DIR, name), 'utf8'))
  }

  const harnesses = new Map()
  if (existsSync(HARNESS_DIR)) {
    for (const name of readdirSync(HARNESS_DIR).sort()) {
      if (name.endsWith('.mjs')) harnesses.set(name, readFileSync(path.join(HARNESS_DIR, name), 'utf8'))
    }
  }

  const tests = new Map()
  for (const full of listFilesRecursive(TESTS_DIR).sort()) {
    if (full.endsWith('.test.mjs') && !full.endsWith('companion-core-architecture-gates.test.mjs')) {
      tests.set(path.relative(TESTS_DIR, full), readFileSync(full, 'utf8'))
    }
  }

  const manifest = JSON.parse(readFileSync(path.join(EXTENSION_ROOT, 'manifest.json'), 'utf8'))

  return { src, harnesses, tests, manifest }
}

export function createSyntheticTree({
  src = {},
  harnesses = {},
  tests = {},
  manifest = { content_scripts: [] },
} = {}) {
  return {
    src: new Map(Object.entries(src)),
    harnesses: new Map(Object.entries(harnesses)),
    tests: new Map(Object.entries(tests)),
    manifest,
  }
}

// ---------------------------------------------------------------------------
// Classificação de arquivos (contrato §4 — nomenclatura conceitual).
// ---------------------------------------------------------------------------

const CORE_FILE_PREFIXES = Object.freeze([
  'companion-core',
  'companion-state',
  'companion-conversation-boundary',
  'companion-lead-resolution-controller',
  'companion-lead-creation-controller',
  'companion-workspace',
  'companion-message-controller',
  'companion-analysis-controller',
  'companion-client-controller',
  'companion-lead-summary-controller',
  'companion-conversation-registration-controller',
  'companion-lead-enrichment-controller',
])

export function isCoreFile(name) {
  return CORE_FILE_PREFIXES.some((prefix) => name.startsWith(prefix))
}

function isManyChatFile(name) {
  return name.startsWith('manychat-')
}

function isWhatsAppAdapterFile(name) {
  return name.startsWith('whatsapp-adapter')
}

function isAdapterContractFile(name) {
  return name === 'manychat-adapter.js' || name === 'platform-contract.js' || /-adapter[\w-]*\.js$/.test(name)
}

function stemOf(name) {
  return name.replace(/\.js$/, '')
}

function violation({ gate, file, symbol, evidence, id }) {
  return {
    id: id ?? `${gate}:${stemOf(file)}:${symbol}`,
    gate,
    file: `src/${file}`,
    symbol,
    evidence: evidence ?? null,
  }
}

function strippedSources(tree) {
  if (!tree.__stripped) {
    const stripped = new Map()
    for (const [name, code] of tree.src) stripped.set(name, stripComments(code))
    Object.defineProperty(tree, '__stripped', { value: stripped, enumerable: false })
  }
  return tree.__stripped
}

// ---------------------------------------------------------------------------
// Detectores A1–A18.
// ---------------------------------------------------------------------------

const COMMERCIAL_STATUSES = Object.freeze([
  'NOT_FOUND',
  'OWNED_BY_ME',
  'OWNED_BY_OTHER',
  'IN_POOL',
  'CLOSED_CYCLE',
  'LEAD_WITHOUT_CYCLE',
  'SOFT_DELETED',
  'MULTIPLE_MATCHES',
  'CONTACT_NOT_LINKED',
])
const STATUS_ALTERNATION = COMMERCIAL_STATUSES.join('|')

// A1 — Core sem plataforma. Rótulos "WhatsApp"/"ManyChat" (platformDisplayName)
// são permitidos; hosts, identificadores opacos, Fiber e seletores não.
const A1_FORBIDDEN = Object.freeze([
  ['host:web.whatsapp.com', /web\.whatsapp\.com/],
  ['host:app.manychat.com', /app\.manychat\.com/],
  ['id:subscriber_id', /\bsubscriber_?id\b|\bsubscriberId\b/],
  ['id:wa_id', /\bwa_id\b|\bwaId\b/],
  ['react-fiber', /__reactFiber|React\s*Fiber|\bFiberNode\b/],
  ['webpackChunk', /webpackChunk/],
  ['selector:#main', /['"`]#main\b/],
  ['selector:data-pre-plain-text', /data-pre-plain-text/],
  ['selector:data-testid', /data-testid/],
  ['selector:chat-messages-list', /chat-messages-list/],
  ['selector:whatsapp-message-bubble', /\.message-(?:in|out)\b/],
  ['jid-suffix', /@[cg]\.us\b/],
])

export function detectA1(tree) {
  const found = []
  for (const [name, code] of strippedSources(tree)) {
    if (!isCoreFile(name)) continue
    for (const [symbol, regex] of A1_FORBIDDEN) {
      if (regex.test(code)) {
        found.push(violation({ gate: 'A1', file: name, symbol, evidence: firstMatchEvidence(code, regex) }))
      }
    }
  }
  return found
}

// A2 — adapter não decide UI por status comercial. Detecta REGIÕES:
//   (a) mapa status → copy seller-facing;
//   (b) função cujo corpo próprio compara status comercial E renderiza.
// Transportar/sanitizar/allowlistar status (sem comparação + render) é
// legítimo e não é acusado.
const A2_STATUS_COMPARISON = new RegExp(
  `(?:===|!==|==|!=|\\bcase)\\s*['"\`](?:${STATUS_ALTERNATION})['"\`]|['"\`](?:${STATUS_ALTERNATION})['"\`]\\s*(?:===|!==|==|!=)`,
)
const A2_RENDER_SIGNAL = /setPanelContent\s*\(|\.innerHTML\s*=|['"`][^'"`\n]*<(?:div|section|button|span|p|h[1-6]|ul|li|form)\b|\brender[A-Z]\w*\s*\(/
const A2_LABEL_MAP_DECLARATION = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:Object\.freeze\(\s*)?\{/g
const A2_STATUS_COPY_ENTRY = new RegExp(
  `(?:^|[\\s,{])['"]?(${STATUS_ALTERNATION})['"]?\\s*:\\s*['"\`][^'"\`\\n]*\\s[^'"\`\\n]*['"\`]`,
)

function isA2ScopeFile(name) {
  return isManyChatFile(name) || isWhatsAppAdapterFile(name)
}

export function detectA2(tree) {
  const found = []
  for (const [name, code] of strippedSources(tree)) {
    if (!isA2ScopeFile(name)) continue

    A2_LABEL_MAP_DECLARATION.lastIndex = 0
    let match
    while ((match = A2_LABEL_MAP_DECLARATION.exec(code)) !== null) {
      const open = match.index + match[0].length - 1
      const block = code.slice(open, skipBalanced(code, open))
      if (A2_STATUS_COPY_ENTRY.test(block)) {
        found.push(violation({
          gate: 'A2',
          file: name,
          symbol: `status-copy-map:${match[1]}`,
          evidence: firstMatchEvidence(block, A2_STATUS_COPY_ENTRY),
        }))
      }
    }

    const functions = findFunctions(code)
    for (const fn of functions) {
      const body = ownBody(code, fn, functions)
      if (A2_STATUS_COMPARISON.test(body) && A2_RENDER_SIGNAL.test(body)) {
        found.push(violation({
          gate: 'A2',
          file: name,
          symbol: `status-render-decision:${fn.name}`,
          evidence: firstMatchEvidence(body, A2_STATUS_COMPARISON),
        }))
      }
    }
  }
  return found
}

// Gates de AUTORIDADE ÚNICA (A3–A8): um único arquivo pode ser dono da
// responsabilidade. O dono permitido é o módulo Core correspondente quando
// ele existir; enquanto não existir, o dono legado é content-script.js
// (cuja mistura com plataforma é dívida própria, catalogada em A11). Todo
// OUTRO arquivo com os marcadores é violação.
function detectSingleOwner(tree, { gate, symbol, markers, coreOwnerPrefix }) {
  const owners = []
  for (const [name, code] of strippedSources(tree)) {
    const marker = markers.find((regex) => regex.test(code))
    if (marker) owners.push({ name, evidence: firstMatchEvidence(code, marker) })
  }

  const coreOwner = owners.find((owner) => owner.name.startsWith(coreOwnerPrefix))
  const legacyOwner = owners.find((owner) => owner.name === 'content-script.js')
  const allowed = coreOwner ?? legacyOwner ?? owners[0] ?? null

  return owners
    .filter((owner) => owner !== allowed)
    .map((owner) => violation({ gate, file: owner.name, symbol, evidence: owner.evidence }))
}

const SELLER_AREA_IDS = Object.freeze(['now', 'message', 'analysis', 'client'])
const SELLER_SECTION_IDS = /data-yolen-section=["'](?:agora|analise|análise|analysis|cliente|client|now|mensagem|message)["']/g

function hasSellerAreaAuthority(code) {
  if (/\bSELLER_AREAS\s*=/.test(code)) return /\bSELLER_AREAS\s*=/

  const arrays = code.match(/\[[^[\]]*\]/g) ?? []
  for (const literal of arrays) {
    const ids = new Set(
      (literal.match(/['"](now|message|analysis|client)['"]/g) ?? []).map((token) => token.slice(1, -1)),
    )
    if (ids.size >= 3 && SELLER_AREA_IDS.some((id) => ids.has(id))) return /\[[^[\]]*['"](?:now|analysis)['"][^[\]]*\]/
  }

  const sections = new Set((code.match(SELLER_SECTION_IDS) ?? []).map((token) => token.toLowerCase()))
  if (sections.size >= 3) return /data-yolen-section=["'](?:agora|analise|análise|analysis|cliente|client|now|mensagem|message)["']/

  return null
}

export function detectA3(tree) {
  const owners = []
  for (const [name, code] of strippedSources(tree)) {
    const marker = hasSellerAreaAuthority(code)
    if (marker) owners.push({ name, evidence: firstMatchEvidence(code, marker) })
  }
  const allowed =
    owners.find((owner) => owner.name.startsWith('companion-workspace')) ??
    owners.find((owner) => owner.name === 'content-script.js') ??
    owners[0] ??
    null
  return owners
    .filter((owner) => owner !== allowed)
    .map((owner) => violation({ gate: 'A3', file: owner.name, symbol: 'seller-area-authority', evidence: owner.evidence }))
}

export function detectA4(tree) {
  return detectSingleOwner(tree, {
    gate: 'A4',
    symbol: 'lead-creation-state-machine',
    coreOwnerPrefix: 'companion-lead-creation-controller',
    markers: [/['"`]created_(?:resolving|unresolved)['"`]/],
  })
}

export function detectA5(tree) {
  return detectSingleOwner(tree, {
    gate: 'A5',
    symbol: 'analysis-policy',
    coreOwnerPrefix: 'companion-analysis-controller',
    markers: [
      /\b[A-Z_]*ANALYSIS[A-Z_]*_(?:DELAY|DELAYS|WATCHDOG|TIMEOUT)[A-Z_]*_MS\s*=/,
      /\.(?:analyzeConversation|getAnalysisJobStatus)\s*=\s*(?:async\s+)?function\b/,
    ],
  })
}

export function detectA6(tree) {
  return detectSingleOwner(tree, {
    gate: 'A6',
    symbol: 'lead-summary-controller',
    coreOwnerPrefix: 'companion-lead-summary-controller',
    markers: [
      /\b\w*[lL]eadSummarySaveStatus\s*(?::|=(?!=))\s*['"`](?:saving|conflict|error)['"`]/,
      /\.(?:loadLeadSummary|saveLeadSummary)\s*=\s*(?:async\s+)?function\b/,
    ],
  })
}

export function detectA7(tree) {
  return detectSingleOwner(tree, {
    gate: 'A7',
    symbol: 'conversation-registration-controller',
    coreOwnerPrefix: 'companion-conversation-registration-controller',
    markers: [/\bstatus\s*:\s*['"`](?:previewing|preview_ready|confirming)['"`]/],
  })
}

export function detectA8(tree) {
  return detectSingleOwner(tree, {
    gate: 'A8',
    symbol: 'lead-enrichment-controller',
    coreOwnerPrefix: 'companion-lead-enrichment-controller',
    markers: [
      /\b(?:leadEnrichmentApplyLoadingKey|applyLoadingKey)\s*(?::|=(?!=))/,
      /\bignored\w*Keys\s*(?::|=(?!=))\s*new\s+Set\b/,
    ],
  })
}

// A9 — harness de integração = composição efetiva do manifest. Só
// harnesses que carregam a âncora de uma composição (content-script.js no
// WhatsApp; bootstrap/runtimes no ManyChat) são tratados como integração;
// o conjunto comparado é o MÁXIMO que o harness pode carregar (todas as
// opções documentadas ligadas). Mocks internos do harness nunca contam:
// só nomes de arquivos que existem em src/.
const COMPOSITION_ANCHORS = Object.freeze([
  'content-script.js',
  'manychat-capture-bootstrap.js',
  'manychat-capture-runtime.js',
  'manychat-seller-panel-runtime.js',
])

function manifestCompositions(manifest) {
  return (manifest.content_scripts ?? []).map((entry, index) => ({
    index,
    files: (entry.js ?? []).map((file) => file.replace(/^src\//, '')),
  }))
}

export function detectA9(tree) {
  const found = []
  const compositions = manifestCompositions(tree.manifest)
  const manifestFiles = new Set(compositions.flatMap((composition) => composition.files))

  for (const [harnessName, harnessCode] of tree.harnesses) {
    const code = stripComments(harnessCode)
    const referenced = []
    for (const match of code.matchAll(/['"`]([\w.-]+\.js)['"`]/g)) {
      if (tree.src.has(match[1]) && !referenced.includes(match[1])) referenced.push(match[1])
    }

    const anchor = COMPOSITION_ANCHORS.find((file) => referenced.includes(file))
    if (!anchor) continue

    const composition =
      compositions.find((entry) => entry.files.includes(anchor)) ??
      compositions
        .map((entry) => ({ entry, score: entry.files.filter((file) => referenced.includes(file)).length }))
        .sort((a, b) => b.score - a.score)[0]?.entry

    const harnessStem = harnessName.replace(/\.mjs$/, '')
    const compositionFiles = composition?.files ?? []

    for (const file of referenced) {
      if (!compositionFiles.includes(file)) {
        found.push({
          id: `A9:${harnessStem}:extra:${file}`,
          gate: 'A9',
          file: `src/${file}`,
          symbol: `harness-loads-module-absent-from-manifest:${harnessStem}${manifestFiles.has(file) ? ':other-composition' : ':not-in-any-manifest'}`,
          evidence: `${harnessName} carrega ${file}`,
        })
      }
    }

    for (const file of compositionFiles) {
      if (!referenced.includes(file)) {
        found.push({
          id: `A9:${harnessStem}:missing:${file}`,
          gate: 'A9',
          file: `src/${file}`,
          symbol: `manifest-module-omitted-by-harness:${harnessStem}`,
          evidence: `manifest content_scripts[${composition.index}] carrega ${file}; ${harnessName} não`,
        })
      }
    }

    for (const match of code.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:Object\.freeze\(\s*)?\[([^\]]*)\]/g)) {
      const files = [...match[2].matchAll(/['"`]([\w.-]+\.js)['"`]/g)]
        .map((item) => item[1])
        .filter((file) => compositionFiles.includes(file))
      const indexes = files.map((file) => compositionFiles.indexOf(file))
      const monotonic = indexes.every((value, index) => index === 0 || value > indexes[index - 1])
      if (!monotonic) {
        found.push({
          id: `A9:${harnessStem}:order:${match[1]}`,
          gate: 'A9',
          file: `tests/e3-test-support/${harnessName}`,
          symbol: `harness-order-differs-from-manifest:${match[1]}`,
          evidence: files.join(' → '),
        })
      }
    }
  }
  return found
}

// A10 — nenhum runtime seller-facing paralelo no ManyChat. Uma entrada por
// RESPONSABILIDADE comprovada em cada arquivo manychat-*.
const A10_RESPONSIBILITIES = Object.freeze([
  ['parallel-seller-state', /\b(?:decisionState|analysisViewModel|customerViewModel|methodGuidance|leadSummary|conversationRegistration|leadEnrichment)\s*:/],
  ['parallel-view-model-loading', /['"`](?:LOAD_CLIENT_CONTEXT|LOAD_DECISION_STATE|LOAD_ANALYSIS_VIEW_MODEL|LOAD_CUSTOMER_VIEW_MODEL|LOAD_METHOD_GUIDANCE|LOAD_LEAD_SUMMARY|SAVE_LEAD_SUMMARY|PREVIEW_CONVERSATION_REGISTRATION|CONFIRM_CONVERSATION_REGISTRATION|LOAD_LEAD_ENRICHMENT_CONTEXT)['"`]/],
  ['parallel-commercial-render', /\brender(?:AgoraViewModelSnapshot|AnalysisViewModel|CustomerViewModel|ClientContextSection|LeadSummarySection)\s*\(|\bgetSellerArea(?:PanelHtml|TabsBarHtml)\s*\(|<h3>\s*(?:AGORA|ANÁLISE|CLIENTE|MENSAGEM)/],
  ['parallel-commercial-action', /\bsuggested_message\b|\bapplySuggestedMessage\b/],
  ['manual-link-ui', /['"`](?:SEARCH_LINKABLE_LEADS|FIRST_LINK_EXTERNAL_IDENTITY)['"`]/],
  ['seller-action-routing', /closest\(\s*['"`]\[data-yolen-(?:apply-suggestion|link-lead-|action=|seller-area|enrichment)/],
])

export function detectA10(tree) {
  const found = []
  for (const [name, code] of strippedSources(tree)) {
    if (!isManyChatFile(name)) continue
    for (const [symbol, regex] of A10_RESPONSIBILITIES) {
      if (regex.test(code)) {
        found.push(violation({ gate: 'A10', file: name, symbol, evidence: firstMatchEvidence(code, regex) }))
      }
    }
  }
  return found
}

// A11 — nenhum runtime seller-facing paralelo WhatsApp: arquivo fora do
// Core que mistura acesso à plataforma WhatsApp com responsabilidade
// seller-facing do Core.
const WHATSAPP_PLATFORM_MARKERS = /web\.whatsapp\.com|['"`]#main\b|\[data-pre-plain-text\]|conversation-compose-box|__reactFiber|@[cg]\.us\b/
const SELLER_CORE_MARKERS = /\bleadCreationStatus\b|\bSELLER_AREAS\b|data-yolen-seller-area|\brenderAgoraViewModelSnapshot\b|data-yolen-seller-message-(?:box|mount)|\bgetSellerMessageAreaHtml\b/

export function detectA11(tree) {
  const found = []
  for (const [name, code] of strippedSources(tree)) {
    if (isManyChatFile(name) || isCoreFile(name)) continue
    if (WHATSAPP_PLATFORM_MARKERS.test(code) && SELLER_CORE_MARKERS.test(code)) {
      found.push(violation({
        gate: 'A11',
        file: name,
        symbol: name === 'content-script.js' ? 'monolithic-core-platform-runtime' : 'mixed-core-platform-runtime',
        evidence: `${firstMatchEvidence(code, WHATSAPP_PLATFORM_MARKERS)} + ${firstMatchEvidence(code, SELLER_CORE_MARKERS)}`,
      }))
    }
  }
  return found
}

// A12 — adapter só com responsabilidade permitida (DOM, identidade,
// mensagens, composer, áudio, mount, capabilities, troca de conversa).
const A12_FORBIDDEN = Object.freeze([
  ['seller-html', /['"`][^'"`\n]*<(?:div|section|button|span|p|h[1-6]|ul|li|form)\b/],
  ['commercial-status', new RegExp(`['"\`](?:${STATUS_ALTERNATION})['"\`]`)],
  ['commercial-backend-action', /['"`](?:LOAD_[A-Z_]+|ANALYZE_CONVERSATION|GET_ANALYSIS_JOB_STATUS|CREATE_LEAD|RESOLVE_LEAD|APPLY_[A-Z_]+|SAVE_LEAD_SUMMARY|PREVIEW_CONVERSATION_REGISTRATION|CONFIRM_CONVERSATION_REGISTRATION)['"`]/],
  ['commercial-state', /\b(?:leadCreationStatus|decisionState|analysisViewModel|customerViewModel|leadSummary)\b/],
])

export function detectA12(tree) {
  const found = []
  for (const [name, code] of strippedSources(tree)) {
    if (!isAdapterContractFile(name)) continue
    for (const [symbol, regex] of A12_FORBIDDEN) {
      if (regex.test(code)) {
        found.push(violation({ gate: 'A12', file: name, symbol, evidence: firstMatchEvidence(code, regex) }))
      }
    }
  }
  return found
}

function detectCoreImports(tree, { gate, prefix, globalPattern }) {
  const importPattern = new RegExp(
    `(?:\\bimport\\b[^;]*?\\bfrom\\s*|\\bimport\\s*\\(\\s*|\\brequire\\s*\\(\\s*|\\breadSource\\s*\\(\\s*|\\bimportScripts\\s*\\(\\s*)['"\`][^'"\`]*${prefix}`,
  )
  const found = []
  for (const [name, code] of strippedSources(tree)) {
    if (!isCoreFile(name)) continue
    if (importPattern.test(code)) {
      found.push(violation({ gate, file: name, symbol: `imports-${prefix.replace(/-$/, '')}`, evidence: firstMatchEvidence(code, importPattern) }))
    }
    if (globalPattern.test(code)) {
      found.push(violation({ gate, file: name, symbol: `runtime-dependency-${prefix.replace(/-$/, '')}`, evidence: firstMatchEvidence(code, globalPattern) }))
    }
  }
  return found
}

export function detectA13(tree) {
  return detectCoreImports(tree, { gate: 'A13', prefix: 'manychat-', globalPattern: /\bYolenManyChat\w+/ })
}

export function detectA14(tree) {
  return detectCoreImports(tree, { gate: 'A14', prefix: 'whatsapp-', globalPattern: /\bYolenWhatsApp\w*|\bYolenCompanionWhatsApp\w*/ })
}

// A15 — kill switch ManyChat fail-closed em canais normais.
export function detectA15(tree) {
  const found = []
  const normal = tree.src.get('manychat-feature-flags.js')
  const composesManyChat = manifestCompositions(tree.manifest).some((entry) =>
    entry.files.some((file) => isManyChatFile(file)),
  )

  if (composesManyChat || normal !== undefined) {
    const code = normal === undefined ? '' : stripComments(normal)
    if (!/\bMANYCHAT_CAPTURE_ENABLED\s*[:=]\s*false\b/.test(code) || /\bMANYCHAT_CAPTURE_ENABLED\s*[:=](?!=)\s*(?![\s]|false\b)[^,;\n}]+/.test(code)) {
      found.push(violation({ gate: 'A15', file: 'manychat-feature-flags.js', symbol: 'normal-flag-not-fail-closed', evidence: firstMatchEvidence(code, /MANYCHAT_CAPTURE_ENABLED/) }))
    }
  }

  const loadsNormal = manifestCompositions(tree.manifest).some((entry) => entry.files.includes('manychat-feature-flags.js'))
  if (composesManyChat && !loadsNormal) {
    found.push(violation({ gate: 'A15', file: 'manychat-feature-flags.js', symbol: 'manifest-missing-normal-flag', evidence: 'manifest.json' }))
  }
  const loadsE2e = manifestCompositions(tree.manifest).some((entry) =>
    entry.files.some((file) => file.includes('manychat-feature-flags.e2e')),
  )
  if (loadsE2e) {
    found.push(violation({ gate: 'A15', file: 'manychat-feature-flags.e2e.js', symbol: 'manifest-loads-e2e-flag', evidence: 'manifest.json' }))
  }
  return found
}

// A16 — a infraestrutura de isolamento A → B continua presente (autoridade
// legada ou companion-conversation-boundary) e continua coberta por teste.
export function detectA16(tree) {
  const found = []
  const stripped = strippedSources(tree)
  const boundaryCore = [...stripped.keys()].some((name) => name.startsWith('companion-conversation-boundary'))
  const compositions = manifestCompositions(tree.manifest)

  const whatsappComposed = compositions.some((entry) => entry.files.includes('content-script.js'))
  if (whatsappComposed || stripped.has('content-script.js')) {
    const legacyAuthority = /\bfunction\s+hardResetConversationWorkspace\s*\(/.test(stripped.get('content-script.js') ?? '')
    if (!legacyAuthority && !boundaryCore) {
      found.push(violation({ gate: 'A16', file: 'content-script.js', symbol: 'whatsapp-isolation-authority-missing' }))
    }
    const covered = [...tree.tests.values()].some((code) => /hardResetConversationWorkspace|companion-conversation-boundary/.test(code))
    if (!covered) {
      found.push(violation({ gate: 'A16', file: 'content-script.js', symbol: 'whatsapp-isolation-coverage-missing' }))
    }
  }

  const manyChatComposed = compositions.some((entry) => entry.files.includes('manychat-capture-runtime.js'))
  if (manyChatComposed || stripped.has('manychat-capture-runtime.js')) {
    const runtime = stripped.get('manychat-capture-runtime.js') ?? ''
    const legacyAuthority =
      /\bfunction\s+isCurrentConversation\s*\(/.test(runtime) &&
      /\bfunction\s+matchesExpectedIdentity\s*\(/.test(runtime)
    const consumesBoundary = [...stripped].some(([name, code]) => isManyChatFile(name) && /YolenCompanionConversationBoundary|companion-conversation-boundary/.test(code))
    if (!legacyAuthority && !consumesBoundary) {
      found.push(violation({ gate: 'A16', file: 'manychat-capture-runtime.js', symbol: 'manychat-isolation-authority-missing' }))
    }
    const covered = [...tree.tests].some(([name, code]) => /manychat/.test(name) && /CONTACT_CHANGED|A → B|A->B/.test(code))
    if (!covered) {
      found.push(violation({ gate: 'A16', file: 'manychat-capture-runtime.js', symbol: 'manychat-isolation-coverage-missing' }))
    }
  }
  return found
}

// A17 — privacidade do telefone ManyChat (future-ready): se existir
// resolução privilegiada por telefone, a resposta precisa passar por um
// sanitizador de allowlist sem spread, sem lead_id e sem telefone; e
// nenhum manychat-* persiste telefone em storage do browser.
export function detectA17(tree) {
  const found = []
  const stripped = strippedSources(tree)

  for (const [name, code] of stripped) {
    const handler = code.match(/\baction\s*===\s*['"`]RESOLVE_MANYCHAT_LEAD_BY_PHONE['"`]/)
    if (!handler) continue

    const functions = findFunctions(code)
    const sanitizers = functions.filter((fn) => /^sanitize\w*Payload$/.test(fn.name))
    if (sanitizers.length === 0) {
      found.push(violation({ gate: 'A17', file: name, symbol: 'phone-resolution-without-sanitizer' }))
      continue
    }
    for (const sanitizer of sanitizers) {
      const body = code.slice(sanitizer.start, sanitizer.end)
      if (/\.\.\.\s*[A-Za-z_$]/.test(body)) {
        found.push(violation({ gate: 'A17', file: name, symbol: `sanitizer-spreads-payload:${sanitizer.name}`, evidence: firstMatchEvidence(body, /\.\.\.\s*[A-Za-z_$]/) }))
      }
      if (/\b(?:lead_id|leadId|phone|phone_mobile|stored_phone|raw_phone)\s*:/.test(body)) {
        found.push(violation({ gate: 'A17', file: name, symbol: `sanitizer-exposes-private-field:${sanitizer.name}`, evidence: firstMatchEvidence(body, /\b(?:lead_id|leadId|phone|phone_mobile|stored_phone|raw_phone)\s*:/) }))
      }
    }
    const sanitizerCalled = sanitizers.some((sanitizer) =>
      new RegExp(`(?<!\\bfunction\\s+)\\b${sanitizer.name}\\s*\\(`).test(code.slice(0, sanitizer.start) + code.slice(sanitizer.end)),
    )
    if (!sanitizerCalled) {
      found.push(violation({ gate: 'A17', file: name, symbol: 'phone-resolution-sanitizer-unused' }))
    }
  }

  for (const [name, code] of stripped) {
    if (!isManyChatFile(name)) continue
    const functions = findFunctions(code)
    for (const fn of functions) {
      const body = ownBody(code, fn, functions)
      if (/(?:localStorage|sessionStorage)\s*\.\s*setItem|storage\s*\.\s*(?:local|session|sync)\s*\.\s*set\s*\(/.test(body) && /phone|telefone/i.test(body)) {
        found.push(violation({ gate: 'A17', file: name, symbol: `phone-persisted-in-browser-storage:${fn.name}` }))
      }
    }
  }
  return found
}

// A18 — subscriber_id / wa_id nunca como telefone. Acusa FLUXO para um
// destino telefônico (atribuição a campo de telefone, normalização
// telefônica, payload de CREATE), nunca a simples menção do identificador
// opaco (que é legítima como identidade externa).
const OPAQUE_ID = '(?:subscriber_id|subscriberId|wa_id|waId)'
const A18_FLOWS = Object.freeze([
  ['opaque-id-assigned-to-phone', new RegExp(`\\b(?:phone|trustedPhone|phone_mobile|phoneNumber|phone_number|conversationPhone|normalizedPhone|contactPhone)\\b\\s*(?::|=(?!=))\\s*[^;,\\n)]*\\b${OPAQUE_ID}\\b`)],
  ['opaque-id-phone-normalization', new RegExp(`\\b(?:normalize\\w*Phone\\w*|extractPhone\\w*|toPhone\\w*|validate\\w*Phone\\w*|onlyDigits|buildPhoneVariants)\\s*\\([^)]*\\b${OPAQUE_ID}\\b`)],
  ['opaque-id-in-create-lead-payload', new RegExp(`['"\`]CREATE_LEAD['"\`][\\s\\S]{0,400}?\\b${OPAQUE_ID}\\b`)],
])

export function detectA18(tree) {
  const found = []
  for (const [name, code] of strippedSources(tree)) {
    for (const [symbol, regex] of A18_FLOWS) {
      if (regex.test(code)) {
        found.push(violation({ gate: 'A18', file: name, symbol, evidence: firstMatchEvidence(code, regex) }))
      }
    }
  }
  return found
}

export const DETECTORS = Object.freeze({
  A1: detectA1,
  A2: detectA2,
  A3: detectA3,
  A4: detectA4,
  A5: detectA5,
  A6: detectA6,
  A7: detectA7,
  A8: detectA8,
  A9: detectA9,
  A10: detectA10,
  A11: detectA11,
  A12: detectA12,
  A13: detectA13,
  A14: detectA14,
  A15: detectA15,
  A16: detectA16,
  A17: detectA17,
  A18: detectA18,
})

function gateOrder(gate) {
  return Number(gate.slice(1))
}

export function sortViolations(violations) {
  return [...violations].sort(
    (a, b) =>
      gateOrder(a.gate) - gateOrder(b.gate) ||
      a.file.localeCompare(b.file) ||
      a.id.localeCompare(b.id),
  )
}

export function scanArchitectureViolations(tree = loadRealSourceTree()) {
  const all = []
  for (const gate of GATE_IDS) all.push(...DETECTORS[gate](tree))
  return sortViolations(all)
}

// ---------------------------------------------------------------------------
// Mecanismo regressivo da baseline.
// ---------------------------------------------------------------------------

export function compareWithBaseline(detected, baseline) {
  const baselineIds = new Set(baseline.map((entry) => entry.id))
  const detectedIds = new Set(detected.map((entry) => entry.id))
  return {
    newViolations: detected.filter((entry) => !baselineIds.has(entry.id)),
    staleBaseline: baseline.filter((entry) => !detectedIds.has(entry.id)),
    legacyRemaining: detected.filter((entry) => baselineIds.has(entry.id)),
  }
}

export function formatReport(detected, comparison) {
  const lines = [
    'ARCHITECTURE GATE REPORT',
    `NEW_VIOLATIONS=${comparison.newViolations.length}`,
    `STALE_BASELINE=${comparison.staleBaseline.length}`,
    `LEGACY_VIOLATIONS_REMAINING=${comparison.legacyRemaining.length}`,
  ]
  for (const gate of GATE_IDS) {
    const newCount = comparison.newViolations.filter((entry) => entry.gate === gate).length
    const legacyCount = comparison.legacyRemaining.filter((entry) => entry.gate === gate).length
    const status = newCount > 0 ? `FAIL(${newCount} new)` : legacyCount > 0 ? `LEGACY(${legacyCount})` : 'PASS'
    lines.push(`${gate}: ${status}`)
  }
  for (const entry of comparison.newViolations) {
    lines.push(`NEW ${entry.gate} ${entry.file} ${entry.symbol} [${entry.id}] evidence: ${entry.evidence ?? '-'}`)
  }
  for (const entry of comparison.staleBaseline) {
    lines.push(`STALE ${entry.gate} ${entry.file} ${entry.symbol} [${entry.id}] — violação removida: apague a entrada da baseline`)
  }
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Testes sobre a árvore real.
// ---------------------------------------------------------------------------

const realTree = loadRealSourceTree()
const detected = scanArchitectureViolations(realTree)
const comparison = compareWithBaseline(detected, LEGACY_ARCHITECTURE_BASELINE)

test('fixture declara base SHA e versão do contrato autoritativo', () => {
  assert.equal(ARCHITECTURE_BASE_SHA, 'b5d877a18843b5653c79adc2c5396447d2a99310')
  assert.equal(CONTRACT_VERSION, '1.1.0')
  const contract = readFileSync(CONTRACT_PATH, 'utf8')
  assert.match(contract, /\|\s*Versão\s*\|\s*1\.1\.0\b/)
})

test('baseline é imutável e estruturalmente válida (sem wildcard, ids únicos)', () => {
  assert.ok(Object.isFrozen(LEGACY_ARCHITECTURE_BASELINE))
  const ids = new Set()
  for (const entry of LEGACY_ARCHITECTURE_BASELINE) {
    assert.ok(Object.isFrozen(entry), `entrada não congelada: ${entry.id}`)
    for (const field of ['id', 'gate', 'file', 'symbol', 'reason', 'removalPhase']) {
      assert.equal(typeof entry[field], 'string', `${entry.id ?? '<sem id>'}: campo ${field} ausente`)
      assert.ok(entry[field].trim().length > 0, `${entry.id}: campo ${field} vazio`)
    }
    assert.equal(entry.introducedBeforeRebuild, true, `${entry.id}: introducedBeforeRebuild precisa ser true`)
    assert.ok(GATE_IDS.includes(entry.gate), `${entry.id}: gate inválido ${entry.gate}`)
    assert.ok(!GATES_WITHOUT_BASELINE.includes(entry.gate), `${entry.id}: ${entry.gate} não aceita baseline`)
    assert.ok(entry.id.startsWith(`${entry.gate}:`), `${entry.id}: id precisa começar com o gate`)
    assert.ok(!ids.has(entry.id), `id duplicado: ${entry.id}`)
    ids.add(entry.id)

    for (const field of ['id', 'file', 'symbol']) {
      const value = entry[field]
      assert.ok(!value.includes('*'), `${entry.id}: ${field} contém wildcard`)
      assert.ok(!/[?[\]{}()^$|\\+]/.test(value.replace(/\.js$/, '')), `${entry.id}: ${field} parece regex`)
    }
    assert.ok(!entry.file.endsWith('/'), `${entry.id}: file não pode ser diretório`)
    assert.match(entry.file, /\.(?:js|mjs)$/, `${entry.id}: file precisa ser um arquivo concreto`)
    assert.ok(existsSync(path.join(EXTENSION_ROOT, entry.file)), `${entry.id}: arquivo inexistente enquanto a entrada está ativa: ${entry.file}`)
    assert.match(entry.removalPhase, /^[4-7]$/, `${entry.id}: removalPhase fora das fases 4–7`)
  }
})

test('ARCHITECTURE GATE REPORT: NEW_VIOLATIONS=0 e STALE_BASELINE=0', () => {
  const report = formatReport(detected, comparison)
  console.log(report)
  assert.equal(comparison.newViolations.length, 0, report)
  assert.equal(comparison.staleBaseline.length, 0, report)
  assert.ok(comparison.legacyRemaining.length > 0, 'baseline legada vazia na FASE 3 é suspeita — revise os detectores')
})

test('toda violação detectada tem identidade semântica sem número de linha', () => {
  for (const entry of detected) {
    assert.ok(GATE_IDS.includes(entry.gate))
    assert.ok(entry.id.startsWith(`${entry.gate}:`))
    assert.doesNotMatch(entry.id, /:\d+$|line/i, entry.id)
  }
  assert.deepEqual(detected, sortViolations(detected), 'ordenação determinística por gate, arquivo e id')
})

for (const gate of GATE_IDS) {
  test(`${gate}: nenhuma violação nova e nenhuma entrada legada obsoleta`, () => {
    const newForGate = comparison.newViolations.filter((entry) => entry.gate === gate)
    const staleForGate = comparison.staleBaseline.filter((entry) => entry.gate === gate)
    assert.deepEqual(
      newForGate.map((entry) => `${entry.id} (${entry.evidence ?? '-'})`),
      [],
      `${gate}: violação nova detectada`,
    )
    assert.deepEqual(staleForGate.map((entry) => entry.id), [], `${gate}: entrada de baseline sem violação correspondente`)
    if (GATES_WITHOUT_BASELINE.includes(gate)) {
      assert.deepEqual(detected.filter((entry) => entry.gate === gate), [], `${gate} precisa estar PASS desde já`)
    }
  })
}

// ---------------------------------------------------------------------------
// Self-tests dos detectores (árvores sintéticas).
// ---------------------------------------------------------------------------

function ids(violations) {
  return violations.map((entry) => entry.id)
}

test('self-test: stripComments/findFunctions ignoram comentários e respeitam strings/templates/regex', () => {
  const code = [
    '// NOT_FOUND === x',
    'const re = /\\}\\{/g',
    'function outer(a) {',
    '  const t = `${a ? "}" : "{"}`',
    '  /* } */',
    '  function inner() { return "}" }',
    '  return t',
    '}',
  ].join('\n')
  const stripped = stripComments(code)
  assert.doesNotMatch(stripped, /NOT_FOUND/)
  const functions = findFunctions(stripped)
  assert.deepEqual(functions.map((fn) => fn.name), ['outer', 'inner'])
  assert.equal(stripped.slice(functions[0].end - 1, functions[0].end), '}')
  assert.ok(functions[0].end > functions[1].end)
})

test('self-test A1: Core com app.manychat.com é acusado; rótulo "ManyChat" não', () => {
  const bad = createSyntheticTree({ src: { 'companion-core.js': "const host = 'https://app.manychat.com/'" } })
  assert.deepEqual(ids(detectA1(bad)), ['A1:companion-core:host:app.manychat.com'])

  const label = createSyntheticTree({
    src: { 'companion-message-controller.js': "const label = `Inserir no ${platformDisplayName}` // WhatsApp\nconst other = 'Inserir no ManyChat'" },
  })
  assert.deepEqual(detectA1(label), [])

  const notCore = createSyntheticTree({ src: { 'manychat-surface.js': "const host = 'app.manychat.com'" } })
  assert.deepEqual(detectA1(notCore), [])
})

test('self-test A2: adapter decidindo NOT_FOUND + HTML é acusado; transporte de status não', () => {
  const bad = createSyntheticTree({
    src: {
      'manychat-panel.js': [
        'function renderLeadStatus(resolution) {',
        "  if (resolution.status === 'NOT_FOUND') {",
        "    mount.setPanelContent('<div>Lead não encontrado</div>')",
        '  }',
        '}',
        "const LABELS = Object.freeze({ IN_POOL: 'Lead está no Pool' })",
      ].join('\n'),
    },
  })
  assert.deepEqual(ids(detectA2(bad)).sort(), [
    'A2:manychat-panel:status-copy-map:LABELS',
    'A2:manychat-panel:status-render-decision:renderLeadStatus',
  ])

  const legit = createSyntheticTree({
    src: {
      'manychat-capture-runtime.js': [
        "const DOMAIN = new Set(['NOT_FOUND', 'IN_POOL'])",
        'function sanitize(payload) {',
        "  return { status: typeof payload.status === 'string' ? payload.status : null }",
        '}',
        'function isCacheable(resolution) {',
        "  return DOMAIN.has(resolution.status) || resolution.status === 'CLOSED_CYCLE'",
        '}',
      ].join('\n'),
    },
  })
  assert.deepEqual(detectA2(legit), [])
})

test('self-test A3: segunda declaração de SELLER_AREAS é acusada', () => {
  const tree = createSyntheticTree({
    src: {
      'content-script.js': "const SELLER_AREAS = ['now', 'message', 'analysis', 'client']",
      'manychat-tabs.js': "const tabs = ['now', 'message', 'analysis', 'client']",
    },
  })
  assert.deepEqual(ids(detectA3(tree)), ['A3:manychat-tabs:seller-area-authority'])

  const migrated = createSyntheticTree({
    src: {
      'companion-workspace.js': "const SELLER_AREAS = Object.freeze(['now', 'message', 'analysis', 'client'])",
      'content-script.js': "const SELLER_AREAS = ['now', 'message', 'analysis', 'client']",
    },
  })
  assert.deepEqual(ids(detectA3(migrated)), ['A3:content-script:seller-area-authority'])
})

test('self-test A4/A6/A7/A8: segundo dono de state machine comercial é acusado', () => {
  const tree = createSyntheticTree({
    src: {
      'content-script.js': [
        "state.leadCreationStatus = 'created_resolving'",
        "state.companionLeadSummarySaveStatus = 'conflict'",
        "entry = { status: 'previewing' }",
        'state.leadEnrichmentApplyLoadingKey = key',
      ].join('\n'),
      'manychat-seller.js': [
        "creation.status = 'created_unresolved'",
        "state.leadSummarySaveStatus = 'saving'",
        "registration = { status: 'preview_ready' }",
        'const ignoredKeys = new Set()',
      ].join('\n'),
    },
  })
  assert.deepEqual(ids(detectA4(tree)), ['A4:manychat-seller:lead-creation-state-machine'])
  assert.deepEqual(ids(detectA6(tree)), ['A6:manychat-seller:lead-summary-controller'])
  assert.deepEqual(ids(detectA7(tree)), ['A7:manychat-seller:conversation-registration-controller'])
  assert.deepEqual(ids(detectA8(tree)), ['A8:manychat-seller:lead-enrichment-controller'])

  const viewOnly = createSyntheticTree({
    src: {
      'content-script.js': "state.leadCreationStatus = 'created_resolving'",
      'lead-form-view.js': 'if (entry.applyLoadingKey === key) { disabled = true }',
    },
  })
  assert.deepEqual(detectA8(viewOnly), [])
})

test('self-test A5: política de análise no ManyChat é acusada', () => {
  const tree = createSyntheticTree({
    src: {
      'content-script.js': 'const AUTOMATIC_ANALYSIS_DELAY_MS = 8000',
      'manychat-analysis.js': 'const ANALYSIS_POLL_DELAYS_MS = [1500, 2000]',
      'analysis-hotfix.js': 'api.analyzeConversation = async function retry(payload) { return payload }',
    },
  })
  assert.deepEqual(ids(detectA5(tree)).sort(), ['A5:analysis-hotfix:analysis-policy', 'A5:manychat-analysis:analysis-policy'])
})

test('self-test A9: módulo só no harness e módulo omitido pelo harness são acusados', () => {
  const tree = createSyntheticTree({
    src: { 'a.js': '', 'b.js': '', 'content-script.js': '', 'extra.js': '' },
    manifest: { content_scripts: [{ js: ['src/a.js', 'src/b.js', 'src/content-script.js'] }] },
    harnesses: {
      'load.mjs': "const DEPENDENCY_FILES = ['b.js', 'a.js', 'extra.js']\nconst mock = 'not-a-src-module.js'\nreadSource('content-script.js')",
    },
  })
  assert.deepEqual(ids(detectA9(tree)).sort(), [
    'A9:load:extra:extra.js',
    'A9:load:order:DEPENDENCY_FILES',
  ])

  const missing = createSyntheticTree({
    src: { 'a.js': '', 'content-script.js': '' },
    manifest: { content_scripts: [{ js: ['src/a.js', 'src/content-script.js'] }] },
    harnesses: { 'load.mjs': "readSource('content-script.js')" },
  })
  assert.deepEqual(ids(detectA9(missing)), ['A9:load:missing:a.js'])
})

test('self-test A10: runtime seller-facing paralelo no ManyChat é acusado por responsabilidade', () => {
  const tree = createSyntheticTree({
    src: {
      'manychat-seller.js': [
        'const state = { decisionState: null }',
        "send({ action: 'LOAD_DECISION_STATE' })",
        'api.renderAgoraViewModelSnapshot(data)',
        "target.closest('[data-yolen-action=\"analyze-conversation\"]')",
      ].join('\n'),
      'manychat-dom-reader.js': "root.querySelector('div[data-test-id=\"chat-messages-list\"]')",
    },
  })
  assert.deepEqual(ids(detectA10(tree)).sort(), [
    'A10:manychat-seller:parallel-commercial-render',
    'A10:manychat-seller:parallel-seller-state',
    'A10:manychat-seller:parallel-view-model-loading',
    'A10:manychat-seller:seller-action-routing',
  ])
})

test('self-test A11/A12: mistura WhatsApp + Core e adapter com responsabilidade comercial são acusados', () => {
  const tree = createSyntheticTree({
    src: {
      'whatsapp-panel.js': "document.querySelector('#main')\nconst SELLER_AREAS = []",
      'whatsapp-reader.js': "document.querySelector('#main')",
      'whatsapp-adapter.js': "const html = '<div class=\"yolen-card\">Lead</div>'",
    },
  })
  assert.deepEqual(ids(detectA11(tree)), ['A11:whatsapp-panel:mixed-core-platform-runtime'])
  assert.deepEqual(ids(detectA12(tree)), ['A12:whatsapp-adapter:seller-html'])
})

test('self-test A13/A14: Core importando adapter é acusado; platformDisplayName não', () => {
  const tree = createSyntheticTree({
    src: {
      'companion-state.js': "import adapter from './manychat-adapter.js'",
      'companion-workspace.js': "const adapter = require('./whatsapp-adapter.js')",
      'companion-message-controller.js': "const label = 'Inserir no ' + platformDisplayName // ManyChat / WhatsApp",
    },
  })
  assert.deepEqual(ids(detectA13(tree)), ['A13:companion-state:imports-manychat'])
  assert.deepEqual(ids(detectA14(tree)), ['A14:companion-workspace:imports-whatsapp'])
})

test('self-test A15: flag normal true e manifest com flag e2e são acusados', () => {
  const tree = createSyntheticTree({
    src: {
      'manychat-feature-flags.js': 'const api = Object.freeze({ MANYCHAT_CAPTURE_ENABLED: true })',
      'manychat-feature-flags.e2e.js': 'const api = Object.freeze({ MANYCHAT_CAPTURE_ENABLED: true })',
    },
    manifest: { content_scripts: [{ js: ['src/manychat-feature-flags.e2e.js'] }] },
  })
  assert.deepEqual(ids(detectA15(tree)).sort(), [
    'A15:manychat-feature-flags.e2e:manifest-loads-e2e-flag',
    'A15:manychat-feature-flags:manifest-missing-normal-flag',
    'A15:manychat-feature-flags:normal-flag-not-fail-closed',
  ])

  const ok = createSyntheticTree({
    src: {
      'manychat-feature-flags.js': 'const api = Object.freeze({ MANYCHAT_CAPTURE_ENABLED: false })',
      'manychat-feature-flags.e2e.js': 'const api = Object.freeze({ MANYCHAT_CAPTURE_ENABLED: true })',
    },
    manifest: { content_scripts: [{ js: ['src/manychat-feature-flags.js'] }] },
  })
  assert.deepEqual(detectA15(ok), [])
})

test('self-test A16: remover o mecanismo de isolamento sem instalar o novo é acusado', () => {
  const removed = createSyntheticTree({
    src: { 'content-script.js': 'function renderPanel() {}', 'manychat-capture-runtime.js': 'function captureNow() {}' },
    manifest: { content_scripts: [{ js: ['src/content-script.js'] }, { js: ['src/manychat-capture-runtime.js'] }] },
  })
  assert.deepEqual(ids(detectA16(removed)).sort(), [
    'A16:content-script:whatsapp-isolation-authority-missing',
    'A16:content-script:whatsapp-isolation-coverage-missing',
    'A16:manychat-capture-runtime:manychat-isolation-authority-missing',
    'A16:manychat-capture-runtime:manychat-isolation-coverage-missing',
  ])

  const migrated = createSyntheticTree({
    src: {
      'companion-conversation-boundary.js': 'function onConversationChanged() {}',
      'content-script.js': '',
      'manychat-capture-runtime.js': 'root.YolenCompanionConversationBoundary.subscribe()',
    },
    tests: {
      'companion-conversation-boundary.test.mjs': "readSource('companion-conversation-boundary.js')",
      'manychat-boundary.test.mjs': "it('A → B', () => {})",
    },
  })
  assert.deepEqual(detectA16(migrated), [])
})

test('self-test A17: resolução por telefone sem hardening é acusada; ausência da feature não', () => {
  const bad = createSyntheticTree({
    src: {
      'background.js': [
        'function sanitizePhonePayload(payload) { return { ...payload, lead_id: payload.lead_id } }',
        "if (message.action === 'RESOLVE_MANYCHAT_LEAD_BY_PHONE') { return request(message) }",
      ].join('\n'),
      'manychat-cache.js': "function remember(phone) { localStorage.setItem('yolen_phone', phone) }",
    },
  })
  assert.deepEqual(ids(detectA17(bad)).sort(), [
    'A17:background:phone-resolution-sanitizer-unused',
    'A17:background:sanitizer-exposes-private-field:sanitizePhonePayload',
    'A17:background:sanitizer-spreads-payload:sanitizePhonePayload',
    'A17:manychat-cache:phone-persisted-in-browser-storage:remember',
  ])

  const hardened = createSyntheticTree({
    src: {
      'background.js': [
        'function sanitizeManyChatPhoneResolutionPayload(payload) {',
        '  return { status: payload.status, cycle: payload.cycle ? { id: payload.cycle.id } : null }',
        '}',
        "if (message.action === 'RESOLVE_MANYCHAT_LEAD_BY_PHONE') { return sanitizeManyChatPhoneResolutionPayload(result.payload) }",
      ].join('\n'),
    },
  })
  assert.deepEqual(detectA17(hardened), [])
  assert.deepEqual(detectA17(createSyntheticTree({ src: { 'background.js': "if (message.action === 'RESOLVE_LEAD') {}" } })), [])
})

test('self-test A18: subscriber_id atribuído a telefone é acusado; identidade externa opaca não', () => {
  const bad = createSyntheticTree({
    src: {
      'manychat-contact.js': 'const trustedPhone = contact.subscriber_id',
      'manychat-create.js': "send({ action: 'CREATE_LEAD', payload: { name, phone: user.wa_id } })",
    },
  })
  assert.deepEqual(ids(detectA18(bad)).sort(), [
    'A18:manychat-contact:opaque-id-assigned-to-phone',
    'A18:manychat-create:opaque-id-assigned-to-phone',
    'A18:manychat-create:opaque-id-in-create-lead-payload',
  ])

  const legit = createSyntheticTree({
    src: {
      'manychat-identity-namespace.js': [
        '// subscriber_id vira phone? nunca.',
        'const subscriberId = normalizeOpaqueIdentifier(raw.subscriber_id)',
        "const identity = { source: 'subscriber_id', key: hash(accountKey, subscriberId) }",
        "const matchers = { whatsapp_user_id: (locator) => /\\.user\\.wa_id$/i.test(locator) }",
      ].join('\n'),
    },
  })
  assert.deepEqual(detectA18(legit), [])
})

test('self-test baseline: violação nova vira NEW_VIOLATIONS e violação removida vira STALE_BASELINE', () => {
  const baseline = [
    { id: 'A10:manychat-x:parallel-seller-state', gate: 'A10' },
    { id: 'A2:manychat-x:status-copy-map:LABELS', gate: 'A2' },
  ]
  const novel = { id: 'A3:manychat-y:seller-area-authority', gate: 'A3', file: 'src/manychat-y.js', symbol: 'seller-area-authority' }

  const grown = compareWithBaseline([...baseline, novel], baseline)
  assert.deepEqual(grown.newViolations.map((entry) => entry.id), [novel.id])
  assert.deepEqual(grown.staleBaseline, [])

  const reduced = compareWithBaseline([baseline[0]], baseline)
  assert.deepEqual(reduced.newViolations, [])
  assert.deepEqual(reduced.staleBaseline.map((entry) => entry.id), ['A2:manychat-x:status-copy-map:LABELS'])

  const swapped = compareWithBaseline([baseline[0], novel], baseline)
  assert.deepEqual(swapped.newViolations.map((entry) => entry.id), [novel.id], 'troca de dívida não passa silenciosamente')
  assert.deepEqual(swapped.staleBaseline.map((entry) => entry.id), ['A2:manychat-x:status-copy-map:LABELS'])
})
