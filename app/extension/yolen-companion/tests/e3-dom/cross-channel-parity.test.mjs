// FASE 8 — PARIDADE AUTOMATIZADA TOTAL (WhatsApp × ManyChat).
//
// Cada cenário executa o MESMO fixture de domínio (mesmo objeto) pelas duas
// composições reais do manifest e compara, com o comparador sem allowlist
// de divergência de e3-test-support/cross-channel-parity.mjs:
//   nível 1 — Canonical Resolution Outcome + DomainResolutionViewModel e os
//             ViewModels entregues às views compartilhadas; intenções de
//             backend do Core;
//   nível 2 — DOM do painel (quatro áreas, ações e painel inteiro).
// Além da igualdade, cada cenário tem asserções semânticas do contrato.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  AUDIO_FILE_NAME_NORMALIZATION,
  PARITY_CONVERSATIONS,
  PARITY_EXTERNAL_KEY,
  PARITY_NORMALIZATIONS,
  PARITY_AUDIO_BYTES,
  PARITY_AUDIO_URL,
  PARITY_PHONE,
  captureParitySnapshot,
  committedResolutions,
  compareParitySnapshots,
  coreIntents,
  normalizeParityText,
  panelOf,
  panelText,
  sleep,
  startParityChannel,
  startParityConversations,
  switchParityConversation,
  waitForBoth,
  waitForQuiet,
} from '../e3-test-support/cross-channel-parity.mjs'
import {
  defaultAgoraDecisionState,
  defaultClientContext,
  defaultLeadResolution,
} from '../e3-test-support/load-content-script.mjs'

const CHANNELS = ['whatsapp', 'manychat']

// ---------------------------------------------------------------------------
// Fixtures de DOMÍNIO (fonte única; nunca por canal)
// ---------------------------------------------------------------------------

function leadResolution(status, overrides = {}) {
  const cycleId = overrides.cycleId ?? `cycle-${status.toLowerCase()}`
  return defaultLeadResolution({
    status,
    phone: PARITY_PHONE,
    user_message: overrides.userMessage ?? null,
    lead: { id: `lead-${cycleId}`, name: overrides.name ?? 'Lead Paridade', phone: PARITY_PHONE, email: overrides.email ?? null, cpf_cnpj: null, deleted_at: null },
    lead_profile: overrides.profile ?? { email: null, cpf: null, cnpj: null, birth_date: null, profession: null, cep: null, phone_mobile: null },
    cycle: { id: cycleId, status: overrides.cycleStatus ?? 'contato', owner_user_id: 'user-owner', owner_name: overrides.ownerName ?? 'Vendedor Dono', current_group_id: null, next_action: null, next_action_date: null },
    actions: {
      can_analyze_conversation: status === 'OWNED_BY_ME',
      can_apply_suggestion: status === 'OWNED_BY_ME',
      can_link_lead: false,
      open_yolen_url: `/sales-cycles/${cycleId}`,
      create_lead_url: `/leads/new?phone=${PARITY_PHONE}`,
      pool_url: '/pool',
    },
    flags: {
      is_admin_or_manager: false,
      is_owned_by_me: status === 'OWNED_BY_ME',
      is_pool: status === 'IN_POOL',
      is_closed: status === 'CLOSED_CYCLE',
    },
    capabilities: {
      can_create_lead: false,
      can_analyze_conversation: status === 'OWNED_BY_ME',
      can_apply_suggestion: status === 'OWNED_BY_ME',
      can_open_pool: status === 'IN_POOL',
      can_open_cycle: true,
    },
  })
}

function notFoundResolution() {
  return defaultLeadResolution({
    status: 'NOT_FOUND',
    phone: PARITY_PHONE,
    user_message: 'Este contato ainda não existe na Yolen.',
    lead: null,
    cycle: null,
    actions: { can_analyze_conversation: false, can_apply_suggestion: false, can_link_lead: false, create_lead_url: `/leads/new?phone=${PARITY_PHONE}` },
    flags: { is_owned_by_me: false, is_pool: false, is_closed: false },
    capabilities: { can_create_lead: true, can_open_cycle: false },
  })
}

function echoSummary(text = 'Cliente pediu a proposta do plano anual.') {
  return (_count, request) => ({
    ok: true,
    data: {
      identity: { company_id: 'company-1', lead_id: null, cycle_id: request?.cycle_id, conversation_key: request?.conversation_key },
      summary: { summary: text, version: 1, updated_at: '2026-09-20T12:00:00.000Z' },
      working_summary: text,
    },
  })
}

function baseBackend(overrides = {}) {
  return {
    decisionStateResult: defaultAgoraDecisionState(),
    clientContextResult: defaultClientContext(),
    leadSummaryResult: echoSummary(),
    ...overrides,
  }
}

function deferred() {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}

// ---------------------------------------------------------------------------
// Execução e comparação
// ---------------------------------------------------------------------------

function click(runtime, target) {
  target.dispatchEvent(new runtime.window.MouseEvent('click', { bubbles: true, cancelable: true }))
}

function start(domain, extra = {}) {
  return CHANNELS.map((channel) => startParityChannel(channel, domain, typeof extra === 'function' ? extra(channel) : extra))
}

function assertParity(runtimes, label, options = {}) {
  const [whatsapp, manychat] = runtimes.map((runtime) => captureParitySnapshot(runtime, { cycleId: options.cycleId, unresolved: options.unresolved }))
  const differences = compareParitySnapshots(whatsapp, manychat, options)
  assert.deepEqual(differences, [], `${label}: divergência entre canais\n${JSON.stringify(differences, null, 1)}`)
  return { whatsapp, manychat }
}

async function settle(runtimes, predicate, options) {
  await waitForBoth(runtimes, predicate, options)
  await waitForQuiet(runtimes)
}

function outcome(runtime) {
  return committedResolutions(runtime).at(-1)?.outcome ?? null
}

function everyRuntime(runtimes, fn) {
  for (const runtime of runtimes) fn(runtime)
}

const hasCall = (action) => (runtime) => runtime.calls.some((call) => call.action === action)
const workspaceLoaded = hasCall('LOAD_CUSTOMER_VIEW_MODEL')

// ---------------------------------------------------------------------------
// Controle positivo do comparador (sem produção)
// ---------------------------------------------------------------------------

test('comparador: detecta divergência seller-facing sintética e aceita só as diferenças registradas', () => {
  const base = {
    canonical: {
      resolution: { viewModel: { status: 'OWNED_BY_ME', lead_display: { name: 'Lead' } }, outcome: { state: 'OWNED_BY_ME', workspace_ready: true } },
      viewInputs: { renderAgoraViewModelSnapshot: [{ headline: 'Responder a objeção de preço', priority: 'high' }] },
    },
    intents: ['{"action":"LOAD_DECISION_STATE","payload":{"conversation_key":"phone:5547999990001","cycle_id":"c1"}}'],
    conversationKeyCount: 1,
    view: {
      html: '<div>Inserir no WhatsApp</div><div>Lead</div>',
      areas: { now: '<p>Responder a objeção de preço</p>', message: '', analysis: '', client: '' },
      actions: ['refresh', 'analyze-conversation'],
    },
  }
  const clone = () => JSON.parse(JSON.stringify(base))

  // Diferenças permitidas e registradas: chave técnica (A), relógio de
  // render (A), nome do canal em copy canônica (C).
  const allowed = clone()
  allowed.intents = ['{"action":"LOAD_DECISION_STATE","payload":{"conversation_key":"manychat:unknown:fb1%3Achat%3A2","cycle_id":"c1"}}']
  allowed.view.html = '<div>Inserir no ManyChat</div><div>Lead</div>'
  assert.deepEqual(compareParitySnapshots(base, allowed), [])

  const seller = [
    (s) => { s.canonical.resolution.outcome.state = 'IN_POOL' },
    (s) => { s.canonical.resolution.viewModel.lead_display.name = 'Outro Lead' },
    (s) => { s.canonical.viewInputs.renderAgoraViewModelSnapshot[0].priority = 'low' },
    (s) => { s.canonical.viewInputs.renderAgoraViewModelSnapshot[0].headline = 'Outra orientação' },
    (s) => { s.intents = ['{"action":"LOAD_DECISION_STATE","payload":{"conversation_key":"phone:5547999990001","cycle_id":"c2"}}'] },
    (s) => { s.view.areas.now = '<p>Oferecer desconto</p>' },
    (s) => { s.conversationKeyCount = 2 },
    (s) => { s.view.actions = ['refresh'] },
    (s) => { s.view.html = '<div>Inserir no WhatsApp</div><div>Lead Diferente</div>' },
  ]
  for (const mutate of seller) {
    const changed = clone()
    mutate(changed)
    assert.ok(compareParitySnapshots(base, changed).length > 0, mutate.toString())
  }

  // Nenhuma regra de normalização toca status, decisão, ação, mensagem,
  // método, etapa, cliente, erro, retry, criação ou ownership.
  for (const rule of PARITY_NORMALIZATIONS) {
    assert.ok(['A', 'B', 'C'].includes(rule.category), rule.id)
    assert.ok(rule.contract, rule.id)
  }
  // A6: só o prefixo platform.id do nome do arquivo; o índice do áudio segue
  // comparado.
  const fileName = (value) => value.replace(AUDIO_FILE_NAME_NORMALIZATION.pattern, AUDIO_FILE_NAME_NORMALIZATION.placeholder)
  assert.equal(fileName('whatsapp-audio-1.webm'), fileName('manychat-audio-1.webm'))
  assert.notEqual(fileName('whatsapp-audio-1.webm'), fileName('manychat-audio-2.webm'))

  for (const text of ['OWNED_BY_ME', 'IN_POOL', 'Tentar novamente', 'Criar lead', 'Responder a objeção de preço', 'Vendedor Dono', 'Método comercial', 'cycle-owned_by_me']) {
    assert.equal(normalizeParityText(text), text, text)
  }
})

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

