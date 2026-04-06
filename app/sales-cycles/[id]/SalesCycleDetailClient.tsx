'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { WinDealModal } from '@/app/components/leads/WinDealModal'
import { LostDealModal } from '@/app/components/leads/LostDealModal'
import type { SalesCycle, LeadStatus } from '@/app/types/sales_cycles'
import StageCheckpointModal from '@/app/leads/components/StageCheckpointModal'
import {
  moveCycleStage,
  setNextAction,
} from '@/app/lib/services/sales-cycles'

const STATUS_OPTIONS: LeadStatus[] = [
  'novo',
  'contato',
  'respondeu',
  'negociacao',
  'ganho',
  'perdido',
]

// “Arco” igual ao Kanban: borda colorida + glow suave + cantos bem arredondados
const STATUS_STYLE: Record<
  LeadStatus,
  { border: string; glow: string; activeBg: string; activeText: string }
> = {
  novo: {
    border: 'border-blue-500/70 hover:border-blue-400',
    glow: 'hover:shadow-[0_0_0_1px_rgba(59,130,246,0.35),0_0_18px_rgba(59,130,246,0.18)]',
    activeBg: 'bg-blue-700/40',
    activeText: 'text-blue-100',
  },
  contato: {
    border: 'border-violet-500/70 hover:border-violet-400',
    glow: 'hover:shadow-[0_0_0_1px_rgba(139,92,246,0.35),0_0_18px_rgba(139,92,246,0.18)]',
    activeBg: 'bg-violet-700/35',
    activeText: 'text-violet-100',
  },
  respondeu: {
    border: 'border-fuchsia-500/70 hover:border-fuchsia-400',
    glow: 'hover:shadow-[0_0_0_1px_rgba(217,70,239,0.35),0_0_18px_rgba(217,70,239,0.18)]',
    activeBg: 'bg-fuchsia-700/30',
    activeText: 'text-fuchsia-100',
  },
  negociacao: {
    border: 'border-orange-500/70 hover:border-orange-400',
    glow: 'hover:shadow-[0_0_0_1px_rgba(249,115,22,0.35),0_0_18px_rgba(249,115,22,0.18)]',
    activeBg: 'bg-orange-700/25',
    activeText: 'text-orange-100',
  },
  ganho: {
    border: 'border-emerald-500/70 hover:border-emerald-400',
    glow: 'hover:shadow-[0_0_0_1px_rgba(16,185,129,0.35),0_0_18px_rgba(16,185,129,0.18)]',
    activeBg: 'bg-emerald-700/25',
    activeText: 'text-emerald-100',
  },
  perdido: {
    border: 'border-red-500/70 hover:border-red-400',
    glow: 'hover:shadow-[0_0_0_1px_rgba(239,68,68,0.35),0_0_18px_rgba(239,68,68,0.18)]',
    activeBg: 'bg-red-700/25',
    activeText: 'text-red-100',
  },
}

type SalesCycleWithLead = SalesCycle & {
  leads?: {
    id?: string
    name?: string
    phone?: string | null
    email?: string | null
  }
}

interface SalesCycleDetailClientProps {
  cycle: SalesCycleWithLead
}

/**
 * Client component para ações do ciclo
 */
