import assert from 'node:assert/strict'
import test from 'node:test'

import {
  loadCanonicalMethodCoachingSource,
} from './canonical-method-coaching-source.ts'

import {
  COMMERCIAL_READING_CONTRACT_VERSION,
} from '../companion/commercial-reading-contract.ts'

const COMPANY_ID = '10000000-0000-4000-8000-000000000001'
const OTHER_COMPANY_ID = '10000000-0000-4000-8000-000000000002'

const CYCLE_ID = '30000000-0000-4000-8000-000000000001'
const OTHER_CYCLE_ID = '30000000-0000-4000-8000-000000000002'

const CONVERSATION_KEY = 'whatsapp:+5547999990001'
const OTHER_CONVERSATION_KEY = 'phone-notes:+5547999990001'

const REFERENCE_TIME = '2026-09-09T17:00:00.000Z'

const STATE_CONTRACT_VERSION = 'phase-5.1-commercial-state-v1'
const OUTPUT_CONTRACT_VERSION = 'phase-5.2-stateful-copilot-v4'
const COMMUNICATION_CONTRACT_VERSION = 'phase-5.2-communication-v5'

function buildMethod(overrides = {}) {
  return {
    configured: true,
    name: 'Método Consultivo',
    stages: [
      {
        step_order: 1,
        stage_key: 'diagnostico',
        name: 'Diagnóstico',
        status: 'active',
        explanation: 'Em diagnóstico.',
        evidence_message_ids: ['m1'],
        memory_ids: [],
      },
    ],
    current_stage: {
      step_order: 1,
      stage_key: 'diagnostico',
      name: 'Diagnóstico',
    },
    adherence: {
      status: 'on_method',
      summary: 'Vendedor segue o método.',
      deviation_stage_order: null,
      what_happened: null,
      missing_information: [],
      why_it_matters: null,
      evidence_message_ids: ['m1'],
      memory_ids: [],
    },
    recovery_guidance: null,
    ...overrides,
  }
}

function buildCurrentReading({
  company_id = COMPANY_ID,
  cycle_id = CYCLE_ID,
  conversation_key = CONVERSATION_KEY,
  state_record_id = 'state-record-1',
  state_version = 3,
  source_event_id = 'event-current-1',
  generated_at = '2026-09-09T16:59:00.000Z',
  // state_updated_at é o instante semântico REAL da análise
  // (state_read.state_updated_at, repassado por
  // loadCanonicalCommercialReadingSource) — distinto de generated_at
  // (quando o evento foi GRAVADO, que pode atrasar por fila/retry).
  // Por padrão igual a generated_at nos testes que não exercitam essa
  // distinção (achado do Codex, PR #278, rodada 7).
  state_updated_at = generated_at,
  method = buildMethod(),
  seller_strengths = [],
  improvement_points = [],
} = {}) {
  return {
    company_id,
    cycle_id,
    conversation_key,
    state_record_id,
    state_version,
    reading: {
      method,
      seller_strengths,
      improvement_points,
    },
    source_event_id,
    generated_at,
    state_updated_at,
  }
}

function buildSnapshot(overrides = {}) {
  return {
    contract_version: STATE_CONTRACT_VERSION,
    cycle_id: CYCLE_ID,
    version: 1,
    updated_at: '2026-09-09T16:00:00.000Z',
    facts: [],
    needs: [],
    open_loops: [],
    objections: [],
    commitments: [],
    signals: [],
    uncertainties: [],
    ...overrides,
  }
}

function buildStateRow({
  id = 'row-1',
  company_id = COMPANY_ID,
  cycle_id = CYCLE_ID,
  conversation_key = CONVERSATION_KEY,
  state_version = 1,
  state_contract_version = STATE_CONTRACT_VERSION,
  state_updated_at = '2026-09-09T16:00:00.000Z',
  snapshot = {},
} = {}) {
  return {
    id,
    company_id,
    cycle_id,
    conversation_key,
    state_version,
    state_contract_version,
    state_updated_at,
    state_snapshot: buildSnapshot({ updated_at: state_updated_at, ...snapshot }),
  }
}

function buildCommercialReadingPayload({
  method = buildMethod(),
  seller_strengths = [],
  improvement_points = [],
} = {}) {
  return {
    contract_version: COMMERCIAL_READING_CONTRACT_VERSION,
    method,
    seller_strengths,
    improvement_points,
  }
}