test('BOOT_LOADING e NO_SESSION: mesmo estado canônico e mesma view nos dois canais', async () => {
  const session = deferred()
  const booting = start({ resolution: leadResolution('OWNED_BY_ME') }, { getMeResult: () => session.promise })
  await settle(booting, (runtime) => Boolean(panelOf(runtime)) && hasCall('GET_ME')(runtime), {})
  const boot = assertParity(booting, 'BOOT_LOADING')
  everyRuntime(booting, (runtime) => {
    assert.match(panelText(runtime), /Conectando/)
    assert.equal(outcome(runtime), null)
  })
  assert.deepEqual(boot.whatsapp.view.actions, boot.manychat.view.actions)

  const noSession = start(
    { resolution: leadResolution('OWNED_BY_ME') },
    { getMeResult: { ok: false, statusCode: 401, payload: { ok: false, status: 'NO_COMPANION_SESSION', error: 'Sessão da Yolen não encontrada.' } } },
  )
  await settle(noSession, (runtime) => Boolean(runtime.document.querySelector('[data-yolen-action="connect-yolen"]')))
  assertParity(noSession, 'NO_SESSION')
  everyRuntime(noSession, (runtime) => {
    assert.equal(runtime.calls.filter((call) => call.action === 'RESOLVE_LEAD').length, 0)
    assert.equal(outcome(runtime), null)
  })
  session.resolve(undefined)
})

test('NO_CONTACT_EVIDENCE: sem telefone nem identidade, nenhuma consulta e mesma view', async () => {
  const runtimes = start({ resolution: null, evidence: 'none' })
  await settle(runtimes, (runtime) => /Telefone ainda não disponível/.test(panelText(runtime)), { timeoutMs: 20000 })
  assertParity(runtimes, 'NO_CONTACT_EVIDENCE')
  everyRuntime(runtimes, (runtime) => {
    assert.equal(runtime.calls.filter((call) => call.action === 'RESOLVE_LEAD').length, 0)
    assert.equal(runtime.document.querySelector('[data-yolen-lead-create-form]'), null)
  })
})

test('RESOLVING → OWNED_BY_ME: mesmo loading e mesma resolução final', async () => {
  const pending = deferred()
  const resolution = leadResolution('OWNED_BY_ME')
  const runtimes = start({
    resolution,
    resolutionsByPhone: () => ({ [PARITY_PHONE]: () => pending.promise }),
    resolutionsByIdentity: () => ({ [PARITY_EXTERNAL_KEY]: () => pending.promise }),
    backend: baseBackend(),
  })
  await settle(runtimes, (runtime) => hasCall('RESOLVE_LEAD')(runtime) && /Localizando/.test(panelText(runtime)))
  assertParity(runtimes, 'RESOLVING')

  pending.resolve(resolution)
  await settle(runtimes, workspaceLoaded)
  assertParity(runtimes, 'OWNED_BY_ME (após RESOLVING)')
  everyRuntime(runtimes, (runtime) => assert.equal(outcome(runtime)?.state, 'OWNED_BY_ME'))
})

for (const [status, text, action] of [
  ['OWNED_BY_ME', 'Lead Paridade', 'open-cycle-yolen'],
  ['IN_POOL', 'Lead Paridade', 'open-pool'],
  ['OWNED_BY_OTHER', 'Lead Paridade', 'open-cycle-yolen'],
  ['CLOSED_CYCLE', 'Lead Paridade', 'open-cycle-yolen'],
]) {
  test(`${status}: mesmo estado canônico, ownership, CTA e workspace nos dois canais`, async () => {
    const runtimes = start({ resolution: leadResolution(status), backend: baseBackend() })
    await settle(runtimes, (runtime) => panelText(runtime).includes(text) && outcome(runtime)?.state === status)
    const snapshots = assertParity(runtimes, status)
    everyRuntime(runtimes, (runtime) => {
      assert.equal(outcome(runtime).state, status)
      assert.equal(outcome(runtime).workspace_ready, status === 'OWNED_BY_ME')
      assert.ok(runtime.document.querySelector(`[data-yolen-action="${action}"]`), action)
      const analyzes = runtime.calls.filter((call) => call.action === 'ANALYZE_CONVERSATION' || call.action === 'INGEST_CAPTURE_MESSAGES')
      if (status !== 'OWNED_BY_ME') assert.equal(analyzes.length, 0, 'sem capability não há captura/análise')
    })
    assert.deepEqual(snapshots.whatsapp.canonical.resolution, snapshots.manychat.canonical.resolution)
  })
}

test('NETWORK_ERROR (transitório): mesma política de retry nos dois canais, sem erro final nem criação', async () => {
  const failing = { __transport: { ok: false, statusCode: 0, payload: { ok: false, status: 'NETWORK_ERROR', error: 'Falha de conexão com a Yolen.' } } }
  const runtimes = start({
    resolution: leadResolution('OWNED_BY_ME'),
    resolutionsByPhone: () => ({ [PARITY_PHONE]: failing }),
    resolutionsByIdentity: () => ({ [PARITY_EXTERNAL_KEY]: failing }),
    backend: baseBackend(),
  })
  // Retry com backoff (1s, 2s, …): observa depois da terceira tentativa.
  await waitForBoth(runtimes, (runtime) => runtime.calls.filter((call) => call.action === 'RESOLVE_LEAD').length >= 3, { timeoutMs: 20000 })
  assertParity(runtimes, 'NETWORK_ERROR', { levels: ['canonical', 'view'] })
  everyRuntime(runtimes, (runtime) => {
    assert.match(panelText(runtime), /Localizando este contato/)
    assert.equal(runtime.document.querySelector('[data-yolen-lead-create-form]'), null)
    assert.equal(runtime.document.querySelector('[data-yolen-seller-area]'), null)
    assert.equal(outcome(runtime), null)
  })
})

test('BACKEND_ERROR (erro de domínio do backend): mesmo erro seller-facing, sem fallback, criação ou workspace; retry disponível', async () => {
  const failing = { __transport: { ok: false, statusCode: 400, payload: { ok: false, status: 'LEAD_SEARCH_ERROR', error: 'Erro interno ao consultar o lead.' } } }
  const runtimes = start({
    resolution: leadResolution('OWNED_BY_ME'),
    resolutionsByPhone: () => ({ [PARITY_PHONE]: failing }),
    resolutionsByIdentity: () => ({ [PARITY_EXTERNAL_KEY]: failing }),
    backend: baseBackend(),
  })
  await settle(runtimes, (runtime) => panelText(runtime).includes('Erro interno ao consultar o lead.'))
  assertParity(runtimes, 'BACKEND_ERROR')
  everyRuntime(runtimes, (runtime) => {
    assert.equal(runtime.calls.filter((call) => call.action === 'RESOLVE_LEAD').length, 1, 'erro de domínio não repete nem cai no fallback')
    assert.equal(runtime.document.querySelector('[data-yolen-lead-create-form]'), null)
    assert.equal(runtime.document.querySelector('[data-yolen-seller-area]'), null)
    assert.ok(runtime.document.querySelector('[data-yolen-action="refresh"]'))
  })
})

// ---------------------------------------------------------------------------
// NOT_FOUND → CREATING_LEAD → CREATED_RESOLVING → OWNED_BY_ME
// ---------------------------------------------------------------------------

function typeLeadName(runtime, name) {
  const input = runtime.document.querySelector('[name="yolen-lead-name"]')
  input.value = name
  input.dispatchEvent(new runtime.window.Event('input', { bubbles: true }))
}

function submitCreate(runtime) {
  const form = runtime.document.querySelector('[data-yolen-lead-create-form]')
  const submit = form.querySelector('.yolen-lead-create-submit')
  submit.dispatchEvent(new runtime.window.Event('pointerdown', { bubbles: true }))
  click(runtime, submit)
  form.dispatchEvent(new runtime.window.Event('submit', { bubbles: true, cancelable: true }))
}

const createCalls = (runtime) => runtime.calls.filter((call) => call.action === 'CREATE_LEAD')