export default function SalesCycleDetailClient({ cycle }: SalesCycleDetailClientProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [showWinDealModal, setShowWinDealModal] = useState(false)
  const [showLostDealModal, setShowLostDealModal] = useState(false)
  const [showActionModal, setShowActionModal] = useState(false)
  const [action, setAction] = useState('')
  const [actionDate, setActionDate] = useState('')

  // ============================================================================
  // Checkpoint modal (idêntico ao Kanban)
  // ============================================================================
  const [checkpointOpen, setCheckpointOpen] = useState(false)
  const [checkpointToStatus, setCheckpointToStatus] = useState<LeadStatus>('contato')
  const [checkpointLoading, setCheckpointLoading] = useState(false)

  const openCheckpoint = (toStatus: LeadStatus) => {
    if (toStatus === cycle.status) return
    if (toStatus === 'ganho') {
      setShowWinDealModal(true)
      return
    }
    if (toStatus === 'perdido') {
      setShowLostDealModal(true)
      return
    }
    setCheckpointToStatus(toStatus)
    setCheckpointOpen(true)
  }

  const isClosed = cycle.status === 'ganho' || cycle.status === 'perdido'

  // ============================================================================
  // Move stage (agora abre o modal correto)
  // ============================================================================
  const handleMoveStage = async (newStatus: LeadStatus) => {
    openCheckpoint(newStatus)
  }

  const handleSaveAction = async () => {
    if (!action.trim() || !actionDate) {
      alert('Preencha ação e data')
      return
    }

    setLoading(true)
    try {
      await setNextAction({
        cycle_id: cycle.id,
        next_action: action,
        next_action_date: new Date(actionDate),
      })
      setAction('')
      setActionDate('')
      setShowActionModal(false)
      router.refresh()
    } catch (err: any) {
      alert(`Erro: ${err?.message ?? String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Status selector */}
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 mb-6">
        <h3 className="text-sm font-bold text-gray-400 uppercase mb-3">Mover para</h3>

        <div className="space-y-2">
          {STATUS_OPTIONS.map((status) => (
            <button
              key={status}
              onClick={() => handleMoveStage(status)}
              disabled={loading || isClosed || status === cycle.status}
              className={[
                'w-full px-3 py-2 rounded-xl text-sm font-semibold transition-all',
                'border bg-[#111827]/60 backdrop-blur-sm',
                STATUS_STYLE[status].border,
                STATUS_STYLE[status].glow,
                status === cycle.status
                  ? `${STATUS_STYLE[status].activeBg} ${STATUS_STYLE[status].activeText} shadow-[0_0_0_1px_rgba(255,255,255,0.10)]`
                  : 'text-gray-200 hover:bg-gray-700/70',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              ].join(' ')}
            >
              {status.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Modal de checkpoint para transições intermediárias */}
      <StageCheckpointModal
        open={checkpointOpen}
        fromStatus={cycle.status as any}
        toStatus={checkpointToStatus as any}
        loading={checkpointLoading}
        onCancel={() => {
          if (checkpointLoading) return
          setCheckpointOpen(false)
        }}
        onConfirm={async (payload) => {
          setCheckpointLoading(true)
          try {
            await moveCycleStage({
              cycle_id: cycle.id,
              to_status: checkpointToStatus,
              metadata: payload as any,
            })

            if (payload?.next_action && payload?.next_action_date) {
              await setNextAction({
                cycle_id: cycle.id,
                next_action: payload.next_action,
                next_action_date: payload.next_action_date,
              })
            }

            setCheckpointOpen(false)
            router.refresh()
          } catch (err: any) {
            alert(`Erro: ${err?.message ?? String(err)}`)
          } finally {
            setCheckpointLoading(false)
          }
        }}
      />

      {/* Action buttons */}
      <div className="space-y-3">
        <button
          onClick={() => setShowActionModal(true)}
          disabled={loading || isClosed}
          className="w-full px-4 py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white rounded font-semibold transition-colors"
        >
          Próxima Ação
        </button>

        {!isClosed && (
          <>
            <button
              onClick={() => setShowWinDealModal(true)}
              disabled={loading}
              className="w-full px-4 py-2 bg-green-700 hover:bg-green-600 text-white rounded font-semibold transition-colors"
            >
              Ciclo Ganho
            </button>

            <button
              onClick={() => setShowLostDealModal(true)}
              disabled={loading}
              className="w-full px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded font-semibold transition-colors"
            >
              Ciclo Perdido
            </button>
          </>
        )}
      </div>

      {/* Action Modal */}
      {showActionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 w-96">
            <h3 className="text-lg font-bold text-white mb-4">Próxima Ação</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-300 mb-2">Ação</label>
                <input
                  type="text"
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                  placeholder="Ex: Ligar para cliente"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-500"
                  disabled={loading}
                />
              </div>

              <div>
                <label className="block text-sm text-gray-300 mb-2">Data e Hora</label>
                <input
                  type="datetime-local"
                  value={actionDate}
                  onChange={(e) => setActionDate(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                  disabled={loading}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowActionModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
                  disabled={loading}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveAction}
                  className="flex-1 px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded transition-colors"
                  disabled={loading}
                >
                  {loading ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Win Deal Modal */}
      <WinDealModal
        isOpen={showWinDealModal}
        dealId={cycle.id}
        dealName={cycle?.leads?.name || 'Deal'}
        ownerUserId={cycle?.owner_user_id || undefined}
        companyId={cycle.company_id}
        onClose={() => setShowWinDealModal(false)}
        onSuccess={() => {
          router.refresh()
          setShowWinDealModal(false)
        }}
      />

      {/* Lost Deal Modal — mesmo modal do Kanban */}
      <LostDealModal
        isOpen={showLostDealModal}
        dealId={cycle.id}
        dealName={cycle?.leads?.name || 'Deal'}
        onClose={() => setShowLostDealModal(false)}
        onSuccess={() => {
          router.refresh()
          setShowLostDealModal(false)
        }}
      />
    </>
  )
}