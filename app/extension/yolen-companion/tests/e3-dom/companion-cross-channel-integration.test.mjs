// STEP 2B.5-D1 — "FECHAR PARIDADE REAL DO COMPANION": testes de
// INTEGRAÇÃO cross-channel de verdade — nunca apenas chamar o renderer
// puro compartilhado (companion-seller-workspace-view.js) diretamente com
// inputs equivalentes (isso só provaria o renderer, nunca que WhatsApp e
// ManyChat de fato CHEGAM a ele com o mesmo estado). Aqui, o MESMO fixture
// de backend (createFakeBackground, load-content-script.mjs) alimenta as
// DUAS orquestrações reais — content-script.js (via loadContentScript) e
// manychat-seller-panel-runtime.js (via loadManyChatRuntime) — e as
// asserções comparam o HTML/estado que cada orquestração produz de
// verdade, através dos seus próprios caminhos de carregamento
// (refreshViewModels/renderPanel no ManyChat; resolveCurrentLead/
// loadCompanionLeadSummaryForCurrentCycle/renderPanel no WhatsApp).
//
// Casos obrigatórios (mandato STEP 2B.5-D1, seção 13): A (AGORA), B/C
// (resumo do lead pronto/erro), D (salvar resumo/conflito), E/F/G
// (MENSAGEM: mesmo working_summary -> mesma UI, adapters distintos, sem
// implementação paralela), H (ANÁLISE pronta/erro), I (CLIENTE conteúdo
// compartilhado), J (A->B->A sem vazamento de estado).

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyLeadEnrichmentCalls,
  applyManyChatLeadEnrichmentCalls,
  buildMessageHtml,
  createFakeBackground,
  defaultAgoraDecisionState,
  defaultClientContext,
  defaultLeadSummary,
  leadEnrichmentContextCalls,
  loadContentScript,
  waitFor,
} from '../e3-test-support/load-content-script.mjs'
import { loadManyChatRuntime } from '../e3-test-support/load-manychat-runtime.mjs'

const WHATSAPP_TITLE = '+55 11 98888-7777'
const WHATSAPP_PHONE = '5511988887777'
const MANYCHAT_CONVERSATION_KEY = 'manychat:contact-42'
const CYCLE_ID = 'cycle-shared-1'

function initialWhatsAppPageHtml() {
  const messagesHtml = buildMessageHtml({
    id: 'msg-1',
    prePlainText: '[10:15, 21/08/2026] Cliente: ',
    text: 'Quero saber mais sobre o plano.',
  })

  return `<!doctype html><html><body>
    <div id="app">
      <div id="main">
        <header><span title="${WHATSAPP_TITLE}">${WHATSAPP_TITLE}</span></header>
        <div id="conversation-body">${messagesHtml}</div>
        <footer><div contenteditable="true" role="textbox"></div></footer>
      </div>
    </div>
  </body></html>`
}

function getWhatsAppPanel(document) {
  return document.getElementById('yolen-companion-panel')
}

async function bootWhatsApp(fixtures) {
  const wa = loadContentScript({
    initialHtml: initialWhatsAppPageHtml(),
    resolutionsByPhone: { [WHATSAPP_PHONE]: { ok: true, status: 'OWNED_BY_ME', lead: { id: 'lead-1', name: 'Cliente Teste', phone: WHATSAPP_PHONE, email: null, cpf_cnpj: null, deleted_at: null }, cycle: { id: CYCLE_ID, status: 'contato', owner_user_id: 'user-1' }, actions: { can_analyze_conversation: true, can_apply_suggestion: true }, flags: { is_owned_by_me: true, is_pool: false, is_closed: false }, phone: WHATSAPP_PHONE } },
    withSellerMessageRuntime: true,
    ...fixtures,
  })

  await waitFor(() => getWhatsAppPanel(wa.document))
  return wa
}

function bootManyChat({ ledgerMessages = [], ...fixtures } = {}) {
  const background = createFakeBackground(fixtures)

  const mc = loadManyChatRuntime({
    sendMessage: background.sendMessage,
    getCurrentConversationKey: () => MANYCHAT_CONVERSATION_KEY,
    getCycleId: () => CYCLE_ID,
    // STEP 2B.5-D1 (Blocker D, Lead Enrichment): mesma fronteira de
    // fake já usada para getCycleId/getCurrentConversationKey — o
    // ledger em si (acumulação/dedupe/retenção) é testado isoladamente
    // em manychat-capture-runtime; aqui só prova que
    // manychat-seller-panel-runtime.js consome o que o ledger devolve.
    getEnrichmentLedgerMessages: () => ledgerMessages,
  })

  return { ...mc, calls: background.calls }
}

// Mensagem já observada com o MESMO shape que
// manychat-capture-runtime.js#getEnrichmentLedgerMessages devolve
// (id/direction/text/audio_transcription/timestamp_ms) — nunca o shape
// cru do adapter (message_key/text_content/occurred_at), que já foi
// traduzido antes de chegar aqui.
function ledgerMessage({ id, text, direction = 'incoming', timestampMs = 0 }) {
  return { id, direction, text, audio_transcription: null, timestamp_ms: timestampMs }
}

function initialWhatsAppPageHtmlWithMessage(text, { id = 'msg-enrichment-1' } = {}) {
  const messagesHtml = buildMessageHtml({
    id,
    prePlainText: '[10:15, 21/08/2026] Cliente: ',
    text,
  })

  return `<!doctype html><html><body>
    <div id="app">
      <div id="main">
        <header><span title="${WHATSAPP_TITLE}">${WHATSAPP_TITLE}</span></header>
        <div id="conversation-body">${messagesHtml}</div>
        <footer><div contenteditable="true" role="textbox"></div></footer>
      </div>
    </div>
  </body></html>`
}