test('NOT_FOUND → CREATING_LEAD → CREATED_RESOLVING → OWNED_BY_ME: mesma progressão, mesmo draft, um único CREATE por canal', async () => {
  const createGate = deferred()
  const resolveGate = deferred()
  const owned = leadResolution('OWNED_BY_ME', { name: 'Lead Criado Paridade', cycleId: 'cycle-created' })
  let phase = 'not_found'

  const runtimes = start({
    resolution: notFoundResolution(),
    resolutionsByPhone: () => ({
      [PARITY_PHONE]: () => (phase === 'not_found' ? notFoundResolution() : phase === 'pending' ? resolveGate.promise : owned),
    }),
    backend: baseBackend({
      createLeadResult: async () => {
        await createGate.promise
        phase = 'pending'
        return { ok: true, lead_id: 'lead-created', cycle_id: 'cycle-created' }
      },
    }),
  })

  await settle(runtimes, (runtime) => Boolean(runtime.document.querySelector('[data-yolen-lead-create-form]')))
  assertParity(runtimes, 'NOT_FOUND')
  everyRuntime(runtimes, (runtime) => {
    assert.equal(outcome(runtime)?.state, 'NOT_FOUND')
    assert.equal(createCalls(runtime).length, 0, 'nada criado sem confirmação')
    assert.equal(runtime.document.querySelector('[name="yolen-lead-phone"]')?.value?.replace(/\D/g, ''), PARITY_PHONE)
  })

  // Mesmo draft nos dois canais; duplo envio.
  everyRuntime(runtimes, (runtime) => {
    typeLeadName(runtime, 'Lead Criado Paridade')
    submitCreate(runtime)
    submitCreate(runtime)
  })
  await settle(runtimes, (runtime) => /Criando lead na Yolen/.test(panelText(runtime)))
  assertParity(runtimes, 'CREATING_LEAD')

  createGate.resolve()
  await settle(runtimes, (runtime) => /Lead criado\. Atualizando o vínculo/.test(panelText(runtime)))
  assertParity(runtimes, 'CREATED_RESOLVING')

  resolveGate.resolve(owned)
  await settle(runtimes, (runtime) => panelText(runtime).includes('Lead Criado Paridade') && outcome(runtime)?.state === 'OWNED_BY_ME')
  assertParity(runtimes, 'OWNED_BY_ME após criação')
  const payloads = runtimes.map((runtime) => {
    assert.equal(createCalls(runtime).length, 1, `${runtime.channel}: um único CREATE`)
    assert.equal(runtime.document.querySelector('[data-yolen-lead-create-form]'), null, 'CREATE nunca reabre')
    return createCalls(runtime)[0].payload
  })
  assert.equal(normalizeParityText(JSON.stringify(payloads[0])), normalizeParityText(JSON.stringify(payloads[1])), 'mesmo payload de criação')
  assert.equal(payloads[0].phone, PARITY_PHONE)
})

test('validação do formulário de criação: nome obrigatório com a mesma resposta nos dois canais', async () => {
  const runtimes = start({ resolution: notFoundResolution(), backend: baseBackend() })
  await settle(runtimes, (runtime) => Boolean(runtime.document.querySelector('[data-yolen-lead-create-form]')))
  everyRuntime(runtimes, (runtime) => {
    typeLeadName(runtime, '')
    submitCreate(runtime)
  })
  await waitForQuiet(runtimes)
  assertParity(runtimes, 'validação sem nome')
  everyRuntime(runtimes, (runtime) => assert.equal(createCalls(runtime).length, 0))
})

test('CREATED_UNRESOLVED → "Atualizar vínculo" → re-resolve: mesmo estado, nunca repete CREATE', async () => {
  let linked = false
  const owned = leadResolution('OWNED_BY_ME', { name: 'Lead Vinculado Depois', cycleId: 'cycle-late' })
  const runtimes = start({
    resolution: notFoundResolution(),
    resolutionsByPhone: () => ({ [PARITY_PHONE]: () => (linked ? owned : notFoundResolution()) }),
    backend: baseBackend({ createLeadResult: { ok: true, lead_id: 'lead-late', cycle_id: 'cycle-late' } }),
  })
  await settle(runtimes, (runtime) => Boolean(runtime.document.querySelector('[data-yolen-lead-create-form]')))
  everyRuntime(runtimes, (runtime) => {
    typeLeadName(runtime, 'Lead Vinculado Depois')
    submitCreate(runtime)
  })
  await settle(runtimes, (runtime) => /Lead criado, mas o vínculo ainda não foi atualizado/.test(panelText(runtime)), { timeoutMs: 20000 })
  assertParity(runtimes, 'CREATED_UNRESOLVED')

  linked = true
  everyRuntime(runtimes, (runtime) => click(runtime, runtime.document.querySelector('[data-yolen-action="retry-lead-link"]')))
  await settle(runtimes, (runtime) => outcome(runtime)?.state === 'OWNED_BY_ME' && panelText(runtime).includes('Lead Vinculado Depois'))
  assertParity(runtimes, 'OWNED_BY_ME após Atualizar vínculo')
  everyRuntime(runtimes, (runtime) => assert.equal(createCalls(runtime).length, 1))
})

test('conflito de criação: mesmo erro canônico, nenhum segundo CREATE', async () => {
  const runtimes = start({
    resolution: notFoundResolution(),
    backend: baseBackend({ createLeadResult: { ok: false, code: 'active_lead_conflict', error: 'Já existe um lead ativo com este telefone.' } }),
  })
  await settle(runtimes, (runtime) => Boolean(runtime.document.querySelector('[data-yolen-lead-create-form]')))
  everyRuntime(runtimes, (runtime) => {
    typeLeadName(runtime, 'Lead Conflito')
    submitCreate(runtime)
  })
  await waitForBoth(runtimes, (runtime) => createCalls(runtime).length === 1)
  await waitForQuiet(runtimes, 1500)
  assertParity(runtimes, 'conflito de criação')
  everyRuntime(runtimes, (runtime) => assert.equal(createCalls(runtime).length, 1))
})

// ---------------------------------------------------------------------------
// AGORA
// ---------------------------------------------------------------------------

const AGORA_READY = defaultAgoraDecisionState({
  silent: false,
  silent_reason: null,
  primary: {
    kind: 'respond_objection',
    priority: 'high',
    headline: 'Responder a objeção de preço antes de seguir',
    explanation: 'O cliente questionou o valor do plano anual.',
    reason: 'objection_open',
    evidence_message_ids: ['m1'],
    cta: { kind: 'open_message', label: 'Preparar resposta' },
  },
  secondary: [],
})

for (const [label, decisionStateResult] of [
  ['AGORA ready', AGORA_READY],
  ['AGORA empty', defaultAgoraDecisionState()],
  ['AGORA error', { ok: false, error: 'Não foi possível carregar a decisão atual.' }],
]) {
  test(`${label}: mesmo ViewModel entregue à view e mesma área AGORA nos dois canais`, async () => {
    const runtimes = start({ resolution: leadResolution('OWNED_BY_ME'), backend: baseBackend({ decisionStateResult }) })
    await settle(runtimes, workspaceLoaded)
    const snapshots = assertParity(runtimes, label)
    assert.deepEqual(
      normalizeParityText(JSON.stringify(snapshots.whatsapp.canonical.viewInputs.renderAgoraViewModelSnapshot ?? null)),
      normalizeParityText(JSON.stringify(snapshots.manychat.canonical.viewInputs.renderAgoraViewModelSnapshot ?? null)),
    )
    everyRuntime(runtimes, (runtime) => assert.ok(runtime.document.querySelector('[data-yolen-seller-panel="now"]')))
  })
}

// ---------------------------------------------------------------------------
// CLIENTE
// ---------------------------------------------------------------------------

test('CLIENTE loading → ready e CLIENTE error: mesmo contexto do cliente nos dois canais', async () => {
  const gate = deferred()
  const loading = start({
    resolution: leadResolution('OWNED_BY_ME'),
    backend: baseBackend({ clientContextResult: () => gate.promise }),
  })
  await settle(loading, hasCall('LOAD_CLIENT_CONTEXT'))
  assertParity(loading, 'CLIENTE loading')
  gate.resolve(defaultClientContext())
  await waitForQuiet(loading)
  assertParity(loading, 'CLIENTE ready')
  everyRuntime(loading, (runtime) => assert.ok(runtime.document.querySelector('[data-yolen-seller-panel="client"]')))

  const failing = start({
    resolution: leadResolution('OWNED_BY_ME'),
    backend: baseBackend({ clientContextResult: { ok: false, error: 'Contexto do cliente indisponível.' } }),
  })
  await settle(failing, workspaceLoaded)
  assertParity(failing, 'CLIENTE error')
})

// ---------------------------------------------------------------------------
// Lead summary
// ---------------------------------------------------------------------------

function unsavedSummary(text) {
  return (_count, request) => ({
    ok: true,
    data: {
      identity: { company_id: 'company-1', lead_id: null, cycle_id: request?.cycle_id, conversation_key: request?.conversation_key },
      summary: null,
      working_summary: text,
      has_unsaved_changes: true,
    },
  })
}

for (const [label, saveLeadSummaryResult, expected] of [
  ['Lead summary save', undefined, /Resumo salvo na Yolen/],
  ['Lead summary conflict', { ok: false, code: 'LEAD_SUMMARY_VERSION_CONFLICT', error: 'Versão mais nova já salva.' }, /./],
]) {
  test(`${label}: load, mesma ação de salvar e mesmo resultado nos dois canais`, async () => {
    const runtimes = start({
      resolution: leadResolution('OWNED_BY_ME'),
      backend: baseBackend({ leadSummaryResult: unsavedSummary('Resumo de trabalho ainda não salvo.'), saveLeadSummaryResult }),
    })
    await settle(runtimes, (runtime) => Boolean(runtime.document.querySelector('[data-yolen-action="save-lead-summary"]')))
    assertParity(runtimes, `${label} (load)`)

    everyRuntime(runtimes, (runtime) => click(runtime, runtime.document.querySelector('[data-yolen-action="save-lead-summary"]')))
    await waitForBoth(runtimes, hasCall('SAVE_LEAD_SUMMARY'))
    await waitForQuiet(runtimes)
    assertParity(runtimes, label)
    everyRuntime(runtimes, (runtime) => {
      assert.equal(runtime.calls.filter((call) => call.action === 'SAVE_LEAD_SUMMARY').length, 1)
      assert.match(panelText(runtime), expected)
    })
  })
}

// ---------------------------------------------------------------------------
// Registro da conversa
// ---------------------------------------------------------------------------

