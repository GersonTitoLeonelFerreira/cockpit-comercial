// FASE 7 — ManyChat conectado ao MESMO Core.
//
// Composição efetiva do manifest ManyChat (bridge isolated + content script
// document_idle): ManyChatAdapter real + companion-bootstrap + Companion
// Core + controllers + views compartilhados, ligados pelo
// manychat-content-script.js real. O único ponto controlado é o transporte
// do background, que passa pelo módulo REAL de privacidade do background
// com remetente app.manychat.com (INV-6). DOM na estrutura ManyChat já
// validada ao vivo (MANYCHAT_*_GATE.md). Nenhum mock circular: o teste
// observa o DOM do painel, o DOM do ManyChat (composer) e as mensagens
// que saem para o background.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CHAT_A_URL,
  CHAT_B_URL,
  KEY_X,
  KEY_Y,
  KEY_Z,
  loadManyChatComposition,
  manyChatPageHtml,
  whatsAppPhoneContactHtml,
} from '../e3-test-support/load-manychat-composition.mjs'
import {
  createLeadCalls,
  defaultAgoraDecisionState,
  defaultLeadResolution,
  ingestCalls,
  resolveLeadCalls,
  waitFor,
} from '../e3-test-support/load-content-script.mjs'

const PHONE_X = '5547999990001'
const PHONE_Y = '5547999990002'
const CYCLE_X = 'cycle-manychat-x'
const CYCLE_Y = 'cycle-manychat-y'

function linkedResolution({ name, cycleId, phone = PHONE_X, status = 'OWNED_BY_ME', flags = {}, lead = {} }) {
  return defaultLeadResolution({
    status,
    phone,
    lead: { id: `lead-${cycleId}`, name, phone, email: null, cpf_cnpj: null, deleted_at: null, ...lead },
    lead_profile: { email: null, cpf: null, cnpj: null, birth_date: null, profession: null, cep: null, phone_mobile: null },
    cycle: { id: cycleId, status: 'contato', owner_user_id: 'user-1', owner_name: 'Vendedor Teste', current_group_id: 'group-1', next_action: null, next_action_date: null },
    actions: {
      can_analyze_conversation: status === 'OWNED_BY_ME',
      can_apply_suggestion: status === 'OWNED_BY_ME',
      can_link_lead: false,
      create_lead_url: `/leads/new?phone=${phone}`,
      open_yolen_url: `/sales-cycles/${cycleId}`,
    },
    flags: { is_owned_by_me: status === 'OWNED_BY_ME', is_pool: false, is_closed: false, ...flags },
  })
}

function notFoundResolution(phone) {
  return defaultLeadResolution({
    status: 'NOT_FOUND',
    phone,
    user_message: 'Este contato ainda não existe na Yolen.',
    lead: null,
    cycle: null,
    actions: { can_analyze_conversation: false, can_apply_suggestion: false, can_link_lead: false, create_lead_url: `/leads/new?phone=${phone}` },
    flags: { is_owned_by_me: false, is_pool: false, is_closed: false },
  })
}

function page({ messages = [{ mid: 'm1', text: 'Quanto custa o plano?' }], phone = null, draft = '' } = {}) {
  return manyChatPageHtml({
    messages,
    contactHtml: phone ? whatsAppPhoneContactHtml(phone) : '',
    draft,
  })
}

function panelOf(document) {
  return document.getElementById('yolen-companion-panel')
}

function panelText(document) {
  return (panelOf(document)?.textContent || '').replace(/\s+/g, ' ')
}

function click(document, target) {
  target.dispatchEvent(new document.defaultView.MouseEvent('click', { bubbles: true, cancelable: true }))
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function actionCalls(calls, action) {
  return calls.filter((call) => call.action === action)
}

function deferred() {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function composer(document) {
  return document.querySelector('footer textarea')
}

function submitCreateForm(document, name) {
  const nameInput = document.querySelector('[name="yolen-lead-name"]')
  if (name !== undefined) {
    nameInput.value = name
    nameInput.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }))
  }

  const form = document.querySelector('[data-yolen-lead-create-form]')
  const submit = form.querySelector('.yolen-lead-create-submit')
  submit.dispatchEvent(new document.defaultView.Event('pointerdown', { bubbles: true }))
  click(document, submit)
  form.dispatchEvent(new document.defaultView.Event('submit', { bubbles: true, cancelable: true }))
}

// ---------------------------------------------------------------------------
// Composição única
// ---------------------------------------------------------------------------

