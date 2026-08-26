import assert from 'node:assert/strict'
import test from 'node:test'

// ============================================================================
// ONDA 8 — Teste de integração entre a FRENTE 1 (publicação do método
// construído pela Guided Journey) e a FRENTE 2 (Companion lê exclusivamente
// commercial-method-v2 publicado, sem fallback para v1/description/legacy
// method_steps).
//
// Este é o teste de portão principal da integração: ele chama a função real
// da Frente 1 (publishBuilderCommercialMethod) contra um Supabase falso em
// memória e alimenta o resultado real (CommercialConfigBundle lido do
// mesmo workspace que o Companion usa) diretamente nas duas funções reais
// de consumo da Frente 2 — buildCompanionDiagnosticInput (motor de
// diagnóstico) e normalizePublishedCommercialMethod (endpoint de
// orientação em tempo real). Nenhuma das duas pontas é simulada.
// ============================================================================

import {
  CommercialMethodPublishError,
  publishBuilderCommercialMethod,
} from '../server/commercial-method-publish.ts'
import { getCommercialConfigWorkspace } from '../server/commercial-config.ts'
import { buildCompanionDiagnosticInput, CompanionDiagnosticInputError } from './diagnostic-input.ts'
import { normalizePublishedCommercialMethod } from './lead-method-guidance.ts'

const COMPANY_ID = '10000000-0000-4000-8000-000000000001'
const CYCLE_ID = '90000000-0000-4000-8000-000000000001'
const PRODUCT_ID = '30000000-0000-4000-8000-000000000001'
const NOW = '2026-08-26T10:00:00.000Z'

// ----------------------------------------------------------------------------
// Fixtures — Método ATO (publicado antes) e Método AVANÇAR (construído pela
// Guided Journey, com as etapas do cenário real de aceitação: Descoberta,
// Tour, Apresentação, Decisão de compra, Follow-up).
// ----------------------------------------------------------------------------

function buildMethodAto() {
  return {
    contract_version: 'commercial-method-v2',
    name: 'Método ATO',
    description: 'Acolher, compreender no Tour e Obter o desfecho adequado.',
    principles: ['Perguntar somente quando a resposta puder alterar a decisão comercial.'],
    stages: [
      {
        key: 'tour',
        display_order: 1,
        name: 'Tour',
        objective: 'Compreender somente as informações relevantes para a decisão atual.',
        requirement: 'required',
        completion_criteria: ['A necessidade relevante está compreendida.'],
        partial_completion_criteria: [],
        skip_conditions: [],
        recommended_questions: ['O que é mais importante para você nessa escolha?'],
        common_mistakes: [],
        deepen_when: [],
        sufficient_when: ['As informações disponíveis já permitem orientar com segurança.'],
        advance_when: ['Existe correspondência comprovada entre necessidade e solução.'],
        wait_when: [],
        stop_asking_when: ['Novas perguntas não alterariam a decisão comercial.'],
        dimensions: [],
      },
    ],
  }
}

function buildMethodAvancar() {
  const stageNames = ['Descoberta', 'Tour', 'Apresentação', 'Decisão de compra', 'Follow-up']

  return {
    contract_version: 'commercial-method-v2',
    name: 'Método AVANÇAR',
    description: 'Método reconstruído pela jornada guiada, com cinco etapas explícitas.',
    principles: ['Avançar somente com evidência confirmada pelo comprador.'],
    stages: stageNames.map((name, index) => ({
      key: name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]+/g, '_'),
      display_order: index + 1,
      name,
      objective: `Objetivo confirmado da etapa ${name}.`,
      requirement: 'required',
      completion_criteria: [`O comprador confirmou o resultado necessário em ${name}.`],
      partial_completion_criteria: [],
      skip_conditions: [],
      recommended_questions: [],
      common_mistakes: [],
      deepen_when: [],
      sufficient_when: [`A informação confirmada já é suficiente em ${name}.`],
      advance_when: [`O comprador confirmou avanço em ${name}.`],
      wait_when: [],
      stop_asking_when: [`Novas perguntas não alterariam a decisão em ${name}.`],
      dimensions: [],
    })),
  }
}

