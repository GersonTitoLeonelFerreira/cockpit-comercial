// FASE 4B.5A — fundação pura do companion-lead-resolution-controller
// (contrato v1.1.0 §9, §10.3 Q1, §10.4, Q2 e Q3).
//
// Carrega o módulo diretamente (sem DOM) e prova: DomainResolutionViewModel
// allowlisted (sem telefone, lead_id, URLs ou campos desconhecidos),
// mapeamento backend → estado canônico (Q1, CONTACT_NOT_LINKED, NOT_FOUND),
// regra de WORKSPACE_READY (Q2), imutabilidade e neutralidade de plataforma.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const MODULE_PATH = fileURLToPath(
  new URL('../src/companion-lead-resolution-controller.js', import.meta.url),
)
const controller = require(MODULE_PATH)
const moduleSource = readFileSync(MODULE_PATH, 'utf8')

const EXTENSION_ROOT = fileURLToPath(
  new URL('../', import.meta.url),
)

const contentScriptSource =
  readFileSync(
    `${EXTENSION_ROOT}src/content-script.js`,
    'utf8',
  )

const manifest =
  JSON.parse(
    readFileSync(
      `${EXTENSION_ROOT}manifest.json`,
      'utf8',
    ),
  )

const buildScriptSource =
  readFileSync(
    `${EXTENSION_ROOT}scripts/build-package.mjs`,
    'utf8',
  )

const harnessSource =
  readFileSync(
    `${EXTENSION_ROOT}tests/e3-test-support/load-content-script.mjs`,
    'utf8',
  )

function legacyPayload(overrides = {}) {
  return {
    ok: true,
    status: 'OWNED_BY_ME',
    user_message: '  Lead vinculado à sua carteira.  ',
    lead: {
      id: 'lead-1',
      name: '  Cliente Teste  ',
      phone: '5511988887777',
      email: 'cliente@example.com',
      cpf_cnpj: '12345678901',
    },
    cycle: {
      id: 'cycle-1',
      status: 'contato',
      owner_name: 'Vendedor A',
      owner_user_id: 'user-1',
    },
    actions: {
      can_analyze_conversation: true,
      can_apply_suggestion: true,
      can_create_lead_inside_extension: false,
    },
    flags: { is_owned_by_me: true, is_pool: false, is_closed: false },
    ...overrides,
  }
}

function outcomeFor(payload, options) {
  return controller.deriveCanonicalResolutionOutcome(
    controller.createDomainResolutionViewModel(payload),
    options,
  )
}

test('API é frozen', () => {
  assert.ok(Object.isFrozen(controller))
  assert.equal(typeof controller.createDomainResolutionViewModel, 'function')
  assert.equal(typeof controller.canOpenWorkspace, 'function')
  assert.equal(typeof controller.deriveCanonicalResolutionOutcome, 'function')
})

test('DOMAIN_ERROR_STATUSES e COMMERCIAL_STATUSES são frozen', () => {
  assert.ok(Object.isFrozen(controller.DOMAIN_ERROR_STATUSES))
  assert.ok(Object.isFrozen(controller.COMMERCIAL_STATUSES))
  assert.deepEqual([...controller.COMMERCIAL_STATUSES], ['OWNED_BY_ME', 'IN_POOL', 'OWNED_BY_OTHER', 'CLOSED_CYCLE'])
  for (const status of ['LEAD_WITHOUT_CYCLE', 'SOFT_DELETED', 'MULTIPLE_MATCHES']) {
    assert.ok(controller.DOMAIN_ERROR_STATUSES.includes(status), status)
  }
})

test('input inválido → null', () => {
  for (const value of [null, undefined, 'OWNED_BY_ME', 42, [], true]) {
    assert.equal(controller.createDomainResolutionViewModel(value), null, String(value))
  }
})

test('payload legacy vira ViewModel allowlisted com cycle, display, capabilities e flags', () => {
  const viewModel = controller.createDomainResolutionViewModel(legacyPayload())

  assert.deepEqual(Object.keys(viewModel).sort(), [
    'capabilities',
    'cycle',
    'flags',
    'lead_display',
    'ownership_display',
    'status',
    'user_message',
  ])
  assert.equal(viewModel.status, 'OWNED_BY_ME')
  assert.equal(viewModel.user_message, 'Lead vinculado à sua carteira.')
  assert.deepEqual({ ...viewModel.cycle }, { id: 'cycle-1', status: 'contato' })
  assert.deepEqual({ ...viewModel.lead_display }, { name: 'Cliente Teste' })
  assert.deepEqual({ ...viewModel.ownership_display }, { owner_name: 'Vendedor A' })
  assert.deepEqual({ ...viewModel.capabilities }, {
    can_create_lead: false,
    can_analyze_conversation: true,
    can_apply_suggestion: true,
    can_open_pool: false,
    can_open_cycle: false,
    can_register_conversation: false,
    can_enrich_lead: false,
  })
  assert.deepEqual({ ...viewModel.flags }, { is_closed: false, is_owned_by_me: true, is_pool: false })
})

