'use client'

import { supabase } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Props = {
  leadId: string
  userId: string
  phone: string | null
  leadName: string
}

function onlyDigits(v: string) {
  return v.replace(/\D/g, '')
}

// Se o número já vier com DDI/DDD ok, beleza.
// Se vier só com 11 dígitos (DDD+cel), a gente assume Brasil.
function toWhatsappLink(phone: string, text: string) {
  const digits = onlyDigits(phone)
  const withCountry = digits.startsWith('55') ? digits : `55${digits}`
  const encoded = encodeURIComponent(text)
  return `https://wa.me/${withCountry}?text=${encoded}`
}

export default function QuickActions({ leadId, userId, phone, leadName }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)

  const addInteraction = async (type: string, note?: string) => {
    setLoading(type)

    // 1) registra interação
    const { error: logErr } = await supabase.from('lead_interactions').insert({
      lead_id: leadId,
      user_id: userId,
      type,
      note: note ?? null,
    })

    if (logErr) {
      alert('Erro ao registrar interação: ' + logErr.message)
      setLoading(null)
      return
    }

    // 2) se for "sem_resposta" ou "ligacao", agenda retorno automático +1 dia (09:00)
    if (type === 'sem_resposta' || type === 'ligacao') {
      const next = new Date()
      next.setDate(next.getDate() + 1)
      next.setHours(9, 0, 0, 0)

      const { error: updErr } = await supabase
        .from('leads')
        .update({
          next_action: 'Retomar contato',
          next_contact_at: next.toISOString(),
        })
        .eq('id', leadId)

      if (updErr) {
        alert('Interação salva, mas erro ao agendar próximo contato: ' + updErr.message)
        setLoading(null)
        return
      }
    }

    setLoading(null)
    router.refresh()
  }

  const openWhatsapp = async () => {
    if (!phone) {
      alert('Esse lead não tem telefone.')
      return
    }

    // registra que você chamou no WhatsApp
    await addInteraction('whatsapp', 'Iniciei conversa no WhatsApp')

    // abre o WhatsApp em nova aba
    const msg = `Olá ${leadName}, tudo bem? Aqui é da Engenharia do Corpo.`
    window.open(toWhatsappLink(phone, msg), '_blank', 'noopener,noreferrer')
  }

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      <button
        onClick={openWhatsapp}
        disabled={!!loading}
        style={{
          padding: '10px 12px',
          borderRadius: 10,
          border: '1px solid #2a2',
          background: '#0f1a0f',
          color: 'white',
          cursor: 'pointer',
        }}
      >
        {loading === 'whatsapp' ? 'Abrindo...' : 'WhatsApp'}
      </button>

      <button
        onClick={() => addInteraction('ligacao', 'Liguei para o lead')}
        disabled={!!loading}
        style={{
          padding: '10px 12px',
          borderRadius: 10,
          border: '1px solid #333',
          background: '#111',
          color: 'white',
          cursor: 'pointer',
        }}
      >
        {loading === 'ligacao' ? 'Salvando...' : 'Liguei'}
      </button>

      <button
        onClick={() => addInteraction('sem_resposta', 'Sem resposta')}
        disabled={!!loading}
        style={{
          padding: '10px 12px',
          borderRadius: 10,
          border: '1px solid #633',
          background: '#1a0f0f',
          color: 'white',
          cursor: 'pointer',
        }}
      >
        {loading === 'sem_resposta' ? 'Salvando...' : 'Sem resposta'}
      </button>
    </div>
  )
}