test('composição única: um bootstrap, um Core, um painel; nenhum runtime comercial paralelo do ManyChat', async () => {
  const runtime = loadManyChatComposition({
    pageHtml: page(),
    resolutionsByIdentity: { [KEY_X]: linkedResolution({ name: 'Lead Xis', cycleId: CYCLE_X }) },
  })
  const { document, sandbox, calls } = runtime

  await waitFor(() => panelText(document).includes('Lead Xis'))

  assert.equal(document.querySelectorAll('#yolen-companion-panel').length, 1)
  assert.equal(panelOf(document).parentElement, document.body, 'painel no container do adapter')
  assert.equal(sandbox.__yolenCompanionRuntimeStarted, true)

  // Os donos comerciais paralelos não existem mais na composição.
  for (const legacyGlobal of [
    'YolenManyChatCaptureBootstrap',
    'YolenManyChatCaptureRuntime',
    'YolenManyChatSellerPanelRuntime',
    'YolenManyChatContactLinkRuntime',
    'YolenManyChatPanelMount',
    'YolenManyChatAudioDispatchRuntime',
    'YolenManyChatAdapter',
  ]) {
    assert.equal(sandbox[legacyGlobal], undefined, legacyGlobal)
  }
  assert.equal(typeof sandbox.YolenCompanionCore.create, 'function')
  assert.equal(typeof sandbox.YolenManyChatChannelAdapter.create, 'function')

  // Um segundo start (reinjeção do content script) não duplica nada.
  const second = sandbox.YolenCompanionBootstrap.create({
    channelAdapter: sandbox.YolenManyChatChannelAdapter.create(),
  })
  assert.equal(await second.start(), false)
  await sleep(400)
  assert.equal(document.querySelectorAll('#yolen-companion-panel').length, 1)
  assert.equal(actionCalls(calls, 'GET_ME').length, 1)
  assert.equal(resolveLeadCalls(calls).length, 1, 'uma única resolução, sem callbacks duplicados')

  const areas = Array.from(panelOf(document).querySelectorAll('[data-yolen-seller-area]')).map((element) =>
    element.getAttribute('data-yolen-seller-area'),
  )
  assert.deepEqual(areas, ['now', 'message', 'analysis', 'client'])
})

test('kill switch: build normal (flag false) não cria adapter, painel nem tráfego', async () => {
  const { document, calls, sandbox } = loadManyChatComposition({ flags: 'normal', pageHtml: page() })

  await sleep(800)
  assert.equal(panelOf(document), null)
  assert.equal(sandbox.__yolenCompanionRuntimeStarted, undefined)
  assert.deepEqual(calls.map((call) => call.action), [])
})

// ---------------------------------------------------------------------------
// Resolução por evidência (§10.4)
// ---------------------------------------------------------------------------

test('§10.4 caso A: identidade segura sem telefone resolve o vínculo existente; o content recebe só a allowlist (INV-6)', async () => {
  const runtime = loadManyChatComposition({
    pageHtml: page(),
    resolutionsByIdentity: { [KEY_X]: linkedResolution({ name: 'Lead Xis', cycleId: CYCLE_X, lead: { email: 'privado@example.com' } }) },
  })
  const { document, calls, delivered } = runtime

  await waitFor(() => panelText(document).includes('Lead Xis'))

  const [resolve] = resolveLeadCalls(calls)
  assert.deepEqual({ ...resolve.payload }, { platform: 'manychat', platform_contact_key: KEY_X })
  assert.equal('phone' in resolve.payload, false, 'identidade opaca nunca vira telefone')

  const resolution = delivered.find((entry) => entry.action === 'RESOLVE_LEAD').response.payload
  assert.equal(resolution.status, 'OWNED_BY_ME')
  assert.deepEqual(resolution.lead_display, { name: 'Lead Xis' })
  assert.deepEqual(resolution.cycle, { id: CYCLE_X, status: 'contato' })
  for (const forbidden of ['phone', 'phone_variants', 'lead', 'lead_profile', 'display_name']) {
    assert.equal(forbidden in resolution, false, forbidden)
  }
  assert.equal('create_lead_url' in resolution.actions, false)
  assert.equal('owner_user_id' in resolution.cycle, false)
  assert.doesNotMatch(JSON.stringify(delivered), /privado@example\.com|lead-cycle-manychat-x|5547999990001/)

  // Workspace completo pelo Core: captura e contexto do ciclo.
  await waitFor(() => ingestCalls(calls).length > 0)
  const capture = ingestCalls(calls).at(-1).payload
  assert.equal(capture.cycle_id, CYCLE_X)
  assert.match(capture.conversation_key, /^manychat:/)
  assert.doesNotMatch(capture.conversation_key, /5547/)
  assert.doesNotMatch(panelText(document), /5547999990001|privado@example\.com/)
})

test('§10.4 caso B: identidade não vinculada + telefone confiável → fallback por telefone', async () => {
  const { document, calls } = loadManyChatComposition({
    pageHtml: page({ phone: PHONE_X }),
    resolutionsByPhone: { [PHONE_X]: linkedResolution({ name: 'Lead Pelo Telefone', cycleId: CYCLE_X }) },
  })

  await waitFor(() => panelText(document).includes('Lead Pelo Telefone'))

  const resolves = resolveLeadCalls(calls).map((call) => ({ ...call.payload }))
  assert.deepEqual(resolves[0], { platform: 'manychat', platform_contact_key: KEY_X })
  assert.equal(resolves[1].phone, PHONE_X)
  assert.equal('platform_contact_key' in resolves[1], false)
  assert.notEqual(resolves[1].phone, KEY_X)
})

test('§10.4 caso C/D: sem evidência (nem identidade nem telefone) não há resolução nem criação; identidade sem vínculo e sem telefone não cria', async () => {
  const none = loadManyChatComposition({ pageHtml: page(), currentIdentity: () => null })
  await waitFor(() => actionCalls(none.calls, 'GET_MANYCHAT_SAFE_IDENTITY').length >= 2)
  await sleep(900)
  assert.equal(resolveLeadCalls(none.calls).length, 0)
  assert.equal(createLeadCalls(none.calls).length, 0)
  assert.equal(none.document.querySelector('[data-yolen-lead-create-form]'), null)

  const unlinked = loadManyChatComposition({ pageHtml: page() })
  await waitFor(() => panelText(unlinked.document).includes('ainda não está vinculado'))
  await sleep(600)
  assert.equal(resolveLeadCalls(unlinked.calls).length, 1, 'sem telefone não há fallback')
  assert.equal(unlinked.document.querySelector('[data-yolen-lead-create-form]'), null, 'CONTACT_NOT_LINKED sem telefone nunca oferece criação')
  assert.equal(createLeadCalls(unlinked.calls).length, 0)
})

