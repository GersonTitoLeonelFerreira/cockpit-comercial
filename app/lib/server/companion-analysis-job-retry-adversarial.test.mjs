// Frente Paralela 3 (FASE 12A) — validação adversarial independente do
// PR #209, reauditado no head 8dafed050c1e7ef18899a899265979d0a7a80088
// (moveu de 0661ff6893299b9a912a2653c2f902cfa3cdac1c durante esta própria
// auditoria — a Frente 1 adicionou `companion-analysis-job-retry.ts`,
// que não existia no head anterior).
//
// Testa `retryCompanionAnalysisJob` diretamente (função recebe `admin` e
// `publish` como parâmetros injetados), cobrindo T26-T29 do mandato:
// retry concorrente (CAS failed->queued), falha de publish não deve
// orfanizar um `queued`, duplo-clique só um vence o CAS, compensação de
// uma tentativa antiga não pode derrubar uma tentativa nova válida.
//
// IMPORTANTE: `companion-analysis-job-retry.ts` e
// `companion-analysis-job-reader.ts` (na forma usada aqui, com DTO
// seller-facing) ainda NÃO EXISTEM nesta branch
// (`claude/adversarial-validation-progressive-inf2cq`) no momento em que
// este teste foi escrito — são código do PR #209 (head 8dafed0), ainda
// não mergeado em `main`. Rodar este arquivo AGORA, contra esta branch,
// falha na importação — isso é esperado e documentado. Cada cenário foi
// validado contra um worktree temporário no head 8dafed0 (nunca mergeado
// nesta branch) antes de ser commitado aqui; resultados registrados em
// docs/companion-v2/phase12/DEEP_RESULT_DELIVERY_ADVERSARIAL_MATRIX.md.

import assert from 'node:assert/strict'
import test from 'node:test'

import { retryCompanionAnalysisJob } from './companion-analysis-job-retry.ts'
import { buildStatefulCopilotBackgroundJobDescriptor } from './stateful-copilot-background-job.ts'

const COMPANY_A = 'aaaaaaaa-0000-4000-8000-000000000001'
const USER_A = 'aaaaaaaa-0000-4000-8000-0000000000a1'
const CYCLE_A = 'aaaaaaaa-0000-4000-8000-0000000000d1'
const CONVERSATION_KEY = 'whatsapp:+5547999990001'

// `retryCompanionAnalysisJob` recomputa deterministicamente o
// analysis_job_id a partir de (job_version, company_id, cycle_id,
// conversation_key, message_watermark) e rejeita qualquer job cujo id
// persistido não bata com essa recomputação — usar o mesmo builder aqui
// garante que a fixture use um id real, não um hash arbitrário.
function jobIdFor(watermark) {
  return buildStatefulCopilotBackgroundJobDescriptor({
    company_id: COMPANY_A,
    cycle_id: CYCLE_A,
    conversation_key: CONVERSATION_KEY,
    message_watermark: watermark,
    requested_at: '2026-08-23T09:55:00.000Z',
  }).analysis_job_id
}

function baseToken() {
  return { company_id: COMPANY_A, sub: USER_A }
}

