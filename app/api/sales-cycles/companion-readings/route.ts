// Leitura do Companion no cadastro do ciclo (rodada 9, Fase 2) — só no
// HML.
//
// GET /api/sales-cycles/companion-readings?cycle_id=<uuid>[&run_id=<uuid>]
//
// Com a flag da leitura completa desligada a rota responde 404 (não
// existe). Com ela ligada: sessão do Yolen, vínculo ativo com a empresa
// ativa e o ciclo visível para o usuário (RLS, as mesmas regras da página
// do ciclo) — só então as leituras são lidas, filtradas pela empresa e
// pelos ciclos conferidos. Só leitura.

import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { getAuthedSupabase } from '@/app/lib/supabase/server'
import { createFullReadingAdminClient } from '@/app/lib/server/full-reading-runner'
import { isFullReadingPanelEnabled } from '@/app/lib/server/full-reading-flag'
import { loadCycleReadings } from '@/app/lib/server/full-reading-cycle-readings'

export const dynamic = 'force-dynamic'

function json(
  body: unknown,
  status: number,
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { 'cache-control': 'no-store' },
  })
}

export async function GET(
  request: Request,
): Promise<NextResponse> {
  if (!isFullReadingPanelEnabled(process.env)) {
    return new NextResponse('Not Found', { status: 404 })
  }

  let auth: Awaited<ReturnType<typeof getAuthedSupabase>>

  try {
    auth = await getAuthedSupabase()
  } catch {
    return json({ ok: false, error: 'NOT_AUTHENTICATED' }, 401)
  }

  const admin =
    createFullReadingAdminClient()

  if (!admin) {
    return json({ ok: false, error: 'SUPABASE_CONFIGURATION_UNAVAILABLE' }, 503)
  }

  const cookieStore =
    await cookies()

  const url =
    new URL(request.url)

  const result =
    await loadCycleReadings({
      access: {
        userClient: auth.supabase,
        admin,
        userId: auth.user.id,
        activeCompanyId: cookieStore.get('cockpit_active_company_id')?.value ?? null,
      },
      cycleId: url.searchParams.get('cycle_id'),
      runId: url.searchParams.get('run_id'),
    })

  return json(result.body, result.status)
}