test('erro de backend na identidade não vira CONTACT_NOT_LINKED/NOT_FOUND nem cai no telefone', async () => {
  const { document, calls } = loadManyChatComposition({
    pageHtml: page({ phone: PHONE_X }),
    resolutionsByIdentity: {
      [KEY_X]: { __transport: { ok: false, statusCode: 400, payload: { ok: false, status: 'EXTERNAL_IDENTITY_SEARCH_ERROR', error: 'Falha ao consultar identidade.' } } },
    },
    resolutionsByPhone: { [PHONE_X]: notFoundResolution(PHONE_X) },
  })

  await waitFor(() => panelText(document).includes('Falha ao consultar identidade.'))
  await sleep(500)
  assert.equal(resolveLeadCalls(calls).length, 1)
  assert.equal(document.querySelector('[data-yolen-lead-create-form]'), null)
})

// ---------------------------------------------------------------------------
// Criação compartilhada
// ---------------------------------------------------------------------------

test('telefone confiável → NOT_FOUND → formulário compartilhado → confirmação → CREATE único → re-resolve → workspace', async () => {
  const resolutionsByPhone = { [PHONE_X]: notFoundResolution(PHONE_X) }
  const { document, calls, delivered } = loadManyChatComposition({
    pageHtml: page({ phone: PHONE_X }),
    resolutionsByPhone,
    createLeadResult: (payload) => {
      resolutionsByPhone[PHONE_X] = linkedResolution({ name: payload?.name || 'Lead Novo', cycleId: CYCLE_X })
      return { ok: true, lead_id: 'lead-new', cycle_id: CYCLE_X, owner_user_id: 'user-1', lead: { id: 'lead-new', phone: PHONE_X } }
    },
  })

  await waitFor(() => document.querySelector('[data-yolen-lead-create-form]'))
  assert.equal(createLeadCalls(calls).length, 0, 'nada é criado sem confirmação humana')
  assert.equal(document.querySelector('[name="yolen-lead-phone"]')?.value?.replace(/\D/g, ''), PHONE_X)

  submitCreateForm(document, 'Lead Criado No ManyChat')
  // Duplo clique: o segundo envio é ignorado.
  document.querySelector('[data-yolen-lead-create-form]')?.dispatchEvent(
    new document.defaultView.Event('submit', { bubbles: true, cancelable: true }),
  )

  await waitFor(() => createLeadCalls(calls).length === 1)
  assert.equal(createLeadCalls(calls)[0].payload.phone, PHONE_X)
  assert.equal(createLeadCalls(calls)[0].payload.name, 'Lead Criado No ManyChat')

  await waitFor(() => panelText(document).includes('Lead Criado No ManyChat'), { timeoutMs: 10000 })
  await waitFor(() => document.querySelector('[data-yolen-lead-create-form]') === null)
  assert.equal(createLeadCalls(calls).length, 1)

  const created = delivered.find((entry) => entry.action === 'CREATE_LEAD').response.payload
  assert.deepEqual(Object.keys(created).sort(), ['code', 'error', 'ok', 'status'])
  assert.equal(created.ok, true)
})

test('CREATE confirmado sem vínculo visível → CREATED_UNRESOLVED; "Atualizar vínculo" só resolve, nunca repete CREATE', async () => {
  const resolutionsByPhone = { [PHONE_X]: notFoundResolution(PHONE_X) }
  const { document, calls } = loadManyChatComposition({
    pageHtml: page({ phone: PHONE_X }),
    resolutionsByPhone,
    createLeadResult: { ok: true, lead_id: 'lead-new', cycle_id: CYCLE_X },
  })

  await waitFor(() => document.querySelector('[data-yolen-lead-create-form]'))
  submitCreateForm(document, 'Lead Sem Vinculo')

  await waitFor(() => panelText(document).includes('Lead criado, mas o vínculo ainda não foi atualizado.'), { timeoutMs: 12000 })
  const resolvesBefore = resolveLeadCalls(calls).length

  resolutionsByPhone[PHONE_X] = linkedResolution({ name: 'Lead Sem Vinculo', cycleId: CYCLE_X })
  click(document, document.querySelector('[data-yolen-action="retry-lead-link"]'))

  await waitFor(() => panelText(document).includes('Lead Sem Vinculo') && !panelText(document).includes('Lead criado, mas'))
  assert.ok(resolveLeadCalls(calls).length > resolvesBefore)
  assert.equal(createLeadCalls(calls).length, 1)
})

test('conflito de criação: mensagem canônica, nenhum segundo CREATE automático', async () => {
  const { document, calls } = loadManyChatComposition({
    pageHtml: page({ phone: PHONE_X }),
    resolutionsByPhone: { [PHONE_X]: notFoundResolution(PHONE_X) },
    createLeadResult: { ok: false, code: 'active_lead_conflict', error: 'Já existe um lead ativo com este telefone.' },
  })

  await waitFor(() => document.querySelector('[data-yolen-lead-create-form]'))
  submitCreateForm(document, 'Lead Em Conflito')

  await waitFor(() => createLeadCalls(calls).length === 1)
  await sleep(2500)
  assert.equal(createLeadCalls(calls).length, 1)
})

