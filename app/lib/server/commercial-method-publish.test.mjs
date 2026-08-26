import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CommercialMethodPublishError,
  publishBuilderCommercialMethod,
} from './commercial-method-publish.ts'
import { getCommercialConfigWorkspace } from './commercial-config.ts'

// ============================================================================
// ONDA 8 / FRENTE A — publicação isolada do método comercial, com a
// correção do Controle Mestre: rpc_publish_builder_commercial_method não
// recebe mais a definição do método do cliente — ela lê
// company_commercial_method_builder_drafts (única fonte de verdade),
// exige review_ready, decide idempotência DENTRO do "lock" simulado
// (comparando com a versão publicada atual), rejeita builder
// desatualizado (p_expected_method_updated_at) e bloqueia a primeira
// publicação sem nenhuma versão publicada anterior. O fake abaixo
// espelha fielmente a SQL real de
// 20260827020000_fix_isolated_method_publish_review_ready_source.sql.
// ============================================================================

const COMPANY_A = '10000000-0000-4000-8000-000000000001'
const COMPANY_B = '10000000-0000-4000-8000-000000000002'

const NOW = '2026-08-27T10:00:00.000Z'
const LATER = '2026-08-27T11:00:00.000Z'

// ----------------------------------------------------------------------------
// Fixtures — Método ATO (legado, publicado) e Método AVANÇAR (construído
// pela Guided Journey).
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
      recommended_questions: [`Pergunta recomendada em ${name}.`],
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
// Fake Supabase
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

function jsonEqual(a, b) {
  if (a === b) return true
  if (a === null || b === null || a === undefined || b === undefined) return a === b
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((item, index) => jsonEqual(item, b[index]))
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const aKeys = Object.keys(a)
    const bKeys = Object.keys(b)
    if (aKeys.length !== bKeys.length) return false
    return aKeys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && jsonEqual(a[key], b[key]))
  }
  return false
}