function builderRow(companyId, overrides = {}) {
  return {
    company_id: companyId,
    ready_for_method: true,
    draft_data: {},
    method_construction_status: 'not_started',
    method_construction: null,
    method_definition: null,
    method_started_at: null,
    method_updated_at: null,
    updated_at: NOW,
    updated_by: 'user',
    ...overrides,
  }
}

function reviewReadyBuilderRow(companyId, methodDefinition, overrides = {}) {
  return builderRow(companyId, {
    method_construction_status: 'review_ready',
    method_construction: { construction_step: 'review' },
    method_definition: methodDefinition,
    method_started_at: NOW,
    method_updated_at: NOW,
    ...overrides,
  })
}

function publishedAtoVersion(companyId, overrides = {}) {
  return {
    id: 'config-ato',
    company_id: companyId,
    version_number: 1,
    contract_version: 'phase-2-v1',
    status: 'published',
    business_description: 'Academia com atendimento comercial consultivo.',
    target_audience: 'Pessoas interessadas em atividade física.',
    value_proposition: 'Acompanhamento e estrutura para treinar.',

    // Divergem propositalmente do commercial_method_definition: provam que
    // o Companion nunca usa esses campos legados como fonte do método.
    commercial_method_name: 'Método legado (não deve ser usado)',
    commercial_method_description: 'Descrição legada (não deve ser usada).',

    commercial_method_contract_version: 'commercial-method-v2',
    commercial_method_definition: buildMethodAto(),
    communication_tone: 'Direto, acolhedor e claro.',
    required_behaviors: ['Responder perguntas do cliente.'],
    prohibited_behaviors: ['Inventar condições comerciais.'],
    created_by: 'user',
    published_by: 'user',
    archived_by: null,
    created_at: NOW,
    updated_at: NOW,
    published_at: NOW,
    archived_at: null,
    ...overrides,
  }
}

function legacyMethodStepRow(companyId, versionId) {
  return {
    id: 'legacy-step-1',
    company_id: companyId,
    config_version_id: versionId,
    step_order: 1,
    name: 'Diagnóstico (etapa legada, não deve ser usada)',
    objective: 'Entender objetivo e rotina.',
    completion_criteria: ['Objetivo identificado.'],
    recommended_questions: ['Qual é seu principal objetivo?'],
    is_required: true,
    created_at: NOW,
    updated_at: NOW,
  }
}

function productProfileRow(companyId, versionId) {
  return {
    id: 'product-profile-1',
    company_id: companyId,
    config_version_id: versionId,
    product_id: PRODUCT_ID,
    commercial_product_contract_version: 'commercial-product-v1',
    commercial_product_definition: null,
    indicated_audiences: ['Adultos'],
    needs_addressed: ['Condicionamento físico'],
    benefits: ['Estrutura completa'],
    verified_differentiators: ['Acompanhamento'],
    limitations: ['Disponibilidade depende da unidade'],
    contract_conditions: ['Conforme contrato'],
    payment_conditions: ['Conforme plano escolhido'],
    allowed_claims: ['Estrutura disponível'],
    forbidden_claims: ['Resultado garantido'],
    created_at: NOW,
    updated_at: NOW,
  }
}

function factRow(companyId, versionId) {
  return {
    id: 'fact-1',
    company_id: companyId,
    config_version_id: versionId,
    commercial_fact_contract_version: 'commercial-fact-v1',
    commercial_fact_definition: null,
    category: 'estrutura',
    fact_key: 'horario',
    fact_value: 'Horário conforme unidade.',
    source_note: 'Configuração oficial',
    is_active: true,
    created_at: NOW,
    updated_at: NOW,
  }
}