// ---------------------------------------------------------------------------
// Vínculo manual (CONTACT_NOT_LINKED) pelo controller único do Core
// ---------------------------------------------------------------------------

test('CONTACT_NOT_LINKED sem telefone: buscar → selecionar → confirmar → first-link → re-resolve pelo Core', async () => {
  let linked = false
  const linkCalls = []

  const { document, calls } = loadManyChatComposition({
    pageHtml: page(),
    resolutionsByIdentity: {
      [KEY_X]: () =>
        linked
          ? linkedResolution({ name: 'Lead Vinculado', cycleId: CYCLE_X })
          : defaultLeadResolution({
              status: 'CONTACT_NOT_LINKED',
              user_message: 'Este contato ainda não está vinculado a nenhum lead da Yolen. Selecione o lead correto para vincular.',
              lead: null,
              cycle: null,
              phone: null,
              actions: { can_analyze_conversation: false, can_apply_suggestion: false, can_link_lead: true },
              flags: { is_owned_by_me: false, is_pool: false, is_closed: false },
              capabilities: { can_create_lead: false, can_open_cycle: false },
            }),
    },
    extraHandlers: {
      SEARCH_LINKABLE_LEADS: async (payload) => ({
        ok: true,
        statusCode: 200,
        payload: { ok: true, leads: payload.query === 'Vinc' ? [{ id: 'lead-target', name: 'Lead Vinculado', phone_hint: '•••0001', owner_name: 'Vendedor Teste', cycle_status: 'contato' }] : [] },
      }),
      FIRST_LINK_EXTERNAL_IDENTITY: async (payload) => {
        linkCalls.push(payload)
        linked = true
        return { ok: true, statusCode: 200, payload: { ok: true, status: 'LINKED' } }
      },
    },
  })

  await waitFor(() => document.querySelector('[data-yolen-action="contact-link-start"]'))
  click(document, document.querySelector('[data-yolen-action="contact-link-start"]'))

  await waitFor(() => document.querySelector('[data-yolen-link-query]'))
  document.querySelector('[data-yolen-link-query]').value = 'Vinc'
  click(document, document.querySelector('[data-yolen-action="contact-link-search"]'))

  await waitFor(() => document.querySelector('[data-yolen-action="contact-link-select"]'))
  assert.equal(document.querySelector('[data-yolen-action="contact-link-select"]').getAttribute('data-yolen-link-index'), '0')
  assert.doesNotMatch(panelOf(document).innerHTML, /lead-target/, 'id do lead nunca vai para o DOM')
  click(document, document.querySelector('[data-yolen-action="contact-link-select"]'))

  await waitFor(() => document.querySelector('[data-yolen-action="contact-link-confirm"]'))
  assert.equal(linkCalls.length, 0, 'nada é vinculado sem confirmação')
  click(document, document.querySelector('[data-yolen-action="contact-link-confirm"]'))
  click(document, document.querySelector('[data-yolen-action="contact-link-confirm"]') ?? panelOf(document))

  await waitFor(() => panelText(document).includes('Lead Vinculado') && document.querySelector('[data-yolen-seller-area="client"]'))
  assert.equal(linkCalls.length, 1, 'duplo clique não duplica o vínculo')
  assert.deepEqual({ ...linkCalls[0] }, {
    platform: 'manychat',
    platform_contact_key: KEY_X,
    lead_id: 'lead-target',
    confirmed: true,
    channel: 'whatsapp',
  })
  assert.ok(resolveLeadCalls(calls).length >= 2)
  assert.equal(actionCalls(calls, 'SEARCH_LINKABLE_LEADS').length, 1)
})

// ---------------------------------------------------------------------------
// Estados comerciais, permissões e as quatro áreas
// ---------------------------------------------------------------------------

test('estados comerciais: outra carteira, Pool e ciclo encerrado pelo mesmo Core, sem ações não autorizadas', async () => {
  const cases = [
    {
      resolution: linkedResolution({ name: 'Lead De Outro', cycleId: 'cycle-other', status: 'OWNED_BY_OTHER', flags: { is_owned_by_me: false } }),
      text: 'Lead De Outro',
    },
    {
      resolution: { ...linkedResolution({ name: 'Lead No Pool', cycleId: 'cycle-pool', status: 'IN_POOL', flags: { is_pool: true, is_owned_by_me: false } }), capabilities: { can_open_pool: true, can_open_cycle: true, can_create_lead: false } },
      text: 'Lead No Pool',
      action: 'open-pool',
    },
    {
      resolution: linkedResolution({ name: 'Lead Encerrado', cycleId: 'cycle-closed', status: 'CLOSED_CYCLE', flags: { is_closed: true, is_owned_by_me: false } }),
      text: 'Lead Encerrado',
    },
  ]

  for (const scenario of cases) {
    const { document, calls } = loadManyChatComposition({
      pageHtml: page(),
      resolutionsByIdentity: { [KEY_X]: scenario.resolution },
    })

    await waitFor(() => panelText(document).includes(scenario.text))
    await sleep(600)
    assert.equal(document.querySelector('[data-yolen-lead-create-form]'), null, scenario.text)
    assert.equal(ingestCalls(calls).length, 0, `${scenario.text}: sem análise autorizada não há captura`)
    assert.equal(actionCalls(calls, 'ANALYZE_CONVERSATION').length, 0)
    if (scenario.action) {
      assert.ok(document.querySelector(`[data-yolen-action="${scenario.action}"]`), scenario.action)
    }
  }
})