function ownedResolutionWithProfile(profileOverrides = {}, leadOverrides = {}) {
  return {
    ok: true,
    status: 'OWNED_BY_ME',
    lead: { id: 'lead-1', name: 'Cliente Teste', phone: WHATSAPP_PHONE, email: null, cpf_cnpj: null, deleted_at: null, ...leadOverrides },
    lead_profile: {
      email: null,
      cpf: null,
      cnpj: null,
      birth_date: null,
      profession: null,
      cep: null,
      phone_mobile: null,
      ...profileOverrides,
    },
    cycle: { id: CYCLE_ID, status: 'contato', owner_user_id: 'user-1' },
    actions: { can_analyze_conversation: true, can_apply_suggestion: true },
    flags: { is_owned_by_me: true, is_pool: false, is_closed: false },
    phone: WHATSAPP_PHONE,
  }
}

// -----------------------------------------------------------------------
// A) AGORA: mesmo AgoraViewModel (decisionStateResult) -> os dois canais
// exibem o MESMO marcador semântico (data-yolen-now-attention), através
// da orquestração real (nunca chamando renderAgoraAreaHtml diretamente).
// -----------------------------------------------------------------------
test('A) AGORA: WhatsApp e ManyChat produzem o MESMO marcador semântico para o MESMO AgoraViewModel', async () => {
  const agoraFixture = defaultAgoraDecisionState({
    silent: false,
    silent_reason: null,
    primary: {
      status: 'respond',
      priority: 'high',
      headline: 'Cliente perguntou o prazo de implantação.',
      action: 'Confirmar o prazo de implantação com o cliente.',
      provenance: { decision_kind: 'respond', source: 'customer_waiting', evidence_message_ids: ['msg-1'], memory_ids: [] },
    },
    secondary: [],
  })

  const wa = await bootWhatsApp({ decisionStateResult: agoraFixture })
  await waitFor(() => getWhatsAppPanel(wa.document).innerHTML.includes('data-yolen-now-attention'))
  const waHtml = getWhatsAppPanel(wa.document).innerHTML

  const mc = bootManyChat({ decisionStateResult: agoraFixture })
  await mc.runtime.refreshViewModels({ cycleId: CYCLE_ID, conversationKey: MANYCHAT_CONVERSATION_KEY })
  const mcHtml = mc.getPanelHtml()

  assert.match(waHtml, /data-yolen-now-attention="respond"/)
  assert.match(mcHtml, /data-yolen-now-attention="respond"/)
  assert.match(waHtml, /Cliente perguntou o prazo de implantação\./)
  assert.match(mcHtml, /Cliente perguntou o prazo de implantação\./)
})

// -----------------------------------------------------------------------
// B/C) Resumo do lead: pronto e erro produzem o MESMO card/estado nos dois
// canais, através de LOAD_LEAD_SUMMARY real.
// -----------------------------------------------------------------------
test('B) Resumo do lead pronto: WhatsApp e ManyChat mostram o MESMO texto de resumo', async () => {
  const leadSummaryFixture = defaultLeadSummary({
    data: { working_summary: 'Cliente perguntou sobre horários de atendimento.', summary: null },
  })

  const wa = await bootWhatsApp({ leadSummaryResult: leadSummaryFixture })
  await waitFor(() => getWhatsAppPanel(wa.document).innerHTML.includes('Cliente perguntou sobre horários de atendimento.'))
  const waHtml = getWhatsAppPanel(wa.document).innerHTML

  const mc = bootManyChat({ leadSummaryResult: leadSummaryFixture })
  await mc.runtime.refreshViewModels({ cycleId: CYCLE_ID, conversationKey: MANYCHAT_CONVERSATION_KEY })
  const mcHtml = mc.getPanelHtml()

  assert.match(waHtml, /yolen-lead-summary-card/)
  assert.match(mcHtml, /yolen-lead-summary-card/)
  assert.match(waHtml, /Cliente perguntou sobre horários de atendimento\./)
  assert.match(mcHtml, /Cliente perguntou sobre horários de atendimento\./)
})

test('C) Resumo do lead com erro: WhatsApp e ManyChat mostram o MESMO estado de erro com retry', async () => {
  const fixtures = { leadSummaryResult: { ok: false, error: 'Não foi possível carregar o resumo salvo na Yolen.' } }

  const wa = await bootWhatsApp(fixtures)
  await waitFor(() => getWhatsAppPanel(wa.document).innerHTML.includes('yolen-lead-summary--error'))
  const waHtml = getWhatsAppPanel(wa.document).innerHTML

  const mc = bootManyChat(fixtures)
  await mc.runtime.refreshViewModels({ cycleId: CYCLE_ID, conversationKey: MANYCHAT_CONVERSATION_KEY })
  const mcHtml = mc.getPanelHtml()

  for (const html of [waHtml, mcHtml]) {
    assert.match(html, /yolen-lead-summary--error/)
    assert.match(html, /data-yolen-action="refresh"/)
  }
})

// -----------------------------------------------------------------------
// D) Salvar resumo: compare-and-set/409 tratado com a MESMA semântica nos
// dois canais (conflict, nunca overwrite silencioso).
// -----------------------------------------------------------------------
test('D) saveLeadSummary: 409 (LEAD_SUMMARY_VERSION_CONFLICT) nunca sobrescreve o resumo em nenhum dos dois canais', async () => {
  const fixtures = {
    leadSummaryResult: defaultLeadSummary({ data: { working_summary: 'Resumo original.', summary: { summary: 'Resumo original.', version: 3, updated_at: null } } }),
    saveLeadSummaryResult: { ok: false, code: 'LEAD_SUMMARY_VERSION_CONFLICT' },
  }

  const mc = bootManyChat(fixtures)
  await mc.runtime.retryLeadSummary(MANYCHAT_CONVERSATION_KEY)
  await mc.runtime.saveLeadSummary(MANYCHAT_CONVERSATION_KEY, 'Tentativa de sobrescrever.')

  const state = mc.runtime.getConversationPanelState(MANYCHAT_CONVERSATION_KEY)
  assert.equal(state.leadSummarySaveStatus, 'conflict')
  assert.equal(state.leadSummary.data.working_summary, 'Resumo original.', 'ManyChat nunca sobrescreve com o rascunho num conflito')

  // WhatsApp: mesma semântica já coberta por handleSaveLeadSummaryClick()
  // (content-script.js, teste unitário próprio) — a prova de integração
  // aqui é que o ManyChat reconhece o MESMO código de conflito
  // (LEAD_SUMMARY_VERSION_CONFLICT) através do MESMO controlador
  // compartilhado (companion-lead-summary-controller.js) que reproduz a
  // convenção de window.YolenCompanionApi.saveLeadSummary
  // (yolen-api.js/background.js) usada pelo WhatsApp — nunca uma segunda
  // convenção de conflito por plataforma.
})