function buildEventRow({
  id = 'event-1',
  company_id = COMPANY_ID,
  cycle_id = CYCLE_ID,
  conversation_key = OTHER_CONVERSATION_KEY,
  state_record_id = 'row-other',
  candidate_state_version = 1,
  state_contract_version = STATE_CONTRACT_VERSION,
  output_contract_version = OUTPUT_CONTRACT_VERSION,
  // generated_at (quando o evento foi gravado) por padrão IGUAL ao
  // updated_at default do snapshot — testes que exercitam a
  // divergência entre os dois campos (achado do Codex, PR #278,
  // rodada 1) devem declarar os dois explicitamente.
  generated_at = '2026-09-09T16:00:00.000Z',
  snapshot = {},
  commercialReading = buildCommercialReadingPayload(),
} = {}) {
  return {
    id,
    company_id,
    cycle_id,
    conversation_key,
    state_record_id,
    candidate_state_version,
    state_contract_version,
    output_contract_version,
    generated_at,
    state_snapshot: buildSnapshot(snapshot),
    normalized_output: {
      contract_version: OUTPUT_CONTRACT_VERSION,
      communication: {
        contract_version: COMMUNICATION_CONTRACT_VERSION,
        commercial_reading: commercialReading,
      },
    },
  }
}

function buildAgoraRow({
  company_id = COMPANY_ID,
  cycle_id = CYCLE_ID,
  conversation_key = CONVERSATION_KEY,
  method_config_version_id = 'method-config-1',
  stage_key = 'diagnostico',
  stage_name = 'Diagnóstico',
  stage_display_order = 1,
  stage_reason = 'Cliente ainda descrevendo a necessidade.',
  updated_at = '2026-09-09T15:00:00.000Z',
} = {}) {
  return {
    company_id,
    cycle_id,
    conversation_key,
    method_config_version_id,
    stage_key,
    stage_name,
    stage_display_order,
    stage_reason,
    updated_at,
  }
}

function buildPublishedMethodConfigRow({
  company_id = COMPANY_ID,
  id = 'method-config-1',
  status = 'published',
  published_at = '2026-09-09T10:00:00.000Z',
} = {}) {
  return {
    company_id,
    id,
    status,
    published_at,
  }
}

function createQueryClass({ rows, error, bypassFilters }) {
  return class Query {
    constructor() {
      this.filters = []
      this.inFilters = []
      this.rangeFrom = null
      this.rangeTo = null
    }

    select() { return this }

    eq(column, value) {
      this.filters.push({ column, value })
      return this
    }

    lte() { return this }

    in(column, values) {
      this.inFilters.push({ column, values })
      return this
    }

    order() { return this }

    range(from, to) {
      this.rangeFrom = from
      this.rangeTo = to
      return this
    }

    matched() {
      if (bypassFilters) return rows

      return rows.filter((row) =>
        this.filters.every(
          (filter) => row[filter.column] === filter.value,
        ) &&
        this.inFilters.every(
          (filter) => filter.values.includes(row[filter.column]),
        ),
      )
    }

    maybeSingle() {
      if (error) {
        return Promise.resolve({ data: null, error })
      }

      const matched = this.matched()

      return Promise.resolve({ data: matched[0] ?? null, error: null })
    }

    then(onFulfilled, onRejected) {
      if (error) {
        return Promise.resolve({ data: null, error })
          .then(onFulfilled, onRejected)
      }

      let matched = this.matched()

      if (this.rangeFrom !== null && this.rangeTo !== null) {
        matched = matched.slice(this.rangeFrom, this.rangeTo + 1)
      }

      return Promise.resolve({ data: matched, error: null })
        .then(onFulfilled, onRejected)
    }
  }
}

function createAdmin({
  agoraRows = [],
  stateRows = [],
  eventRows = [],
  // Por padrão, exatamente a versão de método "atualmente publicada"
  // que os testes de concordância/divergência já esperam — a maioria
  // dos testes não se importa com a prova temporal em si, só quer que
  // ela passe com os defaults de buildAgoraRow/buildCurrentReading.
  publishedMethodRows = [buildPublishedMethodConfigRow()],
  agoraError = null,
  stateError = null,
  eventError = null,
  publishedMethodError = null,
  bypassFilters = false,
} = {}) {
  const AgoraQuery = createQueryClass({ rows: agoraRows, error: agoraError, bypassFilters })
  const StateQuery = createQueryClass({ rows: stateRows, error: stateError, bypassFilters })
  const EventQuery = createQueryClass({ rows: eventRows, error: eventError, bypassFilters })
  const PublishedMethodQuery = createQueryClass({
    rows: publishedMethodRows,
    error: publishedMethodError,
    bypassFilters,
  })

  return {
    from(table) {
      if (table === 'companion_method_stage_state') return new AgoraQuery()
      if (table === 'companion_commercial_states') return new StateQuery()
      if (table === 'companion_commercial_state_events') return new EventQuery()
      if (table === 'company_commercial_config_versions') return new PublishedMethodQuery()
      assert.fail(`tabela inesperada: ${table}`)
      return null
    },
  }
}

