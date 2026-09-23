import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const yolenApi =
  readFileSync(
    new URL(
      '../src/yolen-api.js',
      import.meta.url,
    ),
    'utf8',
  )

const background =
  readFileSync(
    new URL(
      '../src/background.js',
      import.meta.url,
    ),
    'utf8',
  )

const route =
  readFileSync(
    new URL(
      '../../../api/companion/enrich-lead/route.ts',
      import.meta.url,
    ),
    'utf8',
  )

// STEP 2B.5-D1.1 (hardening): a validação de ciclo/ownership/status, o
// stale-check, os conflitos de e-mail/documento e a chamada da RPC foram
// extraídos para este núcleo compartilhado com
// app/api/companion/apply-manychat-lead-enrichment/route.ts — o
// enrich-lead/route.ts continua dono só do token/membership/profile e do
// contrato de entrada (leadId conhecido pelo WhatsApp).
const core =
  readFileSync(
    new URL(
      '../../../lib/server/lead-enrichment-apply-core.ts',
      import.meta.url,
    ),
    'utf8',
  )

test('B2 confirmação usa transporte autenticado do Companion', () => {
  assert.match(
    yolenApi,
    /applyLeadEnrichment/,
  )

  assert.match(
    yolenApi,
    /APPLY_LEAD_ENRICHMENT/,
  )

  assert.match(
    background,
    /APPLY_LEAD_ENRICHMENT/,
  )

  assert.match(
    background,
    /\/api\/companion\/enrich-lead/,
  )

  assert.match(
    route,
    /verifyCompanionRequestToken/,
  )
})

test('B2 confirmação valida membership atual, empresa, ciclo e carteira', () => {
  assert.match(
    route,
    /company_memberships/,
  )

  assert.match(
    route,
    /membership\.role/,
  )

  assert.match(
    core,
    /sales_cycles/,
  )

  assert.match(
    core,
    /cycle\.owner_user_id/,
  )

  assert.match(
    route,
    /tokenPayload\.company_id/,
  )

  assert.match(
    core,
    /not_cycle_owner/,
  )
})

test('B2 confirmação protege contra overwrite desatualizado e duplicidade', () => {
  assert.match(
    route,
    /expectedCurrentValue/,
  )

  assert.match(
    core,
    /stale_current_value/,
  )

  assert.match(
    core,
    /email_norm/,
  )

  assert.match(
    core,
    /email_conflict/,
  )

  assert.match(
    core,
    /document_conflict/,
  )
})

test('B2 confirmação não aceita endereço livre como escrita automática', () => {
  assert.doesNotMatch(
    core,
    /address_raw/,
  )

  assert.match(
    core,
    /confirmation:\s*'human'/,
  )
})


const contentScript =
  readFileSync(
    new URL(
      '../src/content-script.js',
      import.meta.url,
    ),
    'utf8',
  )

const styles =
  readFileSync(
    new URL(
      '../src/styles.css',
      import.meta.url,
    ),
    'utf8',
  )

// STEP 2B.5-D1 (Blocker D): a APRESENTAÇÃO dos candidatos (markup dos
// botões/labels) foi extraída para o renderer compartilhado com o
// ManyChat (companion-seller-workspace-view.js#renderLeadEnrichmentCandidatesHtml)
// — o WhatsApp continua dono de QUAIS candidatos existem e da regra de
// confirmação humana (applyLeadEnrichmentCandidate, ainda em
// content-script.js), só a composição visual mudou de arquivo.
const sellerWorkspaceView =
  readFileSync(
    new URL(
      '../src/companion-seller-workspace-view.js',
      import.meta.url,
    ),
    'utf8',
  )

test('B2 painel exige clique humano antes de atualizar cadastro', () => {
  assert.match(
    sellerWorkspaceView,
    /confirm-lead-enrichment/,
  )

  assert.match(
    sellerWorkspaceView,
    /ignore-lead-enrichment/,
  )

  assert.match(
    contentScript,
    /applyLeadEnrichmentCandidate/,
  )

  assert.match(
    contentScript,
    /confirmed_by_human:\s*true/,
  )

  assert.match(
    contentScript,
    /expected_current_value/,
  )

  assert.match(
    sellerWorkspaceView,
    /O cadastro só muda depois que você confirmar/,
  )
})

test('B2 ignorar candidato não chama API de atualização', () => {
  assert.match(
    contentScript,
    /ignoredLeadEnrichmentCandidateKeys/,
  )

  assert.match(
    contentScript,
    /ignoreLeadEnrichmentCandidate/,
  )

  assert.match(
    contentScript,
    /ignoredLeadEnrichmentCandidateKeys[\s\S]*\.add\(candidateKey\)/,
  )
})

const manyChatController =
  readFileSync(
    new URL(
      '../src/companion-lead-enrichment-controller.js',
      import.meta.url,
    ),
    'utf8',
  )

const manyChatRuntime =
  readFileSync(
    new URL(
      '../src/manychat-seller-panel-runtime.js',
      import.meta.url,
    ),
    'utf8',
  )

test('STEP 2B.5-D1.1 (hardening): ManyChat usa action privilegiada própria e NUNCA conhece/envia lead_id', () => {
  assert.match(
    background,
    /APPLY_MANYCHAT_LEAD_ENRICHMENT/,
  )

  assert.match(
    background,
    /\/api\/companion\/apply-manychat-lead-enrichment/,
  )

  assert.match(
    manyChatController,
    /APPLY_MANYCHAT_LEAD_ENRICHMENT/,
  )

  assert.doesNotMatch(
    manyChatController,
    /leadId/,
  )

  assert.doesNotMatch(
    manyChatRuntime,
    /leadId/,
  )
})

test('B2 confirmação possui estado visual de salvamento', () => {
  assert.match(
    sellerWorkspaceView,
    /Salvando\.\.\./,
  )

  assert.match(
    sellerWorkspaceView,
    /Atualizado/,
  )

  assert.match(
    styles,
    /yolen-enrichment-actions/,
  )
})