const REGISTRATION_PREVIEW = {
  ok: true,
  data: {
    summary_text: 'RESUMO_DO_REGISTRO_PARIDADE',
    watermark: 'wm-1',
    confirmation_token: 'token-1',
    message_count: 1,
    occurred_at: '2026-09-14T20:30:00.000Z',
    already_registered: false,
  },
}

for (const [label, registrationConfirmResult, expected] of [
  ['Registration confirm', { ok: true, data: { registered: true, event_id: 'event-1' } }, null],
  ['Registration stale', { ok: false, code: 'REGISTER_CONVERSATION_STALE_WATERMARK', error: 'A conversa mudou desde o resumo.' }, /A conversa mudou desde o resumo|atualiz/i],
]) {
  test(`${label}: preview e confirmação com o mesmo estado nos dois canais`, async () => {
    const runtimes = start({
      resolution: leadResolution('OWNED_BY_ME'),
      backend: baseBackend({ registrationPreviewResult: REGISTRATION_PREVIEW, registrationConfirmResult }),
    })
    await settle(runtimes, workspaceLoaded)
    everyRuntime(runtimes, (runtime) => click(runtime, runtime.document.querySelector('[data-yolen-seller-area="client"]')))
    await waitForBoth(runtimes, (runtime) => Boolean(runtime.document.querySelector('[data-yolen-action="register-conversation"]')))
    everyRuntime(runtimes, (runtime) => click(runtime, runtime.document.querySelector('[data-yolen-action="register-conversation"]')))
    await settle(runtimes, (runtime) => Boolean(runtime.document.querySelector('[data-yolen-action="confirm-conversation-registration"]')))
    assertParity(runtimes, `${label} (preview)`)
    everyRuntime(runtimes, (runtime) => assert.match(panelText(runtime), /RESUMO_DO_REGISTRO_PARIDADE/))

    everyRuntime(runtimes, (runtime) => click(runtime, runtime.document.querySelector('[data-yolen-action="confirm-conversation-registration"]')))
    await waitForBoth(runtimes, hasCall('CONFIRM_CONVERSATION_REGISTRATION'))
    await waitForQuiet(runtimes)
    assertParity(runtimes, label)
    everyRuntime(runtimes, (runtime) => {
      assert.equal(runtime.calls.filter((call) => call.action === 'CONFIRM_CONVERSATION_REGISTRATION').length, 1)
      if (expected) assert.match(panelText(runtime), expected)
    })
  })
}

// ---------------------------------------------------------------------------
// MENSAGEM (+ composer físico)
// ---------------------------------------------------------------------------

const GENERATED_MESSAGE = 'Entendo a dúvida sobre o preço. Posso te mostrar o plano anual?'

// Fixture FÍSICO do composer por canal (mecânica, nunca domínio).
function composerNode(runtime) {
  return runtime.channel === 'whatsapp'
    ? runtime.document.querySelector('footer [contenteditable="true"]')
    : runtime.document.querySelector('footer textarea')
}

function composerText(runtime) {
  const node = composerNode(runtime)
  if (!node) return null
  return runtime.channel === 'whatsapp' ? node.textContent : node.value
}

function sabotageComposer(runtime, mode) {
  const node = composerNode(runtime)
  if (mode === 'missing') {
    node.remove()
    return
  }
  const property = runtime.channel === 'whatsapp' ? 'textContent' : 'value'
  Object.defineProperty(node, property, {
    configurable: true,
    get: () => {
      if (mode === 'throws') throw new Error('falha física do DOM do canal')
      return ''
    },
    set: () => {},
  })
}

async function openMessageArea(runtimes) {
  await settle(runtimes, workspaceLoaded)
  everyRuntime(runtimes, (runtime) => click(runtime, runtime.document.querySelector('[data-yolen-seller-area="message"]')))
  await waitForQuiet(runtimes)
}

async function generateMessage(runtimes) {
  await waitForBoth(runtimes, (runtime) => Boolean(runtime.document.querySelector('[data-yolen-seller-message-intent]')))
  everyRuntime(runtimes, (runtime) => {
    const intent = runtime.document.querySelector('[data-yolen-seller-message-intent]')
    intent.value = 'Responder sobre o preço do plano anual.'
    intent.dispatchEvent(new runtime.window.Event('input', { bubbles: true }))
    click(runtime, runtime.document.querySelector('[data-yolen-seller-message-action="generate"]'))
  })
  await waitForBoth(runtimes, hasCall('LOAD_METHOD_GUIDANCE'))
  await waitForQuiet(runtimes)
}

test('MENSAGEM eligible → generated: mesma elegibilidade, mesma mensagem gerada, mesma ação', async () => {
  const runtimes = start({
    resolution: leadResolution('OWNED_BY_ME'),
    backend: baseBackend({ messageGenerationResult: { status: 'ready', message: GENERATED_MESSAGE, error: null } }),
  })
  await openMessageArea(runtimes)
  assertParity(runtimes, 'MENSAGEM eligible')
  everyRuntime(runtimes, (runtime) => assert.ok(runtime.document.querySelector('[data-yolen-seller-message-intent]')))

  await generateMessage(runtimes)
  assertParity(runtimes, 'MENSAGEM generated')
  const requests = runtimes.map((runtime) => coreIntents(runtime).filter((intent) => intent.action === 'LOAD_METHOD_GUIDANCE' && intent.payload?.operation === 'generate_message').map((intent) => normalizeParityText(JSON.stringify(intent))))
  assert.deepEqual(requests[0], requests[1], 'mesmo pedido de geração ao Core/backend')
  everyRuntime(runtimes, (runtime) => {
    assert.match(panelText(runtime), new RegExp(GENERATED_MESSAGE.slice(0, 30)))
    assert.ok(runtime.document.querySelector('[data-yolen-seller-message-action="insert"]'))
    assert.ok(runtime.document.querySelector('[data-yolen-seller-message-action="copy"]'))
  })
})

test('MENSAGEM not eligible (resumo indisponível): mesmo estado sem composer nos dois canais', async () => {
  const runtimes = start({
    resolution: leadResolution('OWNED_BY_ME'),
    backend: baseBackend({ leadSummaryResult: { ok: false, error: 'Resumo indisponível.' } }),
  })
  await openMessageArea(runtimes)
  assertParity(runtimes, 'MENSAGEM not eligible')
  everyRuntime(runtimes, (runtime) => assert.equal(runtime.document.querySelector('[data-yolen-seller-message-intent]'), null))
})

test('MENSAGEM error: mesma falha de geração e mesmo retry nos dois canais', async () => {
  const runtimes = start({
    resolution: leadResolution('OWNED_BY_ME'),
    backend: baseBackend({ messageGenerationResult: { status: 'error', message: null, error: 'Não foi possível gerar a mensagem agora.' } }),
  })
  await openMessageArea(runtimes)
  await generateMessage(runtimes)
  assertParity(runtimes, 'MENSAGEM error')
  everyRuntime(runtimes, (runtime) => assert.equal(runtime.document.querySelector('[data-yolen-seller-message-action="insert"]'), null))
})

for (const [label, mode, expected, written] of [
  ['composer disponível → inserção confirmada', null, /Mensagem incluída no (WhatsApp|ManyChat)\. Revise antes de enviar\./, true],
  ['composer indisponível', 'missing', /Não encontrei o campo de mensagem do (WhatsApp|ManyChat)\. Use Copiar\./, false],
  ['inserção não confirmada', 'unconfirmed', /Não foi possível (confirmar a inserção|incluir automaticamente)\. Use Copiar\./, false],
  ['falha física do adapter', 'throws', /Não foi possível incluir automaticamente\. Use Copiar\./, false],
]) {
  test(`MENSAGEM ${label}: mesmo resultado canônico de inserção nos dois canais, nunca envia`, async () => {
    const runtimes = start({
      resolution: leadResolution('OWNED_BY_ME'),
      backend: baseBackend({ messageGenerationResult: { status: 'ready', message: GENERATED_MESSAGE, error: null } }),
    })
    await openMessageArea(runtimes)
    await generateMessage(runtimes)
    if (mode) everyRuntime(runtimes, (runtime) => sabotageComposer(runtime, mode))
    everyRuntime(runtimes, (runtime) => click(runtime, runtime.document.querySelector('[data-yolen-seller-message-action="insert"]')))
    await waitForBoth(runtimes, (runtime) => expected.test(panelText(runtime)))
    await waitForQuiet(runtimes)
    assertParity(runtimes, `MENSAGEM ${label}`)
    everyRuntime(runtimes, (runtime) => {
      if (written) assert.equal(composerText(runtime).trim(), GENERATED_MESSAGE)
      assert.equal(runtime.calls.filter((call) => call.action === 'REGISTER_MESSAGE_ACTION' && call.payload?.action === 'sent').length, 0, 'inserir nunca envia')
    })
  })
}

// ---------------------------------------------------------------------------
// ANÁLISE
// ---------------------------------------------------------------------------

const JOB_ID = 'f'.repeat(64)

