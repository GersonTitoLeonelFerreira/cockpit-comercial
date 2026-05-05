'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { setNextAction as saveNextAction } from '@/app/lib/services/sales-cycles'
import { toLocalDatetimeInputValue } from '@/app/lib/dateUtils'

function getErrorMessage(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : 'Erro ao atualizar próxima ação.'
}

export default function NextContactForm({
  cycleId,
  initialAction,
  initialNextActionDate,
}: {
  cycleId: string
  initialAction?: string | null
  initialNextActionDate?: string | null
}) {
  const router = useRouter()

  const [nextAction, setNextAction] = useState(initialAction ?? '')
  const [nextActionDate, setNextActionDate] = useState(
    initialNextActionDate ? toLocalDatetimeInputValue(initialNextActionDate) : ''
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const salvar = async () => {
    if (loading) return

    if (!cycleId) {
      setError('Ciclo comercial não encontrado.')
      return
    }

    if (!nextActionDate) {
      setError('Defina a data/hora da próxima ação.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      await saveNextAction({
        cycle_id: cycleId,
        next_action: nextAction.trim() || 'Próxima ação',
        next_action_date: new Date(nextActionDate),
      })

      router.refresh()
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {error && (
        <div
          style={{
            border: '1px solid rgba(239,68,68,0.35)',
            background: 'rgba(239,68,68,0.10)',
            color: '#fecaca',
            borderRadius: 10,
            padding: 10,
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}

      <input
        value={nextAction}
        onChange={(e) => setNextAction(e.target.value)}
        placeholder="Próxima ação (ex: WhatsApp com proposta / ligar / follow-up)"
      />

      <input
        type="datetime-local"
        value={nextActionDate}
        onChange={(e) => setNextActionDate(e.target.value)}
      />

      <button onClick={salvar} disabled={loading}>
        {loading ? 'Salvando...' : 'Salvar próxima ação'}
      </button>
    </div>
  )
}