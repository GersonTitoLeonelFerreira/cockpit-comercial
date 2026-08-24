import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const require = createRequire(import.meta.url)
const sellerView = require('../src/companion-seller-information-view.js')
const contentScript = readFileSync(new URL('../src/content-script.js', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')

function fact(summary) {
  return {
    summary,
    evidence_message_ids: [],
    memory_ids: [],
  }
}

function reading(customer, commercialEvolution = []) {
  return {
    commercial_relevance: 'commercial',
    customer,
    commercial_evolution: commercialEvolution,
    seller_strengths: [],
    improvement_points: [],
    risks: {
      customer_objections: [],
      service_risks: [],
    },
    method: null,
  }
}

test('B3.2 distribui Cliente e evolução em áreas progressivas separadas de AGORA', () => {
  const clientHtml = sellerView.renderClientCommercialArea(reading({
    needs: [fact('Precisa reduzir perdas.')],
    interests: [fact('Interesse em automação.')],
    decision_criteria: [],
    preferences: [],
    open_questions: [fact('Qual é o prazo?')],
    objections: [],
    uncertainties: [],
  }))

  const analysisHtml = sellerView.renderAnalysisArea(reading({}, [
    {
      label: 'Descoberta',
      status: 'partial',
      explanation: 'Impacto ainda em aberto.',
    },
  ]))

  assert.match(clientHtml, /O que ele quer/)
  assert.match(clientHtml, /Outros pontos em aberto/)
  assert.match(analysisHtml, /<details class="yolen-seller-secondary-details"[^>]*>/)
  assert.match(analysisHtml, /evolução comercial/i)
  assert.doesNotMatch(analysisHtml, /<details[^>]*open/)

  assert.match(contentScript, /getSellerAreaTabHtml\('now', 'Agora'\)/)
  assert.match(contentScript, /getSellerAreaTabHtml\('analysis', 'Análise'\)/)
  assert.match(contentScript, /getSellerAreaTabHtml\('client', 'Cliente'\)/)
})

test('B3.2 consome os campos seller-facing consolidados pelo contrato do cliente', () => {
  const html = sellerView.renderClientCommercialArea(reading({
    needs: [fact('Necessidade')],
    interests: [fact('Interesse')],
    decision_criteria: [fact('Critério')],
    preferences: [fact('Preferência')],
    open_questions: [fact('Pergunta')],
    objections: [fact('Objeção')],
    uncertainties: [fact('Incerteza')],
    objectives: [fact('Objetivo')],
    discussed_products: [{
      ...fact('Produto discutido'),
      canonical_product_id: 'product-yolen',
      name: 'Yolen',
      interest_level: 'interested',
    }],
    missing_discovery: [{
      ...fact('Orçamento em aberto'),
      topic: 'budget',
    }],
    resolved_information: [{
      ...fact('Informação resolvida'),
      category: 'objection',
    }],
  }))

  for (const copy of [
    'Objetivo',
    'Necessidade',
    'Interesse',
    'Critério',
    'Preferência',
    'Pergunta',
    'Objeção',
    'Incerteza',
    'Yolen',
    'Orçamento em aberto',
    'Informação resolvida',
  ]) {
    assert.match(html, new RegExp(copy))
  }

  assert.doesNotMatch(html, /evidence_message_ids|memory_ids|contract_version|engine_source/)
})

test('B3.2 preserva os status conhecidos da evolução comercial', () => {
  const statuses = [
    'completed',
    'active',
    'partial',
    'pending',
    'not_started',
    'skipped',
    'not_applicable',
  ]

  const html = sellerView.renderAnalysisArea(reading({}, statuses.map((status, index) => ({
    label: `Etapa ${index + 1}`,
    status,
    explanation: `Explicação ${index + 1}`,
  }))))

  for (const label of [
    'Concluída',
    'Ativa',
    'Parcial',
    'Pendente',
    'Não iniciada',
    'Pulada',
    'Não se aplica',
  ]) {
    assert.match(html, new RegExp(label))
  }
})

test('B3.2 omite grupos vazios e mantém detalhe sob demanda sem alterar largura do painel', () => {
  assert.equal(sellerView.renderClientCommercialArea(reading({})), '')
  assert.match(styles, /\.yolen-seller-secondary-details/)
  assert.match(styles, /\.yolen-client-intelligence-group/)
  assert.match(styles, /\.yolen-seller-workspace/)
  assert.match(styles, /overflow-wrap:\s*anywhere/)
  assert.doesNotMatch(styles, /\.yolen-panel\s*\{[^}]*width:\s*[5-9]\d\dpx/s)
})