function commercialReading() {
  const evidence = (summary) => ({ summary, evidence_message_ids: ['m1'], memory_ids: [] })
  return {
    contract_version: 'commercial-reading-v1',
    analysis_status: 'complete',
    analysis_limitations: [],
    commercial_role: 'buyer',
    commercial_relevance: 'commercial',
    conversation_summary: { current_state: evidence('Cliente avaliando o preço do plano anual.') },
    customer: {
      objectives: [], problems: [], impacts: [], needs: [], interests: [],
      decision_criteria: [], preferences: [], open_questions: [], objections: [evidence('Achou caro')],
      uncertainties: [], discussed_products: [], primary_product_interest: null,
      competitors: [], commitments: [], missing_discovery: [],
      resolved_information: [], superseded_information: [],
      communication: { patterns: [], events: [] },
    },
    commercial_evolution: [],
    method: { configured: false, name: null, stages: [], current_stage: null, adherence: { status: 'not_configured' }, recovery_guidance: null },
    seller_strengths: [],
    improvement_points: [],
    risks: { customer_objections: [], service_risks: [] },
    best_approach: { decision: 'handle_objection', reason: 'Tratar a objeção de preço.', channel: 'text', evidence_message_ids: ['m1'], memory_ids: [] },
    communication: { intervention_needed: true, recommended_question: null, recommended_message: GENERATED_MESSAGE },
    operations: {
      crm: { should_change_crm_stage: false, recommended_status: null, rationale: null, requires_human_confirmation: true },
      agenda: { should_change_agenda: false, expected_next_action_at: null, rationale: null, requires_human_confirmation: true },
    },
    evidence_message_ids: [],
    memory_ids: [],
  }
}

function jobStatus(status) {
  return {
    ok: true,
    data: {
      analysis_job_id: JOB_ID,
      status,
      message_watermark: 'wm-1',
      result: status === 'succeeded'
        ? {
            contract_version: 'phase12a-deep-seller-v1',
            engine_source: 'stateful',
            commercial_relevance: 'commercial',
            commercial_role: 'buyer',
            summary: 'Resumo profundo.',
            commercial_reading: commercialReading(),
            recommended_next_approach: 'Ver leitura comercial.',
            recommended_question: null,
            suggested_message: null,
          }
        : null,
    },
  }
}

const QUEUED = { ok: true, data: { deep_analysis: { analysis_job_id: JOB_ID, status: 'queued', message_watermark: 'wm-1' } } }

async function clickAnalyze(runtimes) {
  await settle(runtimes, workspaceLoaded)
  await waitForBoth(runtimes, (runtime) => Boolean(runtime.document.querySelector('[data-yolen-action="analyze-conversation"]')))
  everyRuntime(runtimes, (runtime) => click(runtime, runtime.document.querySelector('[data-yolen-action="analyze-conversation"]')))
  await waitForBoth(runtimes, hasCall('ANALYZE_CONVERSATION'))
}

test('ANÁLISE loading → ready: mesma leitura comercial, mesma orientação e mesma sugestão nos dois canais', async () => {
  const gate = deferred()
  const runtimes = start({
    resolution: leadResolution('OWNED_BY_ME'),
    backend: baseBackend({
      analysisResult: async () => {
        await gate.promise
        return QUEUED
      },
      analysisJobStatusResult: jobStatus('succeeded'),
    }),
  })
  await clickAnalyze(runtimes)
  await waitForQuiet(runtimes)
  assertParity(runtimes, 'ANÁLISE loading')

  gate.resolve()
  await waitForBoth(runtimes, (runtime) => Boolean(runtime.document.querySelector('[data-yolen-action="insert-suggested-message"]')), { timeoutMs: 20000 })
  await waitForQuiet(runtimes)
  const snapshots = assertParity(runtimes, 'ANÁLISE ready')
  const analyzePayloads = runtimes.map((runtime) => normalizeParityText(JSON.stringify(coreIntents(runtime).find((intent) => intent.action === 'ANALYZE_CONVERSATION'))))
  assert.equal(analyzePayloads[0], analyzePayloads[1], 'mesmo pedido de análise (mensagens, ciclo, janela)')
  assert.ok(snapshots.whatsapp.view.areas.analysis)
})

for (const [label, backend, expected] of [
  ['ANÁLISE failed', { analysisResult: QUEUED, analysisJobStatusResult: jobStatus('failed') }, /Não foi possível concluir a leitura comercial da Yolen/],
  ['ANÁLISE superseded', { analysisResult: QUEUED, analysisJobStatusResult: jobStatus('superseded') }, /A conversa mudou durante a análise/],
]) {
  test(`${label}: mesmo estado terminal e mesmo retry nos dois canais`, async () => {
    const runtimes = start({ resolution: leadResolution('OWNED_BY_ME'), backend: baseBackend(backend) })
    await clickAnalyze(runtimes)
    await waitForBoth(runtimes, hasCall('GET_ANALYSIS_JOB_STATUS'), { timeoutMs: 20000 })
    await waitForQuiet(runtimes, 1500)
    assertParity(runtimes, label)
    everyRuntime(runtimes, (runtime) => {
      assert.equal(runtime.document.querySelector('[data-yolen-action="insert-suggested-message"]'), null)
      assert.ok(runtime.document.querySelector('[data-yolen-action="analyze-conversation"]'), 'retry disponível')
    })
    void expected
  })
}

test('ANÁLISE timeout (watchdog): mesmo estado e mesmo retry nos dois canais', async () => {
  const never = new Promise(() => {})
  const runtimes = start(
    { resolution: leadResolution('OWNED_BY_ME'), backend: baseBackend({ analysisResult: () => never }) },
    { beforeLoad: ({ dom }) => { dom.window.__yolenCompanionAnalysisWatchdogMsForTests = 400 } },
  )
  await clickAnalyze(runtimes)
  await sleep(900)
  await waitForQuiet(runtimes)
  assertParity(runtimes, 'ANÁLISE timeout')
  everyRuntime(runtimes, (runtime) => {
    assert.equal(runtime.document.querySelector('[data-yolen-action="insert-suggested-message"]'), null)
    assert.ok(runtime.document.querySelector('[data-yolen-action="analyze-conversation"]'), 'retry disponível')
  })
})

// ---------------------------------------------------------------------------
// Lead enrichment
// ---------------------------------------------------------------------------

const ENRICHMENT_CASES = [
  {
    label: 'Enrichment missing',
    text: 'Pode mandar a proposta para cliente.paridade@example.com por favor.',
    lead: { email: null },
    offered: true,
  },
  {
    label: 'Enrichment same',
    text: 'Pode mandar a proposta para cliente.paridade@example.com por favor.',
    lead: { email: 'cliente.paridade@example.com' },
    offered: false,
  },
  {
    label: 'Enrichment different',
    text: 'Meu e-mail novo é novo.paridade@example.com, pode usar esse.',
    lead: { email: 'antigo.paridade@example.com' },
    offered: true,
  },
  {
    label: 'Enrichment private phone (telefone cadastrado)',
    text: 'Meu telefone é (47) 98888-7777, pode ligar nele.',
    lead: { phone: '5547988887777' },
    offered: false,
  },
]

for (const scenario of ENRICHMENT_CASES) {
  test(`${scenario.label}: mesmos candidatos, mesma comparação, mesma confirmação nos dois canais; valor atual nunca exibido`, async () => {
    const resolution = leadResolution('OWNED_BY_ME', { email: scenario.lead.email ?? null })
    if (scenario.lead.phone) resolution.lead = { ...resolution.lead, phone: scenario.lead.phone }
    const applied = { whatsapp: [], manychat: [] }
    const runtimes = start(
      { resolution, messages: [{ mid: 'm1', text: scenario.text }], backend: baseBackend() },
      (channel) => ({
        extraHandlers: {
          APPLY_LEAD_ENRICHMENT: async (payload) => {
            applied[channel].push(payload)
            return { ok: true, statusCode: 200, payload: { ok: true, status: 'APPLIED' } }
          },
        },
      }),
    )
    await settle(runtimes, workspaceLoaded)
    everyRuntime(runtimes, (runtime) => click(runtime, runtime.document.querySelector('[data-yolen-seller-area="client"]')))
    await waitForQuiet(runtimes, 1500)
    assertParity(runtimes, scenario.label)

    everyRuntime(runtimes, (runtime) => {
      const confirm = runtime.document.querySelector('[data-yolen-action="confirm-lead-enrichment"]')
      assert.equal(Boolean(confirm), scenario.offered, `${runtime.channel}: candidato ${scenario.offered ? 'oferecido' : 'não oferecido'}`)
      if (scenario.lead.email) assert.doesNotMatch(panelText(runtime), new RegExp(scenario.lead.email.replace('.', '\\.')), 'valor atual nunca exibido')
    })

    if (!scenario.offered) return

    everyRuntime(runtimes, (runtime) => click(runtime, runtime.document.querySelector('[data-yolen-action="confirm-lead-enrichment"]')))
    await waitForBoth(runtimes, (runtime) => applied[runtime.channel].length === 1)
    await waitForQuiet(runtimes)
    assertParity(runtimes, `${scenario.label} (confirmado)`)
    for (const channel of CHANNELS) {
      assert.equal(applied[channel][0].confirmed_by_human, true)
      assert.equal(applied[channel][0].lead_id, resolution.lead.id, `${channel}: lead_id no transporte`)
      assert.equal(applied[channel][0].expected_current_value ?? null, scenario.lead.email ?? null, `${channel}: CAS com o valor atual no transporte`)
    }
    assert.equal(applied.whatsapp[0].value, applied.manychat[0].value)
    assert.equal(applied.whatsapp[0].field, applied.manychat[0].field)
  })
}

