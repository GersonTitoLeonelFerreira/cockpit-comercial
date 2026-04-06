'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabaseBrowser } from '@/app/lib/supabaseBrowser'
import * as salesAnalytics from '@/app/lib/services/sales-analytics'
import { listActiveProducts } from '@/app/lib/services/products'
import type { Product } from '@/app/types/product'
import type { PaymentMethod, PaymentType } from '@/app/types/sales_cycles'
import { IconCircleCheck, IconLoader, IconAlertTriangle } from '@/app/components/icons/UiIcons'

type WinDealModalProps = {
  isOpen: boolean
  dealId: string
  dealName?: string
  ownerUserId?: string
  companyId?: string
  onClose: () => void
  onSuccess: () => void
}

type RevenueOption = {
  ref_date: string
  real_value: number
  seller_id: string
}

const PAYMENT_METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: 'pix', label: 'PIX' },
  { value: 'credito', label: 'Cartão de Crédito' },
  { value: 'debito', label: 'Cartão de Débito' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'transferencia', label: 'Transferência' },
  { value: 'misto', label: 'Misto (mais de um meio)' },
  { value: 'outro', label: 'Outro' },
]

const PAYMENT_TYPE_OPTIONS: { value: PaymentType; label: string }[] = [
  { value: 'avista', label: 'À Vista' },
  { value: 'entrada_parcelas', label: 'Entrada + Parcelas' },
  { value: 'parcelado_sem_entrada', label: 'Parcelado (sem entrada)' },
  { value: 'recorrente', label: 'Recorrente / Mensalidade' },
  { value: 'outro', label: 'Outro' },
]

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px',
  borderRadius: 6,
  border: '1px solid #2a2a2a',
  background: '#0f0f0f',
  color: 'white',
  fontSize: 12,
}

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  display: 'block',
  marginBottom: 8,
}

const sectionStyle: React.CSSProperties = {
  marginBottom: 16,
}

