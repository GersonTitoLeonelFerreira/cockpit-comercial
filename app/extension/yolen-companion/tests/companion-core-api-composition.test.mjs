import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import vm from 'node:vm'

const source = readFileSync(
  fileURLToPath(
    new URL('../src/lead-resolution-runtime-cache.js', import.meta.url),
  ),
  'utf8',
)

function createHarness({ resolveImpl } = {}) {
  let resolveCount = 0
  let clearSessionCount = 0
  const listeners = new Map()

  const defaultResolveImpl = (payload) => ({
    ok: true,
    payload: {
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
    async clearSession() {
      clearSessionCount += 1
      return { ok: true }
    },
  }

  const sandbox = {
    YolenCompanionApi: api,
    document: {
      addEventListener(type, listener) {
        listeners.set(type, listener)
      },
    },
    console,
    Map,
    Promise,
    String,
  }
  sandbox.globalThis = sandbox

  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, {
    filename: 'lead-resolution-runtime-cache.js',
  })

  return {
    api,
    listeners,
    get resolveCount() {
      return resolveCount
    },
    get clearSessionCount() {
      return clearSessionCount
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

  const clickListener = harness.listeners.get('click')
  assert.equal(typeof clickListener, 'function')

  clickListener({
    target: {
      closest(selector) {
        return selector === '[data-yolen-action="refresh"]' ? {} : null
      },
    },
  })

  await harness.api.resolveLead({ phone: '5511999999999', display_name: 'Larissa' })

  assert.equal(harness.resolveCount, 2)
})

test('clearSession também invalida resolução anterior', async () => {
  const harness = createHarness()

  await harness.api.resolveLead({ phone: '5511999999999', display_name: 'Larissa' })
  await harness.api.clearSession()
  await harness.api.resolveLead({ phone: '5511999999999', display_name: 'Larissa' })

  assert.equal(harness.clearSessionCount, 1)
  assert.equal(harness.resolveCount, 2)
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
          ? { status: 'NOT_FOUND' }
          : {
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