function objectionGuideRow(companyId, versionId) {
  return {
    id: 'objection-1',
    company_id: companyId,
    config_version_id: versionId,
    commercial_objection_contract_version: 'commercial-objection-v1',
    commercial_objection_definition: null,
    sort_order: 1,
    objection: 'Preço',
    signals: ['Está caro'],
    discovery_questions: ['O que você está comparando?'],
    recommended_approach: 'Entender a comparação antes de responder.',
    response_limits: ['Não prometer desconto inexistente.'],
    is_active: true,
    created_at: NOW,
    updated_at: NOW,
  }
}

// ----------------------------------------------------------------------------
// Fake Supabase — mesma semântica das RPCs reais (full-replace de filhos,
// invariantes de único draft/published, arquivamento no publish), reduzida
// ao necessário para exercitar publishBuilderCommercialMethod de ponta a
// ponta neste teste.
// ----------------------------------------------------------------------------

class FakeQuery {
  constructor(rows) {
    this.rows = rows
    this.filters = []
    this.sorts = []
  }

  select() {
    return this
  }

  eq(field, value) {
    this.filters.push((row) => row[field] === value)
    return this
  }

  in(field, values) {
    this.filters.push((row) => values.includes(row[field]))
    return this
  }

  order(field, opts) {
    this.sorts.push({ field, ascending: opts?.ascending !== false })
    return this
  }

  _rows() {
    let result = this.rows.filter((row) => this.filters.every((filter) => filter(row)))
    for (const sort of [...this.sorts].reverse()) {
      result = [...result].sort((a, b) => {
        if (a[sort.field] === b[sort.field]) return 0
        const diff = a[sort.field] < b[sort.field] ? -1 : 1
        return sort.ascending ? diff : -diff
      })
    }
    return result
  }

  async maybeSingle() {
    const rows = this._rows()
    return { data: rows[0] ?? null, error: rows.length > 1 ? { message: 'multiple rows' } : null }
  }

  then(resolve, reject) {
    Promise.resolve({ data: this._rows(), error: null }).then(resolve, reject)
  }
}

function makeDb() {
  return {
    builderDrafts: [],
    configVersions: [],
    methodSteps: [],
    productProfiles: [],
    facts: [],
    objectionGuides: [],
    products: [],
    forcePublishFailure: false,
    idCounter: 0,
  }
}

function nextId(db, prefix) {
  db.idCounter += 1
  return `${prefix}-${db.idCounter}`
}

function replaceChildren(table, versionId, newRows) {
  const kept = table.filter((row) => row.config_version_id !== versionId)
  table.length = 0
  table.push(...kept, ...newRows)
}