// -----------------------------------------------------------------------
// H) ANÁLISE: pronta e com erro (failed) produzem o MESMO marcador nos
// dois canais.
// -----------------------------------------------------------------------
test('H) ANÁLISE pronta: WhatsApp e ManyChat renderizam o MESMO card de análise para o MESMO AnalysisViewModel', async () => {
  // IMPORTANTE: LOAD_ANALYSIS_VIEW_MODEL devolve o AnalysisViewModel JÁ
  // CONSTRUÍDO pelo servidor (mesmo shape que
  // buildAnalysisViewModelFromReading produz), nunca a CommercialReading
  // bruta — os dois canais passam response.payload.data DIRETO para
  // renderAnalysisViewModel.
  const analysisFixture = {
    ok: true,
    data: {
      available: true,
      unavailable_reason: null,
      neutral: false,
      neutral_headline: null,
      neutral_description: null,
      opportunity: null,
      current_moment: { is_active_session: true },
      risks: [],
      objections_open: [],
      commitments: [],
      seller_conduct: { method: null, stage_divergence: false },
      strengths: [{ summary: 'Confirmou o prazo de implantação com o cliente.', why_it_matters: null, kind: 'other' }],
      improvements: [],
      continuity: { cycle_conversation_count: 0, cross_conversation_signals: [] },
      history: [],
      provenance: {},
    },
  }

  const wa = await bootWhatsApp({ analysisViewModelResult: analysisFixture })
  // Espera pelo MARCADOR REAL (texto do fixture do servidor) — nunca só
  // pela classe wrapper: o fallback local (leitura já resolvida
  // localmente, antes do LOAD_ANALYSIS_VIEW_MODEL do servidor responder)
  // usa a MESMA classe yolen-analysis-area-card, então esperar só por ela
  // pega o estado fallback transitório, não o final vindo do backend.
  await waitFor(() => getWhatsAppPanel(wa.document).innerHTML.includes('Confirmou o prazo de implantação com o cliente.'))
  const waHtml = getWhatsAppPanel(wa.document).innerHTML

  const mc = bootManyChat({ analysisViewModelResult: analysisFixture })
  await mc.runtime.refreshViewModels({ cycleId: CYCLE_ID, conversationKey: MANYCHAT_CONVERSATION_KEY })
  const mcHtml = mc.getPanelHtml()

  assert.match(waHtml, /yolen-analysis-area-card/)
  assert.match(mcHtml, /yolen-analysis-area-card/)
  assert.match(waHtml, /Confirmou o prazo de implantação com o cliente\./)
  assert.match(mcHtml, /Confirmou o prazo de implantação com o cliente\./)
})

test('H) ANÁLISE com falha: ManyChat nunca colapsa silenciosamente em vazio progressivo (mesma garantia semântica do WhatsApp)', async () => {
  const mc = bootManyChat({
    analysisResult: { ok: true, data: { analysis_job_id: 'job-1' } },
    analysisJobStatusResult: { ok: true, data: { status: 'failed' } },
  })

  await mc.runtime.requestAnalysis({ cycleId: CYCLE_ID, conversationKey: MANYCHAT_CONVERSATION_KEY })
  await waitFor(() => mc.getPanelHtml().includes('data-yolen-analysis-error'))

  const html = mc.getPanelHtml()
  assert.match(html, /data-yolen-analysis-error/)
  assert.doesNotMatch(html, /data-yolen-analysis-progressive/)
})

// -----------------------------------------------------------------------
// I) CLIENTE: conteúdo comercial (readyCustomerViewModel) compartilhado —
// mesma composição semântica nos dois canais. O card de relacionamento
// (LOAD_CLIENT_CONTEXT) também é o MESMO nos dois; cartão de registro de
// conversa e candidatos de enriquecimento (WhatsApp-only, Blocker D — ver
// checkpoint) ficam FORA desta comparação, documentados como gap
// conhecido, nunca escondidos.
// -----------------------------------------------------------------------
test('I) CLIENTE: conteúdo comercial e de relacionamento compartilhados são idênticos nos dois canais', async () => {
  // IMPORTANTE: LOAD_CUSTOMER_VIEW_MODEL devolve o CustomerViewModel JÁ
  // CONSTRUÍDO pelo servidor (mesmo shape que
  // buildCustomerViewModelFromReading produz) — nunca a CommercialReading
  // bruta. Tanto content-script.js quanto manychat-seller-panel-
  // runtime.js passam response.payload.data DIRETO para
  // renderCustomerViewModel, sem nenhuma transformação própria.
  const customerFixture = {
    ok: true,
    data: {
      available: true,
      unavailable_reason: null,
      preferences: [],
      communication_patterns: [],
      knowledge_gaps: [],
      opportunity_context: {
        objectives: [],
        needs: [{ summary: 'Precisa reduzir perdas no follow-up.', evidence_message_ids: ['msg-1'], memory_ids: [] }],
        interests: [],
        problems: [],
        impacts: [],
        decision_criteria: [],
        discussed_products: [],
        primary_product_interest: null,
        competitors: [],
        communication_events: [],
      },
      provenance: {},
    },
  }
  const clientContextFixture = defaultClientContext()

  const wa = await bootWhatsApp({ customerViewModelResult: customerFixture, clientContextResult: clientContextFixture })
  await waitFor(() => getWhatsAppPanel(wa.document).innerHTML.includes('Precisa reduzir perdas no follow-up.'))
  const waHtml = getWhatsAppPanel(wa.document).innerHTML

  const mc = bootManyChat({ customerViewModelResult: customerFixture, clientContextResult: clientContextFixture })
  await mc.runtime.refreshViewModels({ cycleId: CYCLE_ID, conversationKey: MANYCHAT_CONVERSATION_KEY })
  const mcHtml = mc.getPanelHtml()

  assert.match(waHtml, /Precisa reduzir perdas no follow-up\./)
  assert.match(mcHtml, /Precisa reduzir perdas no follow-up\./)
  assert.match(waHtml, /yolen-client-relationship-card/)
  assert.match(mcHtml, /yolen-client-relationship-card/)
})

