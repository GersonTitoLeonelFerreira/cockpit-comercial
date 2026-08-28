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

const contentScript = readFileSync(
  new URL('../src/content-script.js', import.meta.url),
  'utf8',
)

const createLeadRoute = readFileSync(
  new URL(
    '../../../api/companion/create-lead/route.ts',
    import.meta.url,
  ),
  'utf8',
)

const resolveLeadRoute = readFileSync(
  new URL(
    '../../../api/companion/resolve-lead/route.ts',
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

  // O formulário de criação é montado por content-script.js na mesma
  // passada que decide o resto do card "Conversa" (getLeadActionButton()),
  // chamando de volta as funções puras que lead-automation.js expõe em
  // window.YolenCompanionLeadAutomation — não há mais um MutationObserver
  // em lead-automation.js substituindo o botão "create-lead-yolen" por
  // conta própria.
  assert.match(contentScript, /data-yolen-action="create-lead-yolen"/)
  assert.match(
    contentScript,
    /window\.YolenCompanionLeadAutomation\s*\n?\s*\?\.buildCreateLeadFormHtml/,
  )
  assert.match(leadAutomation, /window\.YolenCompanionLeadAutomation = \{/)
  assert.match(leadAutomation, /buildCreateLeadFormHtml/)
  assert.match(leadAutomation, /bindCreateLeadForm/)
  assert.match(leadAutomation, /Novo contato/)
  assert.match(leadAutomation, /Nenhum lead encontrado/)
  assert.match(leadAutomation, /name="yolen-lead-name"/)
  assert.match(leadAutomation, /name="yolen-lead-phone"/)
  assert.match(leadAutomation, /readonly/)
  assert.match(leadAutomation, /Criar lead/)
  assert.doesNotMatch(leadAutomation, /window\.open/)
})

test('B1 reconsulta o vínculo automaticamente depois da criação, sem clique sintético', () => {
  // A confirmação do backend não pode depender de clique sintético em
  // [data-yolen-action="refresh"] + setTimeout (causa raiz do BLOCKER da
  // Frente 1B) — a reconsulta é feita chamando explicitamente a mesma
  // fonte de verdade de resolução (resolveCurrentLead/resolveAfterLeadCreation),
  // nunca simulando um clique de usuário.
  assert.doesNotMatch(leadAutomation, /refreshLeadResolution/)
  assert.doesNotMatch(leadAutomation, /refreshButton/)
  assert.doesNotMatch(
    leadAutomation,
    /data-yolen-action="refresh"/,
  )
  assert.doesNotMatch(leadAutomation, /window\.setTimeout/)

  assert.match(
    leadAutomation,
    /window\.YolenCompanionLeadCreationBridge\?\.createLead/,
  )

  assert.match(contentScript, /function resolveAfterLeadCreation/)
  assert.match(contentScript, /function createLeadForCurrentConversation/)
  assert.match(
    contentScript,
    /window\.YolenCompanionLeadCreationBridge = \{/,
  )
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
  // lead-automation.js entrega "document" à bridge de criação
  // (window.YolenCompanionLeadCreationBridge); é content-script.js quem
  // conhece o contrato de fio do backend e mapeia para cpf_cnpj.
  assert.match(
    leadAutomation,
    /document:\s*document \|\| null/,
  )
  assert.match(
    contentScript,
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


test('B2 preenche cadastro inicial com dados da conversa e protege duplicidade', () => {
  assert.match(
    leadAutomation,
    /YolenCompanionLeadEnrichmentContext/,
  )

  assert.match(
    leadAutomation,
    /name="yolen-lead-email"/,
  )

  assert.match(
    leadAutomation,
    /suggestedEmail/,
  )

  assert.match(
    leadAutomation,
    /suggestedDocument/,
  )

  assert.match(
    leadAutomation,
    /email:\s*email \|\| null/,
  )

  assert.match(
    createLeadRoute,
    /email\?: unknown/,
  )

  assert.match(
    createLeadRoute,
    /isValidEmail/,
  )

  assert.match(
    createLeadRoute,
    /email_norm/,
  )

  assert.match(
    createLeadRoute,
    /leadProfilePayload\.email = email/,
  )
})

test('B2 resolve cadastro atual para comparação sem expor perfil de outra carteira', () => {
  assert.match(
    resolveLeadRoute,
    /type LeadProfileRow/,
  )

  assert.match(
    resolveLeadRoute,
    /lead_profile:/,
  )

  assert.match(
    resolveLeadRoute,
    /status === 'OWNED_BY_ME'/,
  )

  assert.match(
    resolveLeadRoute,
    /canReadLeadProfile/,
  )

  assert.match(
    resolveLeadRoute,
    /LEAD_PROFILE_SEARCH_ERROR/,
  )
})


test('B2 atualiza formulário já montado quando enriquecimento termina depois', () => {
  assert.match(
    leadAutomation,
    /function syncLeadCreationFormSuggestions/,
  )

  assert.match(
    leadAutomation,
    /context\.suggestedEmail/,
  )

  assert.match(
    leadAutomation,
    /context\.suggestedDocument/,
  )

  assert.match(
    leadAutomation,
    /!cleanText\(emailInput\.value\)/,
  )

  // bindCreateLeadForm() é chamado a cada renderPanel() (via
  // wirePanelInteractions()) e resincroniza as sugestões no formulário que
  // já está no DOM — equivalente ao "existingForm" da versão anterior,
  // que era acionado pelo MutationObserver próprio deste arquivo. O
  // contexto (conversationKey/phone/displayName) vem sempre explícito de
  // content-script.js, nunca de um lookup implícito global (ver B1B).
  assert.match(
    leadAutomation,
    /function bindCreateLeadForm\(panel, explicitContext\)[\s\S]*syncLeadCreationFormSuggestions\(\s*\n?\s*form,\s*\n?\s*context,/,
  )

  assert.match(
    leadAutomation,
    /Dados encontrados na conversa já preenchidos/,
  )
})
