'use client'

import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'

import { IconAlertTriangle, IconCircleCheck, IconLoader } from '@/app/components/icons/UiIcons'
import * as salesAnalytics from '@/app/lib/services/sales-analytics'
import { listActiveProducts } from '@/app/lib/services/products'
import type { Product } from '@/app/types/product'
import type { PaymentMethod, PaymentType } from '@/app/types/sales_cycles'

type WinDealModalProps = {
  isOpen: boolean
  dealId: string
  dealName?: string
  ownerUserId?: string
  companyId?: string
  onClose: () => void
  onSuccess: () => void
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
  { value: 'parcelado_sem_entrada', label: 'Parcelado sem Entrada' },
  { value: 'recorrente', label: 'Recorrente / Mensalidade' },
  { value: 'outro', label: 'Outro' },
]

const DS = {
  overlay: 'rgba(0,0,0,0.72)',
  surfaceBg: '#111318',
  panelBg: '#0d0f14',
  cardBg: '#141722',
  inputBg: '#090b0f',
  border: '#1a1d2e',
  borderSubtle: '#13162a',
  divider: '#1f2330',
  textPrimary: '#edf2f7',
  textSecondary: '#8fa3bc',
  textMuted: '#546070',
  textLabel: '#4a5569',
  green: '#10b981',
  greenSoft: '#86efac',
  greenBg: 'rgba(16,185,129,0.10)',
  greenBorder: 'rgba(16,185,129,0.32)',
  blue: '#3b82f6',
  blueSoft: '#93c5fd',
  blueBg: 'rgba(59,130,246,0.10)',
  amber: '#f59e0b',
  amberSoft: '#fcd34d',
  amberBg: 'rgba(245,158,11,0.12)',
  amberBorder: 'rgba(245,158,11,0.30)',
  redBg: 'rgba(127,29,29,0.78)',
  redText: '#fecaca',
  redBorder: 'rgba(248,113,113,0.35)',
  radius: 8,
  radiusContainer: 14,
} as const

const inputStyle: CSSProperties = {
  width: '100%',
  minHeight: 42,
  padding: '10px 12px',
  borderRadius: DS.radius,
  border: `1px solid ${DS.border}`,
  background: DS.inputBg,
  color: DS.textPrimary,
  fontSize: 12,
  outline: 'none',
}

const labelStyle: CSSProperties = {
  display: 'block',
  marginBottom: 7,
  color: DS.textSecondary,
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.02em',
}

const sectionCardStyle: CSSProperties = {
  border: `1px solid ${DS.border}`,
  background: DS.panelBg,
  borderRadius: DS.radiusContainer,
  padding: 14,
}

const sectionTitleStyle: CSSProperties = {
  marginBottom: 12,
  color: DS.textPrimary,
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
}

function getTodayISODate(): string {
  const today = new Date()
  const yyyy = today.getFullYear()
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')

  return `${yyyy}-${mm}-${dd}`
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  return fallback
}

function parseMoney(value: string): number {
  return Number.parseFloat(value.replace(',', '.'))
}

