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

// FASE 16.6 — `renderAnalysisArea` foi substituída por
// `renderAnalysisViewModel`, que consome o AnalysisViewModel já pronto
// (Integrated Commercial Context) em vez de uma CommercialReading crua;
// `history` é o campo equivalente a `commercial_evolution` no novo
// contrato (app/lib/server/analysis-view-model.ts). Este helper monta o
// menor AnalysisViewModel "disponível e não neutro" que isola a seção
// de evolução comercial sendo testada, sem depender de nenhum outro
// campo.
function analysisViewModelWithHistory(history) {
  return {
    available: true,
    unavailable_reason: null,
    neutral: false,
    neutral_headline: null,
    neutral_description: null,
    opportunity: null,
    current_moment: { is_active_session: null },
    risks: [],
    objections_open: [],
    commitments: [],
    seller_conduct: {
      method: { configured: false, name: null, stages: [], current_stage: null, adherence: null, recovery_guidance: null },
      stage_divergence: false,
    },
    strengths: [],
    improvements: [],
    continuity: { cycle_conversation_count: 0, cross_conversation_signals: [] },
    history,
    provenance: {},
  }
}

test('B3.2 distribui Cliente e evolução em áreas progressivas separadas de AGORA', () => {
  const clientViewModel = sellerView.buildCustomerViewModelFromReading(reading({
    needs: [fact('Precisa reduzir perdas.')],
    interests: [fact('Interesse em automação.')],
    decision_criteria: [],
    preferences: [],
    open_questions: [fact('Qual é o prazo?')],
    objections: [],
    uncertainties: [],
  }))
  const clientHtml = sellerView.renderCustomerViewModel(clientViewModel)

  const analysisHtml = sellerView.renderAnalysisViewModel(analysisViewModelWithHistory([
    {
      label: 'Descoberta',
      status: 'partial',
      explanation: 'Impacto ainda em aberto.',
    },
  ]))

  // FASE 16.7 — needs/interests ficam no contexto secundário da
  // oportunidade (mandato §7/§13), open_questions vira lacuna de
  // descoberta (mandato §22) — ambos ainda distintos de AGORA/ANÁLISE.
  assert.match(clientHtml, /Contexto desta oportunidade/)
  assert.match(clientHtml, /Precisa reduzir perdas/)
  assert.match(clientHtml, /Interesse em automação/)
  assert.match(clientHtml, /O que falta descobrir/)
  assert.match(clientHtml, /Qual é o prazo\?/)
  assert.match(analysisHtml, /<details class="yolen-seller-secondary-details"[^>]*>/)
  assert.match(analysisHtml, /evolução comercial/i)
  assert.doesNotMatch(analysisHtml, /<details[^>]*open/)

  assert.match(contentScript, /getSellerAreaTabHtml\('now', 'Agora'\)/)
  assert.match(contentScript, /getSellerAreaTabHtml\('analysis', 'Análise'\)/)
  assert.match(contentScript, /getSellerAreaTabHtml\('client', 'Cliente'\)/)
})

test('B3.2 consome os campos seller-facing consolidados pelo contrato do cliente', () => {
  const vm = sellerView.buildCustomerViewModelFromReading(reading({
    needs: [fact('Necessidade')],
    interests: [fact('Interesse')],
    decision_criteria: [fact('Critério')],
    preferences: [fact('Preferência')],
    open_questions: [fact('Pergunta')],
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
  }))
  const html = sellerView.renderCustomerViewModel(vm)

  // FASE 16.7 — 'Pergunta'/'Incerteza' não aparecem aqui porque
  // missing_discovery tem prioridade sobre o fallback open_questions/
  // uncertainties (mandato §22) quando ambos existem.
  for (const copy of [
    'Objetivo',
    'Necessidade',
    'Interesse',
    'Critério',
    'Preferência',
    'Yolen',
    'Orçamento em aberto',
  ]) {
    assert.match(html, new RegExp(copy))
  }

  // Mandato §17 — objeção nunca aparece em CLIENTE (território de
  // ANÁLISE); resolved_information não vira seção própria (mandato §7).
  assert.doesNotMatch(html, /Objeção/)
  assert.doesNotMatch(html, /Informação resolvida/)

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

  const html = sellerView.renderAnalysisViewModel(analysisViewModelWithHistory(statuses.map((status, index) => ({
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
  const emptyVm = sellerView.buildCustomerViewModelFromReading(reading({}))
  // Sem nenhum dado, o empty state ajuda (mandato §36) em vez de
  // simplesmente desaparecer — nunca reaparece uma seção vazia.
  assert.match(sellerView.renderCustomerViewModel(emptyVm), /data-yolen-customer-empty/)
  assert.match(styles, /\.yolen-seller-secondary-details/)
  assert.match(styles, /\.yolen-client-intelligence-group/)
  assert.match(styles, /\.yolen-seller-workspace/)
  assert.match(styles, /overflow-wrap:\s*anywhere/)
  assert.doesNotMatch(styles, /\.yolen-panel\s*\{[^}]*width:\s*[5-9]\d\dpx/s)
})
