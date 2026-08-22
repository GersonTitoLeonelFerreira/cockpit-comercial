// Onda 4 — área CLIENTE: consolida o que o CommercialReading.customer já
// tem (needs/interests/open_questions/objections...) com o Relacionamento
// do PR #189 (histórico, waiting, SLA, timeline) numa única experiência,
// agora navegável por aba.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  analyzeConversationCalls,
  buildMessageHtml,
  buildWhatsAppPageHtml,
  clientContextCalls,
  defaultClientContext,
  defaultCommercialReading,
  loadContentScript,
  resolveLeadCalls,
  waitFor,
} from '../e3-test-support/load-content-script.mjs'

function initialPageHtml() {
  return buildWhatsAppPageHtml({
    headerTitle: '+55 11 98888-7777',
    messagesHtml: buildMessageHtml({
      id: 'msg-1',
      prePlainText: '[10:15, 21/08/2026] Cliente Teste: ',
      text: 'Ola, bom dia',
    }),
  })
}

// IMPORTANTE: cada renderPanel() real substitui panel.innerHTML por
// inteiro, então qualquer nó capturado antes de um render seguinte fica
// órfão (desconectado do documento) e nunca mais reflete atualizações. Por
// isso este helper — e todo `waitFor` abaixo — sempre reconsulta
// `document.getElementById(...)`/`document.querySelector(...)` de dentro
// do predicado, nunca guarda a referência do painel de antemão.
function getClientePanel(document) {
  return document.getElementById('yolen-tabpanel-cliente')
}

async function goToClienteTab(document, calls) {
  await waitFor(() => resolveLeadCalls(calls).length > 0)
  await waitFor(() => Boolean(document.querySelector('.yolen-tabs')))

  document
    .querySelector('[data-yolen-tab="cliente"]')
    .dispatchEvent(new document.defaultView.Event('click', { bubbles: true }))

  assert.equal(getClientePanel(document).hasAttribute('hidden'), false)
}

// Cenário 16: Cliente com dados comerciais.
test('Cliente com leitura V2 mostra "O que sabemos" e "Em aberto" com o conteúdo real', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: initialPageHtml(),
    analyzeConversationResult: {
      ok: true,
      data: {
        engine_source: 'stateful',
        commercial_reading: defaultCommercialReading(),
      },
    },
  })

  await goToClienteTab(document, calls)

  await waitFor(() => Boolean(document.querySelector('[data-yolen-action="analyze-conversation"]')))
  document
    .querySelector('[data-yolen-action="analyze-conversation"]')
    .dispatchEvent(new document.defaultView.Event('click', { bubbles: true }))
  await waitFor(() => analyzeConversationCalls(calls).length > 0, { timeoutMs: 10000 })

  await waitFor(() => /O que sabemos/.test(getClientePanel(document).textContent), {
    timeoutMs: 15000,
  })

  const panel = getClientePanel(document)

  assert.match(panel.textContent, /O que sabemos/)
  assert.match(panel.textContent, /Precisa de um plano para 20 usuários\./)
  assert.match(panel.textContent, /Em aberto/)
  assert.match(panel.textContent, /Ainda não confirmou o orçamento disponível\./)
  assert.match(panel.textContent, /Cliente comentou que o valor está acima do esperado\./)

  // Risco do vendedor (service_risks) não pode vazar para a área do
  // cliente.
  assert.doesNotMatch(panel.textContent, /Preço apresentado antes do diagnóstico terminar\./)
})

// Cenário 17: Cliente sem dados comerciais (V1 / sem leitura rica) — o
// Relacionamento (independente de IA) continua funcionando, mas os
// grupos de "O que sabemos"/"Em aberto" simplesmente não aparecem.
test('Cliente sem leitura comercial rica não mostra grupos vazios, mas mantém o Relacionamento', async () => {
  const { document, calls } = loadContentScript({ initialHtml: initialPageHtml() })

  await goToClienteTab(document, calls)

  await waitFor(() => /Relacionamento/.test(getClientePanel(document).textContent), {
    timeoutMs: 15000,
  })

  const panel = getClientePanel(document)

  assert.match(panel.textContent, /Relacionamento/)
  assert.doesNotMatch(panel.textContent, /O que sabemos/)
  assert.doesNotMatch(panel.textContent, /Em aberto/)
})

// Cenário 18: Relacionamento (histórico, tempo, waiting, SLA) alcançável
// dentro da aba Cliente.
test('a aba Cliente mostra primeiro contato, tempo de relacionamento e situação de espera', async () => {
  const { document, calls } = loadContentScript({ initialHtml: initialPageHtml() })

  await goToClienteTab(document, calls)

  await waitFor(() => /Primeiro contato/.test(getClientePanel(document).textContent), {
    timeoutMs: 15000,
  })

  const panel = getClientePanel(document)

  assert.match(panel.textContent, /Primeiro contato/)
  assert.match(panel.textContent, /Em conversa há/)
  assert.ok(panel.querySelector('[data-yolen-waiting-state]'))
})

// Cenário 21: timeline é secundária — some por padrão, some com "Ver
// histórico" (ou equivalente), abre/fecha sob demanda.
test('a timeline da relação começa fechada e abre/fecha ao clicar no resumo', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: initialPageHtml(),
    clientContextResult: defaultClientContext({
      timeline: [
        {
          kind: 'stage_changed',
          occurred_at: '2026-08-10T08:00:00.000Z',
          label: 'Etapa alterada',
          detail: 'NOVO → CONTATO',
        },
      ],
    }),
  })

  await goToClienteTab(document, calls)

  await waitFor(() => Boolean(getClientePanel(document).querySelector('.yolen-client-timeline')), {
    timeoutMs: 15000,
  })

  const timelineDetails = getClientePanel(document).querySelector('.yolen-client-timeline')
  assert.equal(timelineDetails.hasAttribute('open'), false)

  timelineDetails.querySelector('summary').click()

  assert.equal(timelineDetails.hasAttribute('open'), true)
})

// Cenários 19, 20, 22, 23: o comportamento ao vivo do PR #189 (waiting
// mudando, SLA calculado, troca de conversa, refresh silencioso) precisa
// continuar funcionando quando acessado pela nova navegação em abas — a
// cobertura detalhada desses comportamentos já existe em
// content-script-dom-client-relationship-live-refresh.test.mjs; aqui só
// confirmamos que a aba Cliente reflete um estado "ready" coerente vindo
// do mesmo pipeline.
test('o estado de espera e o risco de SLA aparecem juntos na aba Cliente quando o contexto está pronto', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: initialPageHtml(),
    clientContextResult: defaultClientContext({
      waiting: {
        state: 'customer_waiting_for_seller',
        waiting_since: '2026-08-22T09:42:00.000Z',
        waiting_duration_ms: 60 * 60 * 1000,
      },
      sla: {
        configured: true,
        applicable: true,
        stage: 'contato',
        stage_label: 'CONTATO',
        target_minutes: 60,
        warning_minutes: 120,
        danger_minutes: 180,
        elapsed_minutes: 200,
        risk: 'high',
      },
    }),
  })

  await goToClienteTab(document, calls)

  await waitFor(
    () =>
      Boolean(
        getClientePanel(document).querySelector(
          '[data-yolen-waiting-state="customer_waiting_for_seller"]',
        ),
      ),
    { timeoutMs: 15000 },
  )

  const panel = getClientePanel(document)

  assert.ok(panel.querySelector('[data-yolen-waiting-state="customer_waiting_for_seller"]'))
  assert.ok(panel.querySelector('[data-yolen-sla-risk="high"]'))

  await waitFor(() => clientContextCalls(calls).length > 0)
})
