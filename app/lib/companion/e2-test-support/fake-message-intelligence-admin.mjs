// Fake admin em memória para os testes de integração do Message
// Intelligence Engine V1 — Shadow Validation (server-side, sem device_key).
//
// Cobre exatamente as tabelas tocadas por:
// - app/lib/server/message-intelligence-source-loader.ts
// - app/lib/server/message-intelligence-shadow-worker.ts
// - app/lib/server/message-intelligence-shadow-enqueue.ts
//
// Segue o mesmo padrão já usado pelos outros testes de rota/loader do
// Companion (ver register-conversation-route.test.mjs).

function matchesFilters(row, filters) {
  return filters.every((filter) => row[filter.column] === filter.value)
}

function buildQueryClass(tables, writeLog, resolveInterceptor) {
  return class Query {
    constructor(table) {
      this.table = table
      this.filters = []
      this.inFilters = []
      this.maximum = null
      this.upperBounds = []
      this.rangeFrom = null
      this.rangeTo = null
      this.pendingPatch = null
      this.isInsert = false
    }

    select() {
      return this
    }

    eq(column, value) {
      this.filters.push({ column, value })
      return this
    }

    in(column, values) {
      this.inFilters.push({ column, values })
      return this
    }

    lte(column, value) {
      this.upperBounds.push({ column, value })
      return this
    }

    range(from, to) {
      this.rangeFrom = from
      this.rangeTo = to
      return this
    }

    order() {
      return this
    }

    limit(value) {
      this.maximum = value
      return this
    }

    insert(row) {
      this.isInsert = true
      const rows = Array.isArray(row) ? row : [row]

      for (const item of rows) {
        tables[this.table].push({ ...item })
      }

      writeLog.push({ table: this.table, kind: 'insert', rows })

      return {
        then: (onFulfilled) =>
          Promise.resolve({ data: rows, error: null }).then(onFulfilled),
      }
    }

    update(patch) {
      this.pendingPatch = patch
      return this
    }

    resolveRows() {
      const operation =
        this.pendingPatch ? 'update' : 'select'

      const intercepted =
        resolveInterceptor?.({
          table: this.table,
          operation,
          patch: this.pendingPatch,
          filters: this.filters.map((item) => ({ ...item })),
          upper_bounds: this.upperBounds.map((item) => ({ ...item })),
        })

      if (intercepted) {
        return intercepted
      }

      let rows = (tables[this.table] ?? []).filter(
        (row) =>
          matchesFilters(row, this.filters) &&
          this.inFilters.every((filter) =>
            // Coerção para string: o código real normaliza ids
            // bigint/number para string antes de montar o `.in(...)`
            // (ver normalizeDatabaseId), enquanto as fixtures deste
            // fake guardam o id "cru" (number) nas linhas da tabela —
            // igual ao que o Postgres real faz na comparação.
            filter.values
              .map(String)
              .includes(String(row[filter.column])),
          ) &&
          this.upperBounds.every((filter) =>
            row[filter.column] <= filter.value,
          ),
      )

      if (this.pendingPatch) {
        for (const row of rows) {
          Object.assign(row, this.pendingPatch)
        }

        writeLog.push({
          table: this.table,
          kind: 'update',
          patch: this.pendingPatch,
          matched: rows.length,
        })

        return { data: rows, error: null }
      }

      if (
        this.rangeFrom !== null &&
        this.rangeTo !== null
      ) {
        rows = rows.slice(
          this.rangeFrom,
          this.rangeTo + 1,
        )
      }

      const limited =
        this.maximum === null ? rows : rows.slice(0, this.maximum)

      return { data: limited, error: null }
    }

    maybeSingle() {
      const result = this.resolveRows()
      return Promise.resolve({ data: result.data[0] ?? null, error: null })
    }

    then(onFulfilled, onRejected) {
      return Promise.resolve(this.resolveRows()).then(onFulfilled, onRejected)
    }
  }
}