// Fake admin mínimo, específico para exercitar o CAS de retry: suporta
// `.eq().maybeSingle()` fielmente (0 linhas -> null; 1 -> a linha; 2+ ->
// erro) e `.update(patch).eq(...).select().maybeSingle()`, aplicando o
// patch SÓ se todos os filtros (incluindo `updated_at`, a chave do CAS)
// baterem numa linha existente — imitando o comportamento real de um
// UPDATE condicional do Postgres (0 linhas afetadas se o WHERE não bate
// mais, nunca um erro).
function buildFakeAdmin({ memberships, cycles, jobs }) {
  function resolve(table, filters) {
    const rows = { company_memberships: memberships, sales_cycles: cycles, companion_background_analysis_jobs: jobs }[table] ?? []
    return rows.filter((row) => filters.every((f) => row[f.column] === f.value))
  }

  class Query {
    constructor(table) {
      this.table = table
      this.filters = []
      this.patch = null
    }

    select() {
      return this
    }

    eq(column, value) {
      this.filters.push({ column, value })
      return this
    }

    update(patch) {
      this.patch = patch
      return this
    }

    // Achado ao depurar o teste (T27/T29) de compensação: a compensação
    // real (`companion-analysis-job-retry.ts`) faz
    // `await admin.from(...).update(...).eq(...)` SEM encadear
    // `.maybeSingle()`/`.select()` — o query builder real do
    // supabase-js é "thenable" (implementa `.then()`), então `await`
    // direto no builder já dispara a execução. Sem este método, `await`
    // numa instância de `Query` simplesmente resolve para a própria
    // instância (não-thenable), e `{ error }` desestruturado dá
    // `undefined` — o teste "passava" silenciosamente sem a mutação
    // realmente acontecer. Corrigido implementando `.then()` para
    // aplicar o mesmo efeito de um UPDATE condicional real.
    then(onFulfilled, onRejected) {
      return this.execute().then(onFulfilled, onRejected)
    }

    execute() {
      const matches = resolve(this.table, this.filters)

      if (this.patch) {
        for (const row of matches) {
          Object.assign(row, this.patch)
        }
      }

      return Promise.resolve({ data: null, error: null })
    }

    maybeSingle() {
      const matches = resolve(this.table, this.filters)

      if (matches.length > 1) {
        return Promise.resolve({ data: null, error: { code: 'PGRST116' } })
      }

      const row = matches[0] ?? null

      if (this.patch && row) {
        // CAS: aplica o patch in-place na MESMA referência de objeto do
        // array `jobs`, simulando um UPDATE real que persiste.
        Object.assign(row, this.patch)
      }

      // IMPORTANTE (achado ao rodar T28 pela primeira vez): devolver a
      // referência viva do objeto para um SELECT simples permite que uma
      // mutação concorrente (outra chamada CAS) "vaze" para dentro de uma
      // leitura já resolvida, porque o código sob teste só lê os campos
      // DEPOIS do `await`. Um SELECT real do Postgres devolve um
      // snapshot imutável no momento da leitura — por isso aqui também
      // devolvemos uma cópia rasa, nunca a referência viva, para simular
      // isolamento de leitura real e não introduzir uma corrida
      // fantasma do PRÓPRIO harness de teste.
      return Promise.resolve({ data: row ? { ...row } : null, error: null })
    }
  }

  return {
    from(table) {
      return new Query(table)
    },
  }
}

function baseFixtures() {
  return {
    memberships: [{ company_id: COMPANY_A, user_id: USER_A, role: 'admin', is_active: true }],
    cycles: [{ id: CYCLE_A, company_id: COMPANY_A, owner_user_id: USER_A }],
    jobs: [],
  }
}

function failedJobRow({ analysisJobId, watermark = 'wm-1', updatedAt = '2026-08-23T10:00:00.000Z' }) {
  return {
    analysis_job_id: analysisJobId,
    company_id: COMPANY_A,
    cycle_id: CYCLE_A,
    conversation_key: CONVERSATION_KEY,
    message_watermark: watermark,
    candidate_state_version: null,
    failure_code: 'INVALID_COMMUNICATION_OUTPUT',
    status: 'failed',
    requested_at: '2026-08-23T09:55:00.000Z',
    updated_at: updatedAt,
  }
}

test('(T26) retry bem-sucedido: job failed -> queued, publish chamado exatamente uma vez com watermark correto', async () => {
  const fixtures = baseFixtures()
  const watermark = 'wm-retry-ok'
  const id = jobIdFor(watermark)
  fixtures.jobs.push(failedJobRow({ analysisJobId: id, watermark }))

  const publishCalls = []
  const publish = async (topic, message, options) => {
    publishCalls.push({ topic, message, options })
  }

  const result = await retryCompanionAnalysisJob({
    admin: buildFakeAdmin(fixtures),
    token: baseToken(),
    analysis_job_id: id,
    device_key: 'device-1',
    publish,
  })

  assert.equal(result.status, 'queued')
  assert.equal(result.analysis_job_id, id)
  assert.equal(publishCalls.length, 1, 'publish deve ser chamado exatamente uma vez')
  assert.equal(fixtures.jobs[0].status, 'queued')
  assert.equal(fixtures.jobs[0].attempt_count, 0, 'attempt_count deve ser resetado')
})

