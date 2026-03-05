'use client'

import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'next/navigation'

export default function AddInteraction({ leadId, userId }: { leadId: string, userId: string }) {
  const router = useRouter()

  const [type, setType] = useState('whatsapp')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)

  const salvar = async () => {
    if (loading) return
    if (!note.trim()) {
      alert('Escreva uma observação.')
      return
    }

    setLoading(true)

    const { error } = await supabase
      .from('lead_interactions')
      .insert({
        lead_id: leadId,
        user_id: userId,
        type,
        note
      })

    setLoading(false)

    if (error) {
      alert('Erro: ' + error.message)
      return
    }

    setNote('')
    router.refresh()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <select value={type} onChange={(e) => setType(e.target.value)}>
        <option value="whatsapp">WhatsApp</option>
        <option value="ligacao">Ligação</option>
        <option value="visita">Visita</option>
        <option value="followup">Follow-up</option>
        <option value="outro">Outro</option>
      </select>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Escreva o que aconteceu (ex: não atendeu, pediu valores, marcou visita...)"
        style={{ minHeight: 90 }}
      />

      <button onClick={salvar} disabled={loading}>
        {loading ? 'Salvando...' : 'Salvar interação'}
      </button>
    </div>
  )
}
