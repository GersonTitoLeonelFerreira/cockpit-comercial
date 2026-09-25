import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'

// FASE 5 — o cache de resolução por identidade (antes
// lead-resolution-runtime-cache.js, monkey-patch de
// YolenCompanionApi.resolveLead/clearSession + listener global de clique) é
// agora parte da composição explícita do Core
// (companion-core-api-composition.js). O Core invalida o cache no botão
// "Atualizar" e quando a sessão é perdida/troca de vendedor.
const require = createRequire(import.meta.url)
const composition = require('../src/companion-core-api-composition.js')
const captureResilience = require('../src/capture-resilience.js')
const nullBaseRebase = require('../src/capture-resilience-null-base.js')

function createHarness({ resolveImpl, ingestImpl } = {}) {
  let resolveCount = 0
  const ingestPayloads = []

  const defaultResolveImpl = (payload) => ({
    ok: true,
    payload: {
      ok: true,
      status: 'OWNED_BY_ME',
      lead: { id: 'lead-1', name: payload.display_name || 'Lead' },
      cycle: { id: 'cycle-1' },
    },
  })

  const api = {
    async resolveLead(payload) {
      resolveCount += 1
      return (resolveImpl || defaultResolveImpl)(payload, resolveCount)
    },
    async ingestCapturedMessages(payload) {
      ingestPayloads.push(payload)
      return ingestImpl
        ? ingestImpl(payload, ingestPayloads.length)
        : { ok: true, payload: { ok: true, message_results: [] } }
    },
  }

  const core = composition.create({
    getApi: () => api,
    captureResilienceTools: captureResilience,
    nullBaseRebaseTools: nullBaseRebase,
  })

  return {
    api: {
      // Mesma chamada que o Core faz em resolveCurrentLead().
      resolveLead: (payload, options = {}) =>
        core.resolveLead(payload, {
          companyId: 'company-1',
          boundaryToken: 1,
          ...options,
        }),
    },
    core,
    ingestPayloads,
    get resolveCount() {
      return resolveCount
    },
  }
}

test('lead já resolvido pelo mesmo telefone não consulta novamente', async () => {
  const harness = createHarness()

  const first = await harness.api.resolveLead({
    phone: '+55 11 99999-9999',
    display_name: 'Larissa',
  })

  const second = await harness.api.resolveLead({
    phone: '5511999999999',
    display_name: 'Larissa dos Santos',
  })

  assert.equal(harness.resolveCount, 1)
  assert.equal(second, first)
})

test('outro telefone continua fazendo resolução própria', async () => {
  const harness = createHarness()

  await harness.api.resolveLead({ phone: '5511999999999', display_name: 'Larissa' })
  await harness.api.resolveLead({ phone: '5521999999999', display_name: 'Mayara' })

  assert.equal(harness.resolveCount, 2)
})

test('refresh explícito limpa o cache e permite nova consulta', async () => {
  const harness = createHarness()

  await harness.api.resolveLead({ phone: '5511999999999', display_name: 'Larissa' })

  // O Core chama clearLeadResolutionCache() no clique de "Atualizar".
  harness.core.clearLeadResolutionCache()

  await harness.api.resolveLead({ phone: '5511999999999', display_name: 'Larissa' })

  assert.equal(harness.resolveCount, 2)
})

test('empresa ativa diferente nunca reaproveita a resolução da anterior', async () => {
  const harness = createHarness()

  await harness.api.resolveLead(
    { phone: '5511999999999', display_name: 'Larissa' },
    { companyId: 'company-1' },
  )
  await harness.api.resolveLead(
    { phone: '5511999999999', display_name: 'Larissa' },
    { companyId: 'company-2' },
  )

  assert.equal(harness.resolveCount, 2)
})

test('A → B → A: nova geração de fronteira não herda a requisição presa de A₁', async () => {
  let releaseFirst
  const harness = createHarness({
    resolveImpl: (payload, callNumber) =>
      callNumber === 1
        ? new Promise((resolve) => {
            releaseFirst = () =>
              resolve({
                ok: true,
                payload: { ok: true, status: 'OWNED_BY_ME', lead: { id: 'lead-old' } },
              })
          })
        : {
            ok: true,
            payload: { ok: true, status: 'OWNED_BY_ME', lead: { id: 'lead-current' } },
          },
  })

  const first = harness.api.resolveLead(
    { phone: '5511999999999' },
    { boundaryToken: 1 },
  )
  const sameGeneration = harness.api.resolveLead(
    { phone: '5511999999999' },
    { boundaryToken: 1 },
  )
  const nextGeneration = await harness.api.resolveLead(
    { phone: '5511999999999' },
    { boundaryToken: 3 },
  )

  assert.equal(harness.resolveCount, 2)
  assert.equal(nextGeneration.payload.lead.id, 'lead-current')

  releaseFirst()
  assert.equal((await first).payload.lead.id, 'lead-old')
  assert.equal(await sameGeneration, await first)
})

