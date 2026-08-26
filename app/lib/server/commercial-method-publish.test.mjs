import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CommercialMethodPublishError,
  publishBuilderCommercialMethod,
} from './commercial-method-publish.ts'
import { getCommercialConfigWorkspace } from './commercial-config.ts'

// ============================================================================
// ONDA 8 / FRENTE A — publicação isolada do método comercial.
//
// publishBuilderCommercialMethod agora chama exclusivamente
// rpc_publish_builder_commercial_method, que nunca lê nem escreve o
// rascunho comercial geral da empresa. O fake abaixo espelha fielmente a
// SQL real da migration 20260827010000_add_isolated_method_publish.sql:
// nova versão nasce só da versão PUBLICADA (nunca do draft geral), com os
// filhos copiados apenas da publicada, e é publicada na mesma "transação"
// simulada. Ver também o teste com PGlite/migrations reais em
// supabase/phase-tests para prova contra RPC, constraints e triggers reais.
// ============================================================================

const COMPANY_A = '10000000-0000-4000-8000-000000000001'
const COMPANY_B = '10000000-0000-4000-8000-000000000002'

const NOW = '2026-08-27T10:00:00.000Z'

// ----------------------------------------------------------------------------
// Fixtures — Método ATO (legado, publicado) e Método AVANÇAR (construído
// pela Guided Journey), espelhando o cenário de aceitação da Onda 8.
// ----------------------------------------------------------------------------

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
    draft_purpose: 'general',
    business_description: 'Descrição de negócio publicada.',
    target_audience: 'Público-alvo publicado.',
    value_proposition: 'Proposta de valor publicada.',
    commercial_method_name: 'Método ATO',
    commercial_method_description: 'Descrição do método ATO.',
    commercial_method_contract_version: 'commercial-method-v2',
    commercial_method_definition: buildMethodAto(),
    communication_tone: 'Consultivo e direto (publicado).',
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

// Rascunho comercial geral PARALELO: o gestor está editando produto, fato,
// objeção e tom no editor avançado, sem publicar. Deliberadamente diverge
// de tudo o que está publicado.
function parallelGeneralDraft(companyId, overrides = {}) {
  return {
    id: 'config-draft-parallel',
    company_id: companyId,
    version_number: 2,
    contract_version: 'phase-2-v1',
    status: 'draft',
    draft_purpose: 'general',
    business_description: 'Descrição de negócio EM EDIÇÃO (não publicada).',
    target_audience: 'Público-alvo EM EDIÇÃO (não publicado).',
    value_proposition: 'Proposta de valor EM EDIÇÃO (não publicada).',
    commercial_method_name: 'Método ATO',
    commercial_method_description: 'Descrição do método ATO.',
    commercial_method_contract_version: 'commercial-method-v2',
    commercial_method_definition: buildMethodAto(),
    communication_tone: 'Tom EM EDIÇÃO (não publicado).',
    required_behaviors: ['Comportamento EM EDIÇÃO (não publicado).'],
    prohibited_behaviors: ['Restrição EM EDIÇÃO (não publicada).'],
    created_by: 'user',
    published_by: null,
    archived_by: null,
    created_at: NOW,
    updated_at: NOW,
    published_at: null,
    archived_at: null,
    ...overrides,
  }
}

// ----------------------------------------------------------------------------
// Fake Supabase — tabelas em memória + rpc_publish_builder_commercial_method
// simulada com a mesma semântica da migration real: nova versão nasce só da
// PUBLICADA, filhos copiados só da PUBLICADA, rascunho geral nunca é lido.
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

function copyChildrenFromSource(db, sourceId, targetId, companyId) {
  replaceChildren(
    db.methodSteps,
    targetId,
    db.methodSteps
      .filter((row) => row.config_version_id === sourceId)
      .map((row) => ({ ...row, id: nextId(db, 'step'), company_id: companyId, config_version_id: targetId })),
  )
  replaceChildren(
    db.productProfiles,
    targetId,
    db.productProfiles
      .filter((row) => row.config_version_id === sourceId)
      .map((row) => ({ ...row, id: nextId(db, 'product'), company_id: companyId, config_version_id: targetId })),
  )
  replaceChildren(
    db.facts,
    targetId,
    db.facts
      .filter((row) => row.config_version_id === sourceId)
      .map((row) => ({ ...row, id: nextId(db, 'fact'), company_id: companyId, config_version_id: targetId })),
  )
  replaceChildren(
    db.objectionGuides,
    targetId,
    db.objectionGuides
      .filter((row) => row.config_version_id === sourceId)
      .map((row) => ({ ...row, id: nextId(db, 'objection'), company_id: companyId, config_version_id: targetId })),
  )
}