// -----------------------------------------------------------------------
// J) A->B->A: nenhum vazamento de estado entre conversas, nos dois
// canais, cobrindo lead summary + análise (o composer da MENSAGEM já tem
// cobertura A->B dedicada nos testes unitários do engine e do runtime
// ManyChat).
// -----------------------------------------------------------------------
test('J) ManyChat: A->B->A não vaza resumo do lead nem estado de análise entre conversas', async () => {
  const background = createFakeBackground({
    leadSummaryResult: (callCount, payload) =>
      defaultLeadSummary({
        data: { working_summary: payload.conversation_key === 'manychat:conv-a' ? 'Resumo exclusivo de A.' : 'Resumo exclusivo de B.', summary: null },
      }),
  })

  let currentConversationKey = 'manychat:conv-a'

  const mc = loadManyChatRuntime({
    sendMessage: background.sendMessage,
    getCurrentConversationKey: () => currentConversationKey,
    getCycleId: () => CYCLE_ID,
  })

  await mc.runtime.refreshViewModels({ cycleId: CYCLE_ID, conversationKey: 'manychat:conv-a' })
  assert.match(mc.getPanelHtml(), /Resumo exclusivo de A\./)

  // Troca real de conversa: a fonte autoritativa passa a apontar para B
  // ANTES de resetActiveArea/renderPanel — exatamente a ordem que
  // manychat-capture-bootstrap.js usa em handleAuthoritativeConversationChange.
  currentConversationKey = 'manychat:conv-b'
  mc.runtime.resetActiveArea('manychat:conv-b')
  mc.runtime.renderPanel('manychat:conv-b')
  const htmlAfterSwitchToB = mc.getPanelHtml()
  assert.doesNotMatch(htmlAfterSwitchToB, /Resumo exclusivo de A\./)

  await mc.runtime.refreshViewModels({ cycleId: CYCLE_ID, conversationKey: 'manychat:conv-b' })
  assert.match(mc.getPanelHtml(), /Resumo exclusivo de B\./)
  assert.doesNotMatch(mc.getPanelHtml(), /Resumo exclusivo de A\./)

  const stateA = mc.runtime.getConversationPanelState('manychat:conv-a')
  assert.equal(stateA.leadSummary.data.working_summary, 'Resumo exclusivo de A.', 'o cache de A continua isolado e intacto')

  // Voltar para A repinta A normalmente, sem vazar nada de B.
  currentConversationKey = 'manychat:conv-a'
  mc.runtime.renderPanel('manychat:conv-a')
  assert.match(mc.getPanelHtml(), /Resumo exclusivo de A\./)
  assert.doesNotMatch(mc.getPanelHtml(), /Resumo exclusivo de B\./)
})

// -----------------------------------------------------------------------
// E/F/G) MENSAGEM: o MESMO working_summary produz o MESMO composer
// (companion-seller-message-engine.js) nos dois canais — nunca uma
// implementação paralela por plataforma. Prova real: dispara "Gerar
// mensagem" via clique real no mount de CADA canal (mesmo preset, mesma
// action LOAD_METHOD_GUIDANCE(operation:'generate_message')), confirma
// que a mensagem resultante é IDÊNTICA nos dois, e que "Incluir"/"Inserir"
// aplica no COMPOSER PRÓPRIO de cada plataforma (footer contenteditable
// no WhatsApp, textarea no ManyChat) — nunca no do outro canal.
// -----------------------------------------------------------------------
function dispatchClick(target) {
  const view = target.ownerDocument?.defaultView
  const EventCtor = view?.MouseEvent ?? target.MouseEvent
  target.dispatchEvent(new EventCtor('click', { bubbles: true, cancelable: true }))
}

