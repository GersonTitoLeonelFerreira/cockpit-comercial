import assert from 'node:assert/strict'
import test from 'node:test'

import {
  loadCanonicalCycleCommercialMemory,
} from './canonical-cycle-commercial-memory-source.ts'

const COMPANY_ID = '10000000-0000-4000-8000-000000000001'
const OTHER_COMPANY_ID = '10000000-0000-4000-8000-000000000002'

const CYCLE_ID = '30000000-0000-4000-8000-000000000001'
const OTHER_CYCLE_ID = '30000000-0000-4000-8000-000000000002'

const REFERENCE_TIME = '2026-09-09T17:00:00.000Z'

const STATE_CONTRACT_VERSION =
  'phase-5.1-commercial-state-v1'

function buildMemoryItem(overrides = {}) {
  return {
    id: 'stateful-memory-default',
    kind: 'default_kind',
    summary: 'Resumo padrão.',
    evidence_message_ids: ['m1'],
    memory_status: 'active',
    created_in_state_version: 1,
    updated_in_state_version: 1,
    closed_in_state_version: null,
    ...overrides,
  }
}

function buildFact(overrides = {}) {
  return buildMemoryItem({
    value: 'valor',
    confidence: 'high',
    ...overrides,
  })
}

function buildObserved(overrides = {}) {
  return buildMemoryItem({
    confidence: 'medium',
    ...overrides,
  })
}

function buildCommitment(overrides = {}) {
  return buildMemoryItem({
    commitment_status: 'proposed',
    scheduled_at: null,
    proposed_at: '2026-09-08T10:00:00.000Z',
    ...overrides,
  })
}

function buildSnapshot(overrides = {}) {
  return {
    contract_version: STATE_CONTRACT_VERSION,
    cycle_id: CYCLE_ID,
    version: 1,
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
  conversation_key = 'whatsapp:+5547999990001',
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
    state_snapshot: buildSnapshot(snapshot),
  }
}

function createAdmin({
  rows = [],
  error = null,
  bypassFilters = false,
} = {}) {
  class Query {
    constructor(table) {
      this.table = table
      this.filters = []
      this.upperBounds = []
    }

    select() { return this }

    eq(column, value) {
      this.filters.push({ column, value })
      return this
    }

    lte(column, value) {
      this.upperBounds.push({ column, value })
      return this
    }

    order() { return this }

    then(onFulfilled, onRejected) {
      if (error) {
        return Promise.resolve({ data: null, error })
          .then(onFulfilled, onRejected)
      }

      const matched = bypassFilters
        ? rows
        : rows.filter((row) =>
          this.filters.every(
            (filter) => row[filter.column] === filter.value,
          ) &&
          this.upperBounds.every(
            (filter) =>
              Date.parse(row[filter.column]) <=
                Date.parse(filter.value),
          ),
        )

      return Promise.resolve({ data: matched, error: null })
        .then(onFulfilled, onRejected)
    }
  }

  return {
    from(table) {
      assert.equal(table, 'companion_commercial_states')
      return new Query(table)
    },
  }
}

function load({
  admin,
  company_id = COMPANY_ID,
  cycle_id = CYCLE_ID,
  reference_time = REFERENCE_TIME,
}) {
  return loadCanonicalCycleCommercialMemory({
    admin,
    company_id,
    cycle_id,
    reference_time,
  })
}

test('consolida fato ativo da Conversation A na memória canônica do ciclo', async () => {
  const admin = createAdmin({
    rows: [
      buildStateRow({
        conversation_key: 'whatsapp:conversation-a',
        snapshot: {
          facts: [
            buildFact({ id: 'fact-a-1', summary: 'Cliente confirmou orçamento.' }),
          ],
        },
      }),
    ],
  })

  const memory = await load({ admin })

  assert.equal(memory.facts.length, 1)
  assert.equal(memory.facts[0].summary, 'Cliente confirmou orçamento.')
  assert.equal(memory.facts[0].origin_id, 'fact-a-1')
  assert.equal(
    memory.facts[0].memory_id,
    'whatsapp:conversation-a::fact-a-1',
  )
  assert.deepEqual(memory.conversation_keys, ['whatsapp:conversation-a'])
})

test('consolida objeção ativa de outra conversa do mesmo ciclo', async () => {
  const admin = createAdmin({
    rows: [
      buildStateRow({
        conversation_key: 'phone-notes:conversation-b',
        snapshot: {
          objections: [
            buildObserved({ id: 'obj-b-1', kind: 'price', summary: 'Achou caro.' }),
          ],
        },
      }),
    ],
  })

  const memory = await load({ admin })

  assert.equal(memory.objections.length, 1)
  assert.equal(memory.objections[0].kind, 'price')
  assert.equal(
    memory.objections[0].provenance.conversation_key,
    'phone-notes:conversation-b',
  )
})