function load({
  admin,
  company_id = COMPANY_ID,
  cycle_id = CYCLE_ID,
  conversation_key = CONVERSATION_KEY,
  reference_time = REFERENCE_TIME,
  current_reading = buildCurrentReading(),
}) {
  return loadCanonicalMethodCoachingSource({
    admin,
    company_id,
    cycle_id,
    conversation_key,
    reference_time,
    current_reading,
  })
}

test('empresa sem método configurado: configured=false, sem inventar estágio', async () => {
  const admin = createAdmin({
    agoraRows: [],
    stateRows: [
      buildStateRow({}),
    ],
  })

  const source = await load({
    admin,
    current_reading: buildCurrentReading({
      method: buildMethod({
        configured: false,
        name: null,
        stages: [],
        current_stage: null,
        adherence: {
          status: 'not_configured',
          summary: 'Empresa não configurou método.',
          deviation_stage_order: null,
          what_happened: null,
          missing_information: [],
          why_it_matters: null,
          evidence_message_ids: [],
          memory_ids: [],
        },
      }),
    }),
  })

  assert.equal(source.method.configured, false)
  assert.equal(source.method.name, null)
  assert.deepEqual(source.method.stages, [])
  assert.equal(source.method.analise_stage, null)
  assert.equal(source.method.agora_stage, null)
  assert.equal(source.method.stage_divergence, false)
})

test('método configurado com AGORA e ANÁLISE concordando: sem divergência', async () => {
  const admin = createAdmin({
    agoraRows: [buildAgoraRow({ stage_key: 'diagnostico' })],
    stateRows: [buildStateRow({})],
  })

  const source = await load({ admin })

  assert.equal(source.method.agora_stage.stage_key, 'diagnostico')
  assert.equal(source.method.analise_stage.stage_key, 'diagnostico')
  assert.equal(source.method.stage_comparison_reliable, true)
  assert.equal(source.method.stage_divergence, false)
})

test('método configurado, evidência insuficiente: analise_stage null, sem inventar', async () => {
  const admin = createAdmin({
    agoraRows: [],
    stateRows: [buildStateRow({})],
  })

  const source = await load({
    admin,
    current_reading: buildCurrentReading({
      method: buildMethod({
        current_stage: null,
        adherence: {
          status: 'insufficient_evidence',
          summary: 'Ainda sem evidência suficiente.',
          deviation_stage_order: null,
          what_happened: null,
          missing_information: [],
          why_it_matters: null,
          evidence_message_ids: [],
          memory_ids: [],
        },
      }),
    }),
  })

  assert.equal(source.method.analise_stage, null)
  assert.equal(source.method.adherence.status, 'insufficient_evidence')
  assert.equal(source.method.stage_divergence, false)
})

test('AGORA e ANÁLISE discordando sobre o estágio: stage_divergence=true, sem escolher vencedor', async () => {
  const admin = createAdmin({
    agoraRows: [buildAgoraRow({ stage_key: 'diagnostico' })],
    stateRows: [buildStateRow({})],
  })

  const source = await load({
    admin,
    current_reading: buildCurrentReading({
      method: buildMethod({
        current_stage: {
          step_order: 3,
          stage_key: 'proposta',
          name: 'Proposta',
        },
      }),
    }),
  })

  assert.equal(source.method.agora_stage.stage_key, 'diagnostico')
  assert.equal(source.method.analise_stage.stage_key, 'proposta')
  assert.equal(source.method.stage_comparison_reliable, true)
  assert.equal(source.method.stage_divergence, true)
})

test('AGORA de versão de método diferente da atual: comparação não confiável, sem falsa divergência nem falsa concordância', async () => {
  // Achado do Codex (PR #278, rodada 1): lead-seller-guidance.ts já
  // trata uma etapa anterior de outra method_config_version_id como
  // "sem etapa anterior confiável" (activePreviousStage). Comparar
  // stage_key entre revisões diferentes do método pode reportar
  // divergência falsa (chaves diferentes por acaso) ou concordância
  // falsa (chave reaproveitada com outro significado).
  const admin = createAdmin({
    agoraRows: [
      buildAgoraRow({
        stage_key: 'diagnostico',
        method_config_version_id: 'method-config-OLD',
      }),
    ],
    stateRows: [buildStateRow({})],
    publishedMethodRows: [
      buildPublishedMethodConfigRow({ id: 'method-config-NEW' }),
    ],
  })

  const source = await load({
    admin,
    current_reading: buildCurrentReading({
      method: buildMethod({
        current_stage: {
          step_order: 1,
          stage_key: 'diagnostico',
          name: 'Diagnóstico',
        },
      }),
    }),
  })

  assert.equal(source.method.agora_stage.stage_key, 'diagnostico')
  assert.equal(source.method.analise_stage.stage_key, 'diagnostico')
  assert.equal(source.method.stage_comparison_reliable, false)
  assert.equal(source.method.stage_divergence, false)
})

