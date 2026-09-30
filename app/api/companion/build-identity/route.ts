import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Identidade pública do deploy para o canal HOMOLOG da extensão conferir
// que extensão e backend vêm do MESMO HEAD. Expõe só ambiente e commit do
// deploy (metadados que já são públicos no repositório): nenhum segredo,
// nenhuma outra variável de ambiente, nenhuma sessão.
const COMMIT_PATTERN = /^[0-9a-f]{40}$/

const KNOWN_ENVIRONMENTS = new Set(['production', 'preview', 'development'])

const RESPONSE_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store, max-age=0',
}

function readBuildIdentity() {
  const rawCommit = String(process.env.VERCEL_GIT_COMMIT_SHA ?? '').trim().toLowerCase()
  const commit = COMMIT_PATTERN.test(rawCommit) ? rawCommit : null
  const rawEnvironment = String(process.env.VERCEL_ENV ?? '').trim()

  return {
    environment: KNOWN_ENVIRONMENTS.has(rawEnvironment) ? rawEnvironment : null,
    commit,
    commit_short: commit ? commit.slice(0, 8) : null,
  }
}

export function GET() {
  return NextResponse.json(readBuildIdentity(), { headers: RESPONSE_HEADERS })
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: RESPONSE_HEADERS })
}