export function WinDealModal({
  isOpen,
  dealId,
  dealName,
  ownerUserId,
  companyId,
  onClose,
  onSuccess,
}: WinDealModalProps) {
  const supabase = useMemo(() => supabaseBrowser(), [])

  // --- campos básicos ---
  const [wonValue, setWonValue] = useState('')
  const [winMethod, setWinMethod] = useState<'manual' | 'revenue'>('manual')
  const [revenueDate, setRevenueDate] = useState<string>('')
  const [revenueOptions, setRevenueOptions] = useState<RevenueOption[]>([])
  const [winNote, setWinNote] = useState('')

  // --- produto ---
  const [products, setProducts] = useState<Product[]>([])
  const [productId, setProductId] = useState<string>('')
  const [wonUnitPrice, setWonUnitPrice] = useState('')

  // --- pagamento ---
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('')
  const [paymentType, setPaymentType] = useState<PaymentType | ''>('')
  const [entryAmount, setEntryAmount] = useState('')
  const [installmentsCount, setInstallmentsCount] = useState('')
  const [installmentAmount, setInstallmentAmount] = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')

  // --- estado geral ---
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Carregar opções de receita (mantido para compatibilidade)
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

  // Carregar produtos ativos da empresa
  useEffect(() => {
    if (!isOpen || !companyId) return

    listActiveProducts(companyId)
      .then(setProducts)
      .catch((e) => console.error('Erro ao carregar produtos:', e))
  }, [isOpen, companyId])

  // Default data para hoje ao abrir modo receita
  useEffect(() => {
    if (!isOpen) return
    if (winMethod !== 'revenue') return

    const today = new Date()
    const yyyy = today.getFullYear()
    const mm = String(today.getMonth() + 1).padStart(2, '0')
    const dd = String(today.getDate()).padStart(2, '0')
    setRevenueDate((prev) => prev || `${yyyy}-${mm}-${dd}`)
  }, [isOpen, winMethod])

  // Quando um produto é selecionado, preencher won_unit_price com o base_price
  useEffect(() => {
    if (!productId) return
    const found = products.find((p) => p.id === productId)
    if (found) {
      setWonUnitPrice(String(found.base_price))
    }
  }, [productId, products])

  const showInstallments =
    paymentType === 'entrada_parcelas' || paymentType === 'parcelado_sem_entrada'
  const showEntry = paymentType === 'entrada_parcelas'
  const requirePaymentNotes = paymentMethod === 'misto'

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

    if (winMethod === 'revenue' && !revenueDate) {
      setError('Selecione a data da receita')
      return
    }

    if (requirePaymentNotes && !paymentNotes.trim()) {
      setError('Informe uma observação quando o pagamento for "Misto"')
      return
    }

    try {
      setSaving(true)
      setError(null)

      await salesAnalytics.markDealWonWithRevenue(
        dealId,
        value,
        winMethod === 'revenue' ? revenueDate : undefined,
        winNote || undefined,
        {
          productId: productId || null,
          wonUnitPrice: wonUnitPrice ? parseFloat(wonUnitPrice) : null,
          paymentMethod: (paymentMethod || null) as PaymentMethod | null,
          paymentType: (paymentType || null) as PaymentType | null,
          entryAmount: entryAmount ? parseFloat(entryAmount) : null,
          installmentsCount: installmentsCount ? parseInt(installmentsCount, 10) : null,
          installmentAmount: installmentAmount ? parseFloat(installmentAmount) : null,
          paymentNotes: paymentNotes.trim() || null,
        }
      )

      // Reset
      setWonValue('')
      setWinNote('')
      setRevenueDate('')
      setWinMethod('manual')
      setProductId('')
      setWonUnitPrice('')
      setPaymentMethod('')
      setPaymentType('')
      setEntryAmount('')
      setInstallmentsCount('')
      setInstallmentAmount('')
      setPaymentNotes('')

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

  const disableSave =
    saving ||
    !wonValue ||
    (winMethod === 'revenue' && !revenueDate) ||
    (requirePaymentNotes && !paymentNotes.trim())

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
          maxWidth: 520,
          color: 'white',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
          <IconCircleCheck size={20} color="#10b981" />
          Marcar Deal como Ganho
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
        <div style={sectionStyle}>
          <label style={labelStyle}>Como preencher o valor?</label>
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
              Manual
            </button>
            <button
              onClick={() => setWinMethod('revenue')}
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
              Receita
            </button>
          </div>
        </div>

        {/* Data da Receita */}
        {winMethod === 'revenue' && (
          <div style={sectionStyle}>
            <label style={labelStyle}>Data da Receita</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="date"
                value={revenueDate}
                onChange={(e) => setRevenueDate(e.target.value)}
                disabled={saving}
                style={{ ...inputStyle, flex: 1 }}
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
        <div style={sectionStyle}>
          <label style={labelStyle}>Valor da Venda (R$) *</label>
          <input
            type="number"
            step="0.01"
            placeholder="0.00"
            value={wonValue}
            onChange={(e) => setWonValue(e.target.value)}
            disabled={saving}
            style={{ ...inputStyle, opacity: saving ? 0.7 : 1 }}
          />
        </div>

        {/* Divisor */}
        <div style={{ borderTop: '1px solid #222', margin: '16px 0' }} />

        {/* Produto Vendido */}
        {products.length > 0 && (
          <div style={sectionStyle}>
            <label style={labelStyle}>Produto Vendido (opcional)</label>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              disabled={saving}
              style={{ ...inputStyle, opacity: saving ? 0.7 : 1 }}
            >
              <option value="">— Sem produto vinculado —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.category ? `${p.name} (${p.category})` : p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Valor unitário do produto */}
        {productId && (
          <div style={sectionStyle}>
            <label style={labelStyle}>Valor Comercial do Produto (R$)</label>
            <input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={wonUnitPrice}
              onChange={(e) => setWonUnitPrice(e.target.value)}
              disabled={saving}
              style={{ ...inputStyle, opacity: saving ? 0.7 : 1 }}
            />
            <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>
              Preenchido automaticamente com o preço base do produto.
            </div>
          </div>
        )}

        {/* Divisor pagamento */}
        <div style={{ borderTop: '1px solid #222', margin: '16px 0' }} />
        <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
          Forma de Pagamento (opcional)
        </div>

        {/* Meio de Pagamento */}
        <div style={sectionStyle}>
          <label style={labelStyle}>Meio de Pagamento</label>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod | '')}
            disabled={saving}
            style={{ ...inputStyle, opacity: saving ? 0.7 : 1 }}
          >
            <option value="">— Não informado —</option>
            {PAYMENT_METHOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {paymentMethod === 'misto' && (
            <div style={{ fontSize: 11, color: '#fbbf24', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
              <IconAlertTriangle size={12} color="#fbbf24" /> Pagamento misto — obrigatório informar observação abaixo.
            </div>
          )}
        </div>

        {/* Estrutura da Negociação */}
        <div style={sectionStyle}>
          <label style={labelStyle}>Estrutura da Negociação</label>
          <select
            value={paymentType}
            onChange={(e) => {
              setPaymentType(e.target.value as PaymentType | '')
              // Limpar campos de parcela/entrada ao trocar
              setEntryAmount('')
              setInstallmentsCount('')
              setInstallmentAmount('')
            }}
            disabled={saving}
            style={{ ...inputStyle, opacity: saving ? 0.7 : 1 }}
          >
            <option value="">— Não informado —</option>
            {PAYMENT_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Entrada */}
        {showEntry && (
          <div style={sectionStyle}>
            <label style={labelStyle}>Valor da Entrada (R$)</label>
            <input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={entryAmount}
              onChange={(e) => setEntryAmount(e.target.value)}
              disabled={saving}
              style={{ ...inputStyle, opacity: saving ? 0.7 : 1 }}
            />
          </div>
        )}

        {/* Parcelas */}
        {showInstallments && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Nº de Parcelas</label>
              <input
                type="number"
                min="1"
                step="1"
                placeholder="12"
                value={installmentsCount}
                onChange={(e) => setInstallmentsCount(e.target.value)}
                disabled={saving}
                style={{ ...inputStyle, opacity: saving ? 0.7 : 1 }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Valor da Parcela (R$)</label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={installmentAmount}
                onChange={(e) => setInstallmentAmount(e.target.value)}
                disabled={saving}
                style={{ ...inputStyle, opacity: saving ? 0.7 : 1 }}
              />
            </div>
          </div>
        )}

        {/* Observação de Pagamento */}
        {(paymentMethod || requirePaymentNotes) && (
          <div style={sectionStyle}>
            <label style={labelStyle}>
              Observação de Pagamento{requirePaymentNotes ? ' *' : ' (opcional)'}
            </label>
            <textarea
              placeholder={
                requirePaymentNotes
                  ? 'Descreva como foi dividido o pagamento misto...'
                  : 'Ex: parcelado no cartão do cônjuge...'
              }
              value={paymentNotes}
              onChange={(e) => setPaymentNotes(e.target.value)}
              disabled={saving}
              style={{
                ...inputStyle,
                minHeight: 60,
                resize: 'vertical',
                opacity: saving ? 0.7 : 1,
              }}
            />
          </div>
        )}

        {/* Divisor */}
        <div style={{ borderTop: '1px solid #222', margin: '16px 0' }} />

        {/* Nota geral */}
        <div style={sectionStyle}>
          <label style={labelStyle}>Nota (opcional)</label>
          <textarea
            placeholder="Ex: Contrato assinado, confirmação recebida..."
            value={winNote}
            onChange={(e) => setWinNote(e.target.value)}
            disabled={saving}
            style={{
              ...inputStyle,
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
            disabled={disableSave}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: 6,
              border: 'none',
              background: '#10b981',
              color: 'white',
              cursor: disableSave ? 'not-allowed' : 'pointer',
              fontWeight: 900,
              fontSize: 12,
              opacity: disableSave ? 0.5 : 1,
            }}
          >
            {saving ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><IconLoader size={14} /> Salvando...</span> : 'Confirmar Ganho'}
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
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