test('sem método publicado (nenhuma linha company_commercial_config_versions): comparação nunca é confiável', async () => {
  const admin = createAdmin({
    agoraRows: [buildAgoraRow({ stage_key: 'diagnostico' })],
    stateRows: [buildStateRow({})],
    publishedMethodRows: [],
  })

  const source = await load({ admin })

  assert.equal(source.method.stage_comparison_reliable, false)
  assert.equal(source.method.stage_divergence, false)
})

test('current_reading antigo (state_updated_at anterior à publicação atual do método): comparação não confiável', async () => {
  // Achado do Codex (PR #278, rodada 2, refinando a rodada 1):
  // CanonicalCommercialReadingSource não expõe qual revisão do método
  // gerou a leitura persistida. Um id "atual" fornecido pelo chamador
  // poderia bater com agora_stage por coincidência sem provar que
  // analise_stage veio da mesma revisão. A prova precisa ser temporal:
  // current_reading.state_updated_at (instante semântico REAL da
  // análise, rodada 7) também precisa ser >= published_at da versão
  // atualmente publicada — aqui ele é ANTERIOR, então a leitura pode
  // ter sido computada sob uma versão já substituída.
  const admin = createAdmin({
    agoraRows: [
      buildAgoraRow({
        stage_key: 'diagnostico',
        updated_at: '2026-09-09T12:00:00.000Z',
      }),
    ],
    stateRows: [buildStateRow({})],
    publishedMethodRows: [
      buildPublishedMethodConfigRow({
        published_at: '2026-09-09T11:00:00.000Z',
      }),
    ],
  })

  const source = await load({
    admin,
    current_reading: buildCurrentReading({
      state_updated_at: '2026-09-09T10:00:00.000Z',
      method: buildMethod({
        current_stage: {
          step_order: 1,
          stage_key: 'diagnostico',
          name: 'Diagnóstico',
        },
      }),
    }),
  })

  assert.equal(source.method.stage_comparison_reliable, false)
  assert.equal(source.method.stage_divergence, false)
})

test('AGORA e ANÁLISE ambos posteriores à publicação atual do método: comparação confiável (prova temporal)', async () => {
  const admin = createAdmin({
    agoraRows: [
      buildAgoraRow({
        stage_key: 'diagnostico',
        updated_at: '2026-09-09T12:00:00.000Z',
      }),
    ],
    stateRows: [buildStateRow({})],
    publishedMethodRows: [
      buildPublishedMethodConfigRow({
        published_at: '2026-09-09T11:00:00.000Z',
      }),
    ],
  })

  const source = await load({
    admin,
    current_reading: buildCurrentReading({
      state_updated_at: '2026-09-09T16:00:00.000Z',
      method: buildMethod({
        current_stage: {
          step_order: 1,
          stage_key: 'diagnostico',
          name: 'Diagnóstico',
        },
      }),
    }),
  })

  assert.equal(source.method.stage_comparison_reliable, true)
  assert.equal(source.method.stage_divergence, false)
})

test('escrita atrasada do evento (generated_at pós-republicação) não engana a prova temporal quando a análise em si é anterior', async () => {
  // Achado do Codex (PR #278, rodada 7): a rodada 2 provava
  // "reliable" usando current_reading.generated_at (quando o evento
  // foi GRAVADO). stateful-copilot-persistence-plan.ts:568-578 só
  // exige generated_at >= reference_time (nunca `=`) — uma análise
  // pode ter considerado "agora" um instante ANTES da republicação do
  // método, mas o job só grava o evento (fila/retry) DEPOIS da
  // republicação. Usar generated_at (ou o reference_time desta
  // chamada) para a prova temporal reportaria "reliable" mesmo assim.
  // Aqui: state_updated_at (instante semântico real) é ANTERIOR à
  // publicação, mas generated_at (escrita) é POSTERIOR — a comparação
  // deve seguir NÃO confiável.
  const admin = createAdmin({
    agoraRows: [
      buildAgoraRow({
        stage_key: 'diagnostico',
        updated_at: '2026-09-09T13:00:00.000Z',
      }),
    ],
    stateRows: [buildStateRow({})],
    publishedMethodRows: [
      buildPublishedMethodConfigRow({
        published_at: '2026-09-09T11:00:00.000Z',
      }),
    ],
  })

  const source = await load({
    admin,
    current_reading: buildCurrentReading({
      state_updated_at: '2026-09-09T10:00:00.000Z',
      generated_at: '2026-09-09T12:00:00.000Z',
      method: buildMethod({
        current_stage: {
          step_order: 1,
          stage_key: 'diagnostico',
          name: 'Diagnóstico',
        },
      }),
    }),
  })

  assert.equal(source.method.stage_comparison_reliable, false)
  assert.equal(source.method.stage_divergence, false)
})

