// Onda 4 — estados do painel: recolhido (com sinal de atenção
// reaproveitado, sem criar um novo sistema de alertas), loading, erro, e
// os dois casos "sem mensagens" (lead recém-importado sem histórico, e o
// mesmo caso com SLA configurado).

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  analyzeConversationCalls,
  buildMessageHtml,
  buildWhatsAppPageHtml,
  defaultCommercialReading,
  emptyClientContext,
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

function getPanel(document) {
  return document.getElementById('yolen-companion-panel')
}

// Cenário 24: painel recolhido mostra só um sinal de atenção quando
// off_method é relevante — reaproveitando o mecanismo já existente
// (getCollapsedCompanionAttentionSnapshot), sem criar um novo badge.
test('painel recolhido mostra o ponto de atenção quando a conversa saiu do método', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: initialPageHtml(),
    analyzeConversationResult: {
      ok: true,
      data: {
        engine_source: 'stateful',
        commercial_reading: defaultCommercialReading({
          method: {
            ...defaultCommercialReading().method,
            adherence: {
              status: 'off_method',
              summary: 'Saiu do método antes de concluir a descoberta.',
              deviation_stage_order: 2,
              what_happened: 'Apresentou preço cedo demais.',
              missing_information: ['Orçamento'],
              why_it_matters: 'Pode travar a negociação.',
              evidence_message_ids: [],
              memory_ids: [],
            },
            recovery_guidance: {
              objective: 'Retomar a descoberta.',
              missing_information: ['Orçamento'],
              recommended_move: 'Pergunte o orçamento disponível.',
              optional_question: null,
              evidence_message_ids: [],
              memory_ids: [],
            },
          },
        }),
      },
    },
  })

  await waitFor(() => resolveLeadCalls(calls).length > 0)
  await waitFor(() => Boolean(document.querySelector('[data-yolen-action="collapse-companion"]')))

  // Recolhe ANTES de qualquer análise existir: isso reconhece "nenhuma
  // atenção" (setPanelCollapsed sempre reconhece o instantâneo atual).
  // O ponto de atenção só pode aparecer depois de um sinal *novo* surgir
  // enquanto o painel já está recolhido — daqui em diante a análise
  // automática (sem precisar clicar, o botão nem está visível recolhido)
  // é o gatilho.
  document
    .querySelector('[data-yolen-action="collapse-companion"]')
    .dispatchEvent(new document.defaultView.Event('click', { bubbles: true }))

  await waitFor(() => analyzeConversationCalls(calls).length > 0, { timeoutMs: 15000 })

  await waitFor(() => {
    const logo = getPanel(document).querySelector('.yolen-collapsed-logo-button')
    return Boolean(logo && logo.getAttribute('data-yolen-attention-level') === 'attention')
  }, { timeoutMs: 15000 })

  const logo = getPanel(document).querySelector('.yolen-collapsed-logo-button')
  assert.ok(logo.querySelector('.yolen-collapsed-attention-dot'))
  assert.match(logo.getAttribute('title'), /método/)
})

// Cenário 25: estado de carregamento.
test('enquanto a análise carrega, a área AGORA mostra o estado de carregamento', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: initialPageHtml(),
    // Nunca resolve: mantém o estado "carregando" observável.
    analyzeConversationResult: () => new Promise(() => {}),
  })

  await waitFor(() => resolveLeadCalls(calls).length > 0)
  await waitFor(() => Boolean(document.querySelector('[data-yolen-action="analyze-conversation"]')))

  document
    .querySelector('[data-yolen-action="analyze-conversation"]')
    .dispatchEvent(new document.defaultView.Event('click', { bubbles: true }))

  await waitFor(() => {
    const card = document.querySelector('.yolen-decision-card')
    return Boolean(card && /Analisando/.test(card.textContent))
  })
})

// Cenário 26: estado de erro.
test('quando a análise falha, a área AGORA mostra a mensagem de erro em vez de travar', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: initialPageHtml(),
    analyzeConversationResult: {
      ok: false,
      error: 'Não foi possível analisar a conversa com IA.',
    },
  })

  await waitFor(() => resolveLeadCalls(calls).length > 0)
  await waitFor(() => Boolean(document.querySelector('[data-yolen-action="analyze-conversation"]')))

  document
    .querySelector('[data-yolen-action="analyze-conversation"]')
    .dispatchEvent(new document.defaultView.Event('click', { bubbles: true }))

  await waitFor(() => {
    const card = document.querySelector('.yolen-decision-card')
    return Boolean(card && /Não foi possível analisar a conversa com IA\./.test(card.textContent))
  }, { timeoutMs: 10000 })

  // O painel continua funcional (não trava) mesmo com a análise em erro.
  assert.ok(document.querySelector('.yolen-contact-card'))
})

// Cenário 27: lead sem mensagens ainda (recém-importado).
test('lead sem histórico de mensagens mostra o estado vazio do Relacionamento sem quebrar o painel', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: buildWhatsAppPageHtml({ headerTitle: '+55 11 98888-7777', messagesHtml: '' }),
    clientContextResult: emptyClientContext(),
  })

  await waitFor(() => resolveLeadCalls(calls).length > 0)
  await waitFor(() => Boolean(document.querySelector('.yolen-tabs')))

  document
    .querySelector('[data-yolen-tab="cliente"]')
    .dispatchEvent(new document.defaultView.Event('click', { bubbles: true }))

  await waitFor(() => {
    const panel = document.getElementById('yolen-tabpanel-cliente')
    return Boolean(panel && /Ainda não há histórico suficiente com este cliente\./.test(panel.textContent))
  }, { timeoutMs: 15000 })

  const panel = document.getElementById('yolen-tabpanel-cliente')
  assert.match(panel.textContent, /Ainda não há histórico suficiente com este cliente\./)
  assert.ok(document.querySelector('.yolen-contact-card'), 'o resto do painel continua funcional')
})

// Cenário 28: SLA sem mensagens — não deve inventar risco, mas mostra o
// SLA real quando configurado.
test('lead sem mensagens, mas com SLA configurado, mostra o risco real na aba Cliente', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: buildWhatsAppPageHtml({ headerTitle: '+55 11 98888-7777', messagesHtml: '' }),
    clientContextResult: emptyClientContext({
      sla: {
        configured: true,
        applicable: true,
        stage: 'contato',
        stage_label: 'CONTATO',
        target_minutes: 60,
        warning_minutes: 120,
        danger_minutes: 240,
        elapsed_minutes: 300,
        risk: 'high',
      },
    }),
  })

  await waitFor(() => resolveLeadCalls(calls).length > 0)
  await waitFor(() => Boolean(document.querySelector('.yolen-tabs')))

  document
    .querySelector('[data-yolen-tab="cliente"]')
    .dispatchEvent(new document.defaultView.Event('click', { bubbles: true }))

  await waitFor(() => {
    const panel = document.getElementById('yolen-tabpanel-cliente')
    return Boolean(panel && panel.querySelector('[data-yolen-sla-risk="high"]'))
  }, { timeoutMs: 15000 })

  const panel = document.getElementById('yolen-tabpanel-cliente')
  assert.match(panel.textContent, /Sem histórico de conversa ainda\./)
  assert.ok(panel.querySelector('[data-yolen-sla-risk="high"]'))
})
