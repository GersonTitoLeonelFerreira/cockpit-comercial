// Teste de DOM real (jsdom + node:vm) da reconstrução arquitetural do
// painel do Companion (Onda 7): renderPanel() não substitui mais o painel
// inteiro a cada mudança de estado — cada card/região (Conversa, cadastro
// de lead, Resumo, abas Agora/Análise/Cliente, rodapé...) só troca de DOM
// quando o HTML calculado para ELA muda, e uma região com interação ativa
// (campo com foco, botão entre pointerdown e click) tem sua troca adiada
// em vez de aplicada por baixo do vendedor.
//
// carregado com withStabilityRuntimes: true para exercitar também
// panel-stability-runtime.js/editable-field-stability-runtime.js (Onda 6)
// e lead-automation.js (formulário de criação de lead) do jeito que rodam
// de verdade no manifest.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildMessageHtml,
  buildWhatsAppPageHtml,
  createLeadCalls,
  defaultLeadResolution,
  defaultLeadSummary,
  loadContentScript,
  resolveLeadCalls,
  waitFor,
} from '../e3-test-support/load-content-script.mjs'

const HEADER_TITLE = '+55 11 98888-7777'
const PHONE_DIGITS = '5511988887777'

function initialPageHtml() {
  return buildWhatsAppPageHtml({
    headerTitle: HEADER_TITLE,
    messagesHtml: buildMessageHtml({
      id: 'msg-1',
      prePlainText: '[10:15, 21/08/2026] Cliente Teste: ',
      text: 'Ola, bom dia',
    }),
  })
}

function getPanel(document) {
  return document.getElementById('yolen-companion-panel')
}

function dispatch(target, type, init = {}) {
  const EventCtor =
    target.Event ??
    target.defaultView?.Event ??
    target.ownerDocument?.defaultView?.Event ??
    Event
  target.dispatchEvent(new EventCtor(type, { bubbles: true, cancelable: true, ...init }))
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

test('1) atualização de resumo em segundo plano preserva a posição de leitura do painel', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: initialPageHtml(),
    leadSummaryResult: defaultLeadSummary({
      data: { summary: { summary: 'Resumo inicial salvo.', version: 1, updated_at: '2026-08-25T12:00:00.000Z' } },
    }),
  })

  await waitFor(() => resolveLeadCalls(calls).length > 0)

  const panel = getPanel(document)
  await waitFor(() => Boolean(document.querySelector('.yolen-lead-summary-card')))

  // jsdom não faz layout: simula um painel realmente rolável.
  Object.defineProperty(panel, 'scrollHeight', { get: () => 3000, configurable: true })
  Object.defineProperty(panel, 'clientHeight', { get: () => 600, configurable: true })
  panel.scrollTop = 850

  const leadSummaryRegionBefore = panel.querySelector('[data-yolen-region="lead-summary-card"]')

  // Atualização em segundo plano: o clique em "Atualizar" refaz a
  // resolução do lead e recarrega o contexto/resumo — o tipo de evento que
  // antes reconstruía o painel inteiro (panel.innerHTML = tudo de novo) e
  // jogava o scroll de volta ao topo.
  dispatch(panel.querySelector('[data-yolen-action="refresh"]'), 'click')

  await waitFor(() => resolveLeadCalls(calls).length > 1)
  await sleep(30)

  assert.equal(panel.scrollTop, 850, 'scroll não pode voltar ao topo por causa de uma atualização de fundo')

  // A região do resumo pode ter sido recriada (o conteúdo mudou de fato
  // entre as duas resoluções simuladas), mas o painel continua sendo o
  // MESMO elemento e a estrutura de regiões continua de pé.
  assert.equal(getPanel(document), panel)
  assert.ok(leadSummaryRegionBefore)
})