test('coaching da conversa atual reflete a leitura canônica sem inventar quando não há desvio', async () => {
  const admin = createAdmin({
    agoraRows: [],
    stateRows: [buildStateRow({})],
  })

  const source = await load({
    admin,
    current_reading: buildCurrentReading({
      seller_strengths: [],
      improvement_points: [],
    }),
  })

  assert.deepEqual(source.coaching.seller_strengths, [])
  assert.deepEqual(source.coaching.improvement_points, [])
})

test('desvio real produz coaching específico e evidenciado (observação/diagnóstico/impacto/ação)', async () => {
  const improvementPoint = {
    kind: 'premature_price',
    summary: 'Vendedor enviou preço antes de entender volume.',
    why_it_matters: 'Etapa de diagnóstico foi pulada.',
    impact: 'A proposta fica sem ancoragem de valor.',
    how_to_improve: 'Retomar contexto com pergunta específica antes de negociar condição.',
    evidence_message_ids: ['m5'],
    memory_ids: [],
  }

  const admin = createAdmin({
    agoraRows: [],
    stateRows: [buildStateRow({})],
  })

  const source = await load({
    admin,
    current_reading: buildCurrentReading({
      improvement_points: [improvementPoint],
    }),
  })

  assert.equal(source.coaching.improvement_points.length, 1)
  assert.deepEqual(source.coaching.improvement_points[0], improvementPoint)
})

test('coaching de outra conversa do mesmo ciclo aparece em cross_conversation_coaching', async () => {
  const admin = createAdmin({
    agoraRows: [],
    stateRows: [
      buildStateRow({ id: 'row-current', conversation_key: CONVERSATION_KEY }),
      buildStateRow({ id: 'row-other', conversation_key: OTHER_CONVERSATION_KEY }),
    ],
    eventRows: [
      buildEventRow({
        id: 'event-other-1',
        conversation_key: OTHER_CONVERSATION_KEY,
        state_record_id: 'row-other',
        commercialReading: buildCommercialReadingPayload({
          seller_strengths: [
            {
              kind: 'good_discovery',
              summary: 'Boa investigação de necessidade.',
              why_it_matters: 'Ajuda a ancorar a proposta.',
              evidence_message_ids: ['m9'],
              memory_ids: [],
            },
          ],
        }),
      }),
    ],
  })

  const source = await load({ admin })

  assert.equal(source.cross_conversation_coaching.length, 1)
  assert.equal(
    source.cross_conversation_coaching[0].conversation_key,
    OTHER_CONVERSATION_KEY,
  )
  assert.equal(
    source.cross_conversation_coaching[0].seller_strengths.length,
    1,
  )
})

test('cross_conversation_coaching expõe o generated_at real do evento, não o instante semântico de state_snapshot.updated_at', async () => {
  // Achado do Codex (PR #278, rodada 1): generated_at (quando o
  // evento foi gravado) e state_snapshot.updated_at (o instante
  // semântico que decide qual evento é o mais recente) podem
  // divergir — publicar o valor errado sob o nome generated_at
  // deixaria esse campo inconsistente com coaching.generated_at.
  const admin = createAdmin({
    agoraRows: [],
    stateRows: [
      buildStateRow({ id: 'row-current', conversation_key: CONVERSATION_KEY }),
      buildStateRow({ id: 'row-other', conversation_key: OTHER_CONVERSATION_KEY }),
    ],
    eventRows: [
      buildEventRow({
        id: 'event-other-1',
        conversation_key: OTHER_CONVERSATION_KEY,
        state_record_id: 'row-other',
        snapshot: { updated_at: '2026-09-09T15:00:00.000Z' },
        // generated_at deliberadamente diferente do instante
        // semântico acima — simula um evento gravado com atraso.
        generated_at: '2026-09-09T15:45:00.000Z',
      }),
    ],
  })

  const source = await load({ admin })

  assert.equal(source.cross_conversation_coaching.length, 1)
  assert.equal(
    source.cross_conversation_coaching[0].generated_at,
    '2026-09-09T15:45:00.000Z',
  )
})