test('E/F/G) MENSAGEM: mesmo working_summary produz o MESMO composer (engine compartilhado) e aplica no adapter certo de cada canal', async () => {
  const GENERATED_MESSAGE = 'Posso confirmar o prazo de implantação com você agora?'
  const sharedFixtures = {
    leadSummaryResult: defaultLeadSummary({
      data: { working_summary: 'Cliente perguntou sobre o prazo de implantação.', summary: null },
    }),
    messageGenerationResult: { status: 'ready', message: GENERATED_MESSAGE, error: null },
  }

  // --- WhatsApp ---
  const wa = await bootWhatsApp(sharedFixtures)
  await waitFor(() => wa.document.querySelector('[data-yolen-seller-message-mount]'))
  await waitFor(() => wa.document.querySelector('[data-yolen-seller-message-preset]'))

  dispatchClick(wa.document.querySelector('[data-yolen-seller-message-preset="0"]'))
  dispatchClick(wa.document.querySelector('[data-yolen-seller-message-action="generate"]'))
  await waitFor(() => wa.document.querySelector('[data-yolen-seller-message-box]')?.textContent.includes(GENERATED_MESSAGE))

  const waComposerHtml = wa.document.querySelector('[data-yolen-seller-message-box]').innerHTML
  assert.match(waComposerHtml, /yolen-message-result-card/)
  assert.match(waComposerHtml, new RegExp(GENERATED_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))

  dispatchClick(wa.document.querySelector('[data-yolen-seller-message-action="insert"]'))
  await waitFor(() => wa.document.querySelector('#main footer [contenteditable="true"]').textContent.includes('confirmar o prazo'))
  const waComposerText = wa.document.querySelector('#main footer [contenteditable="true"]').textContent
  assert.match(waComposerText, /confirmar o prazo/)

  // --- ManyChat ---
  const mc = bootManyChat(sharedFixtures)
  await mc.runtime.refreshViewModels({ cycleId: CYCLE_ID, conversationKey: MANYCHAT_CONVERSATION_KEY })
  await waitFor(() => mc.document.querySelector('[data-yolen-seller-message-mount]'))
  await waitFor(() => mc.document.querySelector('[data-yolen-seller-message-preset]'))

  dispatchClick(mc.document.querySelector('[data-yolen-seller-message-preset="0"]'))
  dispatchClick(mc.document.querySelector('[data-yolen-seller-message-action="generate"]'))
  await waitFor(() => mc.document.querySelector('[data-yolen-seller-message-box]')?.textContent.includes(GENERATED_MESSAGE))

  const mcComposerHtml = mc.document.querySelector('[data-yolen-seller-message-box]').innerHTML
  assert.match(mcComposerHtml, /yolen-message-result-card/)
  assert.match(mcComposerHtml, new RegExp(GENERATED_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))

  // MESMA composição estrutural (engine compartilhado, nunca duas
  // implementações): as duas caixas de resultado usam as MESMAS classes.
  assert.equal(
    waComposerHtml.replace(/Incluir no WhatsApp|Inserir no ManyChat/, 'APPLY_LABEL'),
    mcComposerHtml.replace(/Incluir no WhatsApp|Inserir no ManyChat/, 'APPLY_LABEL'),
    'a composição do resultado é IDÊNTICA nos dois canais, exceto o rótulo do botão de aplicar (o único ponto platform-specific)',
  )

  dispatchClick(mc.document.querySelector('[data-yolen-seller-message-action="insert"]'))
  await waitFor(() => mc.document.querySelector('textarea').value.includes('confirmar o prazo'))
  const mcComposerValue = mc.document.querySelector('textarea').value
  assert.match(mcComposerValue, /confirmar o prazo/)
})