test('2) loading local (Conversa) não remove o conteúdo já renderizado do Resumo atual', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: initialPageHtml(),
    leadSummaryResult: defaultLeadSummary({
      data: { summary: { summary: 'Resumo salvo previamente.', version: 1, updated_at: '2026-08-25T12:00:00.000Z' } },
    }),
  })

  await waitFor(() => resolveLeadCalls(calls).length > 0)
  await waitFor(() => document.querySelector('.yolen-lead-summary-card')?.textContent.includes('Resumo salvo previamente'))

  const panel = getPanel(document)
  const summaryCardBefore = document.querySelector('.yolen-lead-summary-card')

  // Clicar em "Atualizar" liga leadResolutionLoading (mostrado só na
  // região "Conversa") de forma síncrona, antes de qualquer resposta de
  // rede voltar.
  dispatch(panel.querySelector('[data-yolen-action="refresh"]'), 'click')

  // No instante do loading, o card de resumo (uma região DIFERENTE) tem
  // que continuar visível com o mesmo texto — nenhuma tela de loading o
  // substituiu.
  const summaryCardDuringLoading = document.querySelector('.yolen-lead-summary-card')
  assert.ok(summaryCardDuringLoading, 'o card de resumo não pode desaparecer por causa de um loading em outra região')
  assert.match(summaryCardDuringLoading.textContent, /Resumo salvo previamente/)
  assert.equal(summaryCardDuringLoading, summaryCardBefore, 'a região do resumo nem precisava ser tocada')

  await waitFor(() => resolveLeadCalls(calls).length > 1)
})

test('3) campo com foco continua sendo o MESMO node do DOM durante um render de fundo', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: initialPageHtml(),
    resolutionsByPhone: {
      [PHONE_DIGITS]: defaultLeadResolution({ phone: PHONE_DIGITS, status: 'NOT_FOUND', lead: null, cycle: null }),
    },
    withStabilityRuntimes: true,
  })

  await waitFor(() => resolveLeadCalls(calls).length > 0)
  await waitFor(() => Boolean(document.querySelector('[data-yolen-lead-create-form]')))

  const panel = getPanel(document)
  const nameInput = document.querySelector('[name="yolen-lead-name"]')
  nameInput.focus()
  dispatch(nameInput, 'focusin')
  nameInput.value = 'Jo'
  dispatch(nameInput, 'input')

  await sleep(30)

  // Atualização de fundo: um novo tick de resolução chega enquanto o
  // vendedor está no meio da digitação.
  dispatch(panel.querySelector('[data-yolen-action="refresh"]'), 'click')
  await sleep(30)

  assert.equal(
    document.querySelector('[name="yolen-lead-name"]'),
    nameInput,
    'o input de nome não pode ter sido substituído por um node novo enquanto o vendedor digitava',
  )
  assert.equal(document.querySelector('[name="yolen-lead-name"]').value, 'Jo', 'o valor digitado não pode ter sido apagado')
})

test('4) botão executa no primeiro clique mesmo com um render solicitado entre pointerdown e click', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: initialPageHtml(),
  })

  await waitFor(() => resolveLeadCalls(calls).length > 0)
  await waitFor(() => Boolean(document.querySelector('[data-yolen-seller-area="analysis"]')))

  const panel = getPanel(document)
  const analysisTab = document.querySelector('[data-yolen-seller-area="analysis"]')

  dispatch(analysisTab, 'pointerdown')

  // Um render de fundo é solicitado enquanto o dedo do vendedor ainda está
  // sobre o botão.
  dispatch(panel.querySelector('[data-yolen-action="refresh"]'), 'click')

  const analysisTabStillThere = document.querySelector('[data-yolen-seller-area="analysis"]')
  assert.equal(analysisTabStillThere, analysisTab, 'a aba não pode ter sido trocada por um node novo entre pointerdown e click')

  dispatch(analysisTab, 'click')

  // O próprio clique ainda estava com a trava de ação ligada (só é
  // liberada num microtask agendado durante esse mesmo evento), então a
  // troca de aba fica retida em panelRegionPendingHtml por um instante —
  // imperceptível para quem está usando o Companion, mas precisa de um
  // tick de microtask para o teste observar o resultado já aplicado.
  await Promise.resolve()
  await Promise.resolve()

  assert.equal(
    document.querySelector('[data-yolen-seller-panel="analysis"]')?.hasAttribute('hidden'),
    false,
    'o primeiro clique já precisa ter trocado para a aba Análise',
  )
})