test('coaching de outro ciclo do mesmo lead não vaza para cross_conversation_coaching', async () => {
  const admin = createAdmin({
    agoraRows: [],
    stateRows: [
      buildStateRow({ id: 'row-current', conversation_key: CONVERSATION_KEY }),
    ],
    eventRows: [
      buildEventRow({
        id: 'event-other-cycle',
        cycle_id: OTHER_CYCLE_ID,
        conversation_key: OTHER_CONVERSATION_KEY,
        state_record_id: 'row-other-cycle',
        snapshot: { cycle_id: OTHER_CYCLE_ID },
      }),
    ],
  })

  const source = await load({ admin })

  assert.deepEqual(source.cross_conversation_coaching, [])
})

test('coaching de outra empresa não vaza mesmo com bypass na camada de query', async () => {
  const admin = createAdmin({
    bypassFilters: true,
    agoraRows: [],
    stateRows: [
      buildStateRow({ id: 'row-current', conversation_key: CONVERSATION_KEY }),
    ],
    eventRows: [
      buildEventRow({
        id: 'event-other-company',
        company_id: OTHER_COMPANY_ID,
        conversation_key: OTHER_CONVERSATION_KEY,
        state_record_id: 'row-other-company',
      }),
    ],
  })

  const source = await load({ admin })

  assert.deepEqual(source.cross_conversation_coaching, [])
})

test('evento cross-conversation malformado (contract_version incompatível) é ignorado sem derrubar a leitura', async () => {
  const admin = createAdmin({
    agoraRows: [],
    stateRows: [
      buildStateRow({ id: 'row-current', conversation_key: CONVERSATION_KEY }),
      buildStateRow({ id: 'row-other', conversation_key: OTHER_CONVERSATION_KEY }),
    ],
    eventRows: [
      buildEventRow({
        id: 'event-broken',
        conversation_key: OTHER_CONVERSATION_KEY,
        state_record_id: 'row-other',
        state_contract_version: 'contrato-desconhecido',
      }),
    ],
  })

  const source = await load({ admin })

  assert.deepEqual(source.cross_conversation_coaching, [])
})

test('evento cross-conversation com item malformado em seller_strengths é ignorado sem derrubar a leitura', async () => {
  // Achado do Codex (PR #278, rodada 4): a restrição do banco valida
  // apenas a versão do contrato de saída, não o formato dos arrays
  // aninhados de coaching — um evento com contract_version correto
  // ainda pode carregar itens malformados (ex.: `[null]`, ou objetos
  // sem os campos obrigatórios).
  const admin = createAdmin({
    agoraRows: [],
    stateRows: [
      buildStateRow({ id: 'row-current', conversation_key: CONVERSATION_KEY }),
      buildStateRow({ id: 'row-other', conversation_key: OTHER_CONVERSATION_KEY }),
    ],
    eventRows: [
      buildEventRow({
        id: 'event-malformed-strength',
        conversation_key: OTHER_CONVERSATION_KEY,
        state_record_id: 'row-other',
        commercialReading: buildCommercialReadingPayload({
          seller_strengths: [null],
        }),
      }),
    ],
  })

  const source = await load({ admin })

  assert.deepEqual(source.cross_conversation_coaching, [])
})

test('evento cross-conversation com item malformado em improvement_points (faltando campo obrigatório) é ignorado sem derrubar a leitura', async () => {
  const admin = createAdmin({
    agoraRows: [],
    stateRows: [
      buildStateRow({ id: 'row-current', conversation_key: CONVERSATION_KEY }),
      buildStateRow({ id: 'row-other', conversation_key: OTHER_CONVERSATION_KEY }),
    ],
    eventRows: [
      buildEventRow({
        id: 'event-malformed-improvement',
        conversation_key: OTHER_CONVERSATION_KEY,
        state_record_id: 'row-other',
        commercialReading: buildCommercialReadingPayload({
          improvement_points: [
            {
              kind: 'premature_price',
              summary: 'Sem os demais campos obrigatórios.',
              // why_it_matters/impact/how_to_improve ausentes de propósito.
              evidence_message_ids: [],
              memory_ids: [],
            },
          ],
        }),
      }),
    ],
  })

  const source = await load({ admin })

  assert.deepEqual(source.cross_conversation_coaching, [])
})

