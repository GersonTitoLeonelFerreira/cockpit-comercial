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

  assert.match(clientHtml, /O que sabemos/)
  assert.match(clientHtml, /Em aberto/)
  assert.match(analysisHtml, /<details class="yolen-seller-secondary-details">/)
  assert.match(analysisHtml, /evolução comercial/i)
  assert.doesNotMatch(analysisHtml, /<details[^>]*open/)

  assert.match(contentScript, /getSellerAreaTabHtml\('now', 'Agora'\)/)
  assert.match(contentScript, /getSellerAreaTabHtml\('analysis', 'Análise'\)/)
  assert.match(contentScript, /getSellerAreaTabHtml\('client', 'Cliente'\)/)
})

test('B3.2 consome os campos seller-facing existentes sem antecipar contratos da Frente 1', () => {
  const html = sellerView.renderClientCommercialArea(reading({
    needs: [fact('Necessidade')],
    interests: [fact('Interesse')],
    decision_criteria: [fact('Critério')],
    preferences: [fact('Preferência')],
    open_questions: [fact('Pergunta')],
    objections: [fact('Objeção')],
    uncertainties: [fact('Incerteza')],
    objectives: [fact('Campo futuro')],
    discussed_products: [fact('Campo futuro')],
    missing_discovery: [fact('Campo futuro')],
    resolved_information: [fact('Campo futuro')],
  }))

  for (const copy of [
    'Necessidade',
    'Interesse',
    'Critério',
    'Preferência',
    'Pergunta',
    'Objeção',
    'Incerteza',
  ]) {
    assert.match(html, new RegExp(copy))
  }

  assert.doesNotMatch(html, /Campo futuro/)
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
  assert.match(styles, /\.yolen-client-knowledge-section/)
  assert.match(styles, /\.yolen-seller-workspace/)
  assert.match(styles, /overflow-wrap:\s*anywhere/)
  assert.doesNotMatch(styles, /\.yolen-panel\s*\{[^}]*width:\s*[5-9]\d\dpx/s)
})
