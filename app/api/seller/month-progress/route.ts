import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      error:
        'Endpoint legado desativado. Use /dashboard/simulador-meta e as RPCs de métricas por empresa ativa.',
      code: 'legacy_endpoint_disabled',
    },
    { status: 410 },
  )
}