test('evento cross-conversation com evidence_message_ids vazio (mesmo com memory_ids preenchido) é ignorado sem derrubar a leitura', async () => {
  // Achado do Codex (PR #278, rodada 5): as duas normalizações
  // canônicas de coaching chamam normalizeReferences(..., true, true) —
  // requireDirectMessage exige pelo menos uma evidence_message_ids não
  // vazia mesmo quando memory_ids está populado. Um item sem evidência
  // direta é ungrounded pelo próprio contrato canônico; a validação
  // estrutural das rodadas anteriores só checava "é array de strings",
  // aceitando um array vazio.
  const admin = createAdmin({
    agoraRows: [],
    stateRows: [
      buildStateRow({ id: 'row-current', conversation_key: CONVERSATION_KEY }),
      buildStateRow({ id: 'row-other', conversation_key: OTHER_CONVERSATION_KEY }),
    ],
    eventRows: [
      buildEventRow({
        id: 'event-no-direct-evidence',
        conversation_key: OTHER_CONVERSATION_KEY,
        state_record_id: 'row-other',
        commercialReading: buildCommercialReadingPayload({
          seller_strengths: [
            {
              kind: 'good_discovery',
              summary: 'Sem evidência direta.',
              why_it_matters: 'Só tem memória, não mensagem.',
              evidence_message_ids: [],
              memory_ids: ['mem-1'],
            },
          ],
        }),
      }),
    ],
  })

  const source = await load({ admin })

  assert.deepEqual(source.cross_conversation_coaching, [])
})

test('evento cross-conversation com state_snapshot.updated_at no futuro é excluído', async () => {
  const admin = createAdmin({
    agoraRows: [],
    stateRows: [
      buildStateRow({ id: 'row-current', conversation_key: CONVERSATION_KEY }),
      buildStateRow({ id: 'row-other', conversation_key: OTHER_CONVERSATION_KEY }),
    ],
    eventRows: [
      buildEventRow({
        id: 'event-future',
        conversation_key: OTHER_CONVERSATION_KEY,
        state_record_id: 'row-other',
        snapshot: { updated_at: '2026-09-09T18:00:00.000Z' },
      }),
    ],
  })

  const source = await load({ admin })

  assert.deepEqual(source.cross_conversation_coaching, [])
})

test('cross-conversation usa o snapshot mais recente entre múltiplos eventos da mesma conversa', async () => {
  const admin = createAdmin({
    agoraRows: [],
    stateRows: [
      buildStateRow({ id: 'row-current', conversation_key: CONVERSATION_KEY }),
      buildStateRow({ id: 'row-other', conversation_key: OTHER_CONVERSATION_KEY }),
    ],
    eventRows: [
      buildEventRow({
        id: 'event-old',
        conversation_key: OTHER_CONVERSATION_KEY,
        state_record_id: 'row-other',
        candidate_state_version: 1,
        snapshot: { updated_at: '2026-09-09T14:00:00.000Z' },
        commercialReading: buildCommercialReadingPayload({
          seller_strengths: [
            {
              kind: 'good_discovery',
              summary: 'Antigo.',
              why_it_matters: 'x',
              evidence_message_ids: ['m1'],
              memory_ids: [],
            },
          ],
        }),
      }),
      buildEventRow({
        id: 'event-recent',
        conversation_key: OTHER_CONVERSATION_KEY,
        state_record_id: 'row-other',
        candidate_state_version: 2,
        snapshot: { updated_at: '2026-09-09T15:30:00.000Z' },
        commercialReading: buildCommercialReadingPayload({
          seller_strengths: [
            {
              kind: 'good_discovery',
              summary: 'Mais recente.',
              why_it_matters: 'y',
              evidence_message_ids: ['m2'],
              memory_ids: [],
            },
          ],
        }),
      }),
    ],
  })

  const source = await load({ admin })

  assert.equal(source.cross_conversation_coaching.length, 1)
  assert.equal(
    source.cross_conversation_coaching[0].seller_strengths[0].summary,
    'Mais recente.',
  )
})

test('current_reading nulo: coaching vazio, sem inventar, e método vem apenas do AGORA quando existir', async () => {
  const admin = createAdmin({
    agoraRows: [buildAgoraRow({})],
    stateRows: [buildStateRow({})],
  })

  const source = await load({
    admin,
    current_reading: null,
  })

  assert.equal(source.method.configured, false)
  assert.equal(source.method.analise_stage, null)
  assert.notEqual(source.method.agora_stage, null)
  assert.equal(source.method.stage_divergence, false)
  assert.deepEqual(source.coaching.seller_strengths, [])
  assert.deepEqual(source.coaching.improvement_points, [])
  assert.equal(source.coaching.source_event_id, null)
})

test('current_reading de outro escopo é rejeitado (fail-closed)', async () => {
  const admin = createAdmin({
    agoraRows: [],
    stateRows: [buildStateRow({})],
  })

  const source = await load({
    admin,
    current_reading: buildCurrentReading({
      conversation_key: OTHER_CONVERSATION_KEY,
    }),
  })

  assert.equal(source, null)
})

