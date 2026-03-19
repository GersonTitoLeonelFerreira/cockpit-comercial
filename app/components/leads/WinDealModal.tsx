'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabaseBrowser } from '@/app/lib/supabaseBrowser'
import * as salesAnalytics from '@/app/lib/services/sales-analytics'

type WinDealModalProps = {
  isOpen: boolean
  dealId: string
  dealName?: string
  ownerUserId?: string
  onClose: () => void
  onSuccess: () => void
}

type RevenueOption = {
  ref_date: string
  real_value: number
  seller_id: string
}

export function WinDealModal({
  isOpen,
  dealId,
  dealName,
  ownerUserId,
  onClose,
  onSuccess,
}: WinDealModalProps) {
  const supabase = useMemo(() => supabaseBrowser(), [])

  // Estado
  const [wonValue, setWonValue] = useState('')
  const [winMethod, setWinMethod] = useState<'manual' | 'revenue'>('manual')

  // ✅ Antes era um select de datas existentes; agora é uma data livre (YYYY-MM-DD)
  const [revenueDate, setRevenueDate] = useState<string>('')

  // Mantém o carregamento apenas para não quebrar o botão “Receita”
  // (você pode remover depois se não precisar mais)
  const [revenueOptions, setRevenueOptions] = useState<RevenueOption[]>([])

  const [winNote, setWinNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Carregar “opções” (mantido só para compatibilidade/estado, não é mais obrigatório escolher data existente)
  useEffect(() => {
    if (!isOpen || !ownerUserId) return

    const loadRevenueOptions = async () => {
      try {
        setLoading(true)
        setError(null)

        const { data, error: err } = await supabase
          .from('v_revenue_daily_seller')
          .select('ref_date, real_value, seller_id')
          .eq('seller_id', ownerUserId)
          .gt('real_value', 0)
          .order('ref_date', { ascending: false })
          .limit(30)

        if (err) throw err

        setRevenueOptions(data || [])
      } catch (e: any) {
        setError(e?.message || 'Erro ao carregar receitas')
        console.error('Erro:', e)
      } finally {
        setLoading(false)
      }
    }

    loadRevenueOptions()
  }, [isOpen, ownerUserId, supabase])

  // Quando abrir no modo receita, defaultar a data para hoje (facilita)
  useEffect(() => {
    if (!isOpen) return
    if (winMethod !== 'revenue') return

    // YYYY-MM-DD no timezone local
    const today = new Date()
    const yyyy = today.getFullYear()
    const mm = String(today.getMonth() + 1).padStart(2, '0')
    const dd = String(today.getDate()).padStart(2, '0')
    setRevenueDate((prev) => prev || `${yyyy}-${mm}-${dd}`)
  }, [isOpen, winMethod])

  // Handler para salvar
  const handleSave = async () => {
    if (!wonValue) {
      setError('Preencha o valor da venda')
      return
    }

    const value = parseFloat(wonValue)
    if (isNaN(value) || value <= 0) {
      setError('Valor deve ser maior que 0')
      return
    }

    // ✅ regra nova: no modo "receita", a data é obrigatória (livre)
    if (winMethod === 'revenue' && !revenueDate) {
      setError('Selecione a data da receita')
      return
    }

    try {
      setSaving(true)
      setError(null)

      await salesAnalytics.markDealWonWithRevenue(
        dealId,
        value,
        winMethod === 'revenue' ? revenueDate : undefined,
        winNote || undefined
      )

      // Sucesso!
      setWonValue('')
      setWinNote('')
      setRevenueDate('')
      setWinMethod('manual')

      onSuccess()
      onClose()
    } catch (e: any) {
      setError(e?.message || 'Erro ao salvar')
      console.error('Erro:', e)
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#111',
          border: '1px solid #333',
          borderRadius: 12,
          padding: 24,
          width: '90%',
          maxWidth: 500,
          color: 'white',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 20 }}>
          ✅ Marcar Deal como Ganho
        </div>

        {dealName && (
          <div
            style={{
              fontSize: 12,
              opacity: 0.7,
              marginBottom: 16,
              padding: '8px 12px',
              background: '#0f0f0f',
              borderRadius: 6,
              border: '1px solid #222',
            }}
          >
            <strong>Deal:</strong> {dealName}
          </div>
        )}

        {/* Erro */}
        {error && (
          <div
            style={{
              fontSize: 12,
              background: '#7f1d1d',
              color: '#fecaca',
              padding: 10,
              borderRadius: 6,
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        )}

        {/* Método de Preenchimento */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 900, display: 'block', marginBottom: 8 }}>
            Como preencher o valor?
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setWinMethod('manual')}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 6,
                border: winMethod === 'manual' ? '2px solid #10b981' : '1px solid #2a2a2a',
                background: winMethod === 'manual' ? '#10b98120' : '#0f0f0f',
                color: 'white',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 900,
              }}
            >
              📝 Manual
            </button>
            <button
              onClick={() => setWinMethod('revenue')}
              // ✅ antes travava se não tivesse opções; agora pode sempre
              disabled={loading}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 6,
                border: winMethod === 'revenue' ? '2px solid #10b981' : '1px solid #2a2a2a',
                background: winMethod === 'revenue' ? '#10b98120' : '#0f0f0f',
                color: 'white',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: 12,
                fontWeight: 900,
                opacity: loading ? 0.5 : 1,
              }}
            >
              💰 Receita
            </button>
          </div>
        </div>

        {/* Seletor de Receita (agora é data livre) */}
        {winMethod === 'revenue' && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 900, display: 'block', marginBottom: 8 }}>
              Data da Receita
            </label>

            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="date"
                value={revenueDate}
                onChange={(e) => setRevenueDate(e.target.value)}
                disabled={saving}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: 6,
                  border: '1px solid #2a2a2a',
                  background: '#0f0f0f',
                  color: 'white',
                  fontSize: 12,
                }}
              />

              <button
                type="button"
                onClick={() => {
                  const today = new Date()
                  const yyyy = today.getFullYear()
                  const mm = String(today.getMonth() + 1).padStart(2, '0')
                  const dd = String(today.getDate()).padStart(2, '0')
                  setRevenueDate(`${yyyy}-${mm}-${dd}`)
                }}
                disabled={saving}
                style={{
                  padding: '10px 12px',
                  borderRadius: 6,
                  border: '1px solid #2a2a2a',
                  background: '#0f0f0f',
                  color: 'white',
                  fontSize: 12,
                  fontWeight: 900,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.5 : 1,
                  whiteSpace: 'nowrap',
                }}
              >
                Hoje
              </button>
            </div>

            {/* dica: mostra últimas receitas só como referência, não como obrigação */}
            {loading ? (
              <div style={{ fontSize: 12, opacity: 0.6, marginTop: 8 }}>Carregando receitas...</div>
            ) : revenueOptions.length > 0 ? (
              <div style={{ fontSize: 11, opacity: 0.65, marginTop: 8 }}>
                Últimas datas com receita: {revenueOptions.slice(0, 3).map((r) => r.ref_date).join(', ')}
              </div>
            ) : null}
          </div>
        )}

        {/* Valor da Venda */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 900, display: 'block', marginBottom: 8 }}>
            Valor da Venda (R$)
          </label>
          <input
            type="number"
            step="0.01"
            placeholder="0.00"
            value={wonValue}
            onChange={(e) => setWonValue(e.target.value)}
            disabled={saving}
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: 6,
              border: '1px solid #2a2a2a',
              background: '#0f0f0f',
              color: 'white',
              fontSize: 12,
              opacity: saving ? 0.7 : 1,
            }}
          />
        </div>

        {/* Nota (opcional) */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, fontWeight: 900, display: 'block', marginBottom: 8 }}>
            Nota (opcional)
          </label>
          <textarea
            placeholder="Ex: Contrato assinado, confirmação recebida..."
            value={winNote}
            onChange={(e) => setWinNote(e.target.value)}
            disabled={saving}
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: 6,
              border: '1px solid #2a2a2a',
              background: '#0f0f0f',
              color: 'white',
              fontSize: 12,
              minHeight: 60,
              resize: 'vertical',
              opacity: saving ? 0.7 : 1,
            }}
          />
        </div>

        {/* Botões */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleSave}
            disabled={saving || !wonValue || (winMethod === 'revenue' && !revenueDate)}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: 6,
              border: 'none',
              background: '#10b981',
              color: 'white',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontWeight: 900,
              fontSize: 12,
              opacity: saving || !wonValue || (winMethod === 'revenue' && !revenueDate) ? 0.5 : 1,
            }}
          >
            {saving ? '⏳ Salvando...' : '✓ Confirmar Ganho'}
          </button>
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: 6,
              border: '1px solid #2a2a2a',
              background: '#111',
              color: 'white',
              cursor: 'pointer',
              fontWeight: 900,
              fontSize: 12,
              opacity: saving ? 0.7 : 1,
            }}
          >
            ✕ Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}