test('falha transitória de rede é repetida antes de chegar ao Core', async () => {
  const harness = createHarness({
    resolveImpl: (payload, callNumber) =>
      callNumber === 1
        ? { ok: false, statusCode: 503, payload: { ok: false } }
        : {
            ok: true,
            payload: { ok: true, status: 'OWNED_BY_ME', lead: { id: 'lead-1' } },
          },
  })

  const result = await harness.core.resolveLead(
    { phone: '5511999999999' },
    { companyId: 'company-1', boundaryToken: 1 },
  )

  assert.equal(harness.resolveCount, 2)
  assert.equal(result.payload.status, 'OWNED_BY_ME')
})

// FASE 15.1 — hotfix pós-merge: NOT_FOUND é um estado TRANSITÓRIO (o lead
// pode ter acabado de ser criado no backend e a primeira consulta chegar
// antes da propagação) — nunca pode ser tratado como resolução estável e
// cacheado como se fosse. Antes desta correção, uma vez que
// resolveLead(phone) devolvia NOT_FOUND para um telefone, TODA consulta
// seguinte para o MESMO telefone (inclusive depois do lead já existir no
// backend) devolvia o mesmo NOT_FOUND obsoleto sem nenhuma requisição nova
// — nem o retry automático pós-create (resolveAfterLeadCreation em
// content-script.js) nem o clique manual em "Atualizar vínculo"
// (retryLeadLinkAfterCreation) conseguiam nunca ver o vínculo aparecer,
// porque nenhum dos dois passa por clearLeadResolutionCache() (só o botão
// global "Atualizar" faz essa limpeza).
test('NOT_FOUND não é cacheado e pode virar OWNED_BY_ME na consulta seguinte', async () => {
  const harness = createHarness({
    resolveImpl: (payload, callNumber) => ({
      ok: true,
      payload:
        callNumber === 1
          ? { ok: true, status: 'NOT_FOUND' }
          : {
              ok: true,
              status: 'OWNED_BY_ME',
              lead: { id: 'lead-1', name: payload.display_name || 'Lead' },
              cycle: { id: 'cycle-1' },
            },
    }),
  })

  const first = await harness.api.resolveLead({
    phone: '5511999999999',
    display_name: 'Larissa',
  })

  assert.equal(first.payload.status, 'NOT_FOUND')

  // Lead foi criado no backend entre a primeira e a segunda consulta —
  // sem nenhum clique no botão global "Atualizar" e sem clearSession(), a
  // única coisa que muda é a resposta que o backend passa a dar.
  const second = await harness.api.resolveLead({
    phone: '5511999999999',
    display_name: 'Larissa',
  })

  assert.equal(
    harness.resolveCount,
    2,
    'NOT_FOUND não pode impedir uma nova consulta real para o mesmo telefone',
  )
  assert.equal(
    second.payload.status,
    'OWNED_BY_ME',
    'a segunda consulta precisa refletir o estado atual do backend, não o NOT_FOUND obsoleto',
  )
  assert.notEqual(
    second,
    first,
    'o resultado NOT_FOUND nunca pode ser reaproveitado por identidade — cada consulta pós-NOT_FOUND precisa ser uma requisição nova',
  )
})

test('resultado positivo continua deduplicado mesmo depois de um NOT_FOUND anterior para outro identity', async () => {
  const harness = createHarness()

  await harness.api.resolveLead({ phone: '5521999999999', display_name: 'Mayara' })
  const first = await harness.api.resolveLead({ phone: '5511999999999', display_name: 'Larissa' })
  const second = await harness.api.resolveLead({ phone: '5511999999999', display_name: 'Larissa' })

  assert.equal(
    harness.resolveCount,
    2,
    'a segunda consulta ao MESMO telefone com resultado positivo continua deduplicada — só NOT_FOUND deixa de ser cacheado',
  )
  assert.equal(second, first)
})

test('Core invalida o cache no "Atualizar", na perda de sessão e na troca de vendedor', async () => {
  const { readWhatsAppCompositionSource } = await import(
    './support/whatsapp-composition-source.mjs'
  )
  const source = readWhatsAppCompositionSource()

  assert.match(
    source,
    /"Atualizar" é a invalidação explícita do cache de resolução\.\s*coreApiComposition\.clearLeadResolutionCache\(\)/,
  )
  assert.match(
    source,
    /Sessão perdida[\s\S]{0,200}coreApiComposition\.clearLeadResolutionCache\(\)/,
  )
  assert.match(
    source,
    /nextUserId !== lastSessionUserId[\s\S]{0,80}coreApiComposition\.clearLeadResolutionCache\(\)/,
  )
})

test('ingestão passa pela composição explícita (coordenação + rebase) até a API', async () => {
  const harness = createHarness()

  const payload = {
    conversation_key: 'phone:5511999999999',
    messages: [],
  }

  const result = await harness.core.ingestCapturedMessages(payload)

  assert.equal(result.ok, true)
  assert.equal(harness.ingestPayloads.length, 1)
})
