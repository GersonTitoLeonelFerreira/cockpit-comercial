import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const ROUTE_URL = new URL(
  '../../api/admin/commercial-method-builder/route.ts',
  import.meta.url,
)
const SERVICE_URL = new URL(
  '../server/commercial-method-builder.ts',
  import.meta.url,
)
const EXPERIENCE_URL = new URL(
  '../../admin/configuracao-comercial/CommercialConfigExperience.tsx',
  import.meta.url,
)
const BUILDER_UI_URL = new URL(
  '../../admin/configuracao-comercial/CommercialMethodBuilder.tsx',
  import.meta.url,
)
const MIGRATION_URL = new URL(
  '../../../supabase/migrations/20260826032000_create_commercial_method_builder_draft.sql',
  import.meta.url,
)

async function source(url) {
  return readFile(url, 'utf8')
}

test('15) editor avançado existente continua acessível', async () => {
  const content = await source(EXPERIENCE_URL)

  assert.match(content, /CommercialConfigClient/)
  assert.match(content, /Já sei como quero estruturar/)
  assert.match(content, /setMode\('advanced'\)/)
})

test('16) fluxo assistido não publica configuração automaticamente', async () => {
  const [route, service, builderUi] = await Promise.all([
    source(ROUTE_URL),
    source(SERVICE_URL),
    source(BUILDER_UI_URL),
  ])
  const combined = `${route}\n${service}\n${builderUi}`

  assert.doesNotMatch(combined, /rpc_publish_company_commercial_config/)
  assert.doesNotMatch(combined, /commercial-config\/publish/)
  assert.doesNotMatch(combined, /publishCommercialConfigDraft/)
})

test('17) fluxo assistido não cria commercial-method-v2 nem etapas automaticamente', async () => {
  const [route, service] = await Promise.all([
    source(ROUTE_URL),
    source(SERVICE_URL),
  ])
  const combined = `${route}\n${service}`

  assert.doesNotMatch(combined, /commercial-method-v2/)
  assert.doesNotMatch(combined, /company_commercial_method_steps/)
  assert.doesNotMatch(combined, /commercial_method_definition/)
})

test('18) API exige o mesmo gate administrativo multiempresa do commercial-config', async () => {
  const route = await source(ROUTE_URL)

  assert.match(route, /requireCommercialConfigAdmin/)
  assert.match(route, /context\.companyId/)
  assert.match(route, /context\.userId/)
})

test('19) migration isola edição por company membership admin e bloqueia anon', async () => {
  const migration = await source(MIGRATION_URL)

  assert.match(migration, /unique \(company_id\)/)
  assert.match(
    migration,
    /private\.has_company_commercial_access\([\s\S]*array\['admin'\]/,
  )
  assert.match(
    migration,
    /revoke all on table public\.company_commercial_method_builder_drafts from anon/,
  )
  assert.match(migration, /force row level security/)
})

test('20) conclusão da Fase 1 deixa construção do método indisponível', async () => {
  const builderUi = await source(BUILDER_UI_URL)

  assert.match(builderUi, /Construir meu método — disponível na Fase 2/)
  assert.match(builderUi, /disabled/)
  assert.match(builderUi, /Concluir mapeamento da operação/)
})
