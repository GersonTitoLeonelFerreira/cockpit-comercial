import assert from 'node:assert/strict'
import { register } from 'node:module'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

register(
  fileURLToPath(
    new URL('../../../scripts/typescript-test-loader.mjs', import.meta.url),
  ),
  import.meta.url,
)

const {
  suggestInitialMethodConstruction,
  buildCommercialMethodDefinitionFromConstruction,
} = await import('./assisted-method-construction.ts')

const {
  applyBuyerDecisionArchitecture,
  createBuyerDecisionDraft,
} = await import('./buyer-decision-architecture.ts')

const {
  createEmptyCommercialMethodBuilderData,
} = await import('../../types/commercial-method-builder.ts')

const {
  publishBuilderCommercialMethod,
} = await import('../server/commercial-method-publish.ts')

const {
  getCommercialConfigWorkspace,
} = await import('../server/commercial-config.ts')

const {
  buildCompanionDiagnosticInput,
} = await import('../companion/diagnostic-input.ts')

const {
  normalizePublishedCommercialMethod,
} = await import('../companion/lead-method-guidance.ts')

// ============================================================================
// ONDA 8 — INTEGRAÇÃO FINAL — teste ponta a ponta do cenário academia
// (seção 8, 9 e 13 do Controle Mestre).
//
// Une as três frentes chamando as funções reais de cada uma, sem simular
// nenhuma ponta:
//
// - FRENTE B (síntese inteligente): suggestInitialMethodConstruction +
//   applyBuyerDecisionArchitecture produzem a estrutura pré-construída a
//   partir do diagnóstico da academia (Tour condicional, Formalização
//   distinta de Decisão, Follow-up condicional) — exatamente a mesma
//   lógica coberta em smart-method-synthesis.test.mjs, aqui levada até o
//   fim: revisão mínima, review_ready, publicação.
// - FRENTE A (publicação isolada): publishBuilderCommercialMethod, com
//   uma versão publicada anterior (Método ATO) e um rascunho comercial
//   geral paralelo com alterações não publicadas — prova que a publicação
//   troca somente o método.
// - FRENTE 2 (Companion V2-only): buildCompanionDiagnosticInput e
//   normalizePublishedCommercialMethod leem o resultado publicado.
// ============================================================================

const COMPANY_ID = '10000000-0000-4000-8000-000000000009'
const CYCLE_ID = '90000000-0000-4000-8000-000000000009'
const NOW = '2026-08-27T12:00:00.000Z'

function academiaData() {
  const data = createEmptyCommercialMethodBuilderData()

  data.company_profile.offer.type = 'service'
  data.company_profile.offer.purchase_frequency = 'recurring'
  data.company_profile.customer.buyer_type = 'person'
  data.company_profile.complexity.typical_timing = 'first_contact'
  data.company_profile.complexity.multiple_decision_makers = false
  data.company_profile.complexity.sales_events = ['Tour']
  data.company_profile.buyer_behavior.contact_is_decision_maker = 'yes'
  data.company_profile.buyer_behavior.closes_on_first_contact = true
  data.company_profile.buyer_behavior.workload_pattern = 'high_volume_short'

  data.current_sales_process.presentation.touchpoints = ['Tour']
  data.current_sales_process.sales_events_detail = [
    {
      event: 'Tour',
      frequency: 'sometimes',
      success_definition:
        'O cliente conheceu a estrutura e confirmou interesse em pelo menos um horário de treino.',
      depends_on_customer_knowledge: 'no',
    },
  ]

  data.current_sales_process.follow_up.happens = true
  data.current_sales_process.follow_up.reasons = [
    'Precisa decidir com o cônjuge',
    'Quer comparar outras academias antes de decidir',
  ]

  data.current_sales_process.formalization = {
    steps: ['Matrícula', 'Pagamento'],
    can_reverse: true,
    operational_approval_after_decision: false,
    sale_completed_when: 'O pagamento da matrícula foi confirmado no sistema.',
  }

  data.current_sales_process.closing.completion_actions = [
    'Cliente confirma que quer se matricular',
  ]

  return data
}

