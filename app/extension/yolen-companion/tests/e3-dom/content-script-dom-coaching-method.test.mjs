// Onda 4 — área ANÁLISE: coaching (#188) e método/aderência/recovery
// precisam realmente aparecer na extensão, com a linguagem humana exigida
// pela missão (não configurado / evidência insuficiente / dentro-fora do
// método).

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  analyzeConversationCalls,
  buildMessageHtml,
  buildWhatsAppPageHtml,
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

async function loadWithReading(commercialReadingOverrides) {
  const { document, calls } = loadContentScript({
    initialHtml: initialPageHtml(),
    analyzeConversationResult: {
      ok: true,
      data: {
        engine_source: 'stateful',
        commercial_reading: defaultCommercialReading(commercialReadingOverrides),
      },
    },
  })

  await waitFor(() => resolveLeadCalls(calls).length > 0)
  await waitFor(() => Boolean(document.querySelector('[data-yolen-action="analyze-conversation"]')))

  document
    .querySelector('[data-yolen-action="analyze-conversation"]')
    .dispatchEvent(new document.defaultView.Event('click', { bubbles: true }))

  await waitFor(() => analyzeConversationCalls(calls).length > 0, { timeoutMs: 10000 })

  // Espera o estado real da análise assentar (não só a requisição ter
  // sido enviada) antes de trocar de aba, usando um texto estável do
  // resumo (não sobrescrito pelos testes) como sinal.
  await waitFor(() => {
    const card = document.querySelector('.yolen-decision-card')
    return Boolean(
      card &&
        /Cliente interessado, mas o impacto ainda não foi confirmado\./.test(card.textContent),
    )
  }, { timeoutMs: 10000 })

  document
    .querySelector('[data-yolen-tab="analise"]')
    .dispatchEvent(new document.defaultView.Event('click', { bubbles: true }))

  await waitFor(() => {
    const panel = document.getElementById('yolen-tabpanel-analise')
    return Boolean(panel && panel.textContent.trim().length > 0)
  })

  return { document }
}

// Cenário 7: coaching com acerto.
test('coaching mostra o acerto do vendedor com o motivo de importar', async () => {
  const { document } = await loadWithReading({})

  const panel = document.getElementById('yolen-tabpanel-analise')

  assert.match(panel.textContent, /Boa descoberta/)
  assert.match(panel.textContent, /Fez perguntas abertas para entender o cenário do cliente\./)
  assert.match(panel.textContent, /Isso ajuda a personalizar a proposta\./)
})

// Cenários 8 e 9: melhoria com impacto e correção — não pode ser só um
// texto genérico.
test('coaching mostra o ponto de melhoria com impacto e como corrigir, distinto do acerto', async () => {
  const { document } = await loadWithReading({})

  const panel = document.getElementById('yolen-tabpanel-analise')

  assert.match(panel.textContent, /Preço apresentado cedo demais/)
  assert.match(panel.textContent, /Mencionou o preço antes de confirmar o impacto\./)
  assert.match(panel.textContent, /O cliente pode ancorar no valor sem entender o valor entregue\./)
  assert.match(panel.textContent, /Confirme o impacto do problema antes de apresentar valores\./)

  const strengthItem = panel.querySelector('.yolen-coaching-strength')
  const improvementItem = panel.querySelector('.yolen-coaching-improvement')

  assert.ok(strengthItem, 'esperava um item de acerto')
  assert.ok(improvementItem, 'esperava um item de melhoria')
  assert.notEqual(strengthItem, improvementItem)
})

// Cenário 10: método on_method.
test('método dentro do padrão mostra "Dentro do método" na aderência', async () => {
  const { document } = await loadWithReading({})

  const panel = document.getElementById('yolen-tabpanel-analise')

  assert.match(panel.textContent, /Aderência ao método/)
  assert.match(panel.textContent, /Dentro do método/)
  assert.match(panel.textContent, /A conversa segue a ordem esperada do método\./)
})