export function createMessageIntelligenceFakeAdmin({
  companies = [],
  leads = [],
  cycles = [],
  reconciliation = [],
  messages = [],
  configVersions = [],
  methodSteps = [],
  productProfiles = [],
  facts = [],
  objectionGuides = [],
  products = [],
  commercialStates = [],
  shadowRuns = [],
  resolveInterceptor = null,
} = {}) {
  const writeLog = []

  const tables = {
    companies,
    leads,
    sales_cycles: cycles,
    conversation_message_reconciliation_state: reconciliation,
    conversation_messages: messages,
    company_commercial_config_versions: configVersions,
    company_commercial_method_steps: methodSteps,
    company_commercial_product_profiles: productProfiles,
    company_commercial_facts: facts,
    company_commercial_objection_guides: objectionGuides,
    products,
    companion_commercial_states: commercialStates,
    message_intelligence_shadow_runs: shadowRuns,
  }

  const Query = buildQueryClass(
    tables,
    writeLog,
    resolveInterceptor,
  )

  return {
    admin: {
      from(table) {
        if (!(table in tables)) {
          throw new Error(
            `fake-message-intelligence-admin: tabela "${table}" não é suportada pelo fixture.`,
          )
        }

        return new Query(table)
      },
    },
    tables,
    writeLog,
  }
}

export function buildTestMethodDefinition() {
  return {
    contract_version: 'commercial-method-v2',
    name: 'Método Teste',
    description: 'Método consultivo publicado.',
    principles: ['Responder fatos antes de avançar.'],
    stages: [
      {
        key: 'diagnostico',
        display_order: 1,
        name: 'Diagnóstico',
        objective: 'Entender a necessidade.',
        requirement: 'required',
        completion_criteria: ['Necessidade compreendida.'],
        partial_completion_criteria: ['Existe contexto inicial.'],
        skip_conditions: [],
        recommended_questions: ['O que você precisa resolver?'],
        common_mistakes: ['Apresentar cedo demais.'],
        deepen_when: ['A necessidade ainda estiver genérica.'],
        sufficient_when: ['A necessidade estiver clara.'],
        advance_when: ['Existe informação suficiente.'],
        wait_when: ['O cliente pediu tempo.'],
        stop_asking_when: ['A resposta já está clara.'],
        dimensions: [],
      },
    ],
  }
}

export function buildTestConfigVersion({
  id,
  companyId,
  methodDefinition = buildTestMethodDefinition(),
}) {
  return {
    id,
    company_id: companyId,
    version_number: 1,
    contract_version: 'phase-2-v1',
    status: 'published',
    business_description: 'Empresa de exemplo.',
    target_audience: 'Times comerciais.',
    value_proposition: 'Organizar a execução comercial.',
    commercial_method_name: 'Método Teste',
    commercial_method_description: 'Método consultivo.',
    commercial_method_contract_version: 'commercial-method-v2',
    commercial_method_definition: methodDefinition,
    communication_tone: 'Direto e claro.',
    required_behaviors: ['Responder objetivamente.'],
    prohibited_behaviors: ['Inventar condição comercial.'],
    created_by: null,
    published_by: null,
    archived_by: null,
    created_at: '2026-08-20T10:00:00.000Z',
    updated_at: '2026-08-29T18:00:00.000Z',
    published_at: '2026-08-29T18:00:00.000Z',
    archived_at: null,
  }
}

export function buildTestCommercialState({
  cycleId,
  version = 3,
  facts = [],
  // Precisa ser um subconjunto não-vazio de known_message_ids quando
  // este state for lido pelo StatefulCopilotStateReader real (o
  // normalizador exige current_moment/current_priority/last_* não
  // vazios). Para fixtures usadas só como state_snapshot herdado
  // (durable memory), evidenceMessageIds pode ficar vazio.
  evidenceMessageIds = [],
}) {
  return {
    contract_version: 'phase-5.1-commercial-state-v1',
    cycle_id: cycleId,
    version,
    commercial_role: 'buyer',
    current_moment: {
      summary: 'Cliente fez uma pergunta.',
      evidence_message_ids: evidenceMessageIds,
    },
    current_priority: {
      summary: 'Responder a dúvida atual.',
      evidence_message_ids: evidenceMessageIds,
    },
    last_analyzed_message_ids: evidenceMessageIds,
    last_evidence_message_ids: evidenceMessageIds,
    facts,
    needs: [],
    open_loops: [],
    objections: [],
    commitments: [],
    signals: [],
    uncertainties: [],
    created_at: '2026-08-29T20:00:00.000Z',
    updated_at: '2026-08-29T21:55:00.000Z',
  }
}