test('cycle.id preservado (string ou número finito)', () => {
  assert.equal(controller.createDomainResolutionViewModel(legacyPayload()).cycle.id, 'cycle-1')
  assert.equal(
    controller.createDomainResolutionViewModel(legacyPayload({ cycle: { id: 42, status: 'novo' } })).cycle.id,
    42,
  )
  assert.equal(controller.createDomainResolutionViewModel(legacyPayload({ cycle: null })).cycle, null)
})

test('cycle.status preservado', () => {
  const viewModel = controller.createDomainResolutionViewModel(legacyPayload({ cycle: { id: 'c', status: 'negociacao' } }))
  assert.equal(viewModel.cycle.status, 'negociacao')
})

test('lead.name legacy → lead_display.name; lead_display canônico tem prioridade', () => {
  assert.equal(controller.createDomainResolutionViewModel(legacyPayload()).lead_display.name, 'Cliente Teste')
  const canonical = controller.createDomainResolutionViewModel(
    legacyPayload({ lead_display: { name: 'Nome Autorizado' } }),
  )
  assert.equal(canonical.lead_display.name, 'Nome Autorizado')
  assert.equal(controller.createDomainResolutionViewModel(legacyPayload({ lead: null })).lead_display.name, null)
})

test('cycle.owner_name legacy → ownership_display.owner_name', () => {
  assert.equal(controller.createDomainResolutionViewModel(legacyPayload()).ownership_display.owner_name, 'Vendedor A')
  const canonical = controller.createDomainResolutionViewModel(
    legacyPayload({ ownership_display: { owner_name: 'Dono Autorizado' } }),
  )
  assert.equal(canonical.ownership_display.owner_name, 'Dono Autorizado')
})

test('capabilities booleanas conhecidas preservadas; canônicas têm prioridade sobre legacy', () => {
  const viewModel = controller.createDomainResolutionViewModel(legacyPayload({
    capabilities: {
      can_create_lead: true,
      can_analyze_conversation: false,
      can_apply_suggestion: false,
      can_open_pool: true,
      can_open_cycle: true,
      can_register_conversation: true,
      can_enrich_lead: true,
    },
  }))
  assert.deepEqual({ ...viewModel.capabilities }, {
    can_create_lead: true,
    can_analyze_conversation: false,
    can_apply_suggestion: false,
    can_open_pool: true,
    can_open_cycle: true,
    can_register_conversation: true,
    can_enrich_lead: true,
  })

  const legacyCreate = controller.createDomainResolutionViewModel(legacyPayload({
    actions: { can_create_lead_inside_extension: true },
  }))
  assert.equal(legacyCreate.capabilities.can_create_lead, true)

  const nonBoolean = controller.createDomainResolutionViewModel(legacyPayload({
    actions: { can_analyze_conversation: 'true', can_apply_suggestion: 1 },
  }))
  assert.equal(nonBoolean.capabilities.can_analyze_conversation, false)
  assert.equal(nonBoolean.capabilities.can_apply_suggestion, false)
})

test('flags permitidas preservadas; somente true explícito conta', () => {
  const viewModel = controller.createDomainResolutionViewModel(legacyPayload({
    flags: { is_closed: true, is_owned_by_me: 'yes', is_pool: true, is_secret: true },
  }))
  assert.deepEqual({ ...viewModel.flags }, { is_closed: true, is_owned_by_me: false, is_pool: true })
})