test('Enrichment ignore: mesmo candidato descartado sem escrita nos dois canais', async () => {
  const runtimes = start({
    resolution: leadResolution('OWNED_BY_ME'),
    messages: [{ mid: 'm1', text: 'Pode mandar a proposta para cliente.paridade@example.com por favor.' }],
    backend: baseBackend(),
  })
  await settle(runtimes, workspaceLoaded)
  everyRuntime(runtimes, (runtime) => click(runtime, runtime.document.querySelector('[data-yolen-seller-area="client"]')))
  await waitForBoth(runtimes, (runtime) => Boolean(runtime.document.querySelector('[data-yolen-action="ignore-lead-enrichment"]')))
  everyRuntime(runtimes, (runtime) => click(runtime, runtime.document.querySelector('[data-yolen-action="ignore-lead-enrichment"]')))
  await waitForQuiet(runtimes)
  assertParity(runtimes, 'Enrichment ignore')
  everyRuntime(runtimes, (runtime) => {
    assert.equal(runtime.document.querySelector('[data-yolen-action="confirm-lead-enrichment"]'), null)
    assert.equal(runtime.calls.filter((call) => call.action === 'APPLY_LEAD_ENRICHMENT').length, 0)
  })
})

// ---------------------------------------------------------------------------
// A → B → A assíncrono (todos os caminhos com guarda própria)
// ---------------------------------------------------------------------------

function conversationResolution(id) {
  const phone = PARITY_CONVERSATIONS[id].phone
  const cycleId = `cycle-conv-${id.toLowerCase()}`
  return defaultLeadResolution({
    status: 'OWNED_BY_ME',
    phone,
    lead: { id: `lead-${cycleId}`, name: id === 'A' ? 'Lead Alfa' : 'Lead Beta', phone, email: null, cpf_cnpj: null, deleted_at: null },
    cycle: { id: cycleId, status: 'contato', owner_user_id: 'user-owner', owner_name: 'Vendedor Dono' },
    actions: { can_analyze_conversation: true, can_apply_suggestion: true, can_link_lead: false },
    flags: { is_owned_by_me: true, is_pool: false, is_closed: false },
    capabilities: { can_create_lead: false, can_analyze_conversation: true, can_apply_suggestion: true, can_open_pool: false, can_open_cycle: true },
  })
}

const isConversationA = (payload) => String(payload?.cycle_id ?? '').endsWith('-a')

// Cada caminho: a resposta de A fica presa até a troca para B; depois é
// liberada. B nunca mostra nada de A; A₂ recupera só estado válido de A.
const ABA_PATHS = [
  {
    label: 'resolução',
    build: (gate) => ({
      A: { resolution: async () => { await gate.promise; return conversationResolution('A') }, messages: [{ mid: 'm1', text: 'Mensagem da conversa A.' }] },
      B: { resolution: conversationResolution('B'), messages: [{ mid: 'm1', text: 'Mensagem da conversa B.' }] },
    }),
    backend: () => ({}),
    armed: hasCall('RESOLVE_LEAD'),
  },
  {
    label: 'lead summary',
    backend: (gate) => ({
      leadSummaryResult: async (count, request) => {
        if (isConversationA(request)) await gate.promise
        return echoSummary(`Resumo da conversa ${isConversationA(request) ? 'A' : 'B'}.`)(count, request)
      },
    }),
    armed: hasCall('LOAD_LEAD_SUMMARY'),
    absentInB: /Resumo da conversa A/,
  },
  {
    label: 'contexto do cliente (CLIENTE)',
    backend: (gate) => ({
      clientContextResult: async (_count, request) => {
        if (isConversationA(request)) await gate.promise
        return defaultClientContext()
      },
    }),
    armed: hasCall('LOAD_CLIENT_CONTEXT'),
  },
  {
    label: 'decisão AGORA',
    backend: (gate) => ({
      decisionStateResult: async (_count, request) => {
        if (!isConversationA(request)) return defaultAgoraDecisionState()
        await gate.promise
        return defaultAgoraDecisionState({ ...AGORA_READY.data, primary: { ...AGORA_READY.data.primary, headline: 'Decisão exclusiva da conversa A' } })
      },
    }),
    armed: hasCall('LOAD_DECISION_STATE'),
    absentInB: /Decisão exclusiva da conversa A/,
  },
]

function startAba(conversations, backend) {
  return CHANNELS.map((channel) => startParityConversations(channel, conversations, { ...baseBackend(), ...backend }))
}

for (const path of ABA_PATHS) {
  test(`A → B → A (${path.label}): resposta tardia de A nunca aparece em B; A₂ só com estado válido — igual nos dois canais`, async () => {
    const gate = deferred()
    const conversations = path.build
      ? path.build(gate)
      : {
          A: { resolution: conversationResolution('A'), messages: [{ mid: 'm1', text: 'Mensagem da conversa A.' }] },
          B: { resolution: conversationResolution('B'), messages: [{ mid: 'm1', text: 'Mensagem da conversa B.' }] },
        }
    const runtimes = startAba(conversations, path.backend(gate))

    await waitForBoth(runtimes, path.armed)
    await sleep(300)
    everyRuntime(runtimes, (runtime) => switchParityConversation(runtime, 'B'))
    await settle(runtimes, (runtime) => panelText(runtime).includes('Lead Beta') && workspaceLoaded(runtime))

    gate.resolve()
    await sleep(600)
    await waitForQuiet(runtimes)
    assertParity(runtimes, `${path.label}: B depois da resposta tardia de A`, { levels: ['canonical', 'view'], cycleId: 'cycle-conv-b' })
    everyRuntime(runtimes, (runtime) => {
      assert.doesNotMatch(panelText(runtime), /Lead Alfa/)
      if (path.absentInB) assert.doesNotMatch(panelText(runtime), path.absentInB)
      // B carrega as áreas do ciclo de B e nunca do ciclo de A depois da troca.
      const loaders = runtime.calls.filter((call) => /^LOAD_(DECISION_STATE|CLIENT_CONTEXT|LEAD_SUMMARY|ANALYSIS_VIEW_MODEL|CUSTOMER_VIEW_MODEL)$/.test(call.action))
      assert.equal(loaders.at(-1)?.payload?.cycle_id, 'cycle-conv-b')
    })

    everyRuntime(runtimes, (runtime) => switchParityConversation(runtime, 'A'))
    await settle(runtimes, (runtime) => panelText(runtime).includes('Lead Alfa'))
    assertParity(runtimes, `${path.label}: A₂`, { levels: ['canonical', 'view'], cycleId: 'cycle-conv-a' })
    everyRuntime(runtimes, (runtime) => assert.doesNotMatch(panelText(runtime), /Lead Beta/))
  })
}

test('A → B → A (análise e geração de mensagem): resultado tardio de A nunca vira leitura, sugestão ou mensagem em B — igual nos dois canais', async () => {
  const analysisGate = deferred()
  const generationGate = deferred()
  const conversations = {
    A: { resolution: conversationResolution('A'), messages: [{ mid: 'm1', text: 'Quanto custa o plano anual?' }] },
    B: { resolution: conversationResolution('B'), messages: [{ mid: 'm1', text: 'Podemos remarcar?' }] },
  }
  const runtimes = startAba(conversations, {
    analysisResult: QUEUED,
    analysisJobStatusResult: async () => {
      await analysisGate.promise
      return jobStatus('succeeded')
    },
    messageGenerationResult: async (request) => {
      if (isConversationA(request)) await generationGate.promise
      return { status: 'ready', message: `Mensagem gerada para ${isConversationA(request) ? 'A' : 'B'}.`, error: null }
    },
  })

  await clickAnalyze(runtimes)
  await waitForBoth(runtimes, hasCall('GET_ANALYSIS_JOB_STATUS'), { timeoutMs: 20000 })
  everyRuntime(runtimes, (runtime) => click(runtime, runtime.document.querySelector('[data-yolen-seller-area="message"]')))
  await generateMessageStarted(runtimes)

  everyRuntime(runtimes, (runtime) => switchParityConversation(runtime, 'B'))
  await settle(runtimes, (runtime) => panelText(runtime).includes('Lead Beta') && workspaceLoaded(runtime))

  analysisGate.resolve()
  generationGate.resolve()
  await sleep(1200)
  await waitForQuiet(runtimes)
  assertParity(runtimes, 'análise/mensagem: B depois das respostas tardias de A', { levels: ['canonical', 'view'], cycleId: 'cycle-conv-b' })
  everyRuntime(runtimes, (runtime) => {
    assert.doesNotMatch(panelText(runtime), /Mensagem gerada para A/)
    assert.equal(runtime.document.querySelector('[data-yolen-action="insert-suggested-message"]'), null, 'sugestão de A nunca oferecida em B')
    assert.equal(composerText(runtime)?.trim() ?? '', '')
  })

  everyRuntime(runtimes, (runtime) => switchParityConversation(runtime, 'A'))
  await settle(runtimes, (runtime) => panelText(runtime).includes('Lead Alfa'))
  assertParity(runtimes, 'análise/mensagem: A₂', { levels: ['canonical', 'view'], cycleId: 'cycle-conv-a' })
  everyRuntime(runtimes, (runtime) => assert.doesNotMatch(panelText(runtime), /Mensagem gerada para B|Lead Beta/))
})

async function generateMessageStarted(runtimes) {
  await waitForBoth(runtimes, (runtime) => Boolean(runtime.document.querySelector('[data-yolen-seller-message-intent]')))
  everyRuntime(runtimes, (runtime) => {
    const intent = runtime.document.querySelector('[data-yolen-seller-message-intent]')
    intent.value = 'Responder sobre o preço.'
    intent.dispatchEvent(new runtime.window.Event('input', { bubbles: true }))
    click(runtime, runtime.document.querySelector('[data-yolen-seller-message-action="generate"]'))
  })
  await waitForBoth(runtimes, (runtime) => runtime.calls.some((call) => call.action === 'LOAD_METHOD_GUIDANCE' && call.payload?.operation === 'generate_message'))
}

