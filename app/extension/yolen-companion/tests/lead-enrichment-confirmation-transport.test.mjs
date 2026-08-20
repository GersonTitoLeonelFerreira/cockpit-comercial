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
    route,
    /sales_cycles/,
  )

  assert.match(
    route,
    /cycle\.owner_user_id/,
  )

  assert.match(
    route,
    /tokenPayload\.company_id/,
  )

  assert.match(
    route,
    /not_cycle_owner/,
  )
})

test('B2 confirmação protege contra overwrite desatualizado e duplicidade', () => {
  assert.match(
    route,
    /expectedCurrentValue/,
  )

  assert.match(
    route,
    /stale_current_value/,
  )

  assert.match(
    route,
    /email_norm/,
  )

  assert.match(
    route,
    /email_conflict/,
  )

  assert.match(
    route,
    /document_conflict/,
  )
})

test('B2 confirmação não aceita endereço livre como escrita automática', () => {
  assert.doesNotMatch(
    route,
    /address_raw/,
  )

  assert.match(
    route,
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

test('B2 painel exige clique humano antes de atualizar cadastro', () => {
  assert.match(
    contentScript,
    /confirm-lead-enrichment/,
  )

  assert.match(
    contentScript,
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
    contentScript,
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

test('B2 confirmação possui estado visual de salvamento', () => {
  assert.match(
    contentScript,
    /Salvando\.\.\./,
  )

  assert.match(
    contentScript,
    /Atualizado/,
  )

  assert.match(
    styles,
    /yolen-enrichment-actions/,
  )
})
