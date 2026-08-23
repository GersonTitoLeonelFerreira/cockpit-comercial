import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createCompanionToken,
  createConversationRegistrationConfirmationToken,
  verifyCompanionRequestToken,
  verifyCompanionTokenValue,
  verifyConversationRegistrationConfirmationTokenValue,
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

// ---------------------------------------------------------------------
// Token de confirmação de "Registrar conversa" (Fase 12A) — mesma
// assinatura HMAC do token de sessão acima, payload diferente.
// ---------------------------------------------------------------------

const SHA256_HEX_A =
  '27317499bfacd15346a1389d10ba1ffdbde1462a64f27e356daea31819f50ddd'

const SHA256_HEX_B =
  'd5ddc6e18cdba6839d0e25c8cc6fa8fc5b86f73f85a9c12fc62babcbf28f63bd'

const VALID_CONFIRMATION_PAYLOAD = {
  sub: '10000000-0000-4000-8000-000000000001',
  company_id: '20000000-0000-4000-8000-000000000001',
  cycle_id: '30000000-0000-4000-8000-000000000001',
  conversation_key: 'whatsapp:+5547999990001',
  watermark: SHA256_HEX_A,
  summary_hash: SHA256_HEX_B,
  exp: NOW + 600,
}

test('cria e verifica um token de confirmação válido (resumo intacto)', () => {
  const token = createConversationRegistrationConfirmationToken(VALID_CONFIRMATION_PAYLOAD)

  assert.deepEqual(
    verifyConversationRegistrationConfirmationTokenValue(token, NOW),
    VALID_CONFIRMATION_PAYLOAD,
  )
})

test('rejeita token de confirmação expirado', () => {
  const token = createConversationRegistrationConfirmationToken({
    ...VALID_CONFIRMATION_PAYLOAD,
    exp: NOW - 1,
  })

  assert.equal(verifyConversationRegistrationConfirmationTokenValue(token, NOW), null)
})

test('rejeita token de confirmação com assinatura adulterada', () => {
  const token = createConversationRegistrationConfirmationToken(VALID_CONFIRMATION_PAYLOAD)
  const [payload, signature] = token.split('.')

  const modifiedSignature = `${signature.slice(0, -1)}${signature.endsWith('a') ? 'b' : 'a'}`

  assert.equal(
    verifyConversationRegistrationConfirmationTokenValue(`${payload}.${modifiedSignature}`, NOW),
    null,
  )
})

test('rejeita token de confirmação estruturalmente inválido', () => {
  assert.equal(verifyConversationRegistrationConfirmationTokenValue('token-invalido', NOW), null)
  assert.equal(
    verifyConversationRegistrationConfirmationTokenValue('parte1.parte2.parte3', NOW),
    null,
  )
})

test('rejeita watermark ou summary_hash que não pareçam sha256 hex', () => {
  const tokenWithBadWatermark = createConversationRegistrationConfirmationToken({
    ...VALID_CONFIRMATION_PAYLOAD,
    watermark: 'nao-e-um-hash',
  })

  assert.equal(verifyConversationRegistrationConfirmationTokenValue(tokenWithBadWatermark, NOW), null)

  const tokenWithBadHash = createConversationRegistrationConfirmationToken({
    ...VALID_CONFIRMATION_PAYLOAD,
    summary_hash: 'nao-e-um-hash',
  })

  assert.equal(verifyConversationRegistrationConfirmationTokenValue(tokenWithBadHash, NOW), null)
})