test('privacidade: todos os campos proibidos são descartados do ViewModel serializado', () => {
  const raw = {
    status: 'OWNED_BY_ME',
    user_message: 'ok',
    phone: '5511900000001',
    phone_variants: ['5511900000002', '11900000003'],
    lead_id: 'LEAD-ID-SENTINEL-TOP',
    lead: {
      id: 'LEAD-ID-SENTINEL',
      name: 'Nome Permitido',
      phone: '5511900000004',
      email: 'sentinel-email@example.com',
      cpf_cnpj: '98765432100',
    },
    lead_profile: { profession: 'SENTINEL-PROFESSION', address_city: 'SENTINEL-CITY' },
    cycle: {
      id: 'cycle-ok',
      status: 'contato',
      owner_name: 'Dono Permitido',
      owner_user_id: 'OWNER-USER-ID-SENTINEL',
      current_group_id: 'GROUP-ID-SENTINEL',
      next_action: 'NEXT-ACTION-SENTINEL',
      next_action_date: '2099-01-01T00:00:00Z',
    },
    actions: {
      can_analyze_conversation: true,
      create_lead_url: 'https://example.test/leads/new?phone=5511900000005&name=SENTINEL-NAME',
      open_yolen_url: 'https://example.test/SENTINEL-OPEN',
      pool_url: 'https://example.test/SENTINEL-POOL',
    },
    flags: { is_closed: false },
    unexpected_secret: 'UNEXPECTED-SECRET-SENTINEL',
  }

  const viewModel =
    controller
      .createDomainResolutionViewModel(
        raw,
      )

  const serialized =
    JSON.stringify(viewModel)

  const forbidden = [
    '5511900000001',
    '5511900000002',
    '11900000003',
    '5511900000004',
    '5511900000005',
    'LEAD-ID-SENTINEL',
    'LEAD-ID-SENTINEL-TOP',
    'sentinel-email@example.com',
    '98765432100',
    'SENTINEL-PROFESSION',
    'SENTINEL-CITY',
    'OWNER-USER-ID-SENTINEL',
    'GROUP-ID-SENTINEL',
    'NEXT-ACTION-SENTINEL',
    '2099-01-01',
    'SENTINEL-NAME',
    'SENTINEL-OPEN',
    'SENTINEL-POOL',
    'UNEXPECTED-SECRET-SENTINEL',
    'example.test',
    'phone',
    'phone_variants',
    'lead_id',
    'email',
    'cpf_cnpj',
    'lead_profile',
    'owner_user_id',
    'current_group_id',
    'next_action',
    'create_lead_url',
    'open_yolen_url',
    'pool_url',
    'unexpected_secret',
    '"id":"LEAD',
  ]
  for (const term of forbidden) {
    assert.ok(!serialized.includes(term), `ViewModel serializado contém "${term}"`)
  }

  assert.equal(viewModel.lead_display.name, 'Nome Permitido')
  assert.equal(viewModel.ownership_display.owner_name, 'Dono Permitido')
  assert.equal(viewModel.cycle.id, 'cycle-ok')
})

test('nenhuma URL é inferida como capability', () => {
  const viewModel = controller.createDomainResolutionViewModel({
    status: 'IN_POOL',
    cycle: { id: 'cycle-1' },
    actions: {
      create_lead_url: 'https://example.test/new',
      open_yolen_url: 'https://example.test/open',
      pool_url: 'https://example.test/pool',
    },
  })
  for (const value of Object.values(viewModel.capabilities)) {
    assert.equal(value, false)
  }
})

test('payload original não é mutado', () => {
  const raw = legacyPayload()
  const snapshot = structuredClone(raw)
  controller.createDomainResolutionViewModel(raw)
  assert.deepEqual(raw, snapshot)
  assert.ok(!Object.isFrozen(raw))
  assert.ok(!Object.isFrozen(raw.cycle))
})

test('ViewModel e objetos aninhados são frozen', () => {
  const viewModel = controller.createDomainResolutionViewModel(legacyPayload())
  for (const value of [
    viewModel,
    viewModel.cycle,
    viewModel.lead_display,
    viewModel.ownership_display,
    viewModel.capabilities,
    viewModel.flags,
  ]) {
    assert.ok(Object.isFrozen(value))
  }
})

for (const status of ['LEAD_WITHOUT_CYCLE', 'SOFT_DELETED', 'MULTIPLE_MATCHES']) {
  test(`Q1: ${status} → RESOLUTION_ERROR, sem workspace e sem fallback`, () => {
    for (const hasTrustedPhone of [true, false]) {
      const outcome = outcomeFor(
        legacyPayload({ status, cycle: { id: 'cycle-1' }, actions: { can_analyze_conversation: true } }),
        { hasTrustedPhone },
      )
      assert.deepEqual({ ...outcome }, {
        state: 'RESOLUTION_ERROR',
        requires_phone_fallback: false,
        workspace_ready: false,
      })
    }
  })
}

test('CONTACT_NOT_LINKED com trustedPhone → RESOLVING + fallback por telefone', () => {
  const outcome = outcomeFor({ status: 'CONTACT_NOT_LINKED' }, { hasTrustedPhone: true })
  assert.deepEqual({ ...outcome }, { state: 'RESOLVING', requires_phone_fallback: true, workspace_ready: false })
})

