import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

async function read(relative) {
  return readFile(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')
}

test('12) Fase 2 não chama publicação automática', async () => {
  const route = await read('../../api/admin/commercial-method-builder/method/route.ts')
  const server = await read('../server/commercial-method-construction.ts')

  assert.doesNotMatch(route, /publishCommercialConfigDraft|\/publish/i)
  assert.doesNotMatch(server, /publishCommercialConfigDraft|rpc_publish_company_commercial_config/i)
})

test('15) editor avançado continua acessível pela experiência', async () => {
  const experience = await read('../../admin/configuracao-comercial/CommercialConfigExperience.tsx')
  assert.match(experience, /import CommercialConfigClient/)
  assert.match(experience, /Já sei como quero estruturar/)
  assert.match(experience, /<CommercialConfigClient\s*\/\>/)
})

test('contrato consumidor commercial-method-v2 não é redefinido pela Fase 2', async () => {
  const types = await read('../../types/commercial-method-construction.ts')
  const logic = await read('./assisted-method-construction.ts')

  assert.match(types, /CommercialMethodDefinition/)
  assert.match(logic, /COMMERCIAL_METHOD_CONTRACT_VERSION/)
  assert.doesNotMatch(types, /commercial-method-v3/)
  assert.doesNotMatch(logic, /commercial-method-v3/)
})

test('Base Comercial permanece fonte de contexto, não contrato de etapas', async () => {
  const logic = await read('./assisted-method-construction.ts')
  assert.match(logic, /commercial_rules/)
  assert.doesNotMatch(logic, /name: 'Desconto'/)
  assert.doesNotMatch(logic, /name: 'Pagamento'/)
  assert.doesNotMatch(logic, /name: 'Contrato'/)
})