function saveDraftRpc(db, args) {
  const { p_company_id: companyId, p_config_version_id: configVersionId, p_payload: payload } = args
  let version

  if (configVersionId) {
    version = db.configVersions.find((row) => row.id === configVersionId && row.company_id === companyId)
    if (!version) return { data: null, error: { message: 'Rascunho não encontrado.' } }
    if (version.status !== 'draft') return { data: null, error: { message: 'A versão não está em rascunho.' } }
  } else {
    const existingDraft = db.configVersions.find((row) => row.company_id === companyId && row.status === 'draft')
    if (existingDraft) return { data: null, error: { message: 'Já existe um rascunho em andamento.' } }
    const numbers = db.configVersions.filter((row) => row.company_id === companyId).map((row) => row.version_number)
    version = {
      id: nextId(db, 'config'),
      company_id: companyId,
      version_number: numbers.length ? Math.max(...numbers) + 1 : 1,
      contract_version: 'phase-2-v1',
      status: 'draft',
      created_by: 'user',
      published_by: null,
      archived_by: null,
      created_at: NOW,
      published_at: null,
      archived_at: null,
    }
    db.configVersions.push(version)
  }

  version.business_description = payload.business_description
  version.target_audience = payload.target_audience
  version.value_proposition = payload.value_proposition
  version.commercial_method_name = payload.commercial_method_name
  version.commercial_method_description = payload.commercial_method_description
  version.communication_tone = payload.communication_tone
  version.required_behaviors = payload.required_behaviors
  version.prohibited_behaviors = payload.prohibited_behaviors
  version.updated_at = NOW

  const definition = payload.commercial_method_definition
  if (definition && typeof definition === 'object') {
    version.commercial_method_contract_version = 'commercial-method-v2'
    version.commercial_method_definition = definition
  } else {
    version.commercial_method_contract_version = 'commercial-method-v1'
    version.commercial_method_definition = null
  }

  replaceChildren(
    db.methodSteps,
    version.id,
    payload.method_steps.map((step) => ({
      id: nextId(db, 'step'),
      company_id: companyId,
      config_version_id: version.id,
      step_order: step.step_order,
      name: step.name,
      objective: step.objective,
      completion_criteria: step.completion_criteria,
      recommended_questions: step.recommended_questions,
      is_required: step.is_required,
      created_at: NOW,
      updated_at: NOW,
    })),
  )

  replaceChildren(
    db.productProfiles,
    version.id,
    payload.product_profiles.map((profile) => ({
      id: nextId(db, 'product'),
      company_id: companyId,
      config_version_id: version.id,
      product_id: profile.product_id,
      commercial_product_contract_version: profile.commercial_product_definition
        ? 'commercial-product-v2'
        : 'commercial-product-v1',
      commercial_product_definition: profile.commercial_product_definition,
      indicated_audiences: profile.indicated_audiences,
      needs_addressed: profile.needs_addressed,
      benefits: profile.benefits,
      verified_differentiators: profile.verified_differentiators,
      limitations: profile.limitations,
      contract_conditions: profile.contract_conditions,
      payment_conditions: profile.payment_conditions,
      allowed_claims: profile.allowed_claims,
      forbidden_claims: profile.forbidden_claims,
      created_at: NOW,
      updated_at: NOW,
    })),
  )

  replaceChildren(
    db.facts,
    version.id,
    payload.facts.map((fact) => ({
      id: nextId(db, 'fact'),
      company_id: companyId,
      config_version_id: version.id,
      commercial_fact_contract_version: fact.commercial_fact_definition ? 'commercial-fact-v2' : 'commercial-fact-v1',
      commercial_fact_definition: fact.commercial_fact_definition,
      category: fact.category,
      fact_key: fact.fact_key,
      fact_value: fact.fact_value,
      source_note: fact.source_note,
      is_active: fact.is_active,
      created_at: NOW,
      updated_at: NOW,
    })),
  )

  replaceChildren(
    db.objectionGuides,
    version.id,
    payload.objection_guides.map((guide) => ({
      id: nextId(db, 'objection'),
      company_id: companyId,
      config_version_id: version.id,
      commercial_objection_contract_version: guide.commercial_objection_definition
        ? 'commercial-objection-v2'
        : 'commercial-objection-v1',
      commercial_objection_definition: guide.commercial_objection_definition,
      sort_order: guide.sort_order,
      objection: guide.objection,
      signals: guide.signals,
      discovery_questions: guide.discovery_questions,
      recommended_approach: guide.recommended_approach,
      response_limits: guide.response_limits,
      is_active: guide.is_active,
      created_at: NOW,
      updated_at: NOW,
    })),
  )

  return {
    data: [
      {
        company_id: version.company_id,
        config_version_id: version.id,
        version_number: version.version_number,
        status: version.status,
      },
    ],
    error: null,
  }
}

function cloneRpc(db, args) {
  const { p_company_id: companyId, p_source_config_version_id: sourceId } = args
  const source = db.configVersions.find((row) => row.id === sourceId && row.company_id === companyId)
  if (!source) return { data: null, error: { message: 'Versão de origem não encontrada.' } }

  const existingDraft = db.configVersions.find((row) => row.company_id === companyId && row.status === 'draft')
  if (existingDraft) return { data: null, error: { message: 'Já existe um rascunho em andamento.' } }

  const numbers = db.configVersions.filter((row) => row.company_id === companyId).map((row) => row.version_number)
  const clone = {
    ...source,
    id: nextId(db, 'config'),
    version_number: numbers.length ? Math.max(...numbers) + 1 : 1,
    status: 'draft',
    published_by: null,
    archived_by: null,
    created_at: NOW,
    updated_at: NOW,
    published_at: null,
    archived_at: null,
  }
  db.configVersions.push(clone)

  for (const [table] of [
    [db.methodSteps],
    [db.productProfiles],
    [db.facts],
    [db.objectionGuides],
  ]) {
    replaceChildren(
      table,
      clone.id,
      table
        .filter((row) => row.config_version_id === source.id)
        .map((row) => ({ ...row, id: nextId(db, 'clone'), config_version_id: clone.id })),
    )
  }

  return {
    data: [
      { company_id: clone.company_id, config_version_id: clone.id, version_number: clone.version_number, status: clone.status },
    ],
    error: null,
  }
}