function synthesizeAcademiaMethod() {
  const data = academiaData()
  const initial = suggestInitialMethodConstruction(data)
  const decision = {
    ...createBuyerDecisionDraft(data),
    approval_or_blocker: 'no',
    formal_process: 'no',
    investment_justification: 'no',
    real_urgency: 'no',
    solution_customization: 'standard',
    operation_intensity: 'high_volume_short',
    buyer_commitment_signals: [
      'O cliente confirmou verbalmente que quer se matricular e perguntou como pagar.',
    ],
  }
  const draft = applyBuyerDecisionArchitecture(initial, data, decision)

  const withMethodMeta = {
    ...draft,
    method_name: 'Método Academia',
    method_description:
      'Método comercial calibrado para academias, com Tour condicional e Follow-up condicional.',
    principles:
      draft.principles.length > 0
        ? draft.principles
        : ['Evidência do comprador, não atividade do vendedor, comprova avanço.'],
  }

  const { definition, validation } =
    buildCommercialMethodDefinitionFromConstruction(withMethodMeta)

  assert.equal(
    validation.valid,
    true,
    `síntese da academia deveria compilar um commercial-method-v2 válido: ${JSON.stringify(validation.issues)}`,
  )

  return definition
}

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

// ----------------------------------------------------------------------------
// Fake Supabase (mesma semântica das RPCs reais — ver
// commercial-method-publish.test.mjs / migrations de
// 20260827010000+20260827020000 para a prova contra PGlite real).
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

  const currentPublished = db.configVersions.find((row) => row.company_id === companyId && row.status === 'published')

  if (
    currentPublished &&
    currentPublished.commercial_method_contract_version === 'commercial-method-v2' &&
    jsonEqual(currentPublished.commercial_method_definition, methodDefinition)
  ) {
    return {
      data: [{
        company_id: currentPublished.company_id,
        config_version_id: currentPublished.id,
        version_number: currentPublished.version_number,
        status: currentPublished.status,
        published_at: currentPublished.published_at,
        already_published: true,
      }],
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
    data: [{
      company_id: newVersion.company_id,
      config_version_id: newVersion.id,
      version_number: newVersion.version_number,
      status: newVersion.status,
      published_at: newVersion.published_at,
      already_published: false,
    }],
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
      if (name === 'rpc_publish_builder_commercial_method') return publishBuilderMethodRpc(db, args)
      throw new Error(`RPC não simulada nos testes: ${name}`)
    },
  }
}

function diagnosticInputArgs(bundle) {
  return {
    company_id: COMPANY_ID,
    cycle_id: CYCLE_ID,
    conversation_key: 'whatsapp:5511988887777',
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
        text_content: 'Quero saber mais sobre os planos da academia.',
        audio_transcription: null,
        is_deleted: false,
      },
    ],
    commercial_config: bundle,
    products: [],
  }
}

