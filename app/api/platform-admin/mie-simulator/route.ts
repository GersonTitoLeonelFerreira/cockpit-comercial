import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

import {
  appendInboundMessage,
  startSimulatorConversation,
  type SimulatorMessage,
} from '@/app/lib/companion/message-intelligence/simulator/conversation-engine'

import {
  generateSimulatorCustomerReply,
} from '@/app/lib/companion/message-intelligence/simulator/customer-ai'

import {
  getSimulatorScenario,
} from '@/app/lib/companion/message-intelligence/simulator/scenarios'

import {
  runSimulatorMie,
} from '@/app/lib/companion/message-intelligence/simulator/run-simulator-mie'

type SimulatorRequestBody = {
  action?: unknown
  scenario?: unknown
  conversation?: unknown
  seller_intent?: unknown
}

function isSimulatorMessage(
  value: unknown,
): value is SimulatorMessage {
  if (!value || typeof value !== 'object') return false

  const record = value as Record<string, unknown>

  return (
    typeof record.id === 'string' &&
    (record.direction === 'inbound' || record.direction === 'outbound') &&
    typeof record.text === 'string' &&
    typeof record.occurred_at === 'string'
  )
}

function parseConversation(value: unknown): SimulatorMessage[] | null {
  if (!Array.isArray(value)) return null
  if (!value.every(isSimulatorMessage)) return null
  return value as SimulatorMessage[]
}

async function requirePlatformAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anon) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'ENV ausente: NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY.' },
        { status: 500 },
      ),
    }
  }

  const cookieStore = await cookies()

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll() {
        // API route de validação de sessão.
      },
    },
  })

  const { data: auth, error: authError } = await supabase.auth.getUser()

  if (authError || !auth?.user?.id) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Não autenticado.' }, { status: 401 }),
    }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, is_active_global, is_platform_admin')
    .eq('id', auth.user.id)
    .maybeSingle()

  if (profileError || !profile) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Perfil não encontrado.' }, { status: 403 }),
    }
  }

  if (profile.is_active_global === false) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Usuário globalmente inativo.' }, { status: 403 }),
    }
  }

  if (profile.is_platform_admin !== true) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Acesso restrito ao admin da plataforma.' },
        { status: 403 },
      ),
    }
  }

  return { ok: true as const }
}

export async function POST(req: Request) {
  const authCheck = await requirePlatformAdmin()

  if (!authCheck.ok) {
    return authCheck.response
  }

  try {
    const body = (await req.json().catch(() => null)) as SimulatorRequestBody | null

    if (!body || typeof body.scenario !== 'string') {
      return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 })
    }

    const scenario = getSimulatorScenario(body.scenario)

    if (!scenario) {
      return NextResponse.json({ error: 'Cenário desconhecido.' }, { status: 400 })
    }

    const nowIso = new Date().toISOString()

    if (body.action === 'start') {
      const conversation = startSimulatorConversation({
        initial_message: scenario.initial_message,
        reference_time: nowIso,
      })

      return NextResponse.json({ ok: true, conversation })
    }

    if (body.action === 'client_reply') {
      const conversation = parseConversation(body.conversation)

      if (!conversation || conversation.length === 0) {
        return NextResponse.json({ error: 'Conversa inválida.' }, { status: 400 })
      }

      const replyText = await generateSimulatorCustomerReply({
        scenario,
        conversation,
      })

      const nextConversation = appendInboundMessage(
        conversation,
        replyText,
        new Date().toISOString(),
      )

      return NextResponse.json({ ok: true, conversation: nextConversation })
    }

    if (body.action === 'run_mie') {
      const conversation = parseConversation(body.conversation)
      const sellerIntent =
        typeof body.seller_intent === 'string' ? body.seller_intent.trim() : ''

      if (!conversation || conversation.length === 0) {
        return NextResponse.json({ error: 'Conversa inválida.' }, { status: 400 })
      }

      if (!sellerIntent) {
        return NextResponse.json(
          { error: 'Descreva a intenção do vendedor antes de gerar com o MIE.' },
          { status: 400 },
        )
      }

      const result = await runSimulatorMie({
        scenario,
        conversation,
        seller_intent: sellerIntent,
        reference_time: new Date().toISOString(),
      })

      return NextResponse.json({ ok: true, result })
    }

    return NextResponse.json({ error: 'Ação desconhecida.' }, { status: 400 })
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Erro inesperado.',
      },
      { status: 500 },
    )
  }
}