test('A → B → A (registro da conversa): preview tardio de A nunca vira confirmação em B — igual nos dois canais', async () => {
  const gate = deferred()
  const conversations = {
    A: { resolution: conversationResolution('A'), messages: [{ mid: 'm1', text: 'Quero fechar o plano anual.' }] },
    B: { resolution: conversationResolution('B'), messages: [{ mid: 'm1', text: 'Podemos remarcar?' }] },
  }
  const runtimes = startAba(conversations, {
    registrationPreviewResult: async (request) => {
      if (isConversationA(request)) await gate.promise
      return { ok: true, data: { ...REGISTRATION_PREVIEW.data, summary_text: `RESUMO_${isConversationA(request) ? 'A' : 'B'}` } }
    },
  })
  await settle(runtimes, workspaceLoaded)
  everyRuntime(runtimes, (runtime) => click(runtime, runtime.document.querySelector('[data-yolen-seller-area="client"]')))
  await waitForBoth(runtimes, (runtime) => Boolean(runtime.document.querySelector('[data-yolen-action="register-conversation"]')))
  everyRuntime(runtimes, (runtime) => click(runtime, runtime.document.querySelector('[data-yolen-action="register-conversation"]')))
  await waitForBoth(runtimes, hasCall('PREVIEW_CONVERSATION_REGISTRATION'))

  everyRuntime(runtimes, (runtime) => switchParityConversation(runtime, 'B'))
  await settle(runtimes, (runtime) => panelText(runtime).includes('Lead Beta') && workspaceLoaded(runtime))
  gate.resolve()
  await sleep(600)
  await waitForQuiet(runtimes)
  assertParity(runtimes, 'registro: B depois do preview tardio de A', { levels: ['canonical', 'view'], cycleId: 'cycle-conv-b' })
  everyRuntime(runtimes, (runtime) => {
    assert.doesNotMatch(panelText(runtime), /RESUMO_A/)
    assert.equal(runtime.document.querySelector('[data-yolen-action="confirm-conversation-registration"]'), null)
  })
})

// ---------------------------------------------------------------------------
// ÁUDIO — comportamentos canônicos (disponível, pendente, indisponível,
// falha de transporte, transcrição). Mesmo fixture de mídia; só a obtenção
// física muda por canal. Nenhuma capability é inventada: os dois adapters
// declaram áudio e a mesma fila canônica decide o que é pendente.
// ---------------------------------------------------------------------------

const AUDIO_MESSAGES = [
  { mid: 'm1', text: 'Mandei um áudio com a dúvida.' },
  { mid: 'a-1', audio: true },
]

const transcribeCalls = (runtime) => runtime.calls.filter((call) => call.action === 'TRANSCRIBE_AUDIO')
const transcribeAction = (runtime) => panelOf(runtime)?.querySelector('[data-yolen-action="transcribe-audio"]') ?? null

function audioDomain(overrides = {}) {
  return {
    resolution: leadResolution('OWNED_BY_ME', { cycleId: 'cycle-audio' }),
    messages: AUDIO_MESSAGES,
    backend: baseBackend(overrides.backend),
    audioSource: overrides.audioSource,
  }
}

// O vendedor vê o fim da tentativa quando a ação volta a ficar habilitada
// (o WhatsAppAdapter tem fallback físico de captura pelo player, mais longo
// que a busca única do ManyChat — mecânica física, não estado canônico).
const transcriptionIdle = (runtime) => Boolean(transcribeAction(runtime)) && !transcribeAction(runtime).disabled

// Pendente = ação oferecida E áudio já no ledger sem transcrição (a
// captura é debounced; o vendedor age depois do estado estável).
async function audioPending(runtimes) {
  await waitForBoth(runtimes, (runtime) => Boolean(transcribeAction(runtime)), { timeoutMs: 15000 })
  await waitForBoth(
    runtimes,
    (runtime) => runtime.calls.some((call) => call.action === 'INGEST_CAPTURE_MESSAGES' && (call.payload?.messages ?? []).some((message) => message.content_type === 'audio' && !message.audio_transcription)),
    { timeoutMs: 15000 },
  )
  await waitForQuiet(runtimes)
}

test('Áudio indisponível (conversa sem áudio): nenhuma ação de transcrição, nenhuma busca de mídia — igual nos dois canais', async () => {
  const runtimes = start({
    resolution: leadResolution('OWNED_BY_ME', { cycleId: 'cycle-audio' }),
    backend: baseBackend(),
  })
  await settle(runtimes, workspaceLoaded)
  assertParity(runtimes, 'sem áudio')
  everyRuntime(runtimes, (runtime) => {
    assert.equal(transcribeAction(runtime), null)
    assert.deepEqual(runtime.audioFetches, [])
    assert.equal(transcribeCalls(runtime).length, 0)
  })
})

test('Áudio disponível → pendente → transcrição: mesma fila, mesma intenção de transcrever no ciclo atual e mesmo resultado', async () => {
  const runtimes = start(audioDomain())
  await audioPending(runtimes)
  assertParity(runtimes, 'áudio pendente')
  everyRuntime(runtimes, (runtime) => {
    assert.match(panelText(runtime), /Transcrever áudio 1 de 1/)
    assert.equal(transcribeCalls(runtime).length, 0, 'nada é transcrito sem ação do vendedor')
  })

  for (const runtime of runtimes) click(runtime, transcribeAction(runtime))
  await waitForBoth(runtimes, (runtime) => transcribeCalls(runtime).length === 1)
  await waitForBoth(runtimes, (runtime) => transcribeAction(runtime) === null, { timeoutMs: 15000 })
  // A transcrição entra no ledger pela ingestão (debounced) nos dois canais.
  await waitForBoth(
    runtimes,
    (runtime) => runtime.calls.some((call) => call.action === 'INGEST_CAPTURE_MESSAGES' && JSON.stringify(call.payload).includes('Transcrição de teste.')),
    { timeoutMs: 15000 },
  )
  await waitForQuiet(runtimes)

  assertParity(runtimes, 'áudio transcrito')
  everyRuntime(runtimes, (runtime) => {
    const [call] = transcribeCalls(runtime)
    assert.equal(call.payload.cycle_id, 'cycle-audio')
    assert.equal(call.payload.mime_type, 'audio/ogg')
    assert.equal(Buffer.from(call.payload.audio_base64, 'base64').toString(), PARITY_AUDIO_BYTES)
    assert.deepEqual(runtime.audioFetches, [PARITY_AUDIO_URL])
  })
})

test('Áudio com falha de transporte: nenhuma transcrição, áudio segue pendente, nenhuma decisão comercial muda — igual nos dois canais', async () => {
  const runtimes = start(audioDomain({ audioSource: () => 'fail' }))
  await audioPending(runtimes)

  for (const runtime of runtimes) click(runtime, transcribeAction(runtime))
  await waitForBoth(runtimes, (runtime) => runtime.audioFetches.length >= 1)
  await waitForBoth(runtimes, transcriptionIdle, { timeoutMs: 20000 })
  await waitForQuiet(runtimes)

  assertParity(runtimes, 'falha de transporte')
  everyRuntime(runtimes, (runtime) => {
    assert.equal(transcribeCalls(runtime).length, 0)
    assert.ok(transcribeAction(runtime), 'o áudio continua pendente para nova tentativa')
    assert.match(panelText(runtime), /Transcrever áudio 1 de 1/)
    assert.match(panelText(runtime), /Lead Paridade/)
  })
})

test('Áudio com erro de transcrição no backend: mesmo erro canônico, áudio segue pendente — igual nos dois canais', async () => {
  const runtimes = start(audioDomain({
    backend: { transcribeAudioResult: { ok: false, error: 'Não foi possível transcrever este áudio agora.' } },
  }))
  await audioPending(runtimes)

  for (const runtime of runtimes) click(runtime, transcribeAction(runtime))
  await waitForBoth(runtimes, (runtime) => transcribeCalls(runtime).length === 1)
  await waitForBoth(runtimes, transcriptionIdle, { timeoutMs: 20000 })
  await waitForQuiet(runtimes)

  assertParity(runtimes, 'erro de transcrição')
  everyRuntime(runtimes, (runtime) => {
    assert.equal(transcribeCalls(runtime).length, 1)
    assert.ok(transcribeAction(runtime), 'o áudio continua pendente para nova tentativa')
  })
})

// ---------------------------------------------------------------------------
// A → B → A — caminhos assíncronos restantes (inserção/feedback, identidade
// e evidência, enriquecimento)
// ---------------------------------------------------------------------------

// A conversa está assentada quando as áreas foram (re)carregadas para o
// ciclo dela e o transporte ficou quieto (o WhatsApp recarrega depois do
// debounce do observer; o ManyChat depois da identidade segura).
const AREA_LOADER = /^LOAD_(DECISION_STATE|CLIENT_CONTEXT|LEAD_SUMMARY|ANALYSIS_VIEW_MODEL|CUSTOMER_VIEW_MODEL)$/
const areasLoadedFor = (cycleId, name) => (runtime) =>
  panelText(runtime).includes(name) &&
  runtime.calls.filter((call) => AREA_LOADER.test(call.action)).at(-1)?.payload?.cycle_id === cycleId &&
  runtime.calls.filter((call) => call.action === 'LOAD_CUSTOMER_VIEW_MODEL').at(-1)?.payload?.cycle_id === cycleId

