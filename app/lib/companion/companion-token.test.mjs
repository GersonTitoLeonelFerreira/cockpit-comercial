import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createCompanionToken,
  verifyCompanionRequestToken,
  verifyCompanionTokenValue,
} from '../server/companion-token.ts'

const ORIGINAL_COMPANION_TOKEN_SECRET =
  process.env.COMPANION_TOKEN_SECRET

const NOW = 2_000_000_000

const VALID_PAYLOAD = {
  sub: '10000000-0000-4000-8000-000000000001',
  company_id: '20000000-0000-4000-8000-000000000001',
  role: 'member',
  iat: NOW - 60,
  exp: NOW + 3600,
}

process.env.COMPANION_TOKEN_SECRET =
  'companion-test-secret-with-sufficient-entropy'

test.after(() => {
  if (ORIGINAL_COMPANION_TOKEN_SECRET === undefined) {
    delete process.env.COMPANION_TOKEN_SECRET
    return
  }

  process.env.COMPANION_TOKEN_SECRET =
    ORIGINAL_COMPANION_TOKEN_SECRET
})

test('cria e verifica um token válido do Companion', () => {
  const token = createCompanionToken(VALID_PAYLOAD)

  assert.deepEqual(
    verifyCompanionTokenValue(token, NOW),
    VALID_PAYLOAD,
  )
})

test('extrai o token Bearer de uma requisição', () => {
  const token = createCompanionToken(VALID_PAYLOAD)

  const request = new Request(
    'https://cockpit-comercial-vocn.vercel.app/api/companion/capture/messages',
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  )

  assert.deepEqual(
    verifyCompanionRequestToken(request, NOW),
    VALID_PAYLOAD,
  )
})

test('rejeita requisição sem token Bearer', () => {
  const request = new Request(
    'https://cockpit-comercial-vocn.vercel.app/api/companion/capture/messages',
  )

  assert.equal(
    verifyCompanionRequestToken(request, NOW),
    null,
  )
})

test('rejeita token com assinatura modificada', () => {
  const token = createCompanionToken(VALID_PAYLOAD)
  const [payload, signature] = token.split('.')

  const modifiedSignature = `${signature.slice(0, -1)}${
    signature.endsWith('a') ? 'b' : 'a'
  }`

  assert.equal(
    verifyCompanionTokenValue(
      `${payload}.${modifiedSignature}`,
      NOW,
    ),
    null,
  )
})

test('rejeita token expirado', () => {
  const token = createCompanionToken({
    ...VALID_PAYLOAD,
    iat: NOW - 7200,
    exp: NOW - 1,
  })

  assert.equal(
    verifyCompanionTokenValue(token, NOW),
    null,
  )
})

test('rejeita papel inválido no conteúdo assinado', () => {
  const token = createCompanionToken({
    ...VALID_PAYLOAD,
    role: 'platform-admin',
  })

  assert.equal(
    verifyCompanionTokenValue(token, NOW),
    null,
  )
})

test('rejeita token estruturalmente inválido', () => {
  assert.equal(
    verifyCompanionTokenValue('token-invalido', NOW),
    null,
  )

  assert.equal(
    verifyCompanionTokenValue('parte1.parte2.parte3', NOW),
    null,
  )
})