test('não vaza memória de outro ciclo do mesmo lead', async () => {
  const admin = createAdmin({
    rows: [
      buildStateRow({
        cycle_id: OTHER_CYCLE_ID,
        snapshot: {
          cycle_id: OTHER_CYCLE_ID,
          facts: [buildFact({ id: 'fact-other-cycle' })],
        },
      }),
    ],
  })

  const memory = await load({ admin })

  assert.equal(memory.facts.length, 0)
})

test('não vaza memória de outra empresa mesmo com bypass na camada de query', async () => {
  const admin = createAdmin({
    bypassFilters: true,
    rows: [
      buildStateRow({
        company_id: OTHER_COMPANY_ID,
        snapshot: {
          facts: [buildFact({ id: 'fact-other-company' })],
        },
      }),
    ],
  })

  const memory = await load({ admin })

  assert.equal(memory.facts.length, 0)
  assert.deepEqual(memory.conversation_keys, [])
})

test('ids brutos colidentes entre conversas diferentes não se confundem nem se duplicam', async () => {
  // As duas linhas usam deliberadamente o MESMO id bruto de item — o
  // esquema real de geração de id (createDeterministicStatefulCommercialMemoryId)
  // é hash(cycle_id, collection, state_version, item_index), sem
  // conversation_key, então duas conversas independentes no mesmo
  // ciclo podem legitimamente colidir nesse id bruto.
  const admin = createAdmin({
    rows: [
      buildStateRow({
        conversation_key: 'conversation-a',
        snapshot: {
          facts: [
            buildFact({
              id: 'stateful-memory-colliding',
              summary: 'Fato da conversa A.',
            }),
          ],
        },
      }),
      buildStateRow({
        conversation_key: 'conversation-b',
        snapshot: {
          facts: [
            buildFact({
              id: 'stateful-memory-colliding',
              summary: 'Fato completamente diferente da conversa B.',
            }),
          ],
        },
      }),
    ],
  })

  const memory = await load({ admin })

  assert.equal(memory.facts.length, 2)

  const memoryIds = memory.facts.map((fact) => fact.memory_id)
  assert.equal(new Set(memoryIds).size, 2)

  const summaries = memory.facts.map((fact) => fact.summary).sort()
  assert.deepEqual(summaries, [
    'Fato completamente diferente da conversa B.',
    'Fato da conversa A.',
  ])
})

test('mesma informação com ids diferentes convive na leitura (sem dedup semântico)', async () => {
  const admin = createAdmin({
    rows: [
      buildStateRow({
        conversation_key: 'conversation-a',
        snapshot: {
          needs: [
            buildObserved({ id: 'need-a-1', summary: 'Precisa de integração com CRM.' }),
          ],
        },
      }),
      buildStateRow({
        conversation_key: 'conversation-b',
        snapshot: {
          needs: [
            buildObserved({ id: 'need-b-1', summary: 'Precisa integrar com o CRM deles.' }),
          ],
        },
      }),
    ],
  })

  const memory = await load({ admin })

  assert.equal(memory.needs.length, 2)
})

test('item superseded em uma conversa nunca reaparece como ativo', async () => {
  const admin = createAdmin({
    rows: [
      buildStateRow({
        snapshot: {
          facts: [
            buildFact({
              id: 'fact-superseded',
              memory_status: 'superseded',
              closed_in_state_version: 2,
            }),
          ],
        },
      }),
    ],
  })

  const memory = await load({ admin })

  assert.equal(memory.facts.length, 0)
})

test('item resolved em uma conversa nunca reaparece como ativo', async () => {
  const admin = createAdmin({
    rows: [
      buildStateRow({
        snapshot: {
          commitments: [
            buildCommitment({
              id: 'commitment-resolved',
              memory_status: 'resolved',
              closed_in_state_version: 2,
            }),
          ],
        },
      }),
    ],
  })

  const memory = await load({ admin })

  assert.equal(memory.commitments.length, 0)
})

test('estado com state_updated_at no futuro em relação a reference_time é excluído', async () => {
  const admin = createAdmin({
    rows: [
      buildStateRow({
        state_updated_at: '2026-09-09T17:00:00.001Z',
        snapshot: {
          facts: [buildFact({ id: 'fact-future' })],
        },
      }),
    ],
  })

  const memory = await load({ admin })

  assert.equal(memory.facts.length, 0)
})

test('estado no exato instante de reference_time é incluído mesmo com formato de serialização diferente', async () => {
  const admin = createAdmin({
    rows: [
      buildStateRow({
        state_updated_at: '2026-09-09T17:00:00+00:00',
        snapshot: {
          facts: [buildFact({ id: 'fact-tied-instant' })],
        },
      }),
    ],
  })

  const memory = await load({ admin })

  assert.equal(memory.facts.length, 1)
})