test('CONTACT_NOT_LINKED sem trustedPhone → NO_CONTACT_EVIDENCE', () => {
  const outcome = outcomeFor({ status: 'CONTACT_NOT_LINKED' }, { hasTrustedPhone: false })
  assert.deepEqual({ ...outcome }, { state: 'NO_CONTACT_EVIDENCE', requires_phone_fallback: false, workspace_ready: false })
  assert.equal(outcomeFor({ status: 'CONTACT_NOT_LINKED' }).state, 'NO_CONTACT_EVIDENCE')
})

test('NOT_FOUND com trustedPhone → NOT_FOUND (criação decidida por outro controller)', () => {
  const outcome = outcomeFor({ status: 'NOT_FOUND' }, { hasTrustedPhone: true })
  assert.deepEqual({ ...outcome }, { state: 'NOT_FOUND', requires_phone_fallback: false, workspace_ready: false })
})

test('NOT_FOUND sem trustedPhone → NO_CONTACT_EVIDENCE', () => {
  assert.equal(outcomeFor({ status: 'NOT_FOUND' }, { hasTrustedPhone: false }).state, 'NO_CONTACT_EVIDENCE')
})

test('status de evidência de telefone ausente/ambígua → NO_CONTACT_EVIDENCE', () => {
  for (const status of ['NO_PHONE_DETECTED', 'PHONE_EVIDENCE_UNAVAILABLE', 'PHONE_EVIDENCE_AMBIGUOUS']) {
    assert.equal(outcomeFor({ status }, { hasTrustedPhone: true }).state, 'NO_CONTACT_EVIDENCE', status)
  }
})

test('erros de transporte/backend/autenticação mapeiam para estados canônicos', () => {
  assert.equal(outcomeFor({ status: 'NETWORK_ERROR' }).state, 'NETWORK_ERROR')
  assert.equal(outcomeFor({ status: 'BACKEND_ERROR' }).state, 'BACKEND_ERROR')
  assert.equal(outcomeFor({ status: 'AUTH_ERROR' }).state, 'NO_SESSION')
})

for (const status of ['OWNED_BY_ME', 'IN_POOL', 'OWNED_BY_OTHER', 'CLOSED_CYCLE']) {
  test(`${status} preserva o estado comercial`, () => {
    const outcome = outcomeFor(legacyPayload({ status }), { hasTrustedPhone: true })
    assert.equal(outcome.state, status)
    assert.equal(outcome.requires_phone_fallback, false)
  })
}

test('Q2: workspace TRUE somente com cycle.id + can_analyze_conversation=true + is_closed=false', () => {
  const ready = controller.createDomainResolutionViewModel(legacyPayload())
  assert.equal(controller.canOpenWorkspace(ready), true)
  assert.equal(controller.deriveCanonicalResolutionOutcome(ready).workspace_ready, true)
})

test('Q2: workspace FALSE sem cycle.id', () => {
  const viewModel = controller.createDomainResolutionViewModel(legacyPayload({ cycle: { status: 'contato' } }))
  assert.equal(viewModel.cycle.id, null)
  assert.equal(controller.canOpenWorkspace(viewModel), false)
  assert.equal(controller.deriveCanonicalResolutionOutcome(viewModel).workspace_ready, false)
})

test('Q2: workspace FALSE com can_analyze_conversation=false', () => {
  const viewModel = controller.createDomainResolutionViewModel(
    legacyPayload({ actions: { can_analyze_conversation: false } }),
  )
  assert.equal(controller.canOpenWorkspace(viewModel), false)
  assert.equal(controller.deriveCanonicalResolutionOutcome(viewModel).workspace_ready, false)
})

test('Q2: workspace FALSE com is_closed=true', () => {
  const viewModel = controller.createDomainResolutionViewModel(
    legacyPayload({ flags: { is_closed: true } }),
  )
  assert.equal(controller.canOpenWorkspace(viewModel), false)
  assert.equal(controller.deriveCanonicalResolutionOutcome(viewModel).workspace_ready, false)
  assert.equal(controller.canOpenWorkspace(null), false)
})

