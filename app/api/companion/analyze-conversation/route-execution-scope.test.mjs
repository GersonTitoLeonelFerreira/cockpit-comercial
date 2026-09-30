// R10 — a rota real de análise por ambiente. O mesmo banco serve HOMOLOG
// (Vercel Preview) e PRODUÇÃO: os dados-fonte (membership, perfil, ciclo,
// lead, eventos do ciclo) são lidos das MESMAS tabelas nos dois — o HML
// continua enxergando a conversa real — mas o job derivado nasce, é
// reaproveitado e é publicado só no armazenamento do próprio escopo.

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { register } from 'node:module'
import test, { mock } from 'node:test'
import { fileURLToPath } from 'node:url'

register(
  fileURLToPath(new URL('../../../lib/companion/e2-test-support/route-alias-resolve-loader.mjs', import.meta.url)),
  import.meta.url,
)

import {
  createStepAdmin,
  insertStep,
  selectStep,
} from '../../../lib/companion/e2-test-support/fake-companion-admin.mjs'
import {
  bearerHeader,
  buildToken,
  installFakeSupabaseEnv,
} from '../../../lib/companion/e2-test-support/fake-companion-token.mjs'

installFakeSupabaseEnv()

const adminBox = { admin: null }
const queueCalls = []

mock.module('@supabase/supabase-js', {
  namedExports: {
    createClient: () => adminBox.admin,
  },
})

mock.module('@vercel/queue', {
  namedExports: {
    send: async (topic, message, options) => {
      queueCalls.push({ topic, message, options })
    },
  },
})

const { POST } = await import('./route.ts')
const { STATEFUL_COPILOT_BACKGROUND_JOB_VERSION } = await import('../../../lib/server/stateful-copilot-background-job.ts')

const IDS = {
  company: 'aaaaaaaa-0000-4000-8000-000000000001',
  user: 'aaaaaaaa-0000-4000-8000-0000000000a1',
  cycle: 'aaaaaaaa-0000-4000-8000-0000000000d1',
  lead: 'aaaaaaaa-0000-4000-8000-0000000000c1',
}

const CONVERSATION = 'whatsapp:+5544000023820'
const WATERMARK = 'wm-route-1'
const SOURCE_TABLES = ['company_memberships', 'profiles', 'sales_cycles', 'leads', 'cycle_events']

function sourceSteps() {
  return [
    selectStep('company_memberships', { company_id: IDS.company, user_id: IDS.user, role: 'member', is_active: true }),
    selectStep('profiles', { id: IDS.user, is_active_global: true }),
    selectStep('sales_cycles', {
      id: IDS.cycle,
      company_id: IDS.company,
      lead_id: IDS.lead,
      status: 'contato',
      owner_user_id: IDS.user,
      next_action: null,
      next_action_date: null,
      current_group_id: null,
    }),
    selectStep('leads', { id: IDS.lead, name: 'Cliente', phone: '5544000023820', email: null, company_id: IDS.company }),
    selectStep('cycle_events', []),
  ]
}

function useAdmin(steps) {
  const fake = createStepAdmin(steps)
  const originalFrom = fake.admin.from

  fake.admin.from = (table) => {
    const builder = originalFrom(table)
    builder.single = () => builder.maybeSingle()
    return builder
  }

  adminBox.admin = fake.admin
  return fake
}

function request() {
  return new Request('http://localhost/api/companion/analyze-conversation', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...bearerHeader(buildToken({ sub: IDS.user, companyId: IDS.company })),
    },
    body: JSON.stringify({
      cycle_id: IDS.cycle,
      conversation_key: CONVERSATION,
      device_key: 'device-1',
      message_snapshot_hash: WATERMARK,
      messages: [{
        id: 'm1',
        timestamp_ms: Date.now(),
        timestamp_label: '10:00',
        date_key: '2026-09-30',
        direction: 'incoming',
        text: 'Olá, quero saber o preço.',
      }],
    }),
  })
}

async function withVercelEnv(value, fn) {
  const previous = process.env.VERCEL_ENV
  process.env.VERCEL_ENV = value

  try {
    return await fn()
  } finally {
    if (previous === undefined) {
      delete process.env.VERCEL_ENV
    } else {
      process.env.VERCEL_ENV = previous
    }
  }
}

function legacyProductionJobId() {
  return createHash('sha256')
    .update(JSON.stringify([STATEFUL_COPILOT_BACKGROUND_JOB_VERSION, IDS.company, IDS.cycle, CONVERSATION, WATERMARK]))
    .digest('hex')
}

async function analyze(vercelEnv, jobSteps) {
  queueCalls.length = 0
  const fake = useAdmin([...sourceSteps(), ...jobSteps])
  const response = await withVercelEnv(vercelEnv, () => POST(request()))
  return { fake, response, body: await response.json() }
}

