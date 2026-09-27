import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const route = await readFile(
  new URL(
    '../../../api/companion/me/route.ts',
    import.meta.url,
  ),
  'utf8',
)

const background = await readFile(
  new URL(
    '../src/background.js',
    import.meta.url,
  ),
  'utf8',
)

test('sessão Companion pode reidratar identidade via Bearer sem depender de cookie do cockpit', () => {
  assert.match(
    route,
    /verifyCompanionRequestToken/,
  )
  assert.match(
    route,
    /getTokenAuthenticatedContext/,
  )
  assert.match(
    route,
    /SUPABASE_SERVICE_ROLE_KEY/,
  )
  assert.match(
    route,
    /\.from\('company_memberships'\)/,
  )
  assert.match(
    route,
    /\.from\('companies'\)/,
  )
  assert.match(
    route,
    /verifyActiveCompanionProfile/,
  )

  assert.match(
    route,
    /getAuthedSupabase/,
    'fluxo cookie-auth da página Yolen precisa continuar existindo',
  )
})

test('GET_ME do background só chama o servidor quando a identidade cacheada está ausente ou placeholder', () => {
  assert.match(
    background,
    /function needsIdentityRefresh\(session\)/,
  )
  assert.match(
    background,
    /empresa sem nome/,
  )
  assert.match(
    background,
    /empresa não carregada/,
  )
  assert.match(
    background,
    /refreshCachedSessionIdentity/,
  )
  assert.match(
    background,
    /\/api\/companion\/me/,
  )
})

test('reidratação preserva token e expiração do envelope de sessão local', () => {
  const start =
    background.indexOf(
      'const refreshedSession = {',
    )
  const end =
    background.indexOf(
      'await setCachedSession',
      start,
    )
  const block =
    background.slice(
      start,
      end,
    )

  assert.notEqual(
    start,
    -1,
  )
  assert.match(
    block,
    /companion_token:[\s\S]*token/,
  )
  assert.match(
    block,
    /expires_at:[\s\S]*cachedSession/,
  )
})