test('Q2: OWNED_BY_OTHER autorizado abre workspace; CLOSED_CYCLE com analyze=true nunca abre', () => {
  const ownedByOther = outcomeFor(legacyPayload({
    status: 'OWNED_BY_OTHER',
    cycle: { id: 'cycle-other' },
    actions: { can_analyze_conversation: true },
    flags: { is_closed: false },
  }))
  assert.equal(ownedByOther.state, 'OWNED_BY_OTHER')
  assert.equal(ownedByOther.workspace_ready, true)

  const closed = outcomeFor(legacyPayload({
    status: 'CLOSED_CYCLE',
    cycle: { id: 'cycle-closed' },
    actions: { can_analyze_conversation: true },
    flags: { is_closed: true },
  }))
  assert.equal(closed.state, 'CLOSED_CYCLE')
  assert.equal(closed.workspace_ready, false)
})

test('Q2: IN_POOL sem capability não abre workspace', () => {
  const inPool = outcomeFor(legacyPayload({
    status: 'IN_POOL',
    cycle: { id: 'cycle-pool' },
    actions: { can_analyze_conversation: false },
  }))
  assert.equal(inPool.state, 'IN_POOL')
  assert.equal(inPool.workspace_ready, false)
})

test('status desconhecido ou ausente → RESOLUTION_ERROR', () => {
  for (const status of ['SOMETHING_NEW', '', null, undefined]) {
    assert.equal(outcomeFor({ status }).state, 'RESOLUTION_ERROR', String(status))
  }
  assert.equal(controller.deriveCanonicalResolutionOutcome(null).state, 'RESOLUTION_ERROR')
})

test('duas chamadas não compartilham objetos mutáveis', () => {
  const first = controller.createDomainResolutionViewModel(legacyPayload())
  const second = controller.createDomainResolutionViewModel(legacyPayload())
  assert.notEqual(first, second)
  assert.notEqual(first.cycle, second.cycle)
  assert.notEqual(first.capabilities, second.capabilities)
  assert.notEqual(first.flags, second.flags)
  assert.deepEqual(first, second)

  const outcomeA = controller.deriveCanonicalResolutionOutcome(first)
  const outcomeB = controller.deriveCanonicalResolutionOutcome(second)
  assert.notEqual(outcomeA, outcomeB)
  assert.ok(Object.isFrozen(outcomeA))
})

test('módulo é platform-neutral', () => {
  const forbidden = [
    'web.whatsapp.com',
    'app.manychat.com',
    'subscriber_id',
    'wa_id',
    'JID',
    'React Fiber',
    'document',
    'querySelector',
    'MutationObserver',
    'chrome',
    'browser',
    'WhatsApp',
    'ManyChat',
  ]
  for (const term of forbidden) {
    assert.ok(!moduleSource.includes(term), `companion-lead-resolution-controller.js contém "${term}"`)
  }
  assert.doesNotMatch(moduleSource, /\.\.\.\s*payload\b/, 'nenhum spread de payload bruto')
})

test('controller está composto antes do content-script no runtime real', () => {
  assert.match(
    contentScriptSource,
    /YolenCompanionLeadResolutionController/,
  )

  assert.match(
    contentScriptSource,
    /if\s*\(\s*!leadResolutionController\s*\)/,
  )

  const whatsappEntry =
    manifest.content_scripts.find(
      (entry) =>
        entry.js?.includes(
          'src/content-script.js',
        ),
    )

  assert.ok(whatsappEntry)

  const boundaryIndex =
    whatsappEntry.js.indexOf(
      'src/companion-conversation-boundary.js',
    )

  const controllerIndex =
    whatsappEntry.js.indexOf(
      'src/companion-lead-resolution-controller.js',
    )

  const workspaceIndex =
    whatsappEntry.js.indexOf(
      'src/companion-workspace-runtime.js',
    )

  const contentScriptIndex =
    whatsappEntry.js.indexOf(
      'src/content-script.js',
    )

  for (const index of [
    boundaryIndex,
    controllerIndex,
    workspaceIndex,
    contentScriptIndex,
  ]) {
    assert.notEqual(index, -1)
  }

  assert.ok(
    boundaryIndex < controllerIndex,
  )

  assert.ok(
    controllerIndex < workspaceIndex,
  )

  assert.ok(
    workspaceIndex < contentScriptIndex,
  )

  assert.match(
    buildScriptSource,
    /src\/companion-lead-resolution-controller\.js/,
  )

  const harnessControllerIndex =
    harnessSource.indexOf(
      "'companion-lead-resolution-controller.js'",
    )

  const harnessWorkspaceIndex =
    harnessSource.indexOf(
      "'companion-workspace-runtime.js'",
    )

  assert.notEqual(
    harnessControllerIndex,
    -1,
  )

  assert.notEqual(
    harnessWorkspaceIndex,
    -1,
  )

  assert.ok(
    harnessControllerIndex <
      harnessWorkspaceIndex,
  )
})

