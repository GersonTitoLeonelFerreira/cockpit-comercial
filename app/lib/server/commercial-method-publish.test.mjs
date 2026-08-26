import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CommercialMethodPublishError,
  publishBuilderCommercialMethod,
} from './commercial-method-publish.ts'
import { getCommercialConfigWorkspace } from './commercial-config.ts'

const COMPANY_A = '10000000-0000-4000-8000-000000000001'
const COMPANY_B = '10000000-0000-4000-8000-000000000002'

const NOW = '2026-08-26T10:00:00.000Z'

// ============================================================================
// Fixtures — Método ATO (legado, publicado) e Método AVANÇAR (construído
// pela Guided Journey), espelhando o cenário de aceitação da seção 23.
// ============================================================================

function buildMethodAto() {
  return {
    contract_version: 'commercial-method-v2',
    name: 'Método ATO',
    description: 'Acolher, realizar o Tour necessário e Obter o desfecho comercial adequado.',
    principles: ['Perguntar somente quando a resposta puder alterar a decisão.'],
    stages: [
      {
        key: 'acolher',
        display_order: 1,
        name: 'Acolher',
        objective: 'Compreender a intenção imediata.',
        requirement: 'required',
        completion_criteria: ['A intenção imediata foi compreendida.'],
        partial_completion_criteria: [],
        skip_conditions: [],
        recommended_questions: [],
        common_mistakes: [],
        deepen_when: [],
        sufficient_when: ['Existe informação suficiente para decidir o que é útil agora.'],
        advance_when: [],
        wait_when: ['O cliente assumiu compromisso de retorno.'],
        stop_asking_when: ['Novas perguntas não alterariam a decisão.'],
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
      key: name.toLowerCase().replace(/[^a-z]+/g, '_'),
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
    business_description: 'Descrição de negócio existente.',
    target_audience: 'Público-alvo existente.',
    value_proposition: 'Proposta de valor existente.',
    commercial_method_name: 'Método ATO',
    commercial_method_description: 'Descrição do método ATO.',
    commercial_method_contract_version: 'commercial-method-v2',
    commercial_method_definition: buildMethodAto(),
    communication_tone: 'Consultivo e direto.',
    required_behaviors: ['Confirmar a necessidade antes de propor.'],
    prohibited_behaviors: ['Prometer condições não aprovadas.'],
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

// ============================================================================
// Fake Supabase — tabelas em memória + RPCs de save/clone/publish
// simuladas com semântica equivalente às RPCs reais (full-replace de
// filhos, invariantes de único draft/published, arquivamento no publish).
// ============================================================================

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

function cloneChildren(db, sourceVersionId, targetVersion) {
  replaceChildren(
    db.methodSteps,
    targetVersion.id,
    db.methodSteps
      .filter((row) => row.config_version_id === sourceVersionId)
      .map((row) => ({ ...row, id: nextId(db, 'step'), config_version_id: targetVersion.id })),
  )
  replaceChildren(
    db.productProfiles,
    targetVersion.id,
    db.productProfiles
      .filter((row) => row.config_version_id === sourceVersionId)
      .map((row) => ({ ...row, id: nextId(db, 'product'), config_version_id: targetVersion.id })),
  )
  replaceChildren(
    db.facts,
    targetVersion.id,
    db.facts
      .filter((row) => row.config_version_id === sourceVersionId)
      .map((row) => ({ ...row, id: nextId(db, 'fact'), config_version_id: targetVersion.id })),
  )
  replaceChildren(
    db.objectionGuides,
    targetVersion.id,
    db.objectionGuides
      .filter((row) => row.config_version_id === sourceVersionId)
      .map((row) => ({ ...row, id: nextId(db, 'objection'), config_version_id: targetVersion.id })),
  )
}

function saveDraftRpc(db, args) {
  const { p_company_id: companyId, p_config_version_id: configVersionId, p_payload: payload } = args
  let version

  if (configVersionId) {
    version = db.configVersions.find((row) => row.id === configVersionId && row.company_id === companyId)
    if (!version) {
      return { data: null, error: { message: 'Rascunho não encontrado.' } }
    }
    if (version.status !== 'draft') {
      return { data: null, error: { message: 'A versão não está em rascunho.' } }
    }
  } else {
    const existingDraft = db.configVersions.find((row) => row.company_id === companyId && row.status === 'draft')
    if (existingDraft) {
      return { data: null, error: { message: 'Já existe um rascunho em andamento.' } }
    }
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

  if (!source) {
    return { data: null, error: { message: 'Versão de origem não encontrada.' } }
  }

  const existingDraft = db.configVersions.find((row) => row.company_id === companyId && row.status === 'draft')
  if (existingDraft) {
    return { data: null, error: { message: 'Já existe um rascunho em andamento.' } }
  }

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
  cloneChildren(db, source.id, clone)

  return {
    data: [
      {
        company_id: clone.company_id,
        config_version_id: clone.id,
        version_number: clone.version_number,
        status: clone.status,
      },
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

  const previouslyPublished = db.configVersions.find(
    (row) => row.company_id === companyId && row.status === 'published',
  )

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
      {
        company_id: version.company_id,
        config_version_id: version.id,
        version_number: version.version_number,
        status: version.status,
        published_at: version.published_at,
      },
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
      if (!rows) {
        throw new Error(`tabela não simulada nos testes: ${table}`)
      }
      return new FakeQuery(rows)
    },

    async rpc(name, args) {
      if (name === 'rpc_save_company_commercial_config_draft_v6') {
        return saveDraftRpc(db, args)
      }
      if (name === 'rpc_clone_company_commercial_config_v6') {
        return cloneRpc(db, args)
      }
      if (name === 'rpc_publish_company_commercial_config') {
        return publishRpc(db, args)
      }
      throw new Error(`RPC não simulada nos testes: ${name}`)
    },
  }
}

// ============================================================================
// Testes
// ============================================================================

test('A: review_ready não altera o método publicado', async () => {
  const db = makeDb()
  db.builderDrafts.push(reviewReadyBuilderRow(COMPANY_A, buildMethodAvancar()))
  db.configVersions.push(publishedAtoVersion(COMPANY_A))

  const workspace = await getCommercialConfigWorkspace(fakeSupabase(db), COMPANY_A)

  assert.equal(workspace.published?.version.commercial_method_name, 'Método ATO')
  assert.equal(workspace.published?.version.commercial_method_definition.name, 'Método ATO')
})

test('B/C/D: publicação explícita cria nova versão published com commercial-method-v2 idêntico ao compilado', async () => {
  const db = makeDb()
  const avancar = buildMethodAvancar()
  db.builderDrafts.push(reviewReadyBuilderRow(COMPANY_A, avancar))
  db.configVersions.push(publishedAtoVersion(COMPANY_A))

  const result = await publishBuilderCommercialMethod(fakeSupabase(db), COMPANY_A)

  assert.equal(result.already_published, false)
  assert.equal(result.method_name, 'Método AVANÇAR')
  assert.equal(result.version_number, 2)
  assert.equal(result.previous_published_version_number, 1)

  const workspace = await getCommercialConfigWorkspace(fakeSupabase(db), COMPANY_A)
  assert.equal(workspace.published?.version.status, 'published')
  assert.equal(workspace.published?.version.commercial_method_contract_version, 'commercial-method-v2')
  assert.deepEqual(workspace.published?.version.commercial_method_definition, avancar)
})

test('E: a versão publicada anterior é preservada, arquivada, não excluída', async () => {
  const db = makeDb()
  db.builderDrafts.push(reviewReadyBuilderRow(COMPANY_A, buildMethodAvancar()))
  db.configVersions.push(publishedAtoVersion(COMPANY_A))

  await publishBuilderCommercialMethod(fakeSupabase(db), COMPANY_A)

  const archived = db.configVersions.find((row) => row.id === 'config-ato')
  assert.ok(archived)
  assert.equal(archived.status, 'archived')
  assert.equal(archived.commercial_method_definition.name, 'Método ATO')
})

test('F/G/H/I: produtos, fatos, objeções, tom e comportamentos permanecem intactos após publicar o método', async () => {
  const db = makeDb()
  db.builderDrafts.push(reviewReadyBuilderRow(COMPANY_A, buildMethodAvancar()))
  const published = publishedAtoVersion(COMPANY_A)
  db.configVersions.push(published)

  db.productProfiles.push({
    id: 'product-existing',
    company_id: COMPANY_A,
    config_version_id: published.id,
    product_id: 'product-1',
    commercial_product_contract_version: 'commercial-product-v1',
    commercial_product_definition: null,
    indicated_audiences: ['Clientes elegíveis.'],
    needs_addressed: ['Necessidade existente.'],
    benefits: ['Benefício existente.'],
    verified_differentiators: [],
    limitations: [],
    contract_conditions: [],
    payment_conditions: [],
    allowed_claims: [],
    forbidden_claims: [],
    created_at: NOW,
    updated_at: NOW,
  })

  db.facts.push({
    id: 'fact-existing',
    company_id: COMPANY_A,
    config_version_id: published.id,
    commercial_fact_contract_version: 'commercial-fact-v1',
    commercial_fact_definition: null,
    category: 'empresa',
    fact_key: 'horario',
    fact_value: 'Atendimento comercial de segunda a sexta.',
    source_note: null,
    is_active: true,
    created_at: NOW,
    updated_at: NOW,
  })

  db.objectionGuides.push({
    id: 'objection-existing',
    company_id: COMPANY_A,
    config_version_id: published.id,
    commercial_objection_contract_version: 'commercial-objection-v1',
    commercial_objection_definition: null,
    sort_order: 1,
    objection: 'Preço percebido como alto',
    signals: ['Está caro.'],
    discovery_questions: [],
    recommended_approach: 'Investigar antes de responder.',
    response_limits: [],
    is_active: true,
    created_at: NOW,
    updated_at: NOW,
  })

  await publishBuilderCommercialMethod(fakeSupabase(db), COMPANY_A)

  const workspace = await getCommercialConfigWorkspace(fakeSupabase(db), COMPANY_A)
  const newPublished = workspace.published

  assert.equal(newPublished?.version.communication_tone, 'Consultivo e direto.')
  assert.deepEqual(newPublished?.version.required_behaviors, ['Confirmar a necessidade antes de propor.'])
  assert.deepEqual(newPublished?.version.prohibited_behaviors, ['Prometer condições não aprovadas.'])

  assert.equal(newPublished?.product_profiles.length, 1)
  assert.equal(newPublished?.product_profiles[0].product_id, 'product-1')
  assert.deepEqual(newPublished?.product_profiles[0].benefits, ['Benefício existente.'])

  assert.equal(newPublished?.facts.length, 1)
  assert.equal(newPublished?.facts[0].fact_key, 'horario')

  assert.equal(newPublished?.objection_guides.length, 1)
  assert.equal(newPublished?.objection_guides[0].objection, 'Preço percebido como alto')

  // E o método, por sua vez, realmente trocou.
  assert.equal(newPublished?.version.commercial_method_name, 'Método AVANÇAR')
})

test('J: falha no publish mantém o método antigo ativo e preserva o novo como rascunho', async () => {
  const db = makeDb()
  db.builderDrafts.push(reviewReadyBuilderRow(COMPANY_A, buildMethodAvancar()))
  db.configVersions.push(publishedAtoVersion(COMPANY_A))
  db.forcePublishFailure = true

  await assert.rejects(
    publishBuilderCommercialMethod(fakeSupabase(db), COMPANY_A),
    (error) => {
      assert.ok(error instanceof CommercialMethodPublishError)
      assert.equal(error.code, 'PUBLISH_FAILED')
      return true
    },
  )

  const workspace = await getCommercialConfigWorkspace(fakeSupabase(db), COMPANY_A)
  assert.equal(workspace.published?.version.commercial_method_name, 'Método ATO')
  assert.equal(workspace.draft?.version.commercial_method_name, 'Método AVANÇAR')
})

test('K: retry após falha publica com sucesso reaproveitando o rascunho já salvo', async () => {
  const db = makeDb()
  db.builderDrafts.push(reviewReadyBuilderRow(COMPANY_A, buildMethodAvancar()))
  db.configVersions.push(publishedAtoVersion(COMPANY_A))
  db.forcePublishFailure = true

  await assert.rejects(publishBuilderCommercialMethod(fakeSupabase(db), COMPANY_A))

  const draftCountAfterFailure = db.configVersions.filter(
    (row) => row.company_id === COMPANY_A && row.status === 'draft',
  ).length
  assert.equal(draftCountAfterFailure, 1)

  db.forcePublishFailure = false
  const result = await publishBuilderCommercialMethod(fakeSupabase(db), COMPANY_A)

  assert.equal(result.method_name, 'Método AVANÇAR')

  const workspace = await getCommercialConfigWorkspace(fakeSupabase(db), COMPANY_A)
  assert.equal(workspace.published?.version.commercial_method_name, 'Método AVANÇAR')
  assert.equal(workspace.draft, null)
})

test('L: chamadas duplicadas (clique duplo) não criam duas versões publicadas', async () => {
  const db = makeDb()
  db.builderDrafts.push(reviewReadyBuilderRow(COMPANY_A, buildMethodAvancar()))
  db.configVersions.push(publishedAtoVersion(COMPANY_A))

  const first = await publishBuilderCommercialMethod(fakeSupabase(db), COMPANY_A)
  const second = await publishBuilderCommercialMethod(fakeSupabase(db), COMPANY_A)

  assert.equal(first.already_published, false)
  assert.equal(second.already_published, true)
  assert.equal(first.version_number, second.version_number)

  const publishedRows = db.configVersions.filter((row) => row.company_id === COMPANY_A && row.status === 'published')
  assert.equal(publishedRows.length, 1)

  const archivedRows = db.configVersions.filter((row) => row.company_id === COMPANY_A && row.status === 'archived')
  assert.equal(archivedRows.length, 1)
})

test('M: editar o método depois de publicado não altera a versão ativa até novo publish', async () => {
  const db = makeDb()
  db.builderDrafts.push(reviewReadyBuilderRow(COMPANY_A, buildMethodAvancar()))
  db.configVersions.push(publishedAtoVersion(COMPANY_A))

  await publishBuilderCommercialMethod(fakeSupabase(db), COMPANY_A)

  // O gestor volta a editar: o rascunho da jornada guiada some (estado
  // "editing" sempre implica method_definition nulo), mas isso não altera
  // a versão publicada.
  const builder = db.builderDrafts.find((row) => row.company_id === COMPANY_A)
  builder.method_construction_status = 'editing'
  builder.method_definition = null

  const workspace = await getCommercialConfigWorkspace(fakeSupabase(db), COMPANY_A)
  assert.equal(workspace.published?.version.commercial_method_name, 'Método AVANÇAR')

  await assert.rejects(
    publishBuilderCommercialMethod(fakeSupabase(db), COMPANY_A),
    (error) => {
      assert.ok(error instanceof CommercialMethodPublishError)
      assert.equal(error.code, 'NOT_REVIEW_READY')
      return true
    },
  )
})

test('P: tenant A nunca altera o método publicado do tenant B', async () => {
  const db = makeDb()
  db.builderDrafts.push(reviewReadyBuilderRow(COMPANY_A, buildMethodAvancar()))
  db.configVersions.push(publishedAtoVersion(COMPANY_A))

  const methodB = { ...buildMethodAto(), name: 'Método B' }
  db.builderDrafts.push(builderRow(COMPANY_B, { method_construction_status: 'not_started' }))
  db.configVersions.push(
    publishedAtoVersion(COMPANY_B, {
      id: 'config-b',
      commercial_method_name: 'Método B',
      commercial_method_definition: methodB,
    }),
  )

  await publishBuilderCommercialMethod(fakeSupabase(db), COMPANY_A)

  const workspaceB = await getCommercialConfigWorkspace(fakeSupabase(db), COMPANY_B)
  assert.equal(workspaceB.published?.version.commercial_method_name, 'Método B')
  assert.equal(workspaceB.published?.version.id, 'config-b')
})

test('publica com sucesso quando não existe rascunho nem versão publicada anterior (primeira publicação)', async () => {
  const db = makeDb()
  db.builderDrafts.push(reviewReadyBuilderRow(COMPANY_A, buildMethodAvancar()))

  const result = await publishBuilderCommercialMethod(fakeSupabase(db), COMPANY_A)

  assert.equal(result.version_number, 1)
  assert.equal(result.previous_published_version_number, null)
  assert.equal(result.method_name, 'Método AVANÇAR')
})

test('rejeita publicação quando a construção não está review_ready', async () => {
  const db = makeDb()
  db.builderDrafts.push(builderRow(COMPANY_A, { method_construction_status: 'editing', method_construction: {} }))

  await assert.rejects(
    publishBuilderCommercialMethod(fakeSupabase(db), COMPANY_A),
    (error) => {
      assert.ok(error instanceof CommercialMethodPublishError)
      assert.equal(error.code, 'NOT_REVIEW_READY')
      return true
    },
  )
})

test('rejeita publicação quando não existe nenhuma construção para a empresa', async () => {
  const db = makeDb()

  await assert.rejects(
    publishBuilderCommercialMethod(fakeSupabase(db), COMPANY_A),
    (error) => {
      assert.ok(error instanceof CommercialMethodPublishError)
      assert.equal(error.code, 'NOT_REVIEW_READY')
      return true
    },
  )
})

test('rejeita publicação de method_definition semanticamente inválido (defesa em profundidade)', async () => {
  const db = makeDb()
  const broken = { ...buildMethodAvancar(), stages: [] }
  db.builderDrafts.push(reviewReadyBuilderRow(COMPANY_A, broken))

  await assert.rejects(
    publishBuilderCommercialMethod(fakeSupabase(db), COMPANY_A),
    (error) => {
      assert.ok(error instanceof CommercialMethodPublishError)
      assert.equal(error.code, 'INVALID_DEFINITION')
      return true
    },
  )
})