test('5) Criar lead funciona no primeiro clique mesmo com "Dados do contato" gerando renders de fundo', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: initialPageHtml(),
    resolutionsByPhone: {
      [PHONE_DIGITS]: defaultLeadResolution({ phone: PHONE_DIGITS, status: 'NOT_FOUND', lead: null, cycle: null }),
    },
    withStabilityRuntimes: true,
  })

  await waitFor(() => resolveLeadCalls(calls).length > 0)
  await waitFor(() => Boolean(document.querySelector('[data-yolen-lead-create-form]')))

  const panel = getPanel(document)
  const nameInput = document.querySelector('[name="yolen-lead-name"]')
  nameInput.focus()
  dispatch(nameInput, 'focusin')
  nameInput.value = 'Cliente Novo'
  dispatch(nameInput, 'input')

  const submitButton = document.querySelector('.yolen-lead-create-submit')
  assert.ok(submitButton)

  dispatch(submitButton, 'pointerdown')

  // Efeito equivalente a "Dados do contato" aberto: o WhatsApp gera mais
  // atividade e o Companion refaz a resolução do lead (leadResolutionLoading
  // liga e desliga, esvaziando e recompondo getLeadActionButton()) bem no
  // meio do clique do vendedor.
  dispatch(panel.querySelector('[data-yolen-action="refresh"]'), 'click')

  const submitButtonStillThere = document.querySelector('.yolen-lead-create-submit')
  assert.equal(
    submitButtonStillThere,
    submitButton,
    'o botão "Criar lead" não pode ter sido substituído por um node novo entre pointerdown e click',
  )

  dispatch(submitButton, 'click')
  dispatch(document.querySelector('[data-yolen-lead-create-form]'), 'submit')

  await waitFor(() => createLeadCalls(calls).length > 0)

  assert.equal(createLeadCalls(calls).length, 1, 'um único clique precisa bastar para criar o lead')
  assert.equal(createLeadCalls(calls)[0].payload.name, 'Cliente Novo')
})

test('6) retorno de aba reutiliza o painel já montado (sem remontar do zero)', async () => {
  const { document, window } = loadContentScript({
    initialHtml: initialPageHtml(),
    withStabilityRuntimes: true,
  })

  await waitFor(() => Boolean(document.querySelector('.yolen-lead-name')))

  const panel = getPanel(document)
  const headerRegionBefore = panel.querySelector('[data-yolen-region="header"]')

  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
  dispatch(document, 'visibilitychange')

  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  dispatch(document, 'visibilitychange')
  dispatch(window, 'pageshow')

  await sleep(30)

  assert.equal(getPanel(document), panel, 'o painel não pode ser desmontado/remontado no retorno de aba')
  assert.equal(
    panel.querySelector('[data-yolen-region="header"]'),
    headerRegionBefore,
    'a região do cabeçalho não precisa ser recriada só porque a aba voltou ao foco',
  )
})