function publishRpc(db, args) {
  if (db.forcePublishFailure) {
    return { data: null, error: { message: 'Falha simulada de publicação.' } }
  }

  const { p_company_id: companyId, p_config_version_id: configVersionId } = args
  const version = db.configVersions.find((row) => row.id === configVersionId && row.company_id === companyId)
  if (!version || version.status !== 'draft') {
    return { data: null, error: { message: 'A versão não está em rascunho.' } }
  }

  const previouslyPublished = db.configVersions.find((row) => row.company_id === companyId && row.status === 'published')
  if (previouslyPublished) {
    previouslyPublished.status = 'archived'
    previouslyPublished.archived_at = NOW
    previouslyPublished.archived_by = 'user'
  }

  version.status = 'published'
  version.published_at = NOW
  version.published_by = 'user'

  return {
    data: [
      { company_id: version.company_id, config_version_id: version.id, version_number: version.version_number, status: version.status, published_at: version.published_at },
    ],
    error: null,
  }
}

function fakeSupabase(db) {
  const tables = {
    company_commercial_method_builder_drafts: db.builderDrafts,
    company_commercial_config_versions: db.configVersions,
    company_commercial_method_steps: db.methodSteps,
    company_commercial_product_profiles: db.productProfiles,
    company_commercial_facts: db.facts,
    company_commercial_objection_guides: db.objectionGuides,
    products: db.products,
  }

  return {
    from(table) {
      const rows = tables[table]
      if (!rows) throw new Error(`tabela não simulada nos testes: ${table}`)
      return new FakeQuery(rows)
    },

    async rpc(name, args) {
      if (name === 'rpc_save_company_commercial_config_draft_v6') return saveDraftRpc(db, args)
      if (name === 'rpc_clone_company_commercial_config_v6') return cloneRpc(db, args)
      if (name === 'rpc_publish_company_commercial_config') return publishRpc(db, args)
      throw new Error(`RPC não simulada nos testes: ${name}`)
    },
  }
}

function seedInitialState(db) {
  db.builderDrafts.push(reviewReadyBuilderRow(COMPANY_ID, buildMethodAvancar()))
  const published = publishedAtoVersion(COMPANY_ID)
  db.configVersions.push(published)
  db.methodSteps.push(legacyMethodStepRow(COMPANY_ID, published.id))
  db.productProfiles.push(productProfileRow(COMPANY_ID, published.id))
  db.facts.push(factRow(COMPANY_ID, published.id))
  db.objectionGuides.push(objectionGuideRow(COMPANY_ID, published.id))
  return published
}

// buildCompanionDiagnosticInput exige messages/products/etc. Não são o foco
// deste teste — apenas o necessário para a função aceitar a entrada.
function diagnosticInputArgs(bundle) {
  return {
    company_id: COMPANY_ID,
    cycle_id: CYCLE_ID,
    conversation_key: 'whatsapp:5511999999999',
    current_crm_status: 'respondeu',
    reference_time: NOW,
    messages: [
      {
        id: '1',
        message_key: 'message-001',
        version: 1,
        direction: 'incoming',
        occurred_at: NOW,
        observed_at: NOW,
        content_type: 'text',
        text_content: 'Quero treinar três vezes por semana.',
        audio_transcription: null,
        is_deleted: false,
      },
    ],
    commercial_config: bundle,
    products: [
      { id: PRODUCT_ID, company_id: COMPANY_ID, name: 'Plano Open', category: 'plano', base_price: 199.9, active: true },
    ],
  }
}

