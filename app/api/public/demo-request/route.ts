import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

function onlyDigits(v: string) {
  return (v || '').replace(/\D/g, '')
}

function buildQualifiedMessage(input: {
  message: string | null
  teamSize: string | null
  currentControl: string | null
  mainBottleneck: string | null
  leadsVolume: string | null
  timeline: string | null
}) {
  const sections: string[] = []

  if (input.message) {
    sections.push(`Contexto informado pelo lead:\n${input.message}`)
  }

  sections.push('Qualificação comercial:')
  sections.push(`- Tamanho do time comercial: ${input.teamSize || '-'}`)
  sections.push(`- Controle atual dos leads: ${input.currentControl || '-'}`)
  sections.push(`- Principal gargalo: ${input.mainBottleneck || '-'}`)
  sections.push(`- Volume de leads por mês: ${input.leadsVolume || '-'}`)
  sections.push(`- Prazo para estruturar: ${input.timeline || '-'}`)

  return sections.join('\n\n')
}

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const name = (body?.name || '').trim()
    const company = (body?.company || '').trim() || null
    const whatsapp = onlyDigits(body?.whatsapp || '') || null
    const email = (body?.email || '').trim() || null
    const segment = (body?.segment || '').trim() || null

    const teamSize = (body?.teamSize || '').trim() || null
    const currentControl = (body?.currentControl || '').trim() || null
    const mainBottleneck = (body?.mainBottleneck || '').trim() || null
    const leadsVolume = (body?.leadsVolume || '').trim() || null
    const timeline = (body?.timeline || '').trim() || null
    const message = (body?.message || '').trim() || null

    if (!name) {
      return NextResponse.json({ error: 'Informe seu nome.' }, { status: 400 })
    }

    if (!whatsapp && !email) {
      return NextResponse.json({ error: 'Informe WhatsApp ou Email.' }, { status: 400 })
    }

    if (!currentControl) {
      return NextResponse.json({ error: 'Selecione como vocês controlam os leads hoje.' }, { status: 400 })
    }

    if (!mainBottleneck) {
      return NextResponse.json({ error: 'Selecione o principal gargalo comercial.' }, { status: 400 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const resendKey = process.env.RESEND_API_KEY
    const notifyEmail = process.env.DEMO_NOTIFY_EMAIL

    if (!url || !serviceKey) {
      return NextResponse.json({ error: 'Supabase env ausente.' }, { status: 500 })
    }

    if (!resendKey || !notifyEmail) {
      return NextResponse.json(
        { error: 'Resend env ausente (RESEND_API_KEY / DEMO_NOTIFY_EMAIL).' },
        { status: 500 }
      )
    }

    const supabase = createClient(url, serviceKey)
    const resend = new Resend(resendKey)

    const qualifiedMessage = buildQualifiedMessage({
      message,
      teamSize,
      currentControl,
      mainBottleneck,
      leadsVolume,
      timeline,
    })

    const { data: saved, error: saveErr } = await supabase
      .from('demo_requests')
      .insert({
        name,
        company,
        whatsapp,
        email,
        segment,
        message: qualifiedMessage,
        status: 'new',
      })
      .select('id, created_at')
      .single()

    if (saveErr) {
      return NextResponse.json({ error: 'Falha ao salvar: ' + saveErr.message }, { status: 400 })
    }

    const subject = `Novo diagnóstico comercial - ${company || name}`

    const text =
      `Novo pedido de diagnóstico comercial:\n\n` +
      `Nome: ${name}\n` +
      `Empresa: ${company || '-'}\n` +
      `WhatsApp: ${whatsapp || '-'}\n` +
      `Email: ${email || '-'}\n` +
      `Segmento: ${segment || '-'}\n` +
      `Tamanho do time comercial: ${teamSize || '-'}\n` +
      `Controle atual dos leads: ${currentControl || '-'}\n` +
      `Principal gargalo: ${mainBottleneck || '-'}\n` +
      `Volume de leads por mês: ${leadsVolume || '-'}\n` +
      `Prazo para estruturar: ${timeline || '-'}\n\n` +
      `Contexto livre:\n${message || '-'}\n\n` +
      `Mensagem consolidada salva no banco:\n${qualifiedMessage}\n\n` +
      `ID: ${saved?.id}\n` +
      `Data: ${saved?.created_at}\n`

    await resend.emails.send({
      from: 'Cockpit Comercial <onboarding@resend.dev>',
      to: [notifyEmail],
      subject,
      text,
    })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erro inesperado' }, { status: 500 })
  }
}