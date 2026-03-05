import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

type Payload = {
  leadId: string
  companyId: string
  pastedText: string
  context?: {
    leadName?: string
    leadPhone?: string | null
    leadStatus?: string
  }
}

function envFlagTrue(name: string) {
  const v = (process.env[name] ?? '').trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'on'
}

function requireEnv(name: string) {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env: ${name}`)
  return v
}

function lines(text: string) {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

function mockAnalyze(pastedText: string, ctx?: Payload['context']) {
  const lns = lines(pastedText).slice(-40) // pega só o final pra reduzir ruído
  const sample = lns.slice(-12)

  const leadName = ctx?.leadName ? ` (${ctx.leadName})` : ''
  const status = ctx?.leadStatus ? String(ctx.leadStatus) : 'indefinido'

  // Heurísticas simples só para fluxo/UX (não é “IA de verdade”)
  const summary =
    `Resumo automático (modo teste)${leadName}:\n` +
    `- Status do lead: ${status}\n` +
    `- Trecho recente da conversa:\n` +
    sample.map((x) => `  • ${x}`).join('\n')

  const objections: string[] = []
  const next_actions: string[] = []
  const highlights: string[] = []

  const fullLower = pastedText.toLowerCase()

  if (fullLower.includes('preço') || fullLower.includes('valor') || fullLower.includes('caro')) objections.push('Preço/valor')
  if (fullLower.includes('pensar') || fullLower.includes('vou ver') || fullLower.includes('depois')) objections.push('Indecisão / falta de urgência')
  if (fullLower.includes('cancel') || fullLower.includes('cancelamento')) highlights.push('Tema: cancelamento / ajuste de contrato')
  if (fullLower.includes('erro') || fullLower.includes('bug') || fullLower.includes('problema')) highlights.push('Tema: problema/erro no sistema')

  next_actions.push('Registrar o próximo passo no campo "Próximo contato" (data/hora + ação).')
  next_actions.push('Confirmar com o cliente qual a decisão e prazo para retorno.')
  if (highlights.length === 0) highlights.push('Sem destaque claro detectado (modo teste).')
  if (objections.length === 0) objections.push('Nenhuma objeção clara detectada (modo teste).')

  const sentiment =
    fullLower.includes('obrigad') || fullLower.includes('perfeito') || fullLower.includes('fechado')
      ? 'positivo'
      : fullLower.includes('problema') || fullLower.includes('ruim') || fullLower.includes('cancel')
        ? 'misto'
        : 'neutro'

  const performance_score = 65

  return {
    summary,
    highlights: highlights.slice(0, 6),
    objections: objections.slice(0, 6),
    next_actions: next_actions.slice(0, 6),
    sentiment,
    performance_score,
    techniques: ['(modo teste)'],
    risks: ['(modo teste)'],
    lost_reason_guess: null as string | null,
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Payload

    if (!body?.leadId || !body?.companyId) {
      return NextResponse.json({ error: 'leadId e companyId são obrigatórios.' }, { status: 400 })
    }

    const pastedText = (body?.pastedText ?? '').trim()
    if (pastedText.length < 40) {
      return NextResponse.json({ error: 'Cole mais conteúdo da conversa (mínimo ~40 caracteres).' }, { status: 400 })
    }

    // Supabase server client (pega o usuário logado pelos cookies)
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll() {
            // esta route não precisa escrever cookies
          },
        },
      }
    )

    const { data: auth, error: authErr } = await supabase.auth.getUser()
    const user = auth?.user
    if (authErr || !user?.id) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    const useMock = envFlagTrue('MOCK_AI')

    let parsed: any
    if (useMock) {
      parsed = mockAnalyze(pastedText, body.context)
    } else {
      const openaiKey = requireEnv('OPENAI_API_KEY')

      const ctx = body.context ?? {}
      const leadInfo = [
        ctx.leadName ? `Nome: ${ctx.leadName}` : null,
        ctx.leadPhone ? `Telefone: ${ctx.leadPhone}` : null,
        ctx.leadStatus ? `Status atual no Kanban: ${ctx.leadStatus}` : null,
      ]
        .filter(Boolean)
        .join('\n')

      const system = `
Você é um analista de atendimento e treinador de vendas.
Seu trabalho: resumir e avaliar uma conversa de WhatsApp entre um consultor e um cliente.
Responda SEMPRE em PT-BR.

Regras:
- Não invente fatos que não estejam no texto.
- Seja objetivo e acionável.
- Gere saída em JSON válido, seguindo o schema pedido.
`

      const userPrompt = `
Contexto do lead:
${leadInfo || '(sem contexto extra)'}

Conversa (texto colado do WhatsApp Web):
"""
${pastedText}
"""

Gere um JSON com o seguinte schema:
{
  "summary": "resumo curto em até 6 linhas",
  "highlights": ["pontos importantes (até 6)"],
  "objections": ["objeções percebidas (até 6)"],
  "next_actions": ["próximas ações sugeridas (até 6)"],
  "sentiment": "positivo|neutro|negativo|misto|indefinido",
  "performance_score": 0-100,
  "techniques": ["técnicas de vendas identificadas (ex.: SPIN, prova social, urgência, etc.)"],
  "risks": ["riscos (ex.: falta de qualificação, demora, objeções sem resposta)"],
  "lost_reason_guess": "se houver sinais, qual o provável motivo de perda, senão null"
}
`

      const r = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4.1-mini',
          input: [
            { role: 'system', content: system },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.2,
        }),
      })

      if (!r.ok) {
        const text = await r.text()
        return NextResponse.json({ error: `OpenAI error: ${text}` }, { status: 502 })
      }

      const data = await r.json()
      const outputText: string = data?.output?.[0]?.content?.[0]?.text ?? data?.output_text ?? ''
      if (!outputText) {
        return NextResponse.json({ error: 'IA não retornou conteúdo.' }, { status: 502 })
      }

      try {
        parsed = JSON.parse(outputText)
      } catch {
        return NextResponse.json({ error: 'IA retornou JSON inválido.', raw: outputText }, { status: 502 })
      }
    }

    const summary = String(parsed.summary ?? '').trim()
    if (!summary) {
      return NextResponse.json({ error: 'Resumo vazio.' }, { status: 502 })
    }

    const highlights = Array.isArray(parsed.highlights) ? parsed.highlights.map(String).slice(0, 10) : []
    const objections = Array.isArray(parsed.objections) ? parsed.objections.map(String).slice(0, 10) : []
    const nextActions = Array.isArray(parsed.next_actions) ? parsed.next_actions.map(String).slice(0, 10) : []

    const sentiment = parsed.sentiment ? String(parsed.sentiment) : null
    const performanceScore = Number.isFinite(Number(parsed.performance_score))
      ? Math.max(0, Math.min(100, Math.floor(Number(parsed.performance_score))))
      : 0

    // Salva SEM raw_text
    const { data: inserted, error: insErr } = await supabase
      .from('lead_conversation_analyses')
      .insert({
        company_id: body.companyId,
        lead_id: body.leadId,
        user_id: user.id,
        source: 'whatsapp_web_paste',
        summary,
        highlights,
        objections,
        next_actions: nextActions,
        performance_score: performanceScore,
        sentiment,
        analysis_json: parsed,
      })
      .select('id, created_at, summary, performance_score, sentiment')
      .single()

    if (insErr) {
      return NextResponse.json({ error: 'Erro ao salvar análise: ' + insErr.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      analysis: inserted,
      parsed,
      mode: useMock ? 'mock' : 'openai',
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 })
  }
}