test('(T28) retry concorrente: dois callers tentam requeue do mesmo job failed -> só um vence o CAS, publish chamado uma única vez no total', async () => {
  const fixtures = baseFixtures()
  const watermark = 'wm-retry-concurrent'
  const id = jobIdFor(watermark)
  fixtures.jobs.push(failedJobRow({ analysisJobId: id, watermark }))

  const publishCalls = []
  const publish = async (topic, message, options) => {
    publishCalls.push({ topic, message, options })
  }

  // Duas "requisições" concorrentes: a primeira lê o job failed, aplica o
  // UPDATE condicional (CAS) e vence porque updated_at ainda bate. A
  // segunda, mesmo re-executando toda a cadeia de autorização, encontra
  // o job já em `queued` (não mais `failed`) na primeira leitura de
  // `loadCompanionAnalysisJobStatus` dentro de `retryCompanionAnalysisJob`
  // e retorna cedo sem publicar de novo — não há uma segunda tentativa de
  // UPDATE competindo pelo mesmo `updated_at` porque o guard de status
  // (`authorized.status !== 'failed'`) já intercepta antes do CAS.
  const admin = buildFakeAdmin(fixtures)

  const [first, second] = await Promise.all([
    retryCompanionAnalysisJob({ admin, token: baseToken(), analysis_job_id: id, device_key: 'device-1', publish }),
    retryCompanionAnalysisJob({ admin, token: baseToken(), analysis_job_id: id, device_key: 'device-2', publish }),
  ])

  assert.equal(publishCalls.length, 1, 'exatamente uma publicação deve vencer a corrida — nunca duas')

  const statuses = [first.status, second.status].sort()
  // Um dos dois vê 'queued' (o vencedor, ou o perdedor lendo o estado já
  // atualizado pelo vencedor); nenhum finaliza como 'failed' novamente,
  // e nenhum duplica o efeito de retry.
  assert.ok(statuses.every((s) => s === 'queued'), `ambos deveriam observar 'queued' ao final: ${statuses}`)
})

test('(T27/T29) falha de publish aciona compensação escopada por updated_at — não derruba um estado mais novo produzido por outra tentativa', async () => {
  const fixtures = baseFixtures()
  const watermark = 'wm-retry-publish-fail'
  const id = jobIdFor(watermark)
  fixtures.jobs.push(failedJobRow({ analysisJobId: id, watermark, updatedAt: '2026-08-23T10:00:00.000Z' }))

  const publish = async () => {
    throw new Error('fila indisponível')
  }

  const result = await retryCompanionAnalysisJob({
    admin: buildFakeAdmin(fixtures),
    token: baseToken(),
    analysis_job_id: id,
    device_key: 'device-1',
    publish,
  })

  // A compensação deve reverter ESTA tentativa para failed (com um
  // failure_code específico de falha de publish), nunca deixar o job
  // orfanado em 'queued' sem nenhum worker escutando.
  assert.equal(result.status, 'failed')
  assert.equal(fixtures.jobs[0].status, 'failed')
  assert.equal(fixtures.jobs[0].failure_code, 'QUEUE_PUBLISH_FAILED')
})

test('(T29) compensação de uma tentativa antiga nunca deve clobber uma tentativa nova e válida (updated_at já mudou)', async () => {
  const fixtures = baseFixtures()
  const watermark = 'wm-retry-compensation-race'
  const id = jobIdFor(watermark)
  const row = failedJobRow({ analysisJobId: id, watermark, updatedAt: '2026-08-23T10:00:00.000Z' })
  fixtures.jobs.push(row)

  let publishCallCount = 0
  const publish = async () => {
    publishCallCount += 1

    if (publishCallCount === 1) {
      // Simula: enquanto esta tentativa publica (e vai falhar), uma
      // segunda tentativa (um worker externo, ou uma segunda aba)
      // avança o job para 'running' com um updated_at NOVO, ANTES da
      // compensação da primeira tentativa rodar.
      row.status = 'running'
      row.updated_at = '2026-08-23T10:05:00.000Z'

      throw new Error('fila indisponível')
    }
  }

  const result = await retryCompanionAnalysisJob({
    admin: buildFakeAdmin(fixtures),
    token: baseToken(),
    analysis_job_id: id,
    device_key: 'device-1',
    publish,
  })

  // A compensação da primeira tentativa é escopada por
  // `.eq('status','queued').eq('updated_at', retryQueuedAt-da-tentativa-1)`
  // — como o job já não está mais nesse exato (status, updated_at), a
  // compensação não encontra a linha e não faz nada. O job permanece no
  // estado mais NOVO ('running'), nunca é derrubado de volta para
  // 'failed' pela tentativa antiga.
  assert.equal(row.status, 'running', 'o estado mais novo (running) não pode ser sobrescrito pela compensação da tentativa antiga')
  assert.equal(result.status, 'running')
})