function formatCurrency(value: number | string | null | undefined): string {
  const parsedValue = typeof value === 'number' ? value : Number(value ?? 0)

  if (!Number.isFinite(parsedValue)) return 'R$ 0,00'

  return parsedValue.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

export function WinDealModal({
  isOpen,
  dealId,
  dealName,
  companyId,
  onClose,
  onSuccess,
}: WinDealModalProps) {
  const [products, setProducts] = useState<Product[]>([])
  const [productsLoading, setProductsLoading] = useState(false)
  const [productsError, setProductsError] = useState<string | null>(null)

  const [productId, setProductId] = useState('')
  const [wonValue, setWonValue] = useState('')
  const [wonUnitPrice, setWonUnitPrice] = useState('')
  const [revenueDate, setRevenueDate] = useState(getTodayISODate())
  const [winNote, setWinNote] = useState('')

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('')
  const [paymentType, setPaymentType] = useState<PaymentType | ''>('')
  const [entryAmount, setEntryAmount] = useState('')
  const [installmentsCount, setInstallmentsCount] = useState('')
  const [installmentAmount, setInstallmentAmount] = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const showInstallments =
    paymentType === 'entrada_parcelas' || paymentType === 'parcelado_sem_entrada'
  const showEntry = paymentType === 'entrada_parcelas'
  const requirePaymentNotes = paymentMethod === 'misto'

  useEffect(() => {
    if (!isOpen) return

    setError(null)
    setRevenueDate((currentDate) => currentDate || getTodayISODate())
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !companyId) {
      setProducts([])
      setProductsError(null)
      setProductsLoading(false)
      return
    }

    const loadProducts = async () => {
      try {
        setProductsLoading(true)
        setProductsError(null)

        const activeProducts = await listActiveProducts(companyId)
        setProducts(activeProducts)
      } catch (loadError: unknown) {
        setProducts([])
        setProductsError(getErrorMessage(loadError, 'Erro ao carregar produtos ativos'))
        console.error('Erro ao carregar produtos:', loadError)
      } finally {
        setProductsLoading(false)
      }
    }

    void loadProducts()
  }, [isOpen, companyId])

  const handleProductChange = (nextProductId: string) => {
    setProductId(nextProductId)

    const selectedProduct = products.find((product) => product.id === nextProductId)

    if (!selectedProduct) {
      setWonUnitPrice('')
      return
    }

    const basePrice = String(selectedProduct.base_price)

    setWonUnitPrice(basePrice)

    if (!wonValue) {
      setWonValue(basePrice)
    }
  }

  const resetFormAfterSuccess = () => {
    setProductId('')
    setWonValue('')
    setWonUnitPrice('')
    setRevenueDate(getTodayISODate())
    setWinNote('')
    setPaymentMethod('')
    setPaymentType('')
    setEntryAmount('')
    setInstallmentsCount('')
    setInstallmentAmount('')
    setPaymentNotes('')
    setError(null)
  }

  const handleSave = async () => {
    const normalizedWonValue = parseMoney(wonValue)

    if (!wonValue || !Number.isFinite(normalizedWonValue) || normalizedWonValue <= 0) {
      setError('Informe um valor de venda maior que zero.')
      return
    }

    if (!revenueDate) {
      setError('Informe a data de faturamento.')
      return
    }

    if (requirePaymentNotes && !paymentNotes.trim()) {
      setError('Informe uma observação quando o pagamento for misto.')
      return
    }

    try {
      setSaving(true)
      setError(null)

      await salesAnalytics.markDealWonWithRevenue(
        dealId,
        normalizedWonValue,
        revenueDate,
        winNote.trim() || undefined,
        {
          productId: productId || null,
          wonUnitPrice: wonUnitPrice ? parseMoney(wonUnitPrice) : null,
          paymentMethod: (paymentMethod || null) as PaymentMethod | null,
          paymentType: (paymentType || null) as PaymentType | null,
          entryAmount: entryAmount ? parseMoney(entryAmount) : null,
          installmentsCount: installmentsCount ? Number.parseInt(installmentsCount, 10) : null,
          installmentAmount: installmentAmount ? parseMoney(installmentAmount) : null,
          paymentNotes: paymentNotes.trim() || null,
        }
      )

      resetFormAfterSuccess()
      onSuccess()
      onClose()
    } catch (saveError: unknown) {
      setError(getErrorMessage(saveError, 'Erro ao confirmar ganho'))
      console.error('Erro ao confirmar ganho:', saveError)
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  const disableSave =
    saving ||
    !wonValue ||
    !revenueDate ||
    (requirePaymentNotes && !paymentNotes.trim())

  const selectedProduct = products.find((product) => product.id === productId) ?? null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 18,
        background: DS.overlay,
        backdropFilter: 'blur(8px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 'min(760px, 96vw)',
          maxHeight: '92vh',
          overflow: 'hidden',
          border: `1px solid ${DS.border}`,
          borderRadius: 18,
          background: DS.surfaceBg,
          color: DS.textPrimary,
          boxShadow: '0 28px 80px rgba(0,0,0,0.62)',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          style={{
            padding: '18px 20px',
            borderBottom: `1px solid ${DS.border}`,
            background: 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(17,19,24,0.98))',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                border: `1px solid ${DS.greenBorder}`,
                background: DS.greenBg,
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              <IconCircleCheck size={18} color={DS.greenSoft} />
            </div>

            <div>
              <div style={{ fontSize: 17, fontWeight: 900, marginBottom: 4 }}>
                Confirmar venda ganha
              </div>
              <div style={{ color: DS.textSecondary, fontSize: 12, lineHeight: 1.45 }}>
                Registre produto, valor, pagamento e data de faturamento em um único fluxo.
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              border: `1px solid ${DS.border}`,
              background: DS.panelBg,
              color: DS.textSecondary,
              cursor: saving ? 'not-allowed' : 'pointer',
              fontWeight: 900,
              opacity: saving ? 0.6 : 1,
            }}
            aria-label="Fechar modal"
          >
            ×
          </button>
        </div>

        <div
          style={{
            padding: 20,
            overflowY: 'auto',
            display: 'grid',
            gap: 14,
          }}
        >
          {dealName && (
            <div
              style={{
                border: `1px solid ${DS.borderSubtle}`,
                background: DS.cardBg,
                borderRadius: DS.radiusContainer,
                padding: '10px 12px',
              }}
            >
              <div
                style={{
                  color: DS.textLabel,
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  marginBottom: 5,
                }}
              >
                Oportunidade
              </div>
              <div style={{ color: DS.textPrimary, fontSize: 13, fontWeight: 800 }}>
                {dealName}
              </div>
            </div>
          )}

          {error && (
            <div
              style={{
                border: `1px solid ${DS.redBorder}`,
                background: DS.redBg,
                color: DS.redText,
                borderRadius: DS.radiusContainer,
                padding: 12,
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {error}
            </div>
          )}

          <div style={sectionCardStyle}>
            <div style={sectionTitleStyle}>Venda</div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1.35fr) minmax(160px, 0.65fr)',
                gap: 12,
              }}
            >
              <div>
                <label style={labelStyle}>Produto vendido</label>

                {productsLoading ? (
                  <div
                    style={{
                      ...inputStyle,
                      display: 'flex',
                      alignItems: 'center',
                      color: DS.textMuted,
                    }}
                  >
                    Carregando produtos ativos...
                  </div>
                ) : productsError ? (
                  <div
                    style={{
                      border: `1px solid ${DS.redBorder}`,
                      background: DS.redBg,
                      color: DS.redText,
                      borderRadius: DS.radius,
                      padding: '10px 12px',
                      fontSize: 12,
                    }}
                  >
                    {productsError}
                  </div>
                ) : products.length > 0 ? (
                  <select
                    value={productId}
                    onChange={(event) => handleProductChange(event.target.value)}
                    disabled={saving}
                    style={{ ...inputStyle, opacity: saving ? 0.7 : 1 }}
                  >
                    <option value="">Sem produto vinculado</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.category
                          ? `${product.name} (${product.category}) — ${formatCurrency(product.base_price)}`
                          : `${product.name} — ${formatCurrency(product.base_price)}`}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div
                    style={{
                      border: `1px solid ${DS.amberBorder}`,
                      background: DS.amberBg,
                      color: DS.amberSoft,
                      borderRadius: DS.radius,
                      padding: '10px 12px',
                      fontSize: 12,
                    }}
                  >
                    Nenhum produto ativo encontrado para esta empresa.
                  </div>
                )}
              </div>

              <div>
                <label style={labelStyle}>Valor da venda *</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={wonValue}
                  onChange={(event) => setWonValue(event.target.value)}
                  disabled={saving}
                  style={{ ...inputStyle, opacity: saving ? 0.7 : 1 }}
                />
              </div>
            </div>

            {selectedProduct && (
              <div
                style={{
                  marginTop: 10,
                  border: `1px solid ${DS.borderSubtle}`,
                  borderRadius: DS.radius,
                  background: DS.inputBg,
                  padding: '9px 10px',
                  display: 'grid',
                  gridTemplateColumns: '1fr 160px',
                  gap: 10,
                  alignItems: 'center',
                }}
              >
                <div style={{ color: DS.textSecondary, fontSize: 12 }}>
                  Produto selecionado:{' '}
                  <strong style={{ color: DS.textPrimary }}>{selectedProduct.name}</strong>
                </div>

                <div>
                  <label style={{ ...labelStyle, marginBottom: 5 }}>Preço base</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={wonUnitPrice}
                    onChange={(event) => setWonUnitPrice(event.target.value)}
                    disabled={saving}
                    style={{ ...inputStyle, minHeight: 36, opacity: saving ? 0.7 : 1 }}
                  />
                </div>
              </div>
            )}
          </div>

          <div style={sectionCardStyle}>
            <div style={sectionTitleStyle}>Faturamento</div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(180px, 220px) minmax(0, 1fr)',
                gap: 12,
                alignItems: 'end',
              }}
            >
              <div>
                <label style={labelStyle}>Data de faturamento *</label>
                <input
                  type="date"
                  value={revenueDate}
                  onChange={(event) => setRevenueDate(event.target.value)}
                  disabled={saving}
                  style={{ ...inputStyle, opacity: saving ? 0.7 : 1 }}
                />
              </div>

              <div
                style={{
                  border: `1px solid ${DS.blue}`,
                  background: DS.blueBg,
                  borderRadius: DS.radius,
                  padding: '10px 12px',
                  color: DS.blueSoft,
                  fontSize: 12,
                  lineHeight: 1.45,
                }}
              >
                Essa data define em qual dia a venda entra no faturamento, dashboard e
                simulador.
              </div>
            </div>
          </div>

          <div style={sectionCardStyle}>
            <div style={sectionTitleStyle}>Pagamento</div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: 12,
              }}
            >
              <div>
                <label style={labelStyle}>Meio de pagamento</label>
                <select
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod | '')}
                  disabled={saving}
                  style={{ ...inputStyle, opacity: saving ? 0.7 : 1 }}
                >
                  <option value="">Não informado</option>
                  {PAYMENT_METHOD_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                {paymentMethod === 'misto' && (
                  <div
                    style={{
                      marginTop: 7,
                      color: DS.amberSoft,
                      fontSize: 11,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                    }}
                  >
                    <IconAlertTriangle size={12} color={DS.amberSoft} />
                    Pagamento misto exige observação.
                  </div>
                )}
              </div>

              <div>
                <label style={labelStyle}>Estrutura da negociação</label>
                <select
                  value={paymentType}
                  onChange={(event) => {
                    setPaymentType(event.target.value as PaymentType | '')
                    setEntryAmount('')
                    setInstallmentsCount('')
                    setInstallmentAmount('')
                  }}
                  disabled={saving}
                  style={{ ...inputStyle, opacity: saving ? 0.7 : 1 }}
                >
                  <option value="">Não informado</option>
                  {PAYMENT_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {(showEntry || showInstallments) && (
              <div
                style={{
                  marginTop: 12,
                  display: 'grid',
                  gridTemplateColumns: showEntry
                    ? 'repeat(3, minmax(0, 1fr))'
                    : 'repeat(2, minmax(0, 1fr))',
                  gap: 12,
                }}
              >
                {showEntry && (
                  <div>
                    <label style={labelStyle}>Entrada (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={entryAmount}
                      onChange={(event) => setEntryAmount(event.target.value)}
                      disabled={saving}
                      style={{ ...inputStyle, opacity: saving ? 0.7 : 1 }}
                    />
                  </div>
                )}

                <div>
                  <label style={labelStyle}>Nº de parcelas</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    placeholder="12"
                    value={installmentsCount}
                    onChange={(event) => setInstallmentsCount(event.target.value)}
                    disabled={saving}
                    style={{ ...inputStyle, opacity: saving ? 0.7 : 1 }}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Valor da parcela (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={installmentAmount}
                    onChange={(event) => setInstallmentAmount(event.target.value)}
                    disabled={saving}
                    style={{ ...inputStyle, opacity: saving ? 0.7 : 1 }}
                  />
                </div>
              </div>
            )}

            {(paymentMethod || requirePaymentNotes) && (
              <div style={{ marginTop: 12 }}>
                <label style={labelStyle}>
                  Observação de pagamento{requirePaymentNotes ? ' *' : ''}
                </label>
                <textarea
                  placeholder={
                    requirePaymentNotes
                      ? 'Descreva como o pagamento misto foi dividido.'
                      : 'Ex.: parcelado no cartão de outra pessoa, entrada em PIX etc.'
                  }
                  value={paymentNotes}
                  onChange={(event) => setPaymentNotes(event.target.value)}
                  disabled={saving}
                  style={{
                    ...inputStyle,
                    minHeight: 74,
                    resize: 'vertical',
                    opacity: saving ? 0.7 : 1,
                  }}
                />
              </div>
            )}
          </div>

          <div style={sectionCardStyle}>
            <div style={sectionTitleStyle}>Observação interna</div>
            <textarea
              placeholder="Ex.: contrato assinado, confirmação recebida, condição especial combinada..."
              value={winNote}
              onChange={(event) => setWinNote(event.target.value)}
              disabled={saving}
              style={{
                ...inputStyle,
                minHeight: 82,
                resize: 'vertical',
                opacity: saving ? 0.7 : 1,
              }}
            />
          </div>
        </div>

        <div
          style={{
            padding: '14px 20px',
            borderTop: `1px solid ${DS.border}`,
            background: DS.surfaceBg,
            display: 'flex',
            gap: 10,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              flex: 1,
              minHeight: 42,
              borderRadius: DS.radius,
              border: `1px solid ${DS.border}`,
              background: DS.panelBg,
              color: DS.textSecondary,
              cursor: saving ? 'not-allowed' : 'pointer',
              fontWeight: 800,
              fontSize: 12,
              opacity: saving ? 0.6 : 1,
            }}
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={disableSave}
            style={{
              flex: 1.4,
              minHeight: 42,
              borderRadius: DS.radius,
              border: `1px solid ${DS.greenBorder}`,
              background: disableSave ? DS.panelBg : '#1e7d4a',
              color: disableSave ? DS.textMuted : '#ffffff',
              cursor: disableSave ? 'not-allowed' : 'pointer',
              fontWeight: 900,
              fontSize: 12,
              opacity: disableSave ? 0.62 : 1,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
            }}
          >
            {saving ? (
              <>
                <IconLoader size={14} />
                Salvando venda...
              </>
            ) : (
              'Confirmar venda ganha'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}