// ----------------------------------------------------------------------------
// Teste de portão principal (seção 9)
// ----------------------------------------------------------------------------

test('elo Frente 1 → Frente 2: publicar Método AVANÇAR troca o que o Companion usa, sem fallback v1/description/legacy steps', async () => {
  const db = makeDb()
  const publishedAto = seedInitialState(db)
  const supabase = fakeSupabase(db)

  // --- Primeira análise: Companion ainda usa o Método ATO publicado ---
  const workspaceBefore = await getCommercialConfigWorkspace(supabase, COMPANY_ID)
  assert.equal(workspaceBefore.published?.version.commercial_method_name, 'Método legado (não deve ser usado)')

  const diagnosticBefore = buildCompanionDiagnosticInput(
    diagnosticInputArgs(workspaceBefore.published),
  )

  assert.equal(diagnosticBefore.commercial_context.sales_method.configured, true)
  assert.equal(diagnosticBefore.commercial_context.sales_method.contract_version, 'commercial-method-v2')
  assert.equal(diagnosticBefore.commercial_context.sales_method.name, 'Método ATO')
  assert.deepEqual(
    diagnosticBefore.commercial_context.sales_method.steps.map((step) => step.name),
    ['Tour'],
  )
  // Prova negativa: os campos legados divergentes nunca aparecem.
  assert.notEqual(diagnosticBefore.commercial_context.sales_method.name, 'Método legado (não deve ser usado)')
  assert.ok(!diagnosticBefore.commercial_context.sales_method.steps.some((step) => step.name.includes('Diagnóstico')))

  const guidanceBefore = normalizePublishedCommercialMethod(publishedAto)
  assert.equal(guidanceBefore.status, 'active')
  assert.equal(guidanceBefore.method.name, 'Método ATO')
  assert.deepEqual(guidanceBefore.method.stages.map((stage) => stage.name), ['Tour'])
  assert.equal(guidanceBefore.method.structure_source, 'structured_definition')

  // --- Ponte: Frente 1 publica o método construído pela Guided Journey ---
  const publishResult = await publishBuilderCommercialMethod(supabase, COMPANY_ID)
  assert.equal(publishResult.method_name, 'Método AVANÇAR')
  assert.equal(publishResult.already_published, false)

  // --- Segunda análise: Companion agora usa o Método AVANÇAR ---
  const workspaceAfter = await getCommercialConfigWorkspace(supabase, COMPANY_ID)
  assert.notEqual(workspaceAfter.published?.version.id, workspaceBefore.published?.version.id)
  assert.equal(workspaceAfter.published?.version.commercial_method_contract_version, 'commercial-method-v2')

  const diagnosticAfter = buildCompanionDiagnosticInput(
    diagnosticInputArgs(workspaceAfter.published),
  )

  assert.equal(diagnosticAfter.commercial_context.sales_method.name, 'Método AVANÇAR')
  assert.deepEqual(
    diagnosticAfter.commercial_context.sales_method.steps.map((step) => step.name),
    ['Descoberta', 'Tour', 'Apresentação', 'Decisão de compra', 'Follow-up'],
  )
  // Não usa mais o Método ATO.
  assert.notEqual(diagnosticAfter.commercial_context.sales_method.name, 'Método ATO')

  const guidanceAfter = normalizePublishedCommercialMethod(workspaceAfter.published.version)
  assert.equal(guidanceAfter.status, 'active')
  assert.equal(guidanceAfter.method.name, 'Método AVANÇAR')
  assert.deepEqual(
    guidanceAfter.method.stages.map((stage) => stage.name),
    ['Descoberta', 'Tour', 'Apresentação', 'Decisão de compra', 'Follow-up'],
  )
  assert.equal(guidanceAfter.method.structure_source, 'structured_definition')

  // Produtos, fatos, objeções, tom e comportamentos continuam os mesmos.
  assert.equal(diagnosticAfter.commercial_context.products[0].name, 'Plano Open')
  assert.equal(diagnosticAfter.commercial_context.facts[0].category, 'estrutura')
  assert.equal(diagnosticAfter.commercial_context.objection_guides[0].objection, 'Preço')

  // O Método ATO permanece no histórico (arquivado), nunca voltando a ser
  // published nem sendo apagado.
  const archived = db.configVersions.find((row) => row.id === publishedAto.id)
  assert.equal(archived.status, 'archived')
  assert.equal(archived.commercial_method_definition.name, 'Método ATO')

  // Um rascunho nunca pode alimentar o Companion — mesmo que alguém tente.
  assert.throws(
    () => buildCompanionDiagnosticInput(diagnosticInputArgs({ ...workspaceAfter.published, version: { ...workspaceAfter.published.version, status: 'draft' } })),
    (error) => {
      assert.ok(error instanceof CompanionDiagnosticInputError)
      assert.equal(error.code, 'UNPUBLISHED_COMMERCIAL_CONFIG')
      return true
    },
  )
})