test('current_reading com generated_at posterior a reference_time é rejeitado (fail-closed)', async () => {
  // Achado do Codex (PR #278, rodada 3): loadCanonicalCommercialReadingSource()
  // aplica seu corte por reference_time apenas durante a própria carga —
  // o objeto devolvido não retém esse reference_time. Um chamador que
  // reuse um current_reading carregado com reference_time posterior não
  // pode ser aceito aqui, senão o agregador exporia method/coaching do
  // futuro e compararia ANÁLISE contra o corte histórico já aplicado ao
  // AGORA.
  const admin = createAdmin({
    agoraRows: [],
    stateRows: [buildStateRow({})],
  })

  const source = await load({
    admin,
    current_reading: buildCurrentReading({
      generated_at: '2026-09-09T17:00:00.001Z',
    }),
  })

  assert.equal(source, null)
})

test('reference_time inválido retorna null sem consultar o banco', async () => {
  let calledFrom = false

  const admin = {
    from() {
      calledFrom = true
      throw new Error('não deveria consultar com reference_time inválido')
    },
  }

  const source = await load({
    admin,
    reference_time: 'not-a-date',
  })

  assert.equal(source, null)
  assert.equal(calledFrom, false)
})

test('AGORA com updated_at posterior a reference_time é tratado como indisponível, não como atual', async () => {
  // Achado do Codex (PR #278, rodada 2): companion_method_stage_state
  // é uma linha viva (upsert, sem histórico) — ao contrário de
  // Commercial Reading, não existe um evento passado para "voltar no
  // tempo". Se ela já avançou para depois de reference_time, expor
  // esse valor promoveria um estágio do futuro.
  const admin = createAdmin({
    agoraRows: [
      buildAgoraRow({
        stage_key: 'proposta',
        updated_at: '2026-09-09T17:00:00.001Z',
      }),
    ],
    stateRows: [buildStateRow({})],
  })

  const source = await load({ admin })

  assert.equal(source.method.agora_stage, null)
  assert.equal(source.method.stage_comparison_reliable, false)
})

test('erro na leitura do estágio AGORA não derruba a leitura combinada (best-effort)', async () => {
  const admin = createAdmin({
    agoraError: { message: 'boom' },
    stateRows: [buildStateRow({})],
  })

  const source = await load({ admin })

  assert.notEqual(source, null)
  assert.equal(source.method.agora_stage, null)
})

test('erro na descoberta de conversation_keys do ciclo degrada para lista vazia sem derrubar o restante (best-effort)', async () => {
  const admin = createAdmin({
    agoraRows: [buildAgoraRow({})],
    stateError: { message: 'boom' },
  })

  const source = await load({ admin })

  assert.notEqual(source, null)
  assert.deepEqual(source.cross_conversation_coaching, [])
  assert.notEqual(source.method.agora_stage, null)
  assert.equal(source.method.configured, true)
})

test('erro na leitura da versão publicada do método torna a comparação não confiável, sem derrubar o restante (best-effort)', async () => {
  const admin = createAdmin({
    agoraRows: [buildAgoraRow({ stage_key: 'diagnostico' })],
    stateRows: [buildStateRow({})],
    publishedMethodError: { message: 'boom' },
  })

  const source = await load({
    admin,
    current_reading: buildCurrentReading({
      method: buildMethod({
        current_stage: {
          step_order: 1,
          stage_key: 'diagnostico',
          name: 'Diagnóstico',
        },
      }),
    }),
  })

  assert.notEqual(source, null)
  assert.notEqual(source.method.agora_stage, null)
  assert.notEqual(source.method.analise_stage, null)
  assert.equal(source.method.stage_comparison_reliable, false)
  assert.equal(source.method.stage_divergence, false)
})

test('erro na leitura de eventos cross-conversation degrada para lista vazia sem derrubar o restante (best-effort)', async () => {
  const admin = createAdmin({
    agoraRows: [],
    stateRows: [
      buildStateRow({ id: 'row-current', conversation_key: CONVERSATION_KEY }),
      buildStateRow({ id: 'row-other', conversation_key: OTHER_CONVERSATION_KEY }),
    ],
    eventError: { message: 'boom' },
  })

  const source = await load({ admin })

  assert.notEqual(source, null)
  assert.deepEqual(source.cross_conversation_coaching, [])
  assert.equal(source.method.configured, true)
})

test('provenance preserva conversation_key, agora updated_at e identidade da leitura canônica', async () => {
  const admin = createAdmin({
    agoraRows: [buildAgoraRow({ updated_at: '2026-09-09T15:30:00.000Z' })],
    stateRows: [buildStateRow({})],
  })

  const source = await load({ admin })

  assert.deepEqual(source.provenance, {
    conversation_key: CONVERSATION_KEY,
    agora_updated_at: '2026-09-09T15:30:00.000Z',
    analise_source_event_id: 'event-current-1',
    analise_state_record_id: 'state-record-1',
    analise_state_version: 3,
  })
})
