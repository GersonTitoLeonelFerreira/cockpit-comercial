import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration =
  readFileSync(
    new URL(
      '../../../supabase/migrations/20260819041655_atomic_companion_lead_enrichment.sql',
      import.meta.url,
    ),
    'utf8',
  )

const route =
  readFileSync(
    new URL(
      '../../api/companion/enrich-lead/route.ts',
      import.meta.url,
    ),
    'utf8',
  )

test('B2 confirmação serializa alterações concorrentes do mesmo lead', () => {
  assert.match(
    migration,
    /from public\.leads[\s\S]*for update;/,
  )

  assert.match(
    migration,
    /from public\.lead_profiles[\s\S]*for update;/,
  )

  assert.match(
    migration,
    /stale_current_value/,
  )
})

test('B2 confirmação atualiza perfil e espelho base na mesma transação', () => {
  assert.match(
    migration,
    /update public\.lead_profiles/,
  )

  assert.match(
    migration,
    /update public\.leads/,
  )

  assert.match(
    migration,
    /email_norm = v_new_value/,
  )

  assert.match(
    migration,
    /cpf_cnpj = v_new_value/,
  )
})

test('B2 confirmação audita o clique sem duplicar PII no evento', () => {
  assert.match(
    migration,
    /lead_enrichment_confirmed/,
  )

  assert.match(
    migration,
    /confirmed_by_human/,
  )

  assert.match(
    migration,
    /evidence_message_ids/,
  )

  const metadataStart =
    migration.indexOf(
      "jsonb_build_object(\n        'source'",
    )

  assert.notEqual(
    metadataStart,
    -1,
  )

  const metadataBlock =
    migration.slice(
      metadataStart,
      migration.indexOf(
        '\n      )\n    );',
        metadataStart,
      ),
    )

  assert.doesNotMatch(
    metadataBlock,
    /v_new_value/,
  )
})

test('B2 rota não realiza mais gravação cadastral em duas etapas', () => {
  assert.match(
    route,
    /\.rpc\(\s*'companion_apply_lead_enrichment'/,
  )

  assert.doesNotMatch(
    route,
    /\.from\('leads'\)\s*\.update/,
  )

  assert.doesNotMatch(
    route,
    /\.from\('lead_profiles'\)\s*\.update/,
  )

  assert.match(
    route,
    /p_confirmed_by_human:\s*true/,
  )
})