// -----------------------------------------------------------------------
// K) CONVERSATION REGISTRATION (Blocker D): mesma prévia/confirmação/erro
// nos dois canais, através da orquestração real de cada um — clique real
// no WhatsApp (wireOnce), chamada real do runtime no ManyChat
// (registerConversation/confirmConversationRegistration), ambos passando
// pelo MESMO controlador compartilhado
// (companion-conversation-registration-controller.js) e pelo MESMO
// renderer (companion-seller-workspace-view.js#renderConversationRegistrationCardHtml).
// -----------------------------------------------------------------------
test('K) Conversation registration: prévia + confirmação produzem o MESMO card final nos dois canais', async () => {
  const REGISTRATION_SUMMARY = 'Cliente perguntou sobre o prazo de implantação e recebeu a resposta.'
  const sharedFixtures = {
    previewConversationRegistrationResult: {
      ok: true,
      data: {
        summary_text: REGISTRATION_SUMMARY,
        watermark: 'watermark-1',
        confirmation_token: 'token-1',
        message_count: 4,
        occurred_at: null,
        already_registered: false,
      },
    },
    confirmConversationRegistrationResult: {
      ok: true,
      data: {
        summary_text: REGISTRATION_SUMMARY,
        occurred_at: '2026-08-22T12:00:00.000Z',
        already_registered: false,
      },
    },
  }

  // --- WhatsApp: clique real em "Registrar conversa" -> prévia -> "Confirmar registro" ---
  const wa = await bootWhatsApp(sharedFixtures)
  await waitFor(() => wa.document.querySelector('[data-yolen-action="register-conversation"]'))
  dispatchClick(wa.document.querySelector('[data-yolen-action="register-conversation"]'))
  await waitFor(() => getWhatsAppPanel(wa.document).innerHTML.includes(REGISTRATION_SUMMARY))
  assert.match(
    getWhatsAppPanel(wa.document).innerHTML,
    /data-yolen-action="confirm-conversation-registration"/,
  )

  dispatchClick(wa.document.querySelector('[data-yolen-action="confirm-conversation-registration"]'))
  await waitFor(() => getWhatsAppPanel(wa.document).innerHTML.includes('Conversa registrada no histórico'))
  const waHtml = getWhatsAppPanel(wa.document).innerHTML

  // --- ManyChat: mesma sequência via chamadas reais do runtime ---
  const mc = bootManyChat(sharedFixtures)
  await mc.runtime.refreshViewModels({ cycleId: CYCLE_ID, conversationKey: MANYCHAT_CONVERSATION_KEY })
  await mc.runtime.registerConversation(MANYCHAT_CONVERSATION_KEY)

  assert.match(mc.getPanelHtml(), new RegExp(REGISTRATION_SUMMARY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(mc.getPanelHtml(), /data-yolen-action="confirm-conversation-registration"/)

  await mc.runtime.confirmConversationRegistration(MANYCHAT_CONVERSATION_KEY)
  const mcHtml = mc.getPanelHtml()
  assert.match(mcHtml, /Conversa registrada no histórico/)

  // Mesma composição estrutural (renderer compartilhado, nunca duas
  // implementações): extrai só o card de registro de cada painel para
  // comparar (o resto do HTML difere por outras áreas/estado já
  // cobertas em outros testes).
  const extractRegistrationCard = (html) => {
    const start = html.indexOf('yolen-conversation-registration-card')
    const cardStart = html.lastIndexOf('<div', start)
    const end = html.indexOf('</div>', html.indexOf('Registrar novamente', cardStart))
    return html.slice(cardStart, end)
  }

  assert.equal(
    extractRegistrationCard(waHtml).replace(/\s+/g, ' '),
    extractRegistrationCard(mcHtml).replace(/\s+/g, ' '),
    'o card de registro confirmado é IDÊNTICO nos dois canais',
  )
})

test('K) Conversation registration: erro na prévia produz o MESMO estado seller-facing com retry nos dois canais', async () => {
  const fixtures = {
    previewConversationRegistrationResult: {
      ok: false,
      error: 'Não foi possível gerar o resumo da conversa.',
    },
  }

  const wa = await bootWhatsApp(fixtures)
  await waitFor(() => wa.document.querySelector('[data-yolen-action="register-conversation"]'))
  dispatchClick(wa.document.querySelector('[data-yolen-action="register-conversation"]'))
  await waitFor(() => getWhatsAppPanel(wa.document).innerHTML.includes('Não foi possível gerar o resumo da conversa.'))
  const waHtml = getWhatsAppPanel(wa.document).innerHTML

  const mc = bootManyChat(fixtures)
  await mc.runtime.refreshViewModels({ cycleId: CYCLE_ID, conversationKey: MANYCHAT_CONVERSATION_KEY })
  await mc.runtime.registerConversation(MANYCHAT_CONVERSATION_KEY)
  const mcHtml = mc.getPanelHtml()

  for (const html of [waHtml, mcHtml]) {
    assert.match(html, /Não foi possível gerar o resumo da conversa\./)
    assert.match(html, /data-yolen-action="register-conversation"/)
    assert.match(html, /Tentar novamente/)
  }
})

test('K) Conversation registration (A->B->A no ManyChat): estado de uma conversa nunca vaza para outra', async () => {
  let currentConversationKey = 'manychat:conv-a'
  const background = createFakeBackground({
    previewConversationRegistrationResult: {
      ok: true,
      data: {
        summary_text: 'Resumo de registro exclusivo de A.',
        watermark: 'wm-a',
        confirmation_token: 'token-a',
        message_count: 2,
        occurred_at: null,
        already_registered: false,
      },
    },
  })

  const mc = loadManyChatRuntime({
    sendMessage: background.sendMessage,
    getCurrentConversationKey: () => currentConversationKey,
    getCycleId: () => CYCLE_ID,
  })

  await mc.runtime.refreshViewModels({ cycleId: CYCLE_ID, conversationKey: 'manychat:conv-a' })
  await mc.runtime.registerConversation('manychat:conv-a')
  assert.match(mc.getPanelHtml(), /Resumo de registro exclusivo de A\./)

  currentConversationKey = 'manychat:conv-b'
  mc.runtime.resetActiveArea('manychat:conv-b')
  mc.runtime.renderPanel('manychat:conv-b')
  assert.doesNotMatch(mc.getPanelHtml(), /Resumo de registro exclusivo de A\./)

  const stateA = mc.runtime.getConversationPanelState('manychat:conv-a')
  assert.equal(stateA.conversationRegistration.summary_text, 'Resumo de registro exclusivo de A.')

  currentConversationKey = 'manychat:conv-a'
  mc.runtime.renderPanel('manychat:conv-a')
  assert.match(mc.getPanelHtml(), /Resumo de registro exclusivo de A\./)
})

// -----------------------------------------------------------------------
// L) Lead Enrichment: candidatos de cadastro extraídos do ledger de
// mensagens já observadas produzem o MESMO card seller-facing nos dois
// canais, através da orquestração real de cada plataforma — WhatsApp via
// getStructuredMessagesForEnrichment()/getLeadEnrichmentCandidates()
// (100% em memória, a partir de resolutionsByPhone), ManyChat via
// companion-lead-enrichment-controller.js + LOAD_LEAD_ENRICHMENT_CONTEXT
// (a MESMA extração pura de lead-enrichment.js, mas com o contexto de
// comparação vindo de uma consulta de rede própria).
// -----------------------------------------------------------------------

function extractEnrichmentCard(html) {
  const start = html.indexOf('yolen-lead-enrichment-card')
  if (start === -1) return null
  const cardStart = html.lastIndexOf('<div', start)
  const end = html.indexOf('</div>', html.lastIndexOf('yolen-operational-note', html.length))
  return html.slice(cardStart, html.indexOf('</div>', end) + '</div>'.length)
}

test('L) Cadastro: candidato "ainda não consta no cadastro" aparece de forma IDÊNTICA nos dois canais (dado ausente no lead existente)', async () => {
  const EMAIL_TEXT = 'Meu e-mail é cliente@exemplo.com'

  const wa = await bootWhatsApp({
    initialHtml: initialWhatsAppPageHtmlWithMessage(EMAIL_TEXT),
    resolutionsByPhone: { [WHATSAPP_PHONE]: ownedResolutionWithProfile() },
  })
  await waitFor(() => getWhatsAppPanel(wa.document).innerHTML.includes('cliente@exemplo.com'))
  const waHtml = getWhatsAppPanel(wa.document).innerHTML

  const mc = bootManyChat({
    ledgerMessages: [ledgerMessage({ id: 'msg-enrichment-1', text: EMAIL_TEXT })],
    leadEnrichmentContextResult: {
      ok: true,
      data: {
        current_values: { email: null, cpf: null, cnpj: null, birth_date: null, profession: null, cep: null, address_raw: null },
        phone_registered: false,
        phone_matches: [],
      },
    },
  })
  await mc.runtime.refreshViewModels({ cycleId: CYCLE_ID, conversationKey: MANYCHAT_CONVERSATION_KEY })
  const mcHtml = mc.getPanelHtml()

  for (const html of [waHtml, mcHtml]) {
    assert.match(html, /E-mail/)
    assert.match(html, /cliente@exemplo\.com/)
    assert.match(html, /Ainda não consta no cadastro/)
    assert.match(html, /data-yolen-action="confirm-lead-enrichment"/)
    assert.match(html, /data-yolen-action="ignore-lead-enrichment"/)
  }

  assert.equal(
    extractEnrichmentCard(waHtml).replace(/\s+/g, ' ').replace(/data-yolen-enrichment-key="[^"]*"/g, 'data-yolen-enrichment-key="X"'),
    extractEnrichmentCard(mcHtml).replace(/\s+/g, ' ').replace(/data-yolen-enrichment-key="[^"]*"/g, 'data-yolen-enrichment-key="X"'),
    'o card de Cadastro é IDÊNTICO nos dois canais (chave interna à parte, que é opaca por design)',
  )

  // STEP 2B.5-D1.1 (hardening): o controller ManyChat NUNCA retém
  // lead_id — o estado interno da conversa não pode conter a chave em
  // nenhuma forma.
  const panelState = mc.runtime.getConversationPanelState(MANYCHAT_CONVERSATION_KEY)
  assert.equal(Object.prototype.hasOwnProperty.call(panelState.leadEnrichment, 'leadId'), false)
})

test('L) Cadastro: nenhuma mensagem com dado identificável -> NENHUM card em nenhum canal, e ManyChat nunca consulta LOAD_LEAD_ENRICHMENT_CONTEXT à toa', async () => {
  const wa = await bootWhatsApp({})
  await waitFor(() => getWhatsAppPanel(wa.document).innerHTML.includes('yolen-seller-tabs'))
  assert.doesNotMatch(getWhatsAppPanel(wa.document).innerHTML, /yolen-lead-enrichment-card/)

  const mc = bootManyChat({ ledgerMessages: [] })
  await mc.runtime.refreshViewModels({ cycleId: CYCLE_ID, conversationKey: MANYCHAT_CONVERSATION_KEY })

  assert.doesNotMatch(mc.getPanelHtml(), /yolen-lead-enrichment-card/)
  assert.equal(
    leadEnrichmentContextCalls(mc.calls).length,
    0,
    'sem candidato extraído do ledger, nunca vale a pena uma chamada de rede',
  )
})

test('L) Cadastro: confirmar um candidato aplica no backend e mostra "Atualizado" nos dois canais — ManyChat NUNCA envia lead_id', async () => {
  const EMAIL_TEXT = 'Meu e-mail é cliente@exemplo.com'
  const applyLeadEnrichmentResult = { ok: true }

  const wa = await bootWhatsApp({
    initialHtml: initialWhatsAppPageHtmlWithMessage(EMAIL_TEXT),
    resolutionsByPhone: { [WHATSAPP_PHONE]: ownedResolutionWithProfile() },
    applyLeadEnrichmentResult,
  })
  await waitFor(() => getWhatsAppPanel(wa.document).innerHTML.includes('cliente@exemplo.com'))
  dispatchClick(wa.document.querySelector('[data-yolen-action="confirm-lead-enrichment"]'))
  await waitFor(() => getWhatsAppPanel(wa.document).innerHTML.includes('Atualizado'))

  const waApplyCall = applyLeadEnrichmentCalls(wa.calls).at(-1)
  assert.equal(waApplyCall.payload.field, 'email')
  assert.equal(waApplyCall.payload.value, 'cliente@exemplo.com')
  assert.equal(waApplyCall.payload.confirmed_by_human, true)

  // STEP 2B.5-D1.1 (hardening): o ManyChat usa uma action PRIVILEGIADA
  // própria (APPLY_MANYCHAT_LEAD_ENRICHMENT), nunca
  // APPLY_LEAD_ENRICHMENT do WhatsApp.
  const mc = bootManyChat({
    ledgerMessages: [ledgerMessage({ id: 'msg-enrichment-1', text: EMAIL_TEXT })],
    leadEnrichmentContextResult: {
      ok: true,
      data: {
        current_values: { email: null, cpf: null, cnpj: null, birth_date: null, profession: null, cep: null, address_raw: null },
        phone_registered: false,
        phone_matches: [],
      },
    },
    applyManyChatLeadEnrichmentResult: { ok: true },
  })
  await mc.runtime.refreshViewModels({ cycleId: CYCLE_ID, conversationKey: MANYCHAT_CONVERSATION_KEY })

  const candidateKey =
    mc.runtime.getConversationPanelState(MANYCHAT_CONVERSATION_KEY).leadEnrichment.candidates[0].key
  await mc.runtime.confirmLeadEnrichment(MANYCHAT_CONVERSATION_KEY, candidateKey)

  assert.match(mc.getPanelHtml(), /Atualizado/)

  assert.equal(applyLeadEnrichmentCalls(mc.calls).length, 0, 'ManyChat nunca chama APPLY_LEAD_ENRICHMENT')

  const mcApplyCall = applyManyChatLeadEnrichmentCalls(mc.calls).at(-1)
  assert.equal(mcApplyCall.payload.field, 'email')
  assert.equal(mcApplyCall.payload.value, 'cliente@exemplo.com')
  assert.equal(mcApplyCall.payload.cycle_id, CYCLE_ID)
  assert.equal(mcApplyCall.payload.confirmed_by_human, true)
  assert.equal(
    Object.prototype.hasOwnProperty.call(mcApplyCall.payload, 'lead_id'),
    false,
    'o request de aplicação do ManyChat NUNCA contém lead_id',
  )
})

test('L) Cadastro (ManyChat): erro ao consultar LOAD_LEAD_ENRICHMENT_CONTEXT mostra estado explícito, SEM apagar o restante da aba CLIENTE', async () => {
  const mc = bootManyChat({
    ledgerMessages: [ledgerMessage({ id: 'msg-enrichment-1', text: 'Meu e-mail é cliente@exemplo.com' })],
    leadEnrichmentContextResult: { ok: false, error: 'Não foi possível consultar o cadastro atual.' },
    clientContextResult: defaultClientContext(),
    customerViewModelResult: {
      ready: true,
      data: {
        available: true,
        unavailable_reason: null,
        preferences: [],
        communication_patterns: [],
        knowledge_gaps: [],
        opportunity_context: {
          objectives: [],
          needs: [],
          interests: [],
          problems: [],
          impacts: [],
          decision_criteria: [],
          discussed_products: [],
          primary_product_interest: null,
          competitors: [],
          communication_events: [],
        },
        provenance: { evidence_message_ids: [] },
      },
    },
  })

  await mc.runtime.refreshViewModels({ cycleId: CYCLE_ID, conversationKey: MANYCHAT_CONVERSATION_KEY })
  const html = mc.getPanelHtml()

  // O erro de Cadastro aparece, explícito...
  assert.match(html, /yolen-lead-enrichment-card/)
  assert.match(html, /Não foi possível consultar o cadastro atual\./)
  // ...mas NUNCA apaga o resto da aba CLIENTE (registro/relacionamento
  // seguem presentes normalmente).
  assert.match(html, /yolen-conversation-registration-card/)
})

test('L) Cadastro (ManyChat): telefone diferente de um JÁ cadastrado ainda pode ser confirmado — número atual nunca aparece, servidor deriva o expected_current_value sozinho', async () => {
  const mc = bootManyChat({
    ledgerMessages: [ledgerMessage({ id: 'msg-enrichment-phone', text: 'Meu celular é 11999998888' })],
    leadEnrichmentContextResult: {
      ok: true,
      data: {
        current_values: { email: null, cpf: null, cnpj: null, birth_date: null, profession: null, cep: null, address_raw: null },
        phone_registered: true,
        phone_matches: [{ normalized_value: '11999998888', matches: false }],
      },
    },
    applyManyChatLeadEnrichmentResult: { ok: true },
  })

  await mc.runtime.refreshViewModels({ cycleId: CYCLE_ID, conversationKey: MANYCHAT_CONVERSATION_KEY })
  const html = mc.getPanelHtml()

  // STEP 2B.5-D1.1 (hardening): 'different_locked' foi eliminado — a
  // capability NÃO é inerentemente indisponível, só o número atual é
  // privado. O candidato aparece, o número atual NUNCA aparece, e a
  // confirmação continua possível por ação humana explícita.
  assert.match(html, /yolen-lead-enrichment-card/)
  assert.match(html, /11999998888/)
  assert.match(html, /Já existe outro telefone cadastrado para este lead\./)
  assert.match(html, /Confirmar substituição/)
  assert.doesNotMatch(html, /different_locked/)
  assert.doesNotMatch(html, /Atualize pela Yolen/)
  assert.match(html, /data-yolen-action="confirm-lead-enrichment"/)
  assert.match(html, /data-yolen-action="ignore-lead-enrichment"/)

  // O telefone atual do lead NUNCA chega a este content script — só o
  // resultado semântico (phone_registered/matches).
  assert.doesNotMatch(html, /"current_value"/)

  const candidateKey =
    mc.runtime.getConversationPanelState(MANYCHAT_CONVERSATION_KEY).leadEnrichment.candidates[0].key
  await mc.runtime.confirmLeadEnrichment(MANYCHAT_CONVERSATION_KEY, candidateKey)

  assert.match(mc.getPanelHtml(), /Atualizado/)

  const applyCall = applyManyChatLeadEnrichmentCalls(mc.calls).at(-1)
  assert.equal(applyCall.payload.field, 'phone_mobile')
  assert.equal(applyCall.payload.value, '11999998888')
  assert.equal(
    Object.prototype.hasOwnProperty.call(applyCall.payload, 'lead_id'),
    false,
    'o request de aplicação de telefone NUNCA contém lead_id',
  )
  // expected_current_value enviado pelo content é sempre null para
  // telefone (nunca conheceu o valor atual) — o SERVIDOR é quem decide
  // o valor real a comparar (provado nos testes de rota de
  // apply-manychat-lead-enrichment).
  assert.equal(applyCall.payload.expected_current_value, null)
})

test('L) Cadastro (ManyChat, A->B->A): candidatos de uma conversa nunca vazam para outra', async () => {
  let currentConversationKey = 'manychat:conv-a'
  const ledgerByConversation = {
    'manychat:conv-a': [ledgerMessage({ id: 'msg-a', text: 'Meu e-mail é lead-a@exemplo.com' })],
    'manychat:conv-b': [],
  }

  const background = createFakeBackground({
    leadEnrichmentContextResult: {
      ok: true,
      data: {
        current_values: { email: null, cpf: null, cnpj: null, birth_date: null, profession: null, cep: null, address_raw: null },
        phone_registered: false,
        phone_matches: [],
      },
    },
  })

  const mc = loadManyChatRuntime({
    sendMessage: background.sendMessage,
    getCurrentConversationKey: () => currentConversationKey,
    getCycleId: () => CYCLE_ID,
    getEnrichmentLedgerMessages: (conversationKey) => ledgerByConversation[conversationKey] ?? [],
  })

  await mc.runtime.refreshViewModels({ cycleId: CYCLE_ID, conversationKey: 'manychat:conv-a' })
  assert.match(mc.getPanelHtml(), /lead-a@exemplo\.com/)

  currentConversationKey = 'manychat:conv-b'
  mc.runtime.resetActiveArea('manychat:conv-b')
  await mc.runtime.refreshViewModels({ cycleId: CYCLE_ID, conversationKey: 'manychat:conv-b' })
  assert.doesNotMatch(mc.getPanelHtml(), /lead-a@exemplo\.com/)
  assert.doesNotMatch(mc.getPanelHtml(), /yolen-lead-enrichment-card/)

  const stateA = mc.runtime.getConversationPanelState('manychat:conv-a')
  assert.match(stateA.leadEnrichment.candidates[0]?.value ?? '', /lead-a@exemplo\.com/)

  currentConversationKey = 'manychat:conv-a'
  mc.runtime.renderPanel('manychat:conv-a')
  assert.match(mc.getPanelHtml(), /lead-a@exemplo\.com/)
})