// ----------------------------------------------------------------------------
// Teste de falha (seção 10)
// ----------------------------------------------------------------------------

test('falha na publicação: Método A continua published e é o que o Companion usa; Método B nunca aparece como ativo', async () => {
  const db = makeDb()
  seedInitialState(db)
  db.forcePublishFailure = true
  const supabase = fakeSupabase(db)

  await assert.rejects(
    publishBuilderCommercialMethod(supabase, COMPANY_ID),
    (error) => {
      assert.ok(error instanceof CommercialMethodPublishError)
      assert.equal(error.code, 'PUBLISH_FAILED')
      return true
    },
  )

  const workspace = await getCommercialConfigWorkspace(supabase, COMPANY_ID)
  assert.equal(workspace.published?.version.commercial_method_definition.name, 'Método ATO')

  const diagnostic = buildCompanionDiagnosticInput(diagnosticInputArgs(workspace.published))
  assert.equal(diagnostic.commercial_context.sales_method.name, 'Método ATO')
  assert.deepEqual(
    diagnostic.commercial_context.sales_method.steps.map((step) => step.name),
    ['Tour'],
  )

  // Método B (AVANÇAR) ficou como draft — nunca chega a ser lido pelo
  // Companion porque buildCompanionDiagnosticInput exige status published.
  assert.equal(workspace.draft?.version.commercial_method_definition.name, 'Método AVANÇAR')
  assert.throws(
    () => buildCompanionDiagnosticInput(diagnosticInputArgs(workspace.draft)),
    (error) => {
      assert.ok(error instanceof CompanionDiagnosticInputError)
      assert.equal(error.code, 'UNPUBLISHED_COMMERCIAL_CONFIG')
      return true
    },
  )
})

// ----------------------------------------------------------------------------
// Teste de edição posterior (seção 11)
// ----------------------------------------------------------------------------

test('edição posterior não publicada: Companion continua usando a última versão published', async () => {
  const db = makeDb()
  seedInitialState(db)
  const supabase = fakeSupabase(db)

  await publishBuilderCommercialMethod(supabase, COMPANY_ID)

  // O gestor começa a editar de novo (o estado "editing" sempre zera
  // method_definition no builder), mas nunca publica a nova revisão.
  const builder = db.builderDrafts.find((row) => row.company_id === COMPANY_ID)
  builder.method_construction_status = 'editing'
  builder.method_definition = null

  const workspace = await getCommercialConfigWorkspace(supabase, COMPANY_ID)
  const diagnostic = buildCompanionDiagnosticInput(diagnosticInputArgs(workspace.published))

  assert.equal(diagnostic.commercial_context.sales_method.name, 'Método AVANÇAR')
  assert.deepEqual(
    diagnostic.commercial_context.sales_method.steps.map((step) => step.name),
    ['Descoberta', 'Tour', 'Apresentação', 'Decisão de compra', 'Follow-up'],
  )

  const guidance = normalizePublishedCommercialMethod(workspace.published.version)
  assert.equal(guidance.status, 'active')
  assert.equal(guidance.method.name, 'Método AVANÇAR')
})
