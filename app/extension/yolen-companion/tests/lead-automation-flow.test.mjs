import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const manifest = JSON.parse(
  readFileSync(
    new URL('../manifest.json', import.meta.url),
    'utf8',
  ),
)

const yolenApi = readFileSync(
  new URL('../src/yolen-api.js', import.meta.url),
  'utf8',
)

const background = readFileSync(
  new URL('../src/background.js', import.meta.url),
  'utf8',
)

const leadAutomation = readFileSync(
  new URL('../src/lead-automation.js', import.meta.url),
  'utf8',
)

const createLeadRoute = readFileSync(
  new URL(
    '../../../api/companion/create-lead/route.ts',
    import.meta.url,
  ),
  'utf8',
)

test('B1 carrega automação de lead sem substituir o content-script principal', () => {
  const whatsappContentScript = manifest.content_scripts.find((entry) =>
    entry.matches?.includes('https://web.whatsapp.com/*'),
  )

  assert.ok(whatsappContentScript)

  const contentScriptIndex = whatsappContentScript.js.indexOf(
    'src/content-script.js',
  )
  const leadAutomationIndex = whatsappContentScript.js.indexOf(
    'src/lead-automation.js',
  )

  assert.ok(contentScriptIndex >= 0)
  assert.ok(leadAutomationIndex > contentScriptIndex)
  assert.ok(
    whatsappContentScript.css.includes('src/lead-automation.css'),
  )
})

test('B1 usa o contexto já resolvido pelo Companion e cria sem abrir a Yolen', () => {
  assert.match(yolenApi, /lastLeadLookupContext/)
  assert.match(yolenApi, /getLastLeadLookupContext/)
  assert.match(yolenApi, /createLead/)
  assert.match(yolenApi, /CREATE_LEAD/)

  assert.match(background, /message\.action === 'CREATE_LEAD'/)
  assert.match(background, /\/api\/companion\/create-lead/)

  assert.match(leadAutomation, /create-lead-yolen/)
  assert.match(leadAutomation, /Novo contato/)
  assert.match(leadAutomation, /Nenhum lead encontrado/)
  assert.match(leadAutomation, /name="yolen-lead-name"/)
  assert.match(leadAutomation, /name="yolen-lead-phone"/)
  assert.match(leadAutomation, /readonly/)
  assert.match(leadAutomation, /Criar lead/)
  assert.doesNotMatch(leadAutomation, /window\.open/)
})

test('B1 reconsulta o vínculo automaticamente depois da criação', () => {
  assert.match(leadAutomation, /refreshLeadResolution/)
  assert.match(leadAutomation, /data-yolen-action=/)
  assert.match(leadAutomation, /refreshButton\?\.click\(\)/)
})

test('B1 mantém proteção multiempresa e duplicidade por variantes de telefone', () => {
  assert.match(createLeadRoute, /verifyCompanionRequestToken/)
  assert.match(createLeadRoute, /company_memberships/)
  assert.match(createLeadRoute, /tokenPayload\.company_id/)
  assert.match(createLeadRoute, /phone_digits/)
  assert.match(createLeadRoute, /buildPhoneVariants/)
  assert.match(createLeadRoute, /multiple_lead_matches/)
  assert.match(createLeadRoute, /active_lead_conflict/)
  assert.match(createLeadRoute, /deleted_lead_conflict/)
  assert.match(createLeadRoute, /companion_phone:/)
  assert.match(createLeadRoute, /concurrent_create_conflict/)
})

test('B1 atribui o lead criado ao usuario logado e cria ciclo novo', () => {
  assert.match(
    createLeadRoute,
    /const ownerUserId = tokenPayload\.sub/,
  )
  assert.match(createLeadRoute, /owner_user_id: ownerUserId/)
  assert.match(createLeadRoute, /status: 'novo'/)
  assert.match(createLeadRoute, /event_type: 'cycle_created'/)
})

test('B2 envia CPF ou CNPJ opcional na criação pelo Companion', () => {
  assert.match(
    leadAutomation,
    /name="yolen-lead-document"/,
  )
  assert.match(
    leadAutomation,
    /CPF\/CNPJ \(opcional\)/,
  )
  assert.match(
    leadAutomation,
    /cpf_cnpj:\s*document \|\| null/,
  )
})

test('B2 valida, protege duplicidade e persiste documento por empresa', () => {
  assert.match(createLeadRoute, /cpf_cnpj\?: unknown/)
  assert.match(createLeadRoute, /isValidCPF/)
  assert.match(createLeadRoute, /isValidCNPJ/)
  assert.match(createLeadRoute, /isValidDocument/)
  assert.match(createLeadRoute, /invalid_document/)
  assert.match(createLeadRoute, /document_lead_conflict/)
  assert.match(createLeadRoute, /DOCUMENT_SEARCH_ERROR/)
  assert.match(createLeadRoute, /lead_profiles/)
  assert.match(createLeadRoute, /leadProfilePayload\.cpf = document/)
  assert.match(createLeadRoute, /leadProfilePayload\.cnpj = document/)
  assert.match(createLeadRoute, /cpf_cnpj: document/)
  assert.match(
    createLeadRoute,
    /\.eq\('company_id', tokenPayload\.company_id\)/,
  )
})