test('wiring normaliza resolução bem-sucedida para o ViewModel canônico', () => {
  assert.match(
    contentScriptSource,
    /const resolutionViewModel\s*=\s*leadResolutionController\s*\.createDomainResolutionViewModel\(\s*result\.payload,\s*\)/,
  )

  assert.match(
    contentScriptSource,
    /leadResolution:\s*result\.payload,\s*leadResolutionViewModel:\s*resolutionViewModel,/,
  )

  assert.doesNotMatch(
    contentScriptSource,
    /leadResolutionViewModel:\s*result\.payload/,
  )

  assert.doesNotMatch(
    contentScriptSource,
    /leadResolutionController\.deriveCanonicalResolutionOutcome/,
  )

  assert.doesNotMatch(
    contentScriptSource,
    /leadResolutionController\.canOpenWorkspace/,
  )
})

const RESOLVED_CONTEXT_FIELDS = [
  'leadResolution',
  'leadResolutionViewModel',
  'leadResolutionOutcome',
  'leadResolutionBoundaryToken',
]

function sliceBetween(
  source,
  startMarker,
  endMarker,
  fromIndex = 0,
) {
  const start =
    source.indexOf(
      startMarker,
      fromIndex,
    )

  assert.notEqual(
    start,
    -1,
    `marcador inicial não encontrado: ${startMarker}`,
  )

  const end =
    source.indexOf(
      endMarker,
      start + startMarker.length,
    )

  assert.notEqual(
    end,
    -1,
    `marcador final não encontrado: ${endMarker}`,
  )

  return source.slice(
    start,
    end,
  )
}

function assertClearsResolvedContext(
  block,
  label,
) {
  for (const field of RESOLVED_CONTEXT_FIELDS) {
    assert.match(
      block,
      new RegExp(`\\b${field}:\\s*null`),
      `${label} precisa limpar ${field}`,
    )
  }
}

test('contexto de resolução é invalidado nos resets e só é preservado na mesma boundary durante re-resolução', () => {
  const resolveStart =
    contentScriptSource.indexOf(
      'async function resolveCurrentLead()',
    )

  assert.notEqual(
    resolveStart,
    -1,
  )

  assertClearsResolvedContext(
    sliceBetween(
      contentScriptSource,
      'let state = {',
      'leadResolutionError',
    ),
    'state inicial',
  )

  assertClearsResolvedContext(
    sliceBetween(
      contentScriptSource,
      'function hardResetConversationWorkspace()',
      'leadResolutionError',
    ),
    'hardResetConversationWorkspace()',
  )

  assertClearsResolvedContext(
    sliceBetween(
      contentScriptSource,
      'if (!state.conversationPhone) {',
      'const phoneAtRequest',
      resolveStart,
    ),
    'resolveCurrentLead() sem telefone',
  )

  assertClearsResolvedContext(
    sliceBetween(
      contentScriptSource,
      '!result.payload?.ok',
      'enqueueRetainedPreResolutionCapture(',
      resolveStart,
    ),
    'resposta de resolução com erro',
  )

  const successIndex =
    contentScriptSource.indexOf(
      'leadResolution: result.payload,',
      resolveStart,
    )

  assert.notEqual(
    successIndex,
    -1,
  )

  assertClearsResolvedContext(
    sliceBetween(
      contentScriptSource,
      '} catch (error) {',
      'Erro ao localizar lead na Yolen.',
      successIndex,
    ),
    'catch de resolveCurrentLead()',
  )

  assertClearsResolvedContext(
    sliceBetween(
      contentScriptSource,
      '...(companyChanged',
      ': {}),',
    ),
    'companyChanged',
  )

  const startBlock =
    sliceBetween(
      contentScriptSource,
      'const canPreserveResolvedContext',
      'renderPanel()',
      resolveStart,
    )

  assert.match(
    startBlock,
    /conversationBoundary\s*\.isTokenCurrent\(\s*state\.leadResolutionBoundaryToken,?\s*\)/,
  )

  for (const field of RESOLVED_CONTEXT_FIELDS) {
    assert.match(
      startBlock,
      new RegExp(
        `\\b${field}:\\s*canPreserveResolvedContext\\s*\\?\\s*state\\.${field}\\s*:\\s*null`,
      ),
      `início da re-resolução só preserva ${field} com token da boundary atual`,
    )

    assert.doesNotMatch(
      startBlock,
      new RegExp(`\\b${field}:\\s*null`),
      `início da re-resolução não pode limpar ${field} incondicionalmente`,
    )
  }

  assert.match(
    contentScriptSource,
    /leadResolutionOutcome:\s*resolutionOutcome,\s*leadResolutionBoundaryToken:\s*boundaryTokenAtRequest,/,
  )
})

