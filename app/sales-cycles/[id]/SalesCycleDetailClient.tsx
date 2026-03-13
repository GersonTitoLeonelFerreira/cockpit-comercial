'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { SalesCycle, LeadStatus } from '@/app/types/sales_cycles'
import { moveCycleStage, setNextAction, closeCycleWon, closeCycleLost } from '@/app/lib/services/sales-cycles'

const STATUS_OPTIONS: LeadStatus[] = ['novo', 'contato', 'respondeu', 'negociacao', 'ganho', 'perdido']

interface SalesCycleDetailClientProps {
  cycle: SalesCycle & { leads?: any }
}

/**
 * Client component para ações do ciclo
 */
export default function SalesCycleDetailClient({ cycle }: SalesCycleDetailClientProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [showActionModal, setShowActionModal] = useState(false)
  const [showCloseModal, setShowCloseModal] = useState<'won' | 'lost' | null>(null)
  const [action, setAction] = useState('')
  const [actionDate, setActionDate] = useState('')
  const [closeValue, setCloseValue] = useState('')

  // ============================================================================
  // Move stage
  // ============================================================================

  const handleMoveStage = async (newStatus: LeadStatus) => {
    if (newStatus === cycle.status) return

    setLoading(true)
    try {
      await moveCycleStage({
        cycle_id: cycle.id,
        to_status: newStatus,
      })
      router.refresh()
    } catch (err: any) {
      alert(`Erro: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  // ============================================================================
  // Set next action
  // ============================================================================

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
      alert(`Erro: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  // ============================================================================
  // Close cycle
  // ============================================================================

  const handleCloseWon = async () => {
    setLoading(true)
    try {
      await closeCycleWon({
        cycle_id: cycle.id,
        won_value: closeValue ? parseFloat(closeValue) : undefined,
      })
      setCloseValue('')
      setShowCloseModal(null)
      router.refresh()
    } catch (err: any) {
      alert(`Erro: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleCloseLost = async () => {
    setLoading(true)
    try {
      await closeCycleLost({
        cycle_id: cycle.id,
        loss_reason: closeValue || undefined,
      })
      setCloseValue('')
      setShowCloseModal(null)
      router.refresh()
    } catch (err: any) {
      alert(`Erro: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const isClosed = cycle.status === 'ganho' || cycle.status === 'perdido'

  return (
    <>
      {/* Status selector */}
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 mb-6">
        <h3 className="text-sm font-bold text-gray-400 uppercase mb-3">
          Mover para
        </h3>

        <div className="space-y-2">
          {STATUS_OPTIONS.map((status) => (
            <button
              key={status}
              onClick={() => handleMoveStage(status)}
              disabled={loading || isClosed || status === cycle.status}
              className={`w-full px-3 py-2 rounded text-sm font-semibold transition-colors ${
                status === cycle.status
                  ? 'bg-blue-700 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-50'
              }`}
            >
              {status.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div className="space-y-3">
        <button
          onClick={() => setShowActionModal(true)}
          disabled={loading || isClosed}
          className="w-full px-4 py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white rounded font-semibold transition-colors"
        >
          ✏️ Próxima Ação
        </button>

        {!isClosed && (
          <>
            <button
              onClick={() => setShowCloseModal('won')}
              disabled={loading}
              className="w-full px-4 py-2 bg-green-700 hover:bg-green-600 text-white rounded font-semibold transition-colors"
            >
              ✅ Ciclo Ganho
            </button>

            <button
              onClick={() => setShowCloseModal('lost')}
              disabled={loading}
              className="w-full px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded font-semibold transition-colors"
            >
              ❌ Ciclo Perdido
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
                <label className="block text-sm text-gray-300 mb-2">
                  Data e Hora
                </label>
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

      {/* Close Modal */}
      {showCloseModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 w-96">
            <h3 className="text-lg font-bold text-white mb-4">
              {showCloseModal === 'won' ? '✅ Ciclo Ganho' : '❌ Ciclo Perdido'}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-300 mb-2">
                  {showCloseModal === 'won' ? 'Valor' : 'Motivo da Perda'}
                </label>
                <input
                  type={showCloseModal === 'won' ? 'number' : 'text'}
                  value={closeValue}
                  onChange={(e) => setCloseValue(e.target.value)}
                  placeholder={
                    showCloseModal === 'won'
                      ? 'Ex: 5000.00'
                      : 'Ex: Concorrência'
                  }
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-500"
                  disabled={loading}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowCloseModal(null)
                    setCloseValue('')
                  }}
                  className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
                  disabled={loading}
                >
                  Cancelar
                </button>
                <button
                  onClick={
                    showCloseModal === 'won'
                      ? handleCloseWon
                      : handleCloseLost
                  }
                  className={`flex-1 px-4 py-2 text-white rounded transition-colors ${
                    showCloseModal === 'won'
                      ? 'bg-green-700 hover:bg-green-600'
                      : 'bg-red-700 hover:bg-red-600'
                  }`}
                  disabled={loading}
                >
                  {loading ? 'Salvando...' : 'Confirmar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}