function publishBuilderMethodRpc(db, args) {
  const { p_company_id: companyId, p_method_definition: methodDefinition } = args

  if (!methodDefinition || typeof methodDefinition !== 'object') {
    return { data: null, error: { message: 'A definição do método precisa ser um objeto.' } }
  }
  if (methodDefinition.contract_version !== 'commercial-method-v2') {
    return { data: null, error: { message: 'A definição do método precisa declarar commercial-method-v2.' } }
  }
  if (!String(methodDefinition.name ?? '').trim()) {
    return { data: null, error: { message: 'O método precisa ter um nome.' } }
  }
  if (!String(methodDefinition.description ?? '').trim()) {
    return { data: null, error: { message: 'O método precisa ter uma descrição.' } }
  }

  if (db.forcePublishFailure) {
    // Simula uma falha em qualquer ponto da transação real (validação da
    // trigger, erro de rede, etc.): nada é criado, exatamente como uma
    // transação Postgres que sofre rollback.
    return { data: null, error: { message: 'Falha simulada de publicação isolada.' } }
  }

  // Simula o índice único parcial (company_id) where status='draft' and
  // draft_purpose='method_publish': protege contra corrida/clique duplo.
  const concurrentMethodPublishDraft = db.configVersions.find(
    (row) => row.company_id === companyId && row.status === 'draft' && row.draft_purpose === 'method_publish',
  )
  if (concurrentMethodPublishDraft) {
    return { data: null, error: { message: 'duplicate key value violates unique constraint "company_commercial_config_one_method_publish_draft_uidx"' } }
  }

  // Único ponto de leitura de estado comercial existente: a versão
  // PUBLICADA. O rascunho comercial geral, se existir, nunca é lido aqui —
  // é exatamente o que este teste precisa provar.
  const source = db.configVersions.find((row) => row.company_id === companyId && row.status === 'published')

  const numbers = db.configVersions.filter((row) => row.company_id === companyId).map((row) => row.version_number)
  const newVersion = {
    id: nextId(db, 'config'),
    company_id: companyId,
    version_number: numbers.length ? Math.max(...numbers) + 1 : 1,
    contract_version: 'phase-2-v1',
    status: 'draft',
    draft_purpose: 'method_publish',
    business_description: source?.business_description ?? '',
    target_audience: source?.target_audience ?? '',
    value_proposition: source?.value_proposition ?? '',
    commercial_method_name: methodDefinition.name,
    commercial_method_description: methodDefinition.description,
    commercial_method_contract_version: 'commercial-method-v2',
    commercial_method_definition: methodDefinition,
    communication_tone: source?.communication_tone ?? '',
    required_behaviors: source?.required_behaviors ?? [],
    prohibited_behaviors: source?.prohibited_behaviors ?? [],
    created_by: 'user',
    published_by: null,
    archived_by: null,
    created_at: NOW,
    updated_at: NOW,
    published_at: null,
    archived_at: null,
  }
  db.configVersions.push(newVersion)

  if (source) {
    copyChildrenFromSource(db, source.id, newVersion.id, companyId)
  }

  const previouslyPublished = db.configVersions.find(
    (row) => row.company_id === companyId && row.status === 'published',
  )
  if (previouslyPublished) {
    previouslyPublished.status = 'archived'
    previouslyPublished.archived_at = NOW
    previouslyPublished.archived_by = 'user'
  }

  newVersion.status = 'published'
  newVersion.published_at = NOW
  newVersion.published_by = 'user'

  return {
    data: [
      {
        company_id: newVersion.company_id,
        config_version_id: newVersion.id,
        version_number: newVersion.version_number,
        status: newVersion.status,
        published_at: newVersion.published_at,
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
      if (name === 'rpc_publish_builder_commercial_method') {
        return publishBuilderMethodRpc(db, args)
      }
      throw new Error(`RPC não simulada nos testes: ${name}`)
    },
  }
}

// ============================================================================
// Testes 1-12 (ONDA 8 / FRENTE A)
// ============================================================================

test('1: sem rascunho paralelo, publicar método PASS', async () => {
  const db = makeDb()
  db.builderDrafts.push(reviewReadyBuilderRow(COMPANY_A, buildMethodAvancar()))
  db.configVersions.push(publishedAtoVersion(COMPANY_A))

  const result = await publishBuilderCommercialMethod(fakeSupabase(db), COMPANY_A)

  assert.equal(result.already_published, false)
  assert.equal(result.method_name, 'Método AVANÇAR')
  assert.equal(result.version_number, 2)
})

test('2: rascunho paralelo com produto alterado — produto do rascunho NÃO é publicado', async () => {
  const db = makeDb()
  db.builderDrafts.push(reviewReadyBuilderRow(COMPANY_A, buildMethodAvancar()))
  const published = publishedAtoVersion(COMPANY_A)
  db.configVersions.push(published)

  db.productProfiles.push({
    id: 'product-published',
    company_id: COMPANY_A,
    config_version_id: published.id,
    product_id: 'product-1',
    commercial_product_contract_version: 'commercial-product-v1',
    commercial_product_definition: null,
    indicated_audiences: ['Publicado'],
    needs_addressed: ['Necessidade publicada'],
    benefits: ['Benefício publicado'],
    verified_differentiators: [],
    limitations: [],
    contract_conditions: [],
    payment_conditions: [],
    allowed_claims: [],
    forbidden_claims: [],
    created_at: NOW,
    updated_at: NOW,
  })

  const draft = parallelGeneralDraft(COMPANY_A)
  db.configVersions.push(draft)
  db.productProfiles.push({
    id: 'product-draft',
    company_id: COMPANY_A,
    config_version_id: draft.id,
    product_id: 'product-1',
    commercial_product_contract_version: 'commercial-product-v1',
    commercial_product_definition: null,
    indicated_audiences: ['EM EDIÇÃO'],
    needs_addressed: ['Necessidade EM EDIÇÃO'],
    benefits: ['Benefício EM EDIÇÃO'],
    verified_differentiators: [],
    limitations: [],
    contract_conditions: [],
    payment_conditions: [],
    allowed_claims: [],
    forbidden_claims: [],
    created_at: NOW,
    updated_at: NOW,
  })

  await publishBuilderCommercialMethod(fakeSupabase(db), COMPANY_A)

  const workspace = await getCommercialConfigWorkspace(fakeSupabase(db), COMPANY_A)
  assert.equal(workspace.published.product_profiles.length, 1)
  assert.equal(workspace.published.product_profiles[0].benefits[0], 'Benefício publicado')
  assert.notEqual(workspace.published.product_profiles[0].benefits[0], 'Benefício EM EDIÇÃO')
})

test('3: rascunho paralelo com fato alterado — fato do rascunho NÃO é publicado', async () => {
  const db = makeDb()
  db.builderDrafts.push(reviewReadyBuilderRow(COMPANY_A, buildMethodAvancar()))
  const published = publishedAtoVersion(COMPANY_A)
  db.configVersions.push(published)

  db.facts.push({
    id: 'fact-published',
    company_id: COMPANY_A,
    config_version_id: published.id,
    commercial_fact_contract_version: 'commercial-fact-v1',
    commercial_fact_definition: null,
    category: 'empresa',
    fact_key: 'horario',
    fact_value: 'Valor publicado.',
    source_note: null,
    is_active: true,
    created_at: NOW,
    updated_at: NOW,
  })

  const draft = parallelGeneralDraft(COMPANY_A)
  db.configVersions.push(draft)
  db.facts.push({
    id: 'fact-draft',
    company_id: COMPANY_A,
    config_version_id: draft.id,
    commercial_fact_contract_version: 'commercial-fact-v1',
    commercial_fact_definition: null,
    category: 'empresa',
    fact_key: 'horario',
    fact_value: 'Valor EM EDIÇÃO.',
    source_note: null,
    is_active: true,
    created_at: NOW,
    updated_at: NOW,
  })

  await publishBuilderCommercialMethod(fakeSupabase(db), COMPANY_A)

  const workspace = await getCommercialConfigWorkspace(fakeSupabase(db), COMPANY_A)
  assert.equal(workspace.published.facts.length, 1)
  assert.equal(workspace.published.facts[0].fact_value, 'Valor publicado.')
})

test('4: rascunho paralelo com objeção alterada — objeção do rascunho NÃO é publicada', async () => {
  const db = makeDb()
  db.builderDrafts.push(reviewReadyBuilderRow(COMPANY_A, buildMethodAvancar()))
  const published = publishedAtoVersion(COMPANY_A)
  db.configVersions.push(published)

  db.objectionGuides.push({
    id: 'objection-published',
    company_id: COMPANY_A,
    config_version_id: published.id,
    commercial_objection_contract_version: 'commercial-objection-v1',
    commercial_objection_definition: null,
    sort_order: 1,
    objection: 'Preço (publicado)',
    signals: [],
    discovery_questions: [],
    recommended_approach: 'Abordagem publicada.',
    response_limits: [],
    is_active: true,
    created_at: NOW,
    updated_at: NOW,
  })

  const draft = parallelGeneralDraft(COMPANY_A)
  db.configVersions.push(draft)
  db.objectionGuides.push({
    id: 'objection-draft',
    company_id: COMPANY_A,
    config_version_id: draft.id,
    commercial_objection_contract_version: 'commercial-objection-v1',
    commercial_objection_definition: null,
    sort_order: 1,
    objection: 'Preço (EM EDIÇÃO)',
    signals: [],
    discovery_questions: [],
    recommended_approach: 'Abordagem EM EDIÇÃO.',
    response_limits: [],
    is_active: true,
    created_at: NOW,
    updated_at: NOW,
  })

  await publishBuilderCommercialMethod(fakeSupabase(db), COMPANY_A)

  const workspace = await getCommercialConfigWorkspace(fakeSupabase(db), COMPANY_A)
  assert.equal(workspace.published.objection_guides.length, 1)
  assert.equal(workspace.published.objection_guides[0].objection, 'Preço (publicado)')
})

test('5: rascunho paralelo com tom alterado — tom do rascunho NÃO é publicado', async () => {
  const db = makeDb()
  db.builderDrafts.push(reviewReadyBuilderRow(COMPANY_A, buildMethodAvancar()))
  db.configVersions.push(publishedAtoVersion(COMPANY_A))
  db.configVersions.push(parallelGeneralDraft(COMPANY_A))

  await publishBuilderCommercialMethod(fakeSupabase(db), COMPANY_A)

  const workspace = await getCommercialConfigWorkspace(fakeSupabase(db), COMPANY_A)
  assert.equal(workspace.published.version.communication_tone, 'Consultivo e direto (publicado).')
  assert.deepEqual(workspace.published.version.required_behaviors, ['Confirmar a necessidade antes de propor.'])
  assert.deepEqual(workspace.published.version.prohibited_behaviors, ['Prometer condições não aprovadas.'])
})

test('6: rascunho comercial paralelo permanece intacto, ainda em draft, após a publicação isolada', async () => {
  const db = makeDb()
  db.builderDrafts.push(reviewReadyBuilderRow(COMPANY_A, buildMethodAvancar()))
  db.configVersions.push(publishedAtoVersion(COMPANY_A))
  const draft = parallelGeneralDraft(COMPANY_A)
  db.configVersions.push(draft)

  await publishBuilderCommercialMethod(fakeSupabase(db), COMPANY_A)

  const stillDraft = db.configVersions.find((row) => row.id === draft.id)
  assert.equal(stillDraft.status, 'draft')
  assert.equal(stillDraft.business_description, 'Descrição de negócio EM EDIÇÃO (não publicada).')
  assert.equal(stillDraft.communication_tone, 'Tom EM EDIÇÃO (não publicado).')

  const workspace = await getCommercialConfigWorkspace(fakeSupabase(db), COMPANY_A)
  assert.equal(workspace.draft?.version.id, draft.id)
  assert.equal(workspace.draft?.version.status, 'draft')
})

test('7: isolamento é a estratégia escolhida — publicar método NUNCA é bloqueado pela existência de um rascunho paralelo divergente', async () => {
  const db = makeDb()
  db.builderDrafts.push(reviewReadyBuilderRow(COMPANY_A, buildMethodAvancar()))
  db.configVersions.push(publishedAtoVersion(COMPANY_A))
  db.configVersions.push(parallelGeneralDraft(COMPANY_A))

  const result = await publishBuilderCommercialMethod(fakeSupabase(db), COMPANY_A)

  assert.equal(result.already_published, false)
  assert.equal(result.method_name, 'Método AVANÇAR')
})

test('8: falha durante a publicação isolada mantém a versão publicada anterior intacta e não deixa nada novo', async () => {
  const db = makeDb()
  db.builderDrafts.push(reviewReadyBuilderRow(COMPANY_A, buildMethodAvancar()))
  db.configVersions.push(publishedAtoVersion(COMPANY_A))
  db.forcePublishFailure = true

  const versionCountBefore = db.configVersions.length

  await assert.rejects(
    publishBuilderCommercialMethod(fakeSupabase(db), COMPANY_A),
    (error) => {
      assert.ok(error instanceof CommercialMethodPublishError)
      assert.equal(error.code, 'PUBLISH_FAILED')
      return true
    },
  )

  assert.equal(db.configVersions.length, versionCountBefore)
  const workspace = await getCommercialConfigWorkspace(fakeSupabase(db), COMPANY_A)
  assert.equal(workspace.published?.version.commercial_method_name, 'Método ATO')
  assert.equal(workspace.draft, null)
})

test('9: retry depois da falha publica com sucesso', async () => {
  const db = makeDb()
  db.builderDrafts.push(reviewReadyBuilderRow(COMPANY_A, buildMethodAvancar()))
  db.configVersions.push(publishedAtoVersion(COMPANY_A))
  db.forcePublishFailure = true

  await assert.rejects(publishBuilderCommercialMethod(fakeSupabase(db), COMPANY_A))

  db.forcePublishFailure = false
  const result = await publishBuilderCommercialMethod(fakeSupabase(db), COMPANY_A)

  assert.equal(result.method_name, 'Método AVANÇAR')
  const workspace = await getCommercialConfigWorkspace(fakeSupabase(db), COMPANY_A)
  assert.equal(workspace.published?.version.commercial_method_name, 'Método AVANÇAR')
})

test('10: clique duplo não duplica a publicação', async () => {
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
})

test('11: tenant A nunca publica o método do tenant B', async () => {
  const db = makeDb()
  db.builderDrafts.push(reviewReadyBuilderRow(COMPANY_A, buildMethodAvancar()))
  db.configVersions.push(publishedAtoVersion(COMPANY_A))

  const methodB = { ...buildMethodAto(), name: 'Método B' }
  db.builderDrafts.push(builderRow(COMPANY_B))
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

test('12: a versão publicada resultante contém exatamente o commercial-method-v2 esperado', async () => {
  const db = makeDb()
  const avancar = buildMethodAvancar()
  db.builderDrafts.push(reviewReadyBuilderRow(COMPANY_A, avancar))
  db.configVersions.push(publishedAtoVersion(COMPANY_A))

  await publishBuilderCommercialMethod(fakeSupabase(db), COMPANY_A)

  const workspace = await getCommercialConfigWorkspace(fakeSupabase(db), COMPANY_A)
  assert.equal(workspace.published?.version.commercial_method_contract_version, 'commercial-method-v2')
  assert.deepEqual(workspace.published?.version.commercial_method_definition, avancar)
})

// ----------------------------------------------------------------------------
// Testes adicionais já cobertos na Frente 1, mantidos para não perder
// cobertura: review_ready não publica sozinho, histórico preservado,
// validação semântica, primeira publicação sem versão publicada anterior.
// ----------------------------------------------------------------------------

test('review_ready não altera o método publicado', async () => {
  const db = makeDb()
  db.builderDrafts.push(reviewReadyBuilderRow(COMPANY_A, buildMethodAvancar()))
  db.configVersions.push(publishedAtoVersion(COMPANY_A))

  const workspace = await getCommercialConfigWorkspace(fakeSupabase(db), COMPANY_A)
  assert.equal(workspace.published?.version.commercial_method_name, 'Método ATO')
})

test('a versão publicada anterior é preservada, arquivada, não excluída', async () => {
  const db = makeDb()
  db.builderDrafts.push(reviewReadyBuilderRow(COMPANY_A, buildMethodAvancar()))
  db.configVersions.push(publishedAtoVersion(COMPANY_A))

  await publishBuilderCommercialMethod(fakeSupabase(db), COMPANY_A)

  const archived = db.configVersions.find((row) => row.id === 'config-ato')
  assert.ok(archived)
  assert.equal(archived.status, 'archived')
  assert.equal(archived.commercial_method_definition.name, 'Método ATO')
})

test('publica com sucesso quando não existe nenhuma versão publicada anterior (primeira publicação)', async () => {
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
