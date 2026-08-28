import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CommercialMethodBuilderStaleWriteError,
  getCommercialMethodBuilderDraft,
  saveCommercialMethodBuilderDraft,
} from './commercial-method-builder.ts'
import {
  createEmptyCommercialMethodBuilderDraft,
} from '../../types/commercial-method-builder.ts'

const COMPANY_A = '10000000-0000-4000-8000-000000000001'
const COMPANY_B = '10000000-0000-4000-8000-000000000002'
const USER_A = '20000000-0000-4000-8000-000000000001'
const USER_B = '20000000-0000-4000-8000-000000000002'

function row(companyId, userId, overrides = {}) {
  return {
    id: `draft-${companyId.slice(-4)}`,
    company_id: companyId,
    contract_version: 'commercial-method-builder-v1',
    current_step: 1,
    completed_steps: [],
    ready_for_method: false,
    draft_data: createEmptyCommercialMethodBuilderDraft().data,
    created_by: userId,
    updated_by: userId,
    created_at: '2026-08-26T03:00:00.000Z',
    updated_at: '2026-08-26T03:00:00.000Z',
    ...overrides,
  }
}

class FakeQuery {
  constructor(store) {
    this.store = store
    this.filters = []
    this.mode = 'select'
    this.payload = null
  }

  select() {
    return this
  }

  eq(field, value) {
    this.filters.push([field, value])
    return this
  }

  update(payload) {
    this.mode = 'update'
    this.payload = payload
    return this
  }

  insert(payload) {
    this.mode = 'insert'
    this.payload = payload
    return this
  }

  matches(item) {
    return this.filters.every(([field, value]) => item[field] === value)
  }

  async maybeSingle() {
    if (this.mode === 'update') {
      const index = this.store.findIndex((item) => this.matches(item))
      if (index < 0) return { data: null, error: null }

      this.store[index] = {
        ...this.store[index],
        ...this.payload,
        updated_at: '2026-08-26T04:00:00.000Z',
      }

      return { data: this.store[index], error: null }
    }

    const matches = this.store.filter((item) => this.matches(item))
    return {
      data: matches[0] ?? null,
      error: matches.length > 1 ? { message: 'multiple rows' } : null,
    }
  }

  async single() {
    if (this.mode === 'update') {
      const index = this.store.findIndex((item) => this.matches(item))
      if (index < 0) {
        return { data: null, error: { message: 'row not found' } }
      }

      this.store[index] = {
        ...this.store[index],
        ...this.payload,
        updated_at: '2026-08-26T04:00:00.000Z',
      }

      return { data: this.store[index], error: null }
    }

    if (this.mode === 'insert') {
      const created = {
        id: `draft-new-${this.store.length + 1}`,
        created_at: '2026-08-26T04:00:00.000Z',
        updated_at: '2026-08-26T04:00:00.000Z',
        ...this.payload,
      }
      this.store.push(created)
      return { data: created, error: null }
    }

    const found = this.store.find((item) => this.matches(item)) ?? null
    return { data: found, error: found ? null : { message: 'row not found' } }
  }
}

function fakeSupabase(store) {
  return {
    from(table) {
      assert.equal(table, 'company_commercial_method_builder_drafts')
      return new FakeQuery(store)
    },
  }
}

test('12) leitura de uma empresa nunca retorna o draft de outra', async () => {
  const store = [
    row(COMPANY_A, USER_A, { current_step: 2 }),
    row(COMPANY_B, USER_B, { current_step: 3 }),
  ]

  const draftA = await getCommercialMethodBuilderDraft(
    fakeSupabase(store),
    COMPANY_A,
  )

  assert.equal(draftA?.company_id, COMPANY_A)
  assert.equal(draftA?.current_step, 2)
  assert.notEqual(draftA?.company_id, COMPANY_B)
})

test('13) atualização é filtrada por company_id e não altera outra empresa', async () => {
  const store = [
    row(COMPANY_A, USER_A),
    row(COMPANY_B, USER_B, { current_step: 3 }),
  ]
  const input = createEmptyCommercialMethodBuilderDraft()
  input.current_step = 2
  input.completed_steps = [1]
  input.data.company_profile.offer.main_offerings = ['Oferta A']

  await saveCommercialMethodBuilderDraft(
    fakeSupabase(store),
    COMPANY_A,
    USER_A,
    input,
  )

  assert.equal(store[0].company_id, COMPANY_A)
  assert.equal(store[0].current_step, 2)
  assert.deepEqual(store[0].draft_data.company_profile.offer.main_offerings, ['Oferta A'])
  assert.equal(store[1].company_id, COMPANY_B)
  assert.equal(store[1].current_step, 3)
})

test('14) novo rascunho nasce com company_id e autoria explícitos', async () => {
  const store = []
  const input = createEmptyCommercialMethodBuilderDraft()
  input.data.company_profile.offer.type = 'product'

  const saved = await saveCommercialMethodBuilderDraft(
    fakeSupabase(store),
    COMPANY_A,
    USER_A,
    input,
  )

  assert.equal(saved.company_id, COMPANY_A)
  assert.equal(saved.created_by, USER_A)
  assert.equal(saved.updated_by, USER_A)
  assert.equal(store.length, 1)
})


test('15) save stale não sobrescreve diagnóstico mais novo', async () => {
  const store = [
    row(COMPANY_A, USER_A, {
      updated_at: '2026-08-26T05:00:00.000Z',
      current_step: 3,
    }),
  ]
  const input = createEmptyCommercialMethodBuilderDraft()
  input.current_step = 2

  await assert.rejects(
    saveCommercialMethodBuilderDraft(
      fakeSupabase(store),
      COMPANY_A,
      USER_A,
      input,
      '2026-08-26T04:00:00.000Z',
    ),
    CommercialMethodBuilderStaleWriteError,
  )

  assert.equal(store[0].current_step, 3)
  assert.equal(store[0].updated_at, '2026-08-26T05:00:00.000Z')
})