// Espelha rpc_publish_builder_commercial_method
// (20260827020000_fix_isolated_method_publish_review_ready_source.sql):
// lê o builder ela mesma, decide idempotência dentro do "lock", nunca
// recebe a definição do método como parâmetro do cliente.
function publishBuilderMethodRpc(db, args) {
  const { p_company_id: companyId, p_expected_method_updated_at: expectedUpdatedAt } = args

  const builder = db.builderDrafts.find((row) => row.company_id === companyId)
  if (!builder) {
    return { data: null, error: { message: 'A construção do método ainda não foi iniciada para esta empresa.' } }
  }

  if (builder.method_construction_status !== 'review_ready' || !builder.method_definition) {
    return { data: null, error: { message: 'O método precisa estar pronto para revisão final antes de ser publicado.' } }
  }

  if (builder.method_updated_at !== expectedUpdatedAt) {
    return { data: null, error: { message: 'O método foi alterado desde que a página foi carregada. Atualize a página e tente novamente.' } }
  }

  const methodDefinition = builder.method_definition
  if (!methodDefinition || typeof methodDefinition !== 'object' || methodDefinition.contract_version !== 'commercial-method-v2') {
    return { data: null, error: { message: 'O método construído não está no contrato commercial-method-v2.' } }
  }

  if (db.forcePublishFailure) {
    return { data: null, error: { message: 'Falha simulada de publicação isolada.' } }
  }

  const currentPublished = db.configVersions.find((row) => row.company_id === companyId && row.status === 'published')

  if (
    currentPublished &&
    currentPublished.commercial_method_contract_version === 'commercial-method-v2' &&
    jsonEqual(currentPublished.commercial_method_definition, methodDefinition)
  ) {
    return {
      data: [
        {
          company_id: currentPublished.company_id,
          config_version_id: currentPublished.id,
          version_number: currentPublished.version_number,
          status: currentPublished.status,
          published_at: currentPublished.published_at,
          already_published: true,
        },
      ],
      error: null,
    }
  }

  if (!currentPublished) {
    return {
      data: null,
      error: {
        message:
          'Ainda não existe uma configuração comercial publicada para esta empresa. Publique a configuração comercial base (contexto, tom e comportamentos) antes de publicar o método.',
      },
    }
  }

  const source = currentPublished
  const numbers = db.configVersions.filter((row) => row.company_id === companyId).map((row) => row.version_number)
  const newVersion = {
    id: nextId(db, 'config'),
    company_id: companyId,
    version_number: numbers.length ? Math.max(...numbers) + 1 : 1,
    contract_version: 'phase-2-v1',
    status: 'draft',
    draft_purpose: 'method_publish',
    business_description: source.business_description,
    target_audience: source.target_audience,
    value_proposition: source.value_proposition,
    commercial_method_name: methodDefinition.name,
    commercial_method_description: methodDefinition.description,
    commercial_method_contract_version: 'commercial-method-v2',
    commercial_method_definition: methodDefinition,
    communication_tone: source.communication_tone,
    required_behaviors: source.required_behaviors,
    prohibited_behaviors: source.prohibited_behaviors,
    created_by: 'user',
    published_by: null,
    archived_by: null,
    created_at: NOW,
    updated_at: NOW,
    published_at: null,
    archived_at: null,
  }
  db.configVersions.push(newVersion)

  // method_steps: projeção de compatibilidade derivada das stages do
  // método NOVO — nunca copiada do método anterior.
  replaceChildren(
    db.methodSteps,
    newVersion.id,
    methodDefinition.stages.map((stage) => ({
      id: nextId(db, 'step'),
      company_id: companyId,
      config_version_id: newVersion.id,
      step_order: stage.display_order,
      name: stage.name,
      objective: stage.objective,
      completion_criteria: stage.completion_criteria,
      recommended_questions: stage.recommended_questions,
      is_required: stage.requirement === 'required',
    })),
  )

  for (const table of [db.productProfiles, db.facts, db.objectionGuides]) {
    replaceChildren(
      table,
      newVersion.id,
      table
        .filter((row) => row.config_version_id === source.id)
        .map((row) => ({ ...row, id: nextId(db, 'copy'), company_id: companyId, config_version_id: newVersion.id })),
    )
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
        already_published: false,
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
// Testes obrigatórios (seção 8 da correção)
// ============================================================================

test('A: publica com sucesso quando review_ready e existe configuração publicada base', async () => {
  const db = makeDb()
  db.builderDrafts.push(reviewReadyBuilderRow(COMPANY_A, buildMethodAvancar()))
  db.configVersions.push(publishedAtoVersion(COMPANY_A))

  const result = await publishBuilderCommercialMethod(fakeSupabase(db), COMPANY_A)

  assert.equal(result.already_published, false)
  assert.equal(result.method_name, 'Método AVANÇAR')
  assert.equal(result.version_number, 2)
})

test('B: retry depois do commit retorna a versão publicada existente (idempotência dentro do lock, não só em TS)', async () => {
  const db = makeDb()
  db.builderDrafts.push(reviewReadyBuilderRow(COMPANY_A, buildMethodAvancar()))
  db.configVersions.push(publishedAtoVersion(COMPANY_A))

  const first = await publishBuilderCommercialMethod(fakeSupabase(db), COMPANY_A)
  const second = await publishBuilderCommercialMethod(fakeSupabase(db), COMPANY_A)

  assert.equal(first.already_published, false)
  assert.equal(second.already_published, true)
  assert.equal(first.version_number, second.version_number)
  assert.equal(first.config_version_id, second.config_version_id)

  const publishedRows = db.configVersions.filter((row) => row.company_id === COMPANY_A && row.status === 'published')
  assert.equal(publishedRows.length, 1)
})

test('B2: duas chamadas DIRETAS à RPC (sem o pre-check de TypeScript) com o mesmo método produzem uma única versão publicada', async () => {
  // Este teste ataca exatamente o cenário descrito pelo Controle Mestre:
  // chama a RPC diretamente, pulando o pre-check de publishBuilderCommercialMethod,
  // simulando duas requisições que já passaram pela checagem de TypeScript
  // antes de qualquer uma publicar.
  const db = makeDb()
  const avancar = buildMethodAvancar()
  db.builderDrafts.push(reviewReadyBuilderRow(COMPANY_A, avancar))
  db.configVersions.push(publishedAtoVersion(COMPANY_A))
  const supabase = fakeSupabase(db)

  const requestA = await supabase.rpc('rpc_publish_builder_commercial_method', {
    p_company_id: COMPANY_A,
    p_expected_method_updated_at: NOW,
  })
  const requestB = await supabase.rpc('rpc_publish_builder_commercial_method', {
    p_company_id: COMPANY_A,
    p_expected_method_updated_at: NOW,
  })

  assert.equal(requestA.error, null)
  assert.equal(requestB.error, null)
  assert.equal(requestA.data[0].already_published, false)
  assert.equal(requestB.data[0].already_published, true)
  assert.equal(requestA.data[0].config_version_id, requestB.data[0].config_version_id)
  assert.equal(requestA.data[0].version_number, requestB.data[0].version_number)

  const publishedRows = db.configVersions.filter((row) => row.company_id === COMPANY_A && row.status === 'published')
  assert.equal(publishedRows.length, 1)
  const archivedRows = db.configVersions.filter((row) => row.company_id === COMPANY_A && row.status === 'archived')
  assert.equal(archivedRows.length, 1)
})

test('C: RPC bloqueia quando o builder não está review_ready', async () => {
  const db = makeDb()
  db.builderDrafts.push(builderRow(COMPANY_A, { method_construction_status: 'editing', method_construction: {} }))
  db.configVersions.push(publishedAtoVersion(COMPANY_A))

  await assert.rejects(
    publishBuilderCommercialMethod(fakeSupabase(db), COMPANY_A),
    (error) => {
      assert.ok(error instanceof CommercialMethodPublishError)
      assert.equal(error.code, 'NOT_REVIEW_READY')
      return true
    },
  )
})

test('D: não existe mais caminho para injetar uma definição arbitrária — a RPC ignora qualquer coisa que não seja p_company_id/p_expected_method_updated_at', async () => {
  const db = makeDb()
  const avancar = buildMethodAvancar()
  db.builderDrafts.push(reviewReadyBuilderRow(COMPANY_A, avancar))
  db.configVersions.push(publishedAtoVersion(COMPANY_A))
  const supabase = fakeSupabase(db)

  const injected = { ...avancar, name: 'Método Injetado Pelo Cliente' }

  // Mesmo que um chamador tente enviar p_method_definition, a RPC (real e
  // fake) simplesmente não lê esse argumento — ela lê
  // company_commercial_method_builder_drafts.
  const result = await supabase.rpc('rpc_publish_builder_commercial_method', {
    p_company_id: COMPANY_A,
    p_expected_method_updated_at: NOW,
    p_method_definition: injected,
  })

  assert.equal(result.error, null)
  assert.equal(result.data[0].already_published, false)

  const published = db.configVersions.find((row) => row.id === result.data[0].config_version_id)
  assert.equal(published.commercial_method_definition.name, 'Método AVANÇAR')
  assert.notEqual(published.commercial_method_definition.name, 'Método Injetado Pelo Cliente')
})

test('E: builder mudou entre o carregamento e a publicação — bloqueado como stale', async () => {
  const db = makeDb()
  db.builderDrafts.push(reviewReadyBuilderRow(COMPANY_A, buildMethodAvancar(), { method_updated_at: LATER }))
  db.configVersions.push(publishedAtoVersion(COMPANY_A))
  const supabase = fakeSupabase(db)

  // Simula uma UI que carregou o builder quando method_updated_at ainda
  // era NOW, mas o banco já reflete LATER (outra aba alterou o método
  // nesse intervalo).
  const result = await supabase.rpc('rpc_publish_builder_commercial_method', {
    p_company_id: COMPANY_A,
    p_expected_method_updated_at: NOW,
  })

  assert.ok(result.error)
  assert.match(result.error.message, /desde que a página foi carregada/)

  const versionsAfter = db.configVersions.filter((row) => row.company_id === COMPANY_A)
  assert.equal(versionsAfter.length, 1)
  assert.equal(versionsAfter[0].status, 'published')
})

test('F: primeira publicação sem nenhuma versão publicada anterior é bloqueada, sem inventar contexto comercial', async () => {
  const db = makeDb()
  db.builderDrafts.push(reviewReadyBuilderRow(COMPANY_A, buildMethodAvancar()))

  await assert.rejects(
    publishBuilderCommercialMethod(fakeSupabase(db), COMPANY_A),
    (error) => {
      assert.ok(error instanceof CommercialMethodPublishError)
      assert.equal(error.code, 'NO_BASE_COMMERCIAL_CONFIG')
      return true
    },
  )

  assert.equal(db.configVersions.length, 0)
})

test('G: nenhuma informação comercial é inventada — os campos publicados vêm exatamente da versão PUBLICADA anterior', async () => {
  const db = makeDb()
  db.builderDrafts.push(reviewReadyBuilderRow(COMPANY_A, buildMethodAvancar()))
  db.configVersions.push(
    publishedAtoVersion(COMPANY_A, {
      business_description: 'Descrição real e específica desta empresa.',
      communication_tone: 'Tom real e específico desta empresa.',
      required_behaviors: ['Comportamento real específico.'],
    }),
  )

  await publishBuilderCommercialMethod(fakeSupabase(db), COMPANY_A)

  const workspace = await getCommercialConfigWorkspace(fakeSupabase(db), COMPANY_A)
  assert.equal(workspace.published?.version.business_description, 'Descrição real e específica desta empresa.')
  assert.equal(workspace.published?.version.communication_tone, 'Tom real e específico desta empresa.')
  assert.deepEqual(workspace.published?.version.required_behaviors, ['Comportamento real específico.'])
})

test('H: rascunho comercial geral paralelo permanece isolado e intacto', async () => {
  const db = makeDb()
  db.builderDrafts.push(reviewReadyBuilderRow(COMPANY_A, buildMethodAvancar()))
  db.configVersions.push(publishedAtoVersion(COMPANY_A))
  const draft = parallelGeneralDraft(COMPANY_A)
  db.configVersions.push(draft)

  await publishBuilderCommercialMethod(fakeSupabase(db), COMPANY_A)

  const stillDraft = db.configVersions.find((row) => row.id === draft.id)
  assert.equal(stillDraft.status, 'draft')
  assert.equal(stillDraft.business_description, 'Descrição de negócio EM EDIÇÃO (não publicada).')

  const workspace = await getCommercialConfigWorkspace(fakeSupabase(db), COMPANY_A)
  assert.equal(workspace.published?.version.business_description, 'Descrição de negócio publicada.')
})

test('I: tenant A nunca publica o método do tenant B', async () => {
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

test('J: o commercial-method-v2 publicado é exatamente o construído na jornada guiada, com projeção de etapas derivada do método novo', async () => {
  const db = makeDb()
  const avancar = buildMethodAvancar()
  db.builderDrafts.push(reviewReadyBuilderRow(COMPANY_A, avancar))
  db.configVersions.push(publishedAtoVersion(COMPANY_A))

  await publishBuilderCommercialMethod(fakeSupabase(db), COMPANY_A)

  const workspace = await getCommercialConfigWorkspace(fakeSupabase(db), COMPANY_A)
  assert.equal(workspace.published?.version.commercial_method_contract_version, 'commercial-method-v2')
  assert.deepEqual(workspace.published?.version.commercial_method_definition, avancar)

  // Projeção de compatibilidade: as etapas legadas vêm do método NOVO
  // (AVANÇAR), nunca do método anterior (ATO/"Acolher").
  assert.deepEqual(
    workspace.published?.method_steps.map((step) => step.name),
    ['Descoberta', 'Tour', 'Apresentação', 'Decisão de compra', 'Follow-up'],
  )
})

// ----------------------------------------------------------------------------
// Cobertura adicional já existente, mantida.
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

test('falha na publicação isolada mantém a versão publicada anterior intacta e não deixa nada novo', async () => {
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
})

test('retry depois da falha publica com sucesso', async () => {
  const db = makeDb()
  db.builderDrafts.push(reviewReadyBuilderRow(COMPANY_A, buildMethodAvancar()))
  db.configVersions.push(publishedAtoVersion(COMPANY_A))
  db.forcePublishFailure = true

  await assert.rejects(publishBuilderCommercialMethod(fakeSupabase(db), COMPANY_A))

  db.forcePublishFailure = false
  const result = await publishBuilderCommercialMethod(fakeSupabase(db), COMPANY_A)

  assert.equal(result.method_name, 'Método AVANÇAR')
})

test('rejeita publicação de method_definition semanticamente inválido (defesa em profundidade em TS, antes de chamar o banco)', async () => {
  const db = makeDb()
  const broken = { ...buildMethodAvancar(), stages: [] }
  db.builderDrafts.push(reviewReadyBuilderRow(COMPANY_A, broken))
  db.configVersions.push(publishedAtoVersion(COMPANY_A))

  await assert.rejects(
    publishBuilderCommercialMethod(fakeSupabase(db), COMPANY_A),
    (error) => {
      assert.ok(error instanceof CommercialMethodPublishError)
      assert.equal(error.code, 'INVALID_DEFINITION')
      return true
    },
  )
})