// Cenário 11: partially_on_method.
test('aderência parcial aparece como "Parcialmente dentro do método"', async () => {
  const { document } = await loadWithReading({
    method: {
      ...defaultCommercialReading().method,
      adherence: {
        status: 'partially_on_method',
        summary: 'Avançou etapas, mas ainda não confirmou o orçamento.',
        deviation_stage_order: 2,
        what_happened: 'Pulou parte da descoberta antes de apresentar a proposta.',
        missing_information: ['Orçamento disponível'],
        why_it_matters: 'Sem o orçamento, a proposta pode não ser viável.',
        evidence_message_ids: [],
        memory_ids: [],
      },
      recovery_guidance: null,
    },
  })

  const panel = document.getElementById('yolen-tabpanel-analise')

  assert.match(panel.textContent, /Parcialmente dentro do método/)
  assert.match(panel.textContent, /Avançou etapas, mas ainda não confirmou o orçamento\./)
})

// Cenários 12 e 13: off_method + recovery — o vendedor precisa entender
// onde saiu, o que faltou, por que importa e como voltar.
test('método fora do padrão mostra "Saiu do método" e o guia de recuperação completo', async () => {
  const { document } = await loadWithReading({
    method: {
      ...defaultCommercialReading().method,
      adherence: {
        status: 'off_method',
        summary: 'A conversa saiu do método antes da descoberta terminar.',
        deviation_stage_order: 2,
        what_happened: 'Você apresentou preço antes de concluir o diagnóstico.',
        missing_information: ['Orçamento disponível', 'Prazo de decisão'],
        why_it_matters: 'Sem confirmar o impacto, o preço pode assustar o cliente.',
        evidence_message_ids: [],
        memory_ids: [],
      },
      recovery_guidance: {
        objective: 'Retomar a descoberta antes de voltar a falar de preço.',
        missing_information: ['Orçamento disponível', 'Prazo de decisão'],
        recommended_move: 'Pergunte qual é o orçamento disponível antes de continuar a negociação.',
        optional_question: 'Qual orçamento vocês têm reservado para isso?',
        evidence_message_ids: [],
        memory_ids: [],
      },
    },
  })

  const panel = document.getElementById('yolen-tabpanel-analise')

  assert.match(panel.textContent, /Saiu do método/)
  assert.match(panel.textContent, /Como voltar ao método/)
  assert.match(panel.textContent, /Você apresentou preço antes de concluir o diagnóstico\./)
  assert.match(panel.textContent, /Orçamento disponível/)
  assert.match(panel.textContent, /Sem confirmar o impacto, o preço pode assustar o cliente\./)
  assert.match(panel.textContent, /Pergunte qual é o orçamento disponível antes de continuar a negociação\./)

  // off_method é urgente o bastante para já vir expandido (item 10 da
  // missão permite abrir por padrão o que for acionável).
  const methodDetails = Array.from(panel.querySelectorAll('details')).find((details) =>
    /Método/.test(details.querySelector('summary')?.textContent ?? ''),
  )

  assert.ok(methodDetails)
  assert.equal(methodDetails.hasAttribute('open'), true)
})

// Cenário 14: método não configurado.
test('método não configurado mostra aviso simples, sem inventar metodologia', async () => {
  const { document } = await loadWithReading({
    method: {
      configured: false,
      name: null,
      stages: [],
      current_stage: null,
      adherence: {
        status: 'not_configured',
        summary: '',
        deviation_stage_order: null,
        what_happened: null,
        missing_information: [],
        why_it_matters: null,
        evidence_message_ids: [],
        memory_ids: [],
      },
      recovery_guidance: null,
    },
  })

  const panel = document.getElementById('yolen-tabpanel-analise')

  assert.match(panel.textContent, /Nenhum método comercial está configurado para esta operação\./)
  assert.match(panel.textContent, /Não configurado/)
  assert.doesNotMatch(panel.textContent, /Método SPIN|Situação|Problema|Implicação/)
})

// Cenário 15: evidência insuficiente — não pode virar "erro".
test('evidência insuficiente aparece como neutra, não como um problema do vendedor', async () => {
  const { document } = await loadWithReading({
    method: {
      ...defaultCommercialReading().method,
      adherence: {
        status: 'insufficient_evidence',
        summary: '',
        deviation_stage_order: null,
        what_happened: null,
        missing_information: [],
        why_it_matters: null,
        evidence_message_ids: [],
        memory_ids: [],
      },
      recovery_guidance: null,
    },
  })

  const panel = document.getElementById('yolen-tabpanel-analise')

  assert.match(panel.textContent, /Não há evidência suficiente para avaliar esta etapa\./)
  assert.doesNotMatch(panel.textContent, /Saiu do método|Como voltar ao método/)
})
