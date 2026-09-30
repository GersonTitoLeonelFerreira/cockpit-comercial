import assert from 'node:assert/strict'
import { register } from 'node:module'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

// Mesmo hook de resolução de next/server usado pelos testes de rota.
register(
  fileURLToPath(new URL('../../../lib/companion/e2-test-support/route-alias-resolve-loader.mjs', import.meta.url)),
  import.meta.url,
)

const { GET, OPTIONS } = await import('./route.ts')

const SHA = 'ce50089a99b3bef6ab9deb9a348a7152439908c3'

function withEnv(values, run) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]))

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  return Promise.resolve()
    .then(run)
    .finally(() => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) {
          delete process.env[key]
        } else {
          process.env[key] = value
        }
      }
    })
}

test('build-identity expõe só ambiente e commit do deploy, sem segredos e sem cache', () =>
  withEnv(
    {
      VERCEL_GIT_COMMIT_SHA: SHA,
      VERCEL_ENV: 'preview',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret-value',
      OPENAI_API_KEY: 'sk-secret-value',
      COMPANION_TOKEN_SECRET: 'token-secret-value',
    },
    async () => {
      const response = GET()
      const text = await response.clone().text()
      const payload = await response.json()

      assert.deepEqual(payload, {
        environment: 'preview',
        commit: SHA,
        commit_short: 'ce50089a',
      })
      assert.deepEqual(Object.keys(payload).sort(), ['commit', 'commit_short', 'environment'])
      for (const secret of ['service-role-secret-value', 'sk-secret-value', 'token-secret-value']) {
        assert.equal(text.includes(secret), false)
      }
      assert.match(response.headers.get('cache-control'), /no-store/)
      assert.equal(response.headers.get('access-control-allow-origin'), '*')
      assert.equal(response.headers.get('access-control-allow-credentials'), null)
    },
  ),
)

test('build-identity sem commit válido responde commit nulo (nunca inventa)', () =>
  withEnv({ VERCEL_GIT_COMMIT_SHA: 'not-a-sha; rm -rf', VERCEL_ENV: 'weird' }, async () => {
    const payload = await GET().json()

    assert.deepEqual(payload, { environment: null, commit: null, commit_short: null })
  }),
)

test('build-identity sem variáveis de deploy responde nulos', () =>
  withEnv({ VERCEL_GIT_COMMIT_SHA: undefined, VERCEL_ENV: undefined }, async () => {
    const payload = await GET().json()

    assert.deepEqual(payload, { environment: null, commit: null, commit_short: null })
  }),
)

test('build-identity responde preflight CORS', () => {
  const response = OPTIONS()

  assert.equal(response.status, 204)
  assert.match(response.headers.get('access-control-allow-methods'), /GET/)
})