test('display seller-facing básico do contato consome somente o DomainResolutionViewModel', () => {
  const statusDisplayStart =
    contentScriptSource.indexOf(
      'function getLeadStatusClass()',
    )

  const statusDisplayEnd =
    contentScriptSource.indexOf(
      'function openYolen(path)',
      statusDisplayStart,
    )

  assert.notEqual(
    statusDisplayStart,
    -1,
  )

  assert.notEqual(
    statusDisplayEnd,
    -1,
  )

  const statusDisplayBlock =
    contentScriptSource.slice(
      statusDisplayStart,
      statusDisplayEnd,
    )

  const compactDisplayStart =
    contentScriptSource.indexOf(
      'function getCompactConversationName()',
    )

  const compactDisplayEnd =
    contentScriptSource.indexOf(
      'function getCompactFooterHtml()',
      compactDisplayStart,
    )

  assert.notEqual(
    compactDisplayStart,
    -1,
  )

  assert.notEqual(
    compactDisplayEnd,
    -1,
  )

  const compactDisplayBlock =
    contentScriptSource.slice(
      compactDisplayStart,
      compactDisplayEnd,
    )

  for (const block of [
    statusDisplayBlock,
    compactDisplayBlock,
  ]) {
    assert.match(
      block,
      /state\.leadResolutionViewModel/,
    )

    assert.doesNotMatch(
      block,
      /state\.leadResolution\b/,
    )

    assert.doesNotMatch(
      block,
      /phone_variants/,
    )

    assert.doesNotMatch(
      block,
      /resolution\.lead\??\./,
    )

    assert.doesNotMatch(
      block,
      /cycle\??\.owner_name/,
    )
  }

  assert.match(
    statusDisplayBlock,
    /lead_display/,
  )

  assert.match(
    statusDisplayBlock,
    /ownership_display/,
  )

  assert.match(
    compactDisplayBlock,
    /lead_display/,
  )

  assert.match(
    compactDisplayBlock,
    /ownership_display/,
  )
})

test('runtime materializa e invalida o Canonical Resolution Outcome', () => {
  assert.match(
    contentScriptSource,
    /const resolutionOutcome\s*=\s*leadResolutionController\s*\.deriveCanonicalResolutionOutcome\(\s*resolutionViewModel,\s*\{\s*hasTrustedPhone:\s*Boolean\(phoneAtRequest\),?\s*\},?\s*\)/,
  )

  assert.match(
    contentScriptSource,
    /leadResolutionOutcome:\s*resolutionOutcome/,
  )

  const normalizerIndex =
    contentScriptSource.indexOf(
      '.createDomainResolutionViewModel(',
    )

  const outcomeIndex =
    contentScriptSource.indexOf(
      '.deriveCanonicalResolutionOutcome(',
    )

  const assignmentIndex =
    contentScriptSource.indexOf(
      'leadResolutionOutcome:',
      outcomeIndex,
    )

  assert.ok(
    normalizerIndex >= 0,
  )

  assert.ok(
    outcomeIndex >
      normalizerIndex,
  )

  assert.ok(
    assignmentIndex >
      outcomeIndex,
  )
})

test('eligibility de análise e aplicação usa resolução canônica', () => {
  const analyzeStart =
    contentScriptSource.indexOf(
      'function canAnalyzeCurrentConversation()',
    )

  const analyzeEnd =
    contentScriptSource.indexOf(
      'function isOpenSuggestionStatus(',
      analyzeStart,
    )

  assert.notEqual(
    analyzeStart,
    -1,
  )

  assert.notEqual(
    analyzeEnd,
    -1,
  )

  const analyzeBlock =
    contentScriptSource.slice(
      analyzeStart,
      analyzeEnd,
    )

  assert.match(
    analyzeBlock,
    /state[\s\S]*leadResolutionOutcome[\s\S]*workspace_ready/,
  )

  assert.doesNotMatch(
    analyzeBlock,
    /leadResolution\??\.cycle/,
  )

  assert.doesNotMatch(
    analyzeBlock,
    /can_analyze_conversation/,
  )

  const applyStart =
    contentScriptSource.indexOf(
      'function canApplyCurrentSuggestion()',
    )

  const applyEnd =
    contentScriptSource.indexOf(
      'function getAnalysisStatusClass()',
      applyStart,
    )

  assert.notEqual(
    applyStart,
    -1,
  )

  assert.notEqual(
    applyEnd,
    -1,
  )

  const applyBlock =
    contentScriptSource.slice(
      applyStart,
      applyEnd,
    )

  assert.match(
    applyBlock,
    /leadResolutionViewModel[\s\S]*capabilities[\s\S]*can_apply_suggestion/,
  )

  assert.doesNotMatch(
    applyBlock,
    /leadResolution[\s\S]*actions[\s\S]*can_apply_suggestion/,
  )
})