test('7) mudança real de conversa reseta scroll e não vaza rascunho do lead anterior', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: initialPageHtml(),
    resolutionsByPhone: {
      [PHONE_DIGITS]: defaultLeadResolution({ phone: PHONE_DIGITS, status: 'NOT_FOUND', lead: null, cycle: null }),
    },
    withStabilityRuntimes: true,
  })

  await waitFor(() => resolveLeadCalls(calls).length > 0)
  await waitFor(() => Boolean(document.querySelector('[data-yolen-lead-create-form]')))

  const panel = getPanel(document)
  Object.defineProperty(panel, 'scrollHeight', { get: () => 3000, configurable: true })
  Object.defineProperty(panel, 'clientHeight', { get: () => 600, configurable: true })
  panel.scrollTop = 700

  const nameInput = document.querySelector('[name="yolen-lead-name"]')
  nameInput.value = 'Rascunho do Cliente A'
  dispatch(nameInput, 'input')
  await sleep(20)

  // Mudança real de conversa: o header do WhatsApp muda de contato.
  const header = document.querySelector('header span[title]')
  header.setAttribute('title', '+55 11 97777-6666')
  header.textContent = '+55 11 97777-6666'
  dispatch(header, 'click')

  await waitFor(() => resolveLeadCalls(calls).some((call) => call.payload.phone !== PHONE_DIGITS))
  await sleep(30)

  assert.equal(panel.scrollTop, 0, 'uma mudança real de conversa precisa resetar o scroll')

  const nameInputAfter = document.querySelector('[name="yolen-lead-name"]')

  if (nameInputAfter) {
    assert.notEqual(
      nameInputAfter.value,
      'Rascunho do Cliente A',
      'o rascunho do lead anterior não pode vazar para a nova conversa',
    )
  }
})

test('8) atualização em segundo plano não destrói o campo enquanto o vendedor digita', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: initialPageHtml(),
    resolutionsByPhone: {
      [PHONE_DIGITS]: defaultLeadResolution({ phone: PHONE_DIGITS, status: 'NOT_FOUND', lead: null, cycle: null }),
    },
    withStabilityRuntimes: true,
  })

  await waitFor(() => resolveLeadCalls(calls).length > 0)
  await waitFor(() => Boolean(document.querySelector('[data-yolen-lead-create-form]')))

  const panel = getPanel(document)
  const emailInput = document.querySelector('[name="yolen-lead-email"]')
  emailInput.focus()
  dispatch(emailInput, 'focusin')

  for (const char of 'cliente@exemplo.com') {
    emailInput.value += char
    dispatch(emailInput, 'input')

    // Uma atualização de fundo chega no meio da digitação.
    dispatch(panel.querySelector('[data-yolen-action="refresh"]'), 'click')
  }

  assert.equal(
    document.querySelector('[name="yolen-lead-email"]'),
    emailInput,
    'o campo de e-mail não pode ter sido substituído durante a digitação',
  )
  assert.equal(document.querySelector('[name="yolen-lead-email"]').value, 'cliente@exemplo.com')
})

test('9) múltiplas atualizações sequenciais sem mudança real não acumulam substituições de DOM', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: initialPageHtml(),
  })

  await waitFor(() => resolveLeadCalls(calls).length > 0)
  await waitFor(() => Boolean(document.querySelector('[data-yolen-seller-area="now"]')))

  const leadNameBefore = document.querySelector('.yolen-lead-name')
  const nowTabBefore = document.querySelector('[data-yolen-seller-area="now"]')
  const footerRegionBefore = document
    .getElementById('yolen-companion-panel')
    .querySelector('[data-yolen-region="footer"]')

  // Clicar várias vezes seguidas na aba que já está ativa dispara
  // renderPanel() de novo a cada clique, mas o HTML calculado é idêntico
  // ao anterior em todas as regiões.
  for (let i = 0; i < 3; i += 1) {
    dispatch(nowTabBefore, 'click')
  }

  assert.equal(document.querySelector('.yolen-lead-name'), leadNameBefore, 'renders repetidos sem mudança real não podem recriar a região "Conversa"')
  assert.equal(
    document.querySelector('[data-yolen-seller-area="now"]'),
    nowTabBefore,
    'renders repetidos sem mudança real não podem recriar a mesma aba clicada repetidamente',
  )
  assert.equal(
    document.getElementById('yolen-companion-panel').querySelector('[data-yolen-region="footer"]'),
    footerRegionBefore,
    'uma região totalmente alheia ao clique (rodapé) não pode ser tocada',
  )
})