test('MENSAGEM: gerar, copiar e incluir no composer do ManyChat; rascunho ocupado preservado; incluir nunca envia', async () => {
  const MESSAGE = 'Olá! Posso te mandar a proposta do plano anual?'
  const { document, window, calls } = loadManyChatComposition({
    pageHtml: page(),
    resolutionsByIdentity: { [KEY_X]: linkedResolution({ name: 'Lead Xis', cycleId: CYCLE_X }) },
    messageGenerationResult: { status: 'ready', message: MESSAGE, error: null },
    leadSummaryResult: (_count, request) => ({
      ok: true,
      data: {
        identity: { company_id: 'company-1', lead_id: null, cycle_id: request?.cycle_id, conversation_key: request?.conversation_key },
        summary: { summary: 'Cliente pediu a proposta do plano anual.', version: 1, updated_at: '2026-09-20T12:00:00.000Z' },
        working_summary: 'Cliente pediu a proposta do plano anual.',
      },
    }),
  })

  let copied = null
  Object.defineProperty(window.navigator, 'clipboard', {
    configurable: true,
    value: { async writeText(value) { copied = value } },
  })
  let sendClicks = 0
  document.querySelector('[data-test-id="send"]').addEventListener('click', () => {
    sendClicks += 1
  })

  await waitFor(() => actionCalls(calls, 'LOAD_LEAD_SUMMARY').length > 0)
  await waitFor(() => document.querySelector('[data-yolen-seller-area="message"]'))
  click(document, document.querySelector('[data-yolen-seller-area="message"]'))
  await waitFor(() => document.querySelector('[data-yolen-seller-message-intent]'))

  const intent = document.querySelector('[data-yolen-seller-message-intent]')
  intent.value = 'Oferecer a proposta.'
  intent.dispatchEvent(new window.Event('input', { bubbles: true }))
  click(document, document.querySelector('[data-yolen-seller-message-action="generate"]'))

  await waitFor(() => document.querySelector('[data-yolen-seller-message-action="insert"]'))
  assert.equal(document.querySelector('[data-yolen-seller-message-action="insert"]').textContent, 'Incluir no ManyChat')
  assert.equal(composer(document).value, '', 'o campo MENSAGEM do painel nunca é tomado pelo composer')

  click(document, document.querySelector('[data-yolen-seller-message-action="copy"]'))
  await sleep(30)
  assert.equal(copied, MESSAGE)

  composer(document).value = 'Rascunho do vendedor'
  click(document, document.querySelector('[data-yolen-seller-message-action="insert"]'))
  await waitFor(() => panelText(document).includes('já contém texto'))
  assert.equal(composer(document).value, 'Rascunho do vendedor')

  composer(document).value = ''
  click(document, document.querySelector('[data-yolen-seller-message-action="insert"]'))
  await waitFor(() => composer(document).value === MESSAGE)
  await sleep(300)
  assert.equal(sendClicks, 0, 'nenhum envio automático')
})

test('CLIENTE: registro da conversa (preview → confirmação) no ciclo resolvido por identidade', async () => {
  const { document, calls } = loadManyChatComposition({
    pageHtml: page({ messages: [{ mid: 'm1', text: 'Quero fechar o plano anual.' }] }),
    resolutionsByIdentity: { [KEY_X]: linkedResolution({ name: 'Lead Xis', cycleId: CYCLE_X }) },
    registrationPreviewResult: {
      ok: true,
      data: { summary_text: 'RESUMO_MANYCHAT', watermark: 'wm-1', confirmation_token: 'token-mc', message_count: 1, occurred_at: '2026-09-20T13:00:00.000Z', already_registered: false },
    },
    registrationConfirmResult: { ok: true, data: { registered: true, event_id: 'event-mc' } },
  })

  await waitFor(() => document.querySelector('[data-yolen-seller-area="client"]'))
  click(document, document.querySelector('[data-yolen-seller-area="client"]'))
  await waitFor(() => document.querySelector('[data-yolen-action="register-conversation"]'))
  click(document, document.querySelector('[data-yolen-action="register-conversation"]'))
  await waitFor(() => document.querySelector('[data-yolen-action="confirm-conversation-registration"]'))
  assert.match(panelText(document), /RESUMO_MANYCHAT/)
  click(document, document.querySelector('[data-yolen-action="confirm-conversation-registration"]'))

  await waitFor(() => actionCalls(calls, 'CONFIRM_CONVERSATION_REGISTRATION').length === 1)
  const confirm = actionCalls(calls, 'CONFIRM_CONVERSATION_REGISTRATION')[0].payload
  assert.equal(confirm.cycle_id, CYCLE_X)
  assert.equal(confirm.confirmation_token, 'token-mc')
  assert.match(confirm.conversation_key, /^manychat:/)
})