test('apply suggestion sincroniza o ViewModel canônico com a etapa atualizada', () => {
  const start =
    contentScriptSource.indexOf(
      'async function applyCurrentSuggestion()',
    )

  const end =
    contentScriptSource.indexOf(
      'function startSessionAutoRefresh()',
      start,
    )

  assert.notEqual(
    start,
    -1,
  )

  assert.notEqual(
    end,
    -1,
  )

  const block =
    contentScriptSource.slice(
      start,
      end,
    )

  assert.match(
    block,
    /const updatedLeadResolution\s*=/,
  )

  assert.match(
    block,
    /status:\s*applied\.status/,
  )

  assert.match(
    block,
    /createDomainResolutionViewModel\(\s*updatedLeadResolution,\s*\)/,
  )

  assert.match(
    block,
    /leadResolution:\s*updatedLeadResolution/,
  )

  assert.match(
    block,
    /leadResolutionViewModel:\s*updatedResolutionViewModel/,
  )

  assert.doesNotMatch(
    block,
    /leadResolutionViewModel:\s*state\.leadResolutionViewModel/,
  )
})

test('seller message eligibility depende do workspace canônico', () => {
  const start =
    contentScriptSource.indexOf(
      'function isSellerWorkspaceReady()',
    )

  const end =
    contentScriptSource.indexOf(
      'function getSellerInformationArchitectureHtml()',
      start,
    )

  assert.notEqual(
    start,
    -1,
  )

  assert.notEqual(
    end,
    -1,
  )

  const block =
    contentScriptSource.slice(
      start,
      end,
    )

  assert.match(
    block,
    /leadResolutionOutcome[\s\S]*workspace_ready/,
  )

  assert.match(
    block,
    /leadResolutionViewModel[\s\S]*cycle[\s\S]*id/,
  )

  assert.match(
    block,
    /isSellerWorkspaceReady\(\)/,
  )

  assert.doesNotMatch(
    block,
    /state\.leadResolution\b/,
  )
})

test('shell seller-facing só apresenta as quatro áreas com WORKSPACE_READY', () => {
  const architectureStart =
    contentScriptSource.indexOf(
      'function getSellerInformationArchitectureHtml()',
    )

  const architectureEnd =
    contentScriptSource.indexOf(
      'function setActiveSellerArea(',
      architectureStart,
    )

  const architectureBlock =
    contentScriptSource.slice(
      architectureStart,
      architectureEnd,
    )

  assert.match(
    architectureBlock,
    /if\s*\(\s*!isSellerWorkspaceReady\(\)\s*\)/,
  )

  assert.match(
    architectureBlock,
    /return\s+''/,
  )

  const renderStart =
    contentScriptSource.indexOf(
      'function renderPanel()',
    )

  const renderBlock =
    contentScriptSource.slice(
      renderStart,
    )

  assert.match(
    renderBlock,
    /'seller-area-tabs'[\s\S]*isSellerWorkspaceReady\(\)[\s\S]*getSellerAreaTabsBarHtml/,
  )
})

test('lead action presenter decide status pelo ViewModel canônico', () => {
  const start =
    contentScriptSource.indexOf(
      'function getLeadActionButton()',
    )

  const end =
    contentScriptSource.indexOf(
      '// ---------------------------------------------------------------------',
      start,
    )

  assert.notEqual(
    start,
    -1,
  )

  assert.notEqual(
    end,
    -1,
  )

  const block =
    contentScriptSource.slice(
      start,
      end,
    )

  assert.match(
    block,
    /state\.leadResolutionViewModel/,
  )

  assert.doesNotMatch(
    block,
    /state\.leadResolution\b/,
  )

  assert.match(
    block,
    /resolution\.status\s*===\s*'NOT_FOUND'/,
  )

  assert.match(
    block,
    /resolution\.status\s*===\s*'IN_POOL'/,
  )
})
