// Assina tokens do Companion para os testes de rota da E2, reutilizando o
// MESMO algoritmo real de `app/lib/server/companion-token.ts`
// (`createCompanionToken`) — não reimplementa a assinatura. Isso garante
// que o token assinado aqui é validado tanto pela verificação
// compartilhada (`verifyCompanionRequestToken`, usada por
// create-lead/route.ts, resolve-lead/route.ts e apply-suggestion/route.ts)
// quanto pelas verificações locais ainda duplicadas em rotas mais antigas
// (message-action/route.ts, transcribe-audio/route.ts), já que todas usam
// o mesmo formato HMAC-SHA256 sobre payload base64url.

import { createCompanionToken } from '../../server/companion-token.ts'

export const FAKE_SERVICE_ROLE_KEY = 'e2-fake-service-role-key-not-a-real-secret'
export const FAKE_SUPABASE_URL = 'http://127.0.0.1:0'

export function installFakeSupabaseEnv() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = FAKE_SUPABASE_URL
  process.env.SUPABASE_SERVICE_ROLE_KEY = FAKE_SERVICE_ROLE_KEY
  delete process.env.COMPANION_TOKEN_SECRET
}

export function buildToken({
  sub,
  companyId,
  role = 'member',
  issuedSecondsAgo = 60,
  expiresInSeconds = 6 * 60 * 60,
}) {
  const nowSeconds = Math.floor(Date.now() / 1000)

  return createCompanionToken({
    sub,
    company_id: companyId,
    role,
    iat: nowSeconds - issuedSecondsAgo,
    exp: nowSeconds + expiresInSeconds,
  })
}

export function buildExpiredToken({ sub, companyId, role = 'member' }) {
  const nowSeconds = Math.floor(Date.now() / 1000)

  return createCompanionToken({
    sub,
    company_id: companyId,
    role,
    iat: nowSeconds - 7 * 60 * 60,
    exp: nowSeconds - 60,
  })
}

export function bearerHeader(token) {
  return { authorization: `Bearer ${token}` }
}