test('CLIENTE: enriquecimento com resolução sanitizada — só campo ausente, confirmação humana, lead_id reinjetado no background', async () => {
  const applied = []
  const { document, calls, transported } = loadManyChatComposition({
    pageHtml: page({ messages: [{ mid: 'm1', text: 'Pode mandar para cliente.manychat@example.com por favor.' }] }),
    resolutionsByIdentity: { [KEY_X]: linkedResolution({ name: 'Lead Xis', cycleId: CYCLE_X }) },
    extraHandlers: {
      APPLY_LEAD_ENRICHMENT: async (payload) => {
        applied.push(payload)
        return { ok: true, statusCode: 200, payload: { ok: true, status: 'APPLIED' } }
      },
    },
  })

  await waitFor(() => document.querySelector('[data-yolen-seller-area="client"]'))
  click(document, document.querySelector('[data-yolen-seller-area="client"]'))
  await waitFor(() => document.querySelector('[data-yolen-action="confirm-lead-enrichment"]'))
  assert.equal(applied.length, 0, 'nada aplicado sem confirmação')

  click(document, document.querySelector('[data-yolen-action="confirm-lead-enrichment"]'))
  await waitFor(() => applied.length === 1)

  const fromContent = actionCalls(calls, 'APPLY_LEAD_ENRICHMENT')[0].payload
  assert.equal(fromContent.lead_id, null, 'o content ManyChat nunca conhece o lead_id')
  assert.equal(fromContent.cycle_id, CYCLE_X)
  assert.equal(fromContent.value, 'cliente.manychat@example.com')
  assert.equal(fromContent.confirmed_by_human, true)
  assert.equal(applied[0].lead_id, `lead-${CYCLE_X}`, 'background reinjeta a referência privada pelo ciclo autorizado')
  assert.equal(transported.filter((message) => message.action === 'APPLY_LEAD_ENRICHMENT').length, 1)
})

test('CLIENTE: campo já preenchido (valor privado) nunca é oferecido para sobrescrita no canal sanitizado', async () => {
  const { document, calls } = loadManyChatComposition({
    pageHtml: page({ messages: [{ mid: 'm1', text: 'Meu e-mail novo é outro.manychat@example.com' }] }),
    resolutionsByIdentity: {
      [KEY_X]: linkedResolution({ name: 'Lead Xis', cycleId: CYCLE_X, lead: { email: 'atual@example.com' } }),
    },
  })

  await waitFor(() => document.querySelector('[data-yolen-seller-area="client"]'))
  click(document, document.querySelector('[data-yolen-seller-area="client"]'))
  await sleep(1200)
  assert.equal(document.querySelector('[data-yolen-action="confirm-lead-enrichment"]'), null)
  assert.equal(actionCalls(calls, 'APPLY_LEAD_ENRICHMENT').length, 0)
  assert.doesNotMatch(panelText(document), /atual@example\.com/)
})

// ---------------------------------------------------------------------------
// Áudio e transcrição
// ---------------------------------------------------------------------------

const AUDIO_URL = 'https://manybot-files.manychat.io/3678277/wa/audio-1.ogg'

function audioOk() {
  return { ok: true, statusCode: 200, payload: { ready: true, audio_base64: Buffer.from('OggS-manychat').toString('base64'), mime_type: 'audio/ogg' } }
}

function audioPage() {
  return page({ messages: [{ mid: 'm1', text: 'Mandei um áudio.' }, { mid: 'a-1', audioUrl: AUDIO_URL }] })
}

test('áudio: o Core pede a fonte ao ManyChatAdapter por handle opaco e transcreve pela Yolen no ciclo atual', async () => {
  const fetched = []
  const { document, calls } = loadManyChatComposition({
    pageHtml: audioPage(),
    resolutionsByIdentity: { [KEY_X]: linkedResolution({ name: 'Lead Xis', cycleId: CYCLE_X }) },
    fetchAudioSource: async (url) => {
      fetched.push(url)
      return audioOk()
    },
  })

  await waitFor(() => document.querySelector('[data-yolen-action="transcribe-audio"]'), { timeoutMs: 10000 })
  click(document, document.querySelector('[data-yolen-action="transcribe-audio"]'))
  await waitFor(() => actionCalls(calls, 'TRANSCRIBE_AUDIO').length === 1)

  const payload = actionCalls(calls, 'TRANSCRIBE_AUDIO')[0].payload
  assert.equal(payload.cycle_id, CYCLE_X)
  assert.equal(payload.mime_type, 'audio/ogg')
  assert.ok(payload.audio_base64.length > 0)
  assert.deepEqual(fetched, [AUDIO_URL])
})

test('áudio stale: troca A → B durante o download nunca vira transcrição de A em B', async () => {
  const release = deferred()
  const fetched = []
  const runtime = loadManyChatComposition({
    pageHtml: audioPage(),
    currentIdentity: () => (runtime?.window?.location?.href === CHAT_B_URL ? KEY_Y : KEY_X),
    resolutionsByIdentity: {
      [KEY_X]: linkedResolution({ name: 'Lead Xis', cycleId: CYCLE_X }),
      [KEY_Y]: linkedResolution({ name: 'Lead Ypsilon', cycleId: CYCLE_Y, phone: PHONE_Y }),
    },
    fetchAudioSource: async (url) => {
      fetched.push(url)
      await release.promise
      return audioOk()
    },
  })
  const { document, calls } = runtime

  await waitFor(() => document.querySelector('[data-yolen-action="transcribe-audio"]'), { timeoutMs: 10000 })
  click(document, document.querySelector('[data-yolen-action="transcribe-audio"]'))
  await waitFor(() => fetched.length === 1)

  runtime.navigate(CHAT_B_URL)
  await waitFor(() => panelText(document).includes('Lead Ypsilon'), { timeoutMs: 10000 })

  release.resolve()
  await sleep(800)
  assert.equal(actionCalls(calls, 'TRANSCRIBE_AUDIO').length, 0, 'áudio stale nunca é transcrito')
  assert.doesNotMatch(panelText(document), /Lead Xis/)
})