test(
  'ponta a ponta — cenário academia: diagnóstico → síntese inteligente → review_ready → publicação isolada → Companion usa exclusivamente o novo método',
  async () => {
    const db = makeDb()

    // Estado inicial: Método ATO publicado (v10) + rascunho comercial
    // geral paralelo (v11) com alterações NÃO publicadas em produto, fato
    // e tom — exatamente o cenário da seção 9.
    const publishedAto = {
      id: 'config-ato',
      company_id: COMPANY_ID,
      version_number: 10,
      contract_version: 'phase-2-v1',
      status: 'published',
      draft_purpose: 'general',
      business_description: 'Academia com atendimento comercial consultivo.',
      target_audience: 'Pessoas interessadas em atividade física.',
      value_proposition: 'Acompanhamento e estrutura para treinar.',
      commercial_method_name: 'Método ATO',
      commercial_method_description: 'Descrição do método ATO.',
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
    }
    db.configVersions.push(publishedAto)

    db.productProfiles.push({
      id: 'product-published',
      company_id: COMPANY_ID,
      config_version_id: publishedAto.id,
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

    const parallelDraft = {
      id: 'config-draft-v11',
      company_id: COMPANY_ID,
      version_number: 11,
      contract_version: 'phase-2-v1',
      status: 'draft',
      draft_purpose: 'general',
      business_description: 'Descrição EM EDIÇÃO (não publicada).',
      target_audience: 'Público EM EDIÇÃO (não publicado).',
      value_proposition: 'Proposta EM EDIÇÃO (não publicada).',
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
    }
    db.configVersions.push(parallelDraft)

    // Primeira análise do Companion: usa o Método ATO publicado.
    const workspaceBefore = await getCommercialConfigWorkspace(fakeSupabase(db), COMPANY_ID)
    const diagnosticBefore = buildCompanionDiagnosticInput(diagnosticInputArgs(workspaceBefore.published))
    assert.equal(diagnosticBefore.commercial_context.sales_method.name, 'Método ATO')

    // FRENTE B: diagnóstico → síntese inteligente do método da academia.
    const academiaMethod = synthesizeAcademiaMethod()
    assert.equal(academiaMethod.contract_version, 'commercial-method-v2')

    const stageByName = (name) =>
      academiaMethod.stages.find((stage) => stage.name.toLowerCase() === name.toLowerCase())

    const tour = stageByName('Tour')
    const followUp = stageByName('Follow-up')
    const formalization = stageByName('Formalização')
    const decision = stageByName('Decisão de compra')
    const discovery = stageByName('Descoberta') ?? academiaMethod.stages[0]

    assert.ok(discovery, 'esperava uma etapa inicial de descoberta')
    assert.ok(tour && tour.requirement === 'conditional', 'Tour deveria ser condicional')
    assert.ok(followUp && followUp.requirement === 'conditional', 'Follow-up deveria ser condicional')
    assert.ok(formalization, 'esperava uma etapa de Formalização distinta de Decisão')
    assert.ok(decision, 'esperava uma etapa de Decisão de compra')
    assert.notEqual(decision.name, formalization.name)

    // review_ready: builder grava a definição materializada (é isto que a
    // UI faz ao clicar "Preparar para revisão final").
    db.builderDrafts.push({
      company_id: COMPANY_ID,
      ready_for_method: true,
      draft_data: {},
      method_construction_status: 'review_ready',
      method_construction: { construction_step: 'review' },
      method_definition: academiaMethod,
      method_started_at: NOW,
      method_updated_at: NOW,
      updated_at: NOW,
      updated_by: 'user',
    })

    // FRENTE A: publicação isolada — usuário clica "Publicar método".
    const publishResult = await publishBuilderCommercialMethod(fakeSupabase(db), COMPANY_ID)
    assert.equal(publishResult.already_published, false)
    assert.equal(publishResult.method_name, 'Método Academia')
    assert.equal(publishResult.version_number, 12)

    // v11 (rascunho paralelo) continua intacto e em draft.
    const stillDraft = db.configVersions.find((row) => row.id === parallelDraft.id)
    assert.equal(stillDraft.status, 'draft')
    assert.equal(stillDraft.business_description, 'Descrição EM EDIÇÃO (não publicada).')

    // v12 preserva produto/fato/tom de v10 (a versão PUBLICADA anterior),
    // nunca os de v11.
    const workspaceAfter = await getCommercialConfigWorkspace(fakeSupabase(db), COMPANY_ID)
    assert.equal(workspaceAfter.published.version.version_number, 12)
    assert.equal(workspaceAfter.published.version.communication_tone, 'Direto, acolhedor e claro.')
    assert.equal(workspaceAfter.published.product_profiles[0]?.benefits[0], 'Benefício publicado')

    // v10 (Método ATO) foi arquivado, não apagado.
    const archived = db.configVersions.find((row) => row.id === publishedAto.id)
    assert.equal(archived.status, 'archived')

    // FRENTE 2 (Companion): segunda análise usa exclusivamente o método
    // novo, com a estrutura sintetizada da academia.
    const diagnosticAfter = buildCompanionDiagnosticInput(diagnosticInputArgs(workspaceAfter.published))
    assert.equal(diagnosticAfter.commercial_context.sales_method.name, 'Método Academia')
    assert.notEqual(diagnosticAfter.commercial_context.sales_method.name, 'Método ATO')

    const stageNamesUsedByCompanion = diagnosticAfter.commercial_context.sales_method.steps.map(
      (step) => step.name,
    )
    assert.ok(stageNamesUsedByCompanion.includes('Tour'))
    assert.ok(stageNamesUsedByCompanion.includes('Formalização'))
    assert.ok(stageNamesUsedByCompanion.includes('Follow-up'))

    const guidance = normalizePublishedCommercialMethod(workspaceAfter.published.version)
    assert.equal(guidance.status, 'active')
    assert.equal(guidance.method.name, 'Método Academia')
    assert.equal(guidance.method.structure_source, 'structured_definition')
    const guidanceTour = guidance.method.stages.find((stage) => stage.name === 'Tour')
    assert.equal(guidanceTour.requirement, 'conditional')
  },
)