test('linha malformada é ignorada sem derrubar a leitura das demais', async () => {
  const admin = createAdmin({
    rows: [
      buildStateRow({
        conversation_key: 'conversation-broken',
        state_contract_version: 'contrato-desconhecido',
        snapshot: {
          facts: [buildFact({ id: 'fact-broken-row' })],
        },
      }),
      buildStateRow({
        conversation_key: 'conversation-ok',
        snapshot: {
          facts: [buildFact({ id: 'fact-ok-row' })],
        },
      }),
    ],
  })

  const memory = await load({ admin })

  assert.equal(memory.facts.length, 1)
  assert.equal(memory.facts[0].origin_id, 'fact-ok-row')
})

test('item malformado dentro de uma linha válida é ignorado sem afetar os demais itens', async () => {
  const admin = createAdmin({
    rows: [
      buildStateRow({
        snapshot: {
          facts: [
            buildFact({ id: 'fact-valid', confidence: 'high' }),
            buildFact({ id: 'fact-invalid-confidence', confidence: 'nao-existe' }),
          ],
        },
      }),
    ],
  })

  const memory = await load({ admin })

  assert.equal(memory.facts.length, 1)
  assert.equal(memory.facts[0].origin_id, 'fact-valid')
})

test('erro de query mantém a leitura best-effort e retorna null', async () => {
  const admin = createAdmin({
    error: { message: 'boom' },
  })

  const memory = await load({ admin })

  assert.equal(memory, null)
})

test('reference_time inválido retorna null sem consultar o banco', async () => {
  let calledFrom = false

  const admin = {
    from() {
      calledFrom = true
      throw new Error('não deveria consultar com reference_time inválido')
    },
  }

  const memory = await load({
    admin,
    reference_time: 'not-a-date',
  })

  assert.equal(memory, null)
  assert.equal(calledFrom, false)
})

test('ordenação é determinística por conversation_key, versão de criação e id de origem', async () => {
  const admin = createAdmin({
    rows: [
      buildStateRow({
        conversation_key: 'conversation-z',
        snapshot: {
          facts: [
            buildFact({ id: 'fact-z-1', created_in_state_version: 1 }),
          ],
        },
      }),
      buildStateRow({
        conversation_key: 'conversation-a',
        snapshot: {
          facts: [
            buildFact({ id: 'fact-a-2', created_in_state_version: 2 }),
            buildFact({ id: 'fact-a-1', created_in_state_version: 1 }),
          ],
        },
      }),
    ],
  })

  const memoryFirstRun = await load({ admin })

  const admin2 = createAdmin({
    rows: [
      buildStateRow({
        conversation_key: 'conversation-a',
        snapshot: {
          facts: [
            buildFact({ id: 'fact-a-1', created_in_state_version: 1 }),
            buildFact({ id: 'fact-a-2', created_in_state_version: 2 }),
          ],
        },
      }),
      buildStateRow({
        conversation_key: 'conversation-z',
        snapshot: {
          facts: [
            buildFact({ id: 'fact-z-1', created_in_state_version: 1 }),
          ],
        },
      }),
    ],
  })

  const memorySecondRun = await load({ admin: admin2 })

  const idsFirstRun = memoryFirstRun.facts.map((fact) => fact.origin_id)
  const idsSecondRun = memorySecondRun.facts.map((fact) => fact.origin_id)

  assert.deepEqual(idsFirstRun, ['fact-a-1', 'fact-a-2', 'fact-z-1'])
  assert.deepEqual(idsSecondRun, ['fact-a-1', 'fact-a-2', 'fact-z-1'])
})

test('provenance de cada item preserva conversation_key, state_record_id e state_version', async () => {
  const admin = createAdmin({
    rows: [
      buildStateRow({
        id: 'state-record-xyz',
        conversation_key: 'conversation-a',
        state_version: 7,
        snapshot: {
          facts: [buildFact({ id: 'fact-provenance' })],
        },
      }),
    ],
  })

  const memory = await load({ admin })

  assert.deepEqual(memory.facts[0].provenance, {
    conversation_key: 'conversation-a',
    state_record_id: 'state-record-xyz',
    state_version: 7,
  })
})

test('compromisso ativo preserva commitment_status, scheduled_at e proposed_at', async () => {
  const admin = createAdmin({
    rows: [
      buildStateRow({
        snapshot: {
          commitments: [
            buildCommitment({
              id: 'commitment-active',
              commitment_status: 'confirmed',
              scheduled_at: '2026-09-10T10:00:00.000Z',
            }),
          ],
        },
      }),
    ],
  })

  const memory = await load({ admin })

  assert.equal(memory.commitments.length, 1)
  assert.equal(memory.commitments[0].commitment_status, 'confirmed')
  assert.equal(
    memory.commitments[0].scheduled_at,
    '2026-09-10T10:00:00.000Z',
  )
})

test('nenhuma linha para o ciclo retorna coleções vazias, não null', async () => {
  const admin = createAdmin({ rows: [] })

  const memory = await load({ admin })

  assert.notEqual(memory, null)
  assert.deepEqual(memory.facts, [])
  assert.deepEqual(memory.conversation_keys, [])
})