test('I + A: HML lê os mesmos dados-fonte e cria job só no armazenamento homolog, com identidade própria', async () => {
  const hml = await analyze('preview', [
    insertStep('companion_background_analysis_jobs_homolog', { analysis_job_id: 'placeholder', status: 'queued', message_watermark: WATERMARK }),
  ])

  assert.equal(hml.response.status, 200)
  assert.equal(hml.fake.remaining.length, 0)
  assert.deepEqual(
    hml.fake.calls.slice(0, SOURCE_TABLES.length).map((call) => call.table),
    SOURCE_TABLES,
    'dado-fonte continua disponível para o HML',
  )

  const hmlInsert = hml.fake.calls.find((call) => call.method === 'insert')
  assert.equal(hmlInsert.table, 'companion_background_analysis_jobs_homolog')
  assert.equal(hmlInsert.payload.execution_scope, 'homolog')
  assert.equal(hmlInsert.payload.automatic_crm_write, false)
  assert.equal(hmlInsert.payload.automatic_agenda_write, false)
  assert.equal(hml.body.data.deep_analysis.execution_scope, 'homolog')
  assert.equal(queueCalls.length, 1)
  assert.equal(queueCalls[0].message.execution_scope, 'homolog')
  assert.equal(queueCalls[0].options.idempotencyKey, hmlInsert.payload.analysis_job_id)
  assert.equal(
    hml.fake.calls.some((call) => call.table === 'companion_background_analysis_jobs'),
    false,
    'HML nunca toca o job de produção',
  )

  const prod = await analyze('production', [
    insertStep('companion_background_analysis_jobs', { analysis_job_id: 'placeholder', status: 'queued', message_watermark: WATERMARK }),
  ])

  const prodInsert = prod.fake.calls.find((call) => call.method === 'insert')
  assert.equal(prodInsert.table, 'companion_background_analysis_jobs')
  assert.equal(prodInsert.payload.execution_scope, 'production')
  assert.equal(prod.body.data.deep_analysis.execution_scope, 'production')
  assert.equal(queueCalls[0].message.execution_scope, 'production')
  assert.notEqual(
    prodInsert.payload.analysis_job_id,
    hmlInsert.payload.analysis_job_id,
    'A: mesmo contexto/watermark, jobs diferentes',
  )
})

test('idempotência por escopo: HML reaproveita só o próprio job; PROD reaproveita o job legado', async () => {
  const hml = await analyze('preview', [
    insertStep('companion_background_analysis_jobs_homolog', null, { code: '23505', message: 'duplicate' }),
    selectStep('companion_background_analysis_jobs_homolog', {
      analysis_job_id: 'f'.repeat(64),
      status: 'succeeded',
      message_watermark: WATERMARK,
      requested_at: '2026-09-30T10:00:00.000Z',
      updated_at: '2026-09-30T10:00:30.000Z',
      started_at: '2026-09-30T10:00:05.000Z',
      execution_scope: 'homolog',
    }),
  ])

  assert.equal(hml.response.status, 200)
  assert.equal(hml.body.data.deep_analysis.analysis_job_id, 'f'.repeat(64))
  assert.equal(hml.body.data.deep_analysis.execution_scope, 'homolog')
  assert.equal(queueCalls.length, 0)

  const legacyId = legacyProductionJobId()
  const prod = await analyze('production', [
    insertStep('companion_background_analysis_jobs', null, { code: '23505', message: 'duplicate' }),
    selectStep('companion_background_analysis_jobs', {
      analysis_job_id: legacyId,
      status: 'succeeded',
      message_watermark: WATERMARK,
      requested_at: '2026-09-29T10:00:00.000Z',
      updated_at: '2026-09-29T10:00:30.000Z',
      started_at: '2026-09-29T10:00:05.000Z',
    }),
  ])

  assert.equal(prod.body.data.deep_analysis.analysis_job_id, legacyId, 'legado (sem escopo) é produção')
  assert.equal(prod.body.data.deep_analysis.execution_scope, 'production')

  const reuseLookup = prod.fake.calls.at(-1)
  assert.equal(reuseLookup.filters.some((filter) => filter.column === 'analysis_job_id'), false)
})

test('linha de outro escopo nunca é reaproveitada, mesmo que apareça na busca', async () => {
  const hml = await analyze('preview', [
    insertStep('companion_background_analysis_jobs_homolog', null, { code: '23505', message: 'duplicate' }),
    selectStep('companion_background_analysis_jobs_homolog', {
      analysis_job_id: legacyProductionJobId(),
      status: 'succeeded',
      message_watermark: WATERMARK,
      requested_at: '2026-09-29T10:00:00.000Z',
      updated_at: '2026-09-29T10:00:30.000Z',
      started_at: null,
      execution_scope: 'production',
    }),
  ])

  assert.equal(hml.response.status, 502)
  assert.equal(hml.body.ok, false)
  assert.equal(queueCalls.length, 0)
})

test('"Atualizar análise" que cria job novo publica force_reanalysis na fila; sem o pedido, não', async () => {
  for (const force of [false, true]) {
    queueCalls.length = 0
    useAdmin([
      ...sourceSteps(),
      insertStep('companion_background_analysis_jobs_homolog', { analysis_job_id: 'placeholder', status: 'queued', message_watermark: WATERMARK }),
    ])

    const base = request()
    const body = await base.json()

    const response = await withVercelEnv('preview', () =>
      POST(new Request(base.url, {
        method: 'POST',
        headers: base.headers,
        body: JSON.stringify(force ? { ...body, force_reanalysis: true } : body),
      })),
    )

    assert.equal(response.status, 200)
    assert.equal(queueCalls.length, 1)
    assert.equal(queueCalls[0].message.force_reanalysis === true, force)
  }
})