// ---------------------------------------------------------------------------
// Isolamento de conversa (A → B → A, mesma rota com outro contato)
// ---------------------------------------------------------------------------

test('A → B → A: resolução tardia de A nunca aparece em B; A₂ resolve de novo sem herdar A₁', async () => {
  const releaseA1 = deferred()
  let aCalls = 0
  const runtime = loadManyChatComposition({
    pageHtml: page(),
    currentIdentity: () => (runtime?.window?.location?.href === CHAT_B_URL ? KEY_Y : KEY_X),
    resolutionsByIdentity: {
      [KEY_X]: async () => {
        aCalls += 1
        if (aCalls === 1) await releaseA1.promise
        return linkedResolution({ name: 'Lead Xis', cycleId: CYCLE_X })
      },
      [KEY_Y]: linkedResolution({ name: 'Lead Ypsilon', cycleId: CYCLE_Y, phone: PHONE_Y }),
    },
  })
  const { document, calls } = runtime

  await waitFor(() => aCalls === 1)
  runtime.navigate(CHAT_B_URL)
  await waitFor(() => panelText(document).includes('Lead Ypsilon'), { timeoutMs: 10000 })

  releaseA1.resolve()
  await sleep(700)
  assert.match(panelText(document), /Lead Ypsilon/)
  assert.doesNotMatch(panelText(document), /Lead Xis/, 'resposta tardia de A não aparece em B')
  assert.ok(ingestCalls(calls).every((call) => call.payload.cycle_id !== CYCLE_X || !call.payload.conversation_key.includes('999999999')))

  // A₂ é uma geração nova: nunca herda a promise presa de A₁ (que já
  // terminou); o resultado estável de A pode vir do cache de resolução por
  // empresa + identidade, como no WhatsApp.
  runtime.navigate(CHAT_A_URL)
  await waitFor(() => panelText(document).includes('Lead Xis'), { timeoutMs: 10000 })
  assert.doesNotMatch(panelText(document), /Lead Ypsilon/)
  await waitFor(() => ingestCalls(calls).some((call) => call.payload.cycle_id === CYCLE_X && call.payload.conversation_key.includes('438324835')))

  const bResolves = resolveLeadCalls(calls).filter((call) => call.payload.platform_contact_key === KEY_Y)
  assert.equal(bResolves.length, 1, 'sem callbacks duplicados para B')
})

test('mesma rota, outro contato (CONTACT_CHANGED): o Core invalida o contexto do contato anterior e resolve o novo', async () => {
  let identity = KEY_X
  const runtime = loadManyChatComposition({
    pageHtml: page(),
    currentIdentity: () => identity,
    resolutionsByIdentity: {
      [KEY_X]: linkedResolution({ name: 'Lead Xis', cycleId: CYCLE_X }),
      [KEY_Z]: linkedResolution({ name: 'Lead Zeta', cycleId: 'cycle-zeta' }),
    },
  })
  const { document, calls } = runtime

  await waitFor(() => panelText(document).includes('Lead Xis'))

  // O ManyChat troca o contato aberto sem mudar a URL: nova identidade e
  // novas mensagens na mesma rota.
  identity = KEY_Z
  const list = document.querySelector('div[data-test-id="chat-messages-list"]')
  list.insertAdjacentHTML('beforeend', '<div><div class="_wrapper_x _typeIn_x" data-title="2026-09-14T20:31:00" data-title-at="1" data-title-offset-bottom="1"><span data-mid="z-1">Oi, sou outro contato.</span></div></div>')

  await waitFor(() => panelText(document).includes('Lead Zeta'), { timeoutMs: 15000 })
  assert.doesNotMatch(panelText(document), /Lead Xis/)
  assert.ok(resolveLeadCalls(calls).some((call) => call.payload.platform_contact_key === KEY_Z))
})

// ---------------------------------------------------------------------------
// Sessão e empresa
// ---------------------------------------------------------------------------

test('sessão ausente: nada é resolvido; recuperação da sessão resolve pelo mesmo Core', async () => {
  let sessionReady = false
  const { document, calls } = loadManyChatComposition({
    pageHtml: page(),
    resolutionsByIdentity: { [KEY_X]: linkedResolution({ name: 'Lead Xis', cycleId: CYCLE_X }) },
    getMeResult: () =>
      sessionReady
        ? undefined
        : { ok: false, statusCode: 401, payload: { ok: false, status: 'NO_COMPANION_SESSION', error: 'Sessão ausente.' } },
  })

  await waitFor(() => document.querySelector('[data-yolen-action="connect-yolen"]'))
  await sleep(600)
  assert.equal(resolveLeadCalls(calls).length, 0)

  sessionReady = true
  click(document, document.querySelector('[data-yolen-action="refresh"]'))
  await waitFor(() => panelText(document).includes('Lead Xis'), { timeoutMs: 10000 })
})