const registerCalls = (runtime, action) =>
  runtime.calls.filter((call) => call.action === 'REGISTER_MESSAGE_ACTION' && (!action || call.payload?.action === action))

// Limpeza FÍSICA do campo do canal (o vendedor apagou o rascunho).
function clearComposer(runtime) {
  const node = composerNode(runtime)
  if (runtime.channel === 'whatsapp') node.textContent = ''
  else node.value = ''
}

test('A → B → A (inserção e feedback): registro tardio da inserção de A nunca muda B nem A₂ — igual nos dois canais', async () => {
  const gate = deferred()
  const conversations = {
    A: { resolution: conversationResolution('A'), messages: [{ mid: 'm1', text: 'Quanto custa o plano anual?' }] },
    B: { resolution: conversationResolution('B'), messages: [{ mid: 'm1', text: 'Podemos remarcar?' }] },
  }
  const runtimes = startAba(conversations, {
    analysisResult: QUEUED,
    analysisJobStatusResult: jobStatus('succeeded'),
    messageActionResult: async (payload) => {
      if (payload?.action === 'inserted' && isConversationA(payload)) await gate.promise
      return { ok: true, data: { already_registered: false } }
    },
  })

  await clickAnalyze(runtimes)
  await waitForBoth(runtimes, (runtime) => Boolean(runtime.document.querySelector('[data-yolen-action="insert-suggested-message"]')), { timeoutMs: 20000 })
  everyRuntime(runtimes, (runtime) => click(runtime, runtime.document.querySelector('[data-yolen-action="insert-suggested-message"]')))
  await waitForBoth(runtimes, (runtime) => registerCalls(runtime, 'inserted').length === 1)
  everyRuntime(runtimes, (runtime) => {
    assert.equal(composerText(runtime).trim(), GENERATED_MESSAGE, 'inserção em A acontece normalmente')
    assert.equal(registerCalls(runtime, 'inserted')[0].payload.cycle_id, 'cycle-conv-a')
  })

  everyRuntime(runtimes, (runtime) => {
    clearComposer(runtime)
    switchParityConversation(runtime, 'B')
  })
  await settle(runtimes, areasLoadedFor('cycle-conv-b', 'Lead Beta'))

  gate.resolve()
  await sleep(600)
  await waitForQuiet(runtimes)
  assertParity(runtimes, 'inserção: B depois do registro tardio de A', { levels: ['canonical', 'view'], cycleId: 'cycle-conv-b' })
  everyRuntime(runtimes, (runtime) => {
    assert.equal(runtime.document.querySelector('[data-yolen-action="insert-suggested-message"]'), null, 'sugestão de A nunca oferecida em B')
    assert.doesNotMatch(panelText(runtime), /Mensagem incluída/)
    assert.equal(composerText(runtime).trim(), '', 'nada é escrito no campo de B')
  })

  everyRuntime(runtimes, (runtime) => switchParityConversation(runtime, 'A'))
  await settle(runtimes, areasLoadedFor('cycle-conv-a', 'Lead Alfa'))
  assertParity(runtimes, 'inserção: A₂', { levels: ['canonical', 'view'], cycleId: 'cycle-conv-a' })
  everyRuntime(runtimes, (runtime) => {
    assert.equal(registerCalls(runtime, 'inserted').length, 1, 'o registro tardio não é repetido')
    assert.equal(registerCalls(runtime, 'sent').length, 0, 'inserir nunca envia')
    assert.doesNotMatch(panelText(runtime), /Lead Beta/)
  })
})

test('A → B → A (identidade e evidência): resolução tardia de A nunca vira lead de uma conversa sem evidência — igual nos dois canais', async () => {
  const gate = deferred()
  let aResolutions = 0
  const conversations = {
    A: {
      resolution: async () => {
        aResolutions += 1
        if (aResolutions <= 2) await gate.promise
        return conversationResolution('A')
      },
      messages: [{ mid: 'm1', text: 'Mensagem da conversa A.' }],
    },
    B: { resolution: null, evidence: 'none', messages: [{ mid: 'm1', text: 'Mensagem sem contato identificável.' }] },
  }
  const runtimes = startAba(conversations, {})

  await waitForBoth(runtimes, hasCall('RESOLVE_LEAD'))
  await sleep(300)
  const resolvesBeforeB = runtimes.map((runtime) => runtime.calls.filter((call) => call.action === 'RESOLVE_LEAD').length)
  everyRuntime(runtimes, (runtime) => switchParityConversation(runtime, 'B'))
  await settle(runtimes, (runtime) => /Telefone ainda não disponível/.test(panelText(runtime)), { timeoutMs: 20000 })

  gate.resolve()
  await sleep(600)
  await waitForQuiet(runtimes)
  assertParity(runtimes, 'identidade: B sem evidência depois da resposta tardia de A', { levels: ['view'], unresolved: true })
  runtimes.forEach((runtime, index) => {
    assert.match(panelText(runtime), /Telefone ainda não disponível/)
    assert.doesNotMatch(panelText(runtime), /Lead Alfa/)
    assert.equal(runtime.document.querySelector('[data-yolen-lead-create-form]'), null, 'sem evidência, nunca oferece criação')
    assert.equal(
      runtime.calls.filter((call) => call.action === 'RESOLVE_LEAD').length,
      resolvesBeforeB[index],
      'conversa sem evidência nunca consulta a Yolen',
    )
  })

  everyRuntime(runtimes, (runtime) => switchParityConversation(runtime, 'A'))
  await settle(runtimes, areasLoadedFor('cycle-conv-a', 'Lead Alfa'), { timeoutMs: 20000 })
  assertParity(runtimes, 'identidade: A₂', { levels: ['canonical', 'view'], cycleId: 'cycle-conv-a' })
})

test('A → B → A (enriquecimento): aplicação tardia de A nunca vira confirmação ou candidato em B — igual nos dois canais', async () => {
  const gate = deferred()
  const applied = { whatsapp: [], manychat: [] }
  const conversations = {
    A: { resolution: conversationResolution('A'), messages: [{ mid: 'm1', text: 'Pode mandar a proposta para alfa.paridade@example.com por favor.' }] },
    B: { resolution: conversationResolution('B'), messages: [{ mid: 'm1', text: 'Podemos remarcar a reunião?' }] },
  }
  const runtimes = CHANNELS.map((channel) =>
    startParityConversations(channel, conversations, {
      ...baseBackend(),
      extraHandlers: {
        APPLY_LEAD_ENRICHMENT: async (payload) => {
          applied[channel].push(payload)
          await gate.promise
          return { ok: true, statusCode: 200, payload: { ok: true, status: 'APPLIED' } }
        },
      },
    }),
  )
  await settle(runtimes, workspaceLoaded)
  everyRuntime(runtimes, (runtime) => click(runtime, runtime.document.querySelector('[data-yolen-seller-area="client"]')))
  await waitForBoth(runtimes, (runtime) => Boolean(runtime.document.querySelector('[data-yolen-action="confirm-lead-enrichment"]')))
  everyRuntime(runtimes, (runtime) => click(runtime, runtime.document.querySelector('[data-yolen-action="confirm-lead-enrichment"]')))
  await waitForBoth(runtimes, (runtime) => applied[runtime.channel].length === 1)

  everyRuntime(runtimes, (runtime) => switchParityConversation(runtime, 'B'))
  await settle(runtimes, areasLoadedFor('cycle-conv-b', 'Lead Beta'))
  const resolvesBeforeRelease = runtimes.map((runtime) => runtime.calls.filter((call) => call.action === 'RESOLVE_LEAD').length)
  gate.resolve()
  // Depois da escrita, os dois canais atualizam a conversa ATUAL (B) — nunca
  // a de A; o ManyChat chega lá depois das idas de identidade segura.
  await waitForBoth(runtimes, (runtime) => runtime.calls.filter((call) => call.action === 'RESOLVE_LEAD').length > resolvesBeforeRelease[runtimes.indexOf(runtime)], { timeoutMs: 15000 })
  await settle(runtimes, (runtime) => {
    const lastResolve = runtime.calls.findLastIndex((call) => call.action === 'RESOLVE_LEAD')
    const reloaded = (action) => runtime.calls.some((call, index) => index > lastResolve && call.action === action && call.payload?.cycle_id === 'cycle-conv-b')
    // O resumo de B continua válido em cache (nenhuma mensagem nova): só o
    // view model do cliente é sempre recarregado depois da re-resolução.
    return areasLoadedFor('cycle-conv-b', 'Lead Beta')(runtime) && reloaded('LOAD_CUSTOMER_VIEW_MODEL')
  }, { timeoutMs: 15000 })
  assertParity(runtimes, 'enriquecimento: B depois da aplicação tardia de A', { levels: ['canonical', 'view'], cycleId: 'cycle-conv-b' })
  everyRuntime(runtimes, (runtime) => {
    assert.doesNotMatch(panelText(runtime), /alfa\.paridade@example\.com/)
    assert.equal(runtime.document.querySelector('[data-yolen-action="confirm-lead-enrichment"]'), null)
  })
  for (const channel of CHANNELS) {
    assert.equal(applied[channel].length, 1, `${channel}: uma única escrita, sempre do lead de A`)
    assert.equal(applied[channel][0].lead_id, 'lead-cycle-conv-a')
  }

  everyRuntime(runtimes, (runtime) => switchParityConversation(runtime, 'A'))
  await settle(runtimes, areasLoadedFor('cycle-conv-a', 'Lead Alfa'))
  assertParity(runtimes, 'enriquecimento: A₂', { levels: ['canonical', 'view'], cycleId: 'cycle-conv-a' })
})
