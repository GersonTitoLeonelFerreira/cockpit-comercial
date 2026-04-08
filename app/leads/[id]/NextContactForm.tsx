'use client'

import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import { toLocalDatetimeInputValue } from '@/app/lib/dateUtils'

export default function NextContactForm({
  leadId,
  initialAction,
  initialNextContactAt
}: {
  leadId: string
  initialAction?: string | null
  initialNextContactAt?: string | null
}) {
  const router = useRouter()
  const [nextAction, setNextAction] = useState(initialAction ?? '')
  const [nextContactAt, setNextContactAt] = useState(
    initialNextContactAt ? toLocalDatetimeInputValue(initialNextContactAt) : ''
  )
  const [loading, setLoading] = useState(false)

  const salvar = async () => {
    if (!nextContactAt) {
      alert('Defina a data/hora do próximo contato.')
      return
    }

    setLoading(true)

    const { error } = await supabase
      .from('leads')
      .update({
        next_action: nextAction || null,
        next_contact_at: new Date(nextContactAt).toISOString()
      })
      .eq('id', leadId)

    setLoading(false)

    if (error) {
      alert('Erro: ' + error.message)
      return
    }

    router.refresh()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <input
        value={nextAction}
        onChange={(e) => setNextAction(e.target.value)}
        placeholder="Próxima ação (ex: WhatsApp com proposta / ligar / follow-up)"
      />

      <input
        type="datetime-local"
        value={nextContactAt}
        onChange={(e) => setNextContactAt(e.target.value)}
      />

      <button onClick={salvar} disabled={loading}>
        {loading ? 'Salvando...' : 'Salvar próximo contato'}
      </button>
    </div>
  )
}