test('troca de empresa e perda de sessão invalidam o contexto comercial', async () => {
  let company = { id: 'company-1', name: 'Empresa Um', role: 'member' }
  let sessionLost = false
  const { document, calls } = loadManyChatComposition({
    pageHtml: page(),
    resolutionsByIdentity: { [KEY_X]: () => linkedResolution({ name: `Lead ${company.name}`, cycleId: `cycle-${company.id}` }) },
    getMeResult: () =>
      sessionLost
        ? { ok: false, statusCode: 401, payload: { ok: false, status: 'NO_COMPANION_SESSION', error: 'Sessão expirada.' } }
        : { ok: true, statusCode: 200, origin: 'https://cockpit-comercial-vocn.vercel.app', payload: { ok: true, user: { id: 'user-1', full_name: 'Vendedor' }, active_company: company } },
  })

  await waitFor(() => panelText(document).includes('Lead Empresa Um'))

  company = { id: 'company-2', name: 'Empresa Dois', role: 'member' }
  click(document, document.querySelector('[data-yolen-action="refresh"]'))
  await waitFor(() => panelText(document).includes('Lead Empresa Dois'), { timeoutMs: 10000 })
  assert.doesNotMatch(panelText(document), /Lead Empresa Um/)

  sessionLost = true
  click(document, document.querySelector('[data-yolen-action="refresh"]'))
  await waitFor(() => document.querySelector('[data-yolen-action="connect-yolen"]'), { timeoutMs: 10000 })
  assert.doesNotMatch(panelText(document), /Lead Empresa Dois/)
  assert.ok(resolveLeadCalls(calls).length >= 2)
})

// ---------------------------------------------------------------------------
// ANÁLISE: inserção confirmada pelo vendedor
// ---------------------------------------------------------------------------

const SUGGESTED = 'Entendo a dúvida sobre o preço. Posso te mostrar o plano anual?'
const JOB_ID = 'e'.repeat(64)

function readingWithMessage() {
  const evidence = (summary) => ({ summary, evidence_message_ids: [], memory_ids: [] })
  return {
    contract_version: 'commercial-reading-v1',
    analysis_status: 'complete',
    analysis_limitations: [],
    commercial_role: 'buyer',
    commercial_relevance: 'commercial',
    conversation_summary: { current_state: evidence('Cliente avaliando o preço.') },
    customer: {
      objectives: [], problems: [], impacts: [], needs: [], interests: [],
      decision_criteria: [], preferences: [], open_questions: [], objections: [],
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
    best_approach: { decision: 'handle_objection', reason: 'Tratar a objeção de preço.', channel: 'text', evidence_message_ids: [], memory_ids: [] },
    communication: { intervention_needed: true, recommended_question: null, recommended_message: SUGGESTED },
    operations: {
      crm: { should_change_crm_stage: false, recommended_status: null, rationale: null, requires_human_confirmation: true },
      agenda: { should_change_agenda: false, expected_next_action_at: null, rationale: null, requires_human_confirmation: true },
    },
    evidence_message_ids: [],
    memory_ids: [],
  }
}

test('ANÁLISE: composer ocupado exige confirmação humana; inserção confirmada escreve no ManyChat e nunca envia', async () => {
  const { document, window, calls } = loadManyChatComposition({
    pageHtml: page(),
    resolutionsByIdentity: { [KEY_X]: linkedResolution({ name: 'Lead Xis', cycleId: CYCLE_X }) },
    analysisResult: { ok: true, data: { deep_analysis: { analysis_job_id: JOB_ID, status: 'queued', message_watermark: 'wm-1' } } },
    analysisJobStatusResult: {
      ok: true,
      data: {
        analysis_job_id: JOB_ID,
        status: 'succeeded',
        message_watermark: 'wm-1',
        result: {
          contract_version: 'phase12a-deep-seller-v1',
          engine_source: 'stateful',
          commercial_relevance: 'commercial',
          commercial_role: 'buyer',
          summary: 'Resumo profundo.',
          commercial_reading: readingWithMessage(),
          recommended_next_approach: 'Ver leitura comercial.',
          recommended_question: null,
          suggested_message: null,
        },
      },
    },
    decisionStateResult: defaultAgoraDecisionState(),
  })

  const confirmations = []
  window.confirm = (text) => {
    confirmations.push(text)
    return confirmations.length > 1
  }
  let sendClicks = 0
  document.querySelector('[data-test-id="send"]').addEventListener('click', () => {
    sendClicks += 1
  })

  await waitFor(() => ingestCalls(calls).length > 0)
  await waitFor(() => document.querySelector('[data-yolen-action="analyze-conversation"]'))
  click(document, document.querySelector('[data-yolen-action="analyze-conversation"]'))
  const insertButton = await waitFor(() => document.querySelector('[data-yolen-action="insert-suggested-message"]'), { timeoutMs: 12000 })
  assert.match(insertButton.textContent, /Inserir no ManyChat/)

  composer(document).value = 'Rascunho do vendedor'
  click(document, insertButton)
  await sleep(150)
  assert.equal(composer(document).value, 'Rascunho do vendedor', 'recusa preserva o rascunho')
  assert.match(confirmations[0], /O campo do ManyChat já tem texto/)

  click(document, document.querySelector('[data-yolen-action="insert-suggested-message"]'))
  await waitFor(() => actionCalls(calls, 'REGISTER_MESSAGE_ACTION').some((call) => call.payload?.action === 'inserted'))
  assert.equal(composer(document).value, SUGGESTED)
  const inserted = actionCalls(calls, 'REGISTER_MESSAGE_ACTION').find((call) => call.payload?.action === 'inserted')
  assert.equal(inserted.payload.cycle_id, CYCLE_X)
  await sleep(300)
  assert.equal(sendClicks, 0, 'inserir nunca envia')
})
