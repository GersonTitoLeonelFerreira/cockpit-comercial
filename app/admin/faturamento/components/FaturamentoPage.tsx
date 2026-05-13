'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { supabaseBrowser } from '@/app/lib/supabaseBrowser'
import * as faturamentoService from '@/app/lib/services/faturamento'

type SourceType = 'empresa' | 'seller' | 'extra'

const UI = {
  surface: '#0d0f14',
  surfaceSoft: '#10131a',
  surfaceElevated: '#121621',
  borderSoft: 'rgba(148, 163, 184, 0.10)',
  borderMuted: 'rgba(148, 163, 184, 0.07)',
  textPrimary: '#f8fafc',
  textSecondary: '#cbd5e1',
  textMuted: '#94a3b8',
  textSubtle: '#64748b',
  blue: '#3b82f6',
  green: '#22c55e',
  greenSoft: 'rgba(34, 197, 94, 0.13)',
  redSoft: 'rgba(239, 68, 68, 0.13)',
  amberSoft: 'rgba(245, 158, 11, 0.12)',
} as const

const buttonBase: React.CSSProperties = {
  height: 36,
  borderRadius: 11,
  padding: '0 13px',
  fontSize: 12,
  fontWeight: 850,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const inputBase: React.CSSProperties = {
  height: 36,
  borderRadius: 11,
  border: `1px solid ${UI.borderSoft}`,
  background: 'rgba(9, 11, 15, 0.72)',
  color: UI.textPrimary,
  padding: '0 12px',
  fontSize: 12.5,
  fontWeight: 700,
  outline: 'none',
}

function formatPerson(name: string | null, email: string | null) {
  return name || email || 'Sem identificação'
}

function formatPaymentLabel(value: string | null) {
  if (!value) return 'Não informado'

  const labels: Record<string, string> = {
    pix: 'PIX',
    credito: 'Cartão de crédito',
    debito: 'Cartão de débito',
    dinheiro: 'Dinheiro',
    boleto: 'Boleto',
    transferencia: 'Transferência',
    misto: 'Misto',
    avista: 'À vista',
    entrada_parcelas: 'Entrada + parcelas',
    parcelado_sem_entrada: 'Parcelado sem entrada',
    recorrente: 'Recorrente',
    outro: 'Outro',
  }

  return labels[value] ?? value
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message
  return fallback
}

export default function FaturamentoPage({
  activeCompanyId,
}: {
  activeCompanyId: string | null
}) {
  const supabase = useMemo(() => supabaseBrowser(), [])

  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)

  const [sourceType, setSourceType] = useState<SourceType>('empresa')
  const [selectedSellerId, setSelectedSellerId] = useState<string | null>(null)
  const [selectedExtraId, setSelectedExtraId] = useState<string | null>(null)

  const [sellers, setSellers] = useState<faturamentoService.Seller[]>([])
  const [extras, setExtras] = useState<faturamentoService.RevenueExtraSource[]>([])
  const [revenueSellers, setRevenueSellers] = useState<faturamentoService.RevenueDailySeller[]>([])
  const [revenueExtras, setRevenueExtras] = useState<faturamentoService.RevenueDailyExtra[]>([])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [showAddSourceModal, setShowAddSourceModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [newSourceName, setNewSourceName] = useState('')
  const [editingCell, setEditingCell] = useState<{
    sourceKind: 'seller' | 'extra'
    sourceId: string
    refDate: string
  } | null>(null)
  const [editRealValue, setEditRealValue] = useState('')
  const [editReason, setEditReason] = useState('Conciliação')
  const [editNotes, setEditNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const [salesModalOpen, setSalesModalOpen] = useState(false)
  const [salesModalDate, setSalesModalDate] = useState<string | null>(null)
  const [salesModalLoading, setSalesModalLoading] = useState(false)
  const [salesModalError, setSalesModalError] = useState<string | null>(null)
  const [salesDetails, setSalesDetails] = useState<faturamentoService.RevenueSaleDetail[]>([])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      if (!activeCompanyId) {
        throw new Error('Empresa ativa não selecionada.')
      }

      const [sellersData, extrasData, revenueSellerData, revenueExtraData] = await Promise.all([
        faturamentoService.getSellers(supabase, activeCompanyId),
        faturamentoService.getRevenueExtraSources(supabase, activeCompanyId),
        faturamentoService.getRevenueDailySellers(supabase, activeCompanyId),
        faturamentoService.getRevenueDailyExtras(supabase, activeCompanyId),
      ])

      setSellers(sellersData)
      setExtras(extrasData)
      setRevenueSellers(revenueSellerData)
      setRevenueExtras(revenueExtraData)
    } catch (error: unknown) {
      setError(getErrorMessage(error, 'Erro ao carregar dados'))
      console.error('Erro ao carregar dados:', error)
    } finally {
      setLoading(false)
    }
  }, [supabase, activeCompanyId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handlePreviousMonth = () => {
    const { year: newYear, month: newMonth } = faturamentoService.getPreviousMonth(year, month)
    setYear(newYear)
    setMonth(newMonth)
  }

  const handleNextMonth = () => {
    const { year: newYear, month: newMonth } = faturamentoService.getNextMonth(year, month)
    setYear(newYear)
    setMonth(newMonth)
  }

  const handleSourceChange = (value: string) => {
    if (value === '') {
      setSourceType('empresa')
      setSelectedSellerId(null)
      setSelectedExtraId(null)
      return
    }

    const seller = sellers.find((s) => s.id === value)

    if (seller) {
      setSourceType('seller')
      setSelectedSellerId(value)
      setSelectedExtraId(null)
      return
    }

    const extra = extras.find((e) => e.id === value)

    if (extra) {
      setSourceType('extra')
      setSelectedSellerId(null)
      setSelectedExtraId(value)
    }
  }

  const handleAddSource = async () => {
    if (!newSourceName.trim()) {
      alert('Nome da fonte não pode estar vazio')
      return
    }

    try {
      setSaving(true)
      if (!activeCompanyId) {
        throw new Error('Empresa ativa não selecionada.')
      }

      await faturamentoService.createRevenueExtraSource(
        supabase,
        activeCompanyId,
        newSourceName,
      )
      setNewSourceName('')
      setShowAddSourceModal(false)
      await loadData()
      alert('Fonte de faturamento criada com sucesso.')
    } catch (error: unknown) {
      alert(`Erro: ${getErrorMessage(error, 'Erro ao criar fonte de faturamento')}`)
    } finally {
      setSaving(false)
    }
  }

  const handleEditCell = async (
    sourceKind: 'seller' | 'extra',
    sourceId: string,
    refDate: string,
    currentValue: number,
  ) => {
    setEditingCell({ sourceKind, sourceId, refDate })
    setEditRealValue(String(currentValue))
    setEditReason('Conciliação')
    setEditNotes('')
    setShowEditModal(true)
  }

  const handleSaveEdit = async () => {
    if (!editingCell) return

    const realValue = parseFloat(editRealValue) || 0

    try {
      setSaving(true)

      if (!activeCompanyId) {
        throw new Error('Empresa ativa não selecionada.')
      }

      await faturamentoService.upsertRevenueOverride(
        supabase,
        activeCompanyId,
        editingCell.sourceKind,
        editingCell.sourceId,
        editingCell.refDate,
        realValue,
        editReason,
        editNotes,
      )

      setShowEditModal(false)
      await loadData()
      alert('Faturamento atualizado com sucesso.')
    } catch (error: unknown) {
      alert(`Erro: ${getErrorMessage(error, 'Erro ao atualizar faturamento')}`)
    } finally {
      setSaving(false)
    }
  }

  const handleOpenSalesDetails = async (date: string) => {
    setSalesModalOpen(true)
    setSalesModalDate(date)
    setSalesModalLoading(true)
    setSalesModalError(null)
    setSalesDetails([])

    try {
      if (!activeCompanyId) {
        throw new Error('Empresa ativa não selecionada.')
      }

      const ownerId = sourceType === 'seller' ? selectedSellerId : null

      const rows = await faturamentoService.getRevenueSalesDetailsByDay(
        supabase,
        activeCompanyId,
        date,
        ownerId,
      )

      setSalesDetails(rows)
    } catch (error: unknown) {
      setSalesModalError(getErrorMessage(error, 'Erro ao carregar vendas do dia.'))
      setSalesDetails([])
    } finally {
      setSalesModalLoading(false)
    }
  }

  const datesOfMonth = useMemo(
    () => faturamentoService.getDatesOfMonth(year, month),
    [year, month],
  )

  const calendarData = useMemo(() => {
    const result: Record<string, number> = {}

    datesOfMonth.forEach((date) => {
      result[date] = 0
    })

    if (sourceType === 'empresa') {
      revenueSellers.forEach((r) => {
        if (result[r.ref_date] !== undefined) {
          result[r.ref_date] += Number(r.real_value || 0)
        }
      })

      revenueExtras.forEach((r) => {
        if (result[r.ref_date] !== undefined) {
          result[r.ref_date] += Number(r.real_value || 0)
        }
      })
    }

    if (sourceType === 'seller' && selectedSellerId) {
      revenueSellers.forEach((r) => {
        if (r.seller_id === selectedSellerId && result[r.ref_date] !== undefined) {
          result[r.ref_date] = Number(r.real_value || 0)
        }
      })
    }

    if (sourceType === 'extra' && selectedExtraId) {
      revenueExtras.forEach((r) => {
        if (r.extra_id === selectedExtraId && result[r.ref_date] !== undefined) {
          result[r.ref_date] = Number(r.real_value || 0)
        }
      })
    }

    return result
  }, [
    datesOfMonth,
    sourceType,
    selectedSellerId,
    selectedExtraId,
    revenueSellers,
    revenueExtras,
  ])

  const kpis = useMemo(() => {
    const totalReal = datesOfMonth.reduce((acc, date) => acc + (calendarData[date] ?? 0), 0)
    const daysWithRevenue = datesOfMonth.filter((date) => (calendarData[date] ?? 0) > 0).length

    return {
      real: totalReal,
      daysWithRevenue,
      averagePerRevenueDay: daysWithRevenue > 0 ? totalReal / daysWithRevenue : 0,
    }
  }, [datesOfMonth, calendarData])

  const sortedDates = useMemo(() => [...datesOfMonth].sort(), [datesOfMonth])

  const selectValue = useMemo(() => {
    if (sourceType === 'empresa') return ''
    if (sourceType === 'seller') return selectedSellerId || ''
    if (sourceType === 'extra') return selectedExtraId || ''
    return ''
  }, [sourceType, selectedSellerId, selectedExtraId])

  const sellerRanking = useMemo(() => {
    const totalsBySeller = new Map<
      string,
      {
        seller_id: string
        seller_name: string
        seller_email: string | null
        total: number
        daysWithRevenue: number
      }
    >()

    const datesOfMonthSet = new Set(datesOfMonth)

    revenueSellers.forEach((row) => {
      if (!datesOfMonthSet.has(row.ref_date)) return

      const seller = sellers.find((item) => item.id === row.seller_id)
      const current = totalsBySeller.get(row.seller_id) ?? {
        seller_id: row.seller_id,
        seller_name: seller?.full_name || seller?.email || 'Vendedor sem nome',
        seller_email: seller?.email ?? null,
        total: 0,
        daysWithRevenue: 0,
      }

      const realValue = Number(row.real_value || 0)

      current.total += realValue

      if (realValue > 0) {
        current.daysWithRevenue += 1
      }

      totalsBySeller.set(row.seller_id, current)
    })

    return Array.from(totalsBySeller.values())
      .filter((seller) => seller.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 3)
  }, [datesOfMonth, revenueSellers, sellers])

  const currentScopeLabel = useMemo(() => {
    if (sourceType === 'empresa') return 'Empresa (todos)'

    if (sourceType === 'seller') {
      const seller = sellers.find((s) => s.id === selectedSellerId)
      return formatPerson(seller?.full_name ?? null, seller?.email ?? null)
    }

    const extra = extras.find((e) => e.id === selectedExtraId)
    return extra?.name ?? 'Fonte extra'
  }, [sourceType, selectedSellerId, selectedExtraId, sellers, extras])

  if (loading) {
    return (
      <div
        style={{
          border: `1px solid ${UI.borderSoft}`,
          background: UI.surface,
          borderRadius: 18,
          padding: 18,
          color: UI.textMuted,
          fontSize: 13,
        }}
      >
        Carregando Gestão de Faturamento...
      </div>
    )
  }

  return (
    <div
      style={{
        color: UI.textPrimary,
        display: 'grid',
        gap: 18,
      }}
    >
      <section
        style={{
          border: `1px solid ${UI.borderSoft}`,
          background:
            'linear-gradient(135deg, rgba(18, 22, 33, 0.86) 0%, rgba(13, 15, 20, 0.98) 100%)',
          borderRadius: 20,
          padding: 18,
          display: 'grid',
          gap: 16,
          boxShadow:
            '0 14px 36px rgba(0, 0, 0, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.035)',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handlePreviousMonth}
              style={{
                ...buttonBase,
                border: `1px solid ${UI.borderSoft}`,
                background: 'rgba(9, 11, 15, 0.72)',
                color: UI.textSecondary,
              }}
            >
              ◀
            </button>

            <div
              style={{
                minWidth: 170,
                height: 36,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: `1px solid ${UI.borderSoft}`,
                background: 'rgba(9, 11, 15, 0.58)',
                borderRadius: 12,
                color: UI.textPrimary,
                fontWeight: 950,
                letterSpacing: -0.2,
              }}
            >
              {faturamentoService.formatMonthYear(year, month)}
            </div>

            <button
              type="button"
              onClick={handleNextMonth}
              style={{
                ...buttonBase,
                border: `1px solid ${UI.borderSoft}`,
                background: 'rgba(9, 11, 15, 0.72)',
                color: UI.textSecondary,
              }}
            >
              ▶
            </button>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={selectValue}
              onChange={(e) => handleSourceChange(e.target.value)}
              style={{
                ...inputBase,
                minWidth: 260,
              }}
            >
              <option value="">Empresa (Todos)</option>

              <optgroup label="Vendedores">
                {sellers.map((seller) => (
                  <option key={seller.id} value={seller.id}>
                    {formatPerson(seller.full_name, seller.email)} ({seller.role})
                  </option>
                ))}
              </optgroup>

              {extras.length > 0 ? (
                <optgroup label="Fontes Extras">
                  {extras.map((extra) => (
                    <option key={extra.id} value={extra.id}>
                      {extra.name} (extra)
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>

            <button
              type="button"
              onClick={() => setShowAddSourceModal(true)}
              style={{
                ...buttonBase,
                border: '1px solid rgba(34, 197, 94, 0.38)',
                background:
                  'linear-gradient(135deg, rgba(34, 197, 94, 0.95), rgba(22, 163, 74, 0.92))',
                color: '#052e16',
              }}
            >
              + Adicionar Faturamento
            </button>

            <button
              type="button"
              onClick={() => void loadData()}
              style={{
                ...buttonBase,
                border: `1px solid ${UI.borderSoft}`,
                background: 'rgba(9, 11, 15, 0.72)',
                color: UI.textSecondary,
              }}
            >
              Atualizar
            </button>
          </div>
        </div>

        <div
          style={{
            color: UI.textSubtle,
            fontSize: 12.5,
            lineHeight: 1.45,
          }}
        >
          Escopo atual: <strong style={{ color: UI.textSecondary }}>{currentScopeLabel}</strong>
        </div>
      </section>

      {error ? (
        <div
          style={{
            border: '1px solid rgba(239, 68, 68, 0.28)',
            background: UI.redSoft,
            color: '#fecaca',
            padding: 12,
            borderRadius: 14,
            fontSize: 13,
            fontWeight: 750,
          }}
        >
          {error}
        </div>
      ) : null}

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 12,
        }}
      >
        <div
          style={{
            border: `1px solid ${UI.borderSoft}`,
            background: `linear-gradient(135deg, ${UI.greenSoft} 0%, ${UI.surfaceSoft} 42%, ${UI.surface} 100%)`,
            borderRadius: 18,
            padding: 18,
            minHeight: 118,
          }}
        >
          <div style={{ color: UI.textMuted, fontSize: 12.5, fontWeight: 850 }}>
            Faturamento Real ({faturamentoService.formatMonthYear(year, month)})
          </div>

          <div
            style={{
              marginTop: 12,
              color: '#86efac',
              fontSize: 30,
              fontWeight: 950,
              letterSpacing: -0.7,
              lineHeight: 1,
            }}
          >
            {faturamentoService.formatCurrency(kpis.real)}
          </div>

          <div style={{ marginTop: 10, color: UI.textSubtle, fontSize: 12 }}>
            Soma do período no escopo selecionado.
          </div>
        </div>

        <div
          style={{
            border: `1px solid ${UI.borderSoft}`,
            background: `linear-gradient(135deg, rgba(59, 130, 246, 0.12) 0%, ${UI.surfaceSoft} 46%, ${UI.surface} 100%)`,
            borderRadius: 18,
            padding: 18,
            minHeight: 118,
          }}
        >
          <div style={{ color: UI.textMuted, fontSize: 12.5, fontWeight: 850 }}>
            Dias com faturamento
          </div>

          <div
            style={{
              marginTop: 12,
              color: '#93c5fd',
              fontSize: 30,
              fontWeight: 950,
              letterSpacing: -0.7,
              lineHeight: 1,
            }}
          >
            {kpis.daysWithRevenue}
          </div>

          <div style={{ marginTop: 10, color: UI.textSubtle, fontSize: 12 }}>
            Dias com valor maior que zero.
          </div>
        </div>

        <div
          style={{
            border: `1px solid ${UI.borderSoft}`,
            background: `linear-gradient(135deg, ${UI.amberSoft} 0%, ${UI.surfaceSoft} 46%, ${UI.surface} 100%)`,
            borderRadius: 18,
            padding: 18,
            minHeight: 118,
          }}
        >
          <div style={{ color: UI.textMuted, fontSize: 12.5, fontWeight: 850 }}>
            Média por dia com receita
          </div>

          <div
            style={{
              marginTop: 12,
              color: '#fbbf24',
              fontSize: 30,
              fontWeight: 950,
              letterSpacing: -0.7,
              lineHeight: 1,
            }}
          >
            {faturamentoService.formatCurrency(kpis.averagePerRevenueDay)}
          </div>

          <div style={{ marginTop: 10, color: UI.textSubtle, fontSize: 12 }}>
            Média considerando somente dias faturados.
          </div>
        </div>
      </section>

      <section
        style={{
          border: `1px solid ${UI.borderSoft}`,
          background:
            'linear-gradient(135deg, rgba(18, 22, 33, 0.72) 0%, rgba(13, 15, 20, 0.98) 100%)',
          borderRadius: 20,
          padding: 16,
          overflowX: 'auto',
          boxShadow:
            '0 14px 36px rgba(0, 0, 0, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.025)',
        }}
      >

<section
        style={{
          border: `1px solid ${UI.borderSoft}`,
          background:
            'linear-gradient(135deg, rgba(18, 22, 33, 0.76) 0%, rgba(13, 15, 20, 0.98) 100%)',
          borderRadius: 20,
          padding: 18,
          display: 'grid',
          gap: 14,
          boxShadow:
            '0 14px 36px rgba(0, 0, 0, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.025)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            alignItems: 'flex-start',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div
              style={{
                color: UI.textPrimary,
                fontSize: 15,
                fontWeight: 950,
                letterSpacing: -0.2,
                lineHeight: 1.25,
              }}
            >
              Ranking de vendedores
            </div>

            <div
              style={{
                marginTop: 4,
                color: UI.textMuted,
                fontSize: 12.5,
                lineHeight: 1.45,
              }}
            >
              Top 3 vendedores por faturamento real no período selecionado.
            </div>
          </div>

          <div
            style={{
              border: `1px solid ${UI.borderMuted}`,
              background: 'rgba(9, 11, 15, 0.50)',
              borderRadius: 999,
              padding: '7px 10px',
              color: UI.textSecondary,
              fontSize: 11.5,
              fontWeight: 900,
              whiteSpace: 'nowrap',
            }}
          >
            {faturamentoService.formatMonthYear(year, month)}
          </div>
        </div>

        {sellerRanking.length === 0 ? (
          <div
            style={{
              border: `1px solid ${UI.borderMuted}`,
              background: 'rgba(9, 11, 15, 0.46)',
              borderRadius: 14,
              padding: 14,
              color: UI.textMuted,
              fontSize: 13,
              lineHeight: 1.45,
            }}
          >
            Nenhum vendedor com faturamento registrado neste período.
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12,
            }}
          >
            {sellerRanking.map((seller, index) => {
              const position = index + 1

              const positionLabel =
                position === 1
                  ? '1º lugar'
                  : position === 2
                    ? '2º lugar'
                    : '3º lugar'

              const borderColor =
                position === 1
                  ? 'rgba(245, 158, 11, 0.35)'
                  : position === 2
                    ? 'rgba(148, 163, 184, 0.28)'
                    : 'rgba(251, 146, 60, 0.30)'

              const valueColor =
                position === 1
                  ? '#fbbf24'
                  : position === 2
                    ? '#cbd5e1'
                    : '#fdba74'

              const background =
                position === 1
                  ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.13) 0%, rgba(9, 11, 15, 0.72) 100%)'
                  : position === 2
                    ? 'linear-gradient(135deg, rgba(148, 163, 184, 0.12) 0%, rgba(9, 11, 15, 0.72) 100%)'
                    : 'linear-gradient(135deg, rgba(251, 146, 60, 0.12) 0%, rgba(9, 11, 15, 0.72) 100%)'

              return (
                <div
                  key={seller.seller_id}
                  style={{
                    border: `1px solid ${borderColor}`,
                    background,
                    borderRadius: 16,
                    padding: 15,
                    minHeight: 126,
                    display: 'grid',
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 10,
                      alignItems: 'center',
                    }}
                  >
                    <div
                      style={{
                        border: `1px solid ${borderColor}`,
                        background: 'rgba(9, 11, 15, 0.42)',
                        borderRadius: 999,
                        padding: '5px 9px',
                        color: valueColor,
                        fontSize: 11.5,
                        fontWeight: 950,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {positionLabel}
                    </div>

                    <div
                      style={{
                        color: valueColor,
                        fontSize: 20,
                        fontWeight: 950,
                        letterSpacing: -0.4,
                        lineHeight: 1,
                      }}
                    >
                      #{position}
                    </div>
                  </div>

                  <div>
                    <div
                      style={{
                        color: UI.textPrimary,
                        fontSize: 14,
                        fontWeight: 950,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={seller.seller_name}
                    >
                      {seller.seller_name}
                    </div>

                    {seller.seller_email ? (
                      <div
                        style={{
                          marginTop: 3,
                          color: UI.textSubtle,
                          fontSize: 11.5,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={seller.seller_email}
                      >
                        {seller.seller_email}
                      </div>
                    ) : null}
                  </div>

                  <div>
                    <div
                      style={{
                        color: valueColor,
                        fontSize: 22,
                        fontWeight: 950,
                        letterSpacing: -0.45,
                        lineHeight: 1,
                      }}
                    >
                      {faturamentoService.formatCurrency(seller.total)}
                    </div>

                    <div
                      style={{
                        marginTop: 6,
                        color: UI.textSubtle,
                        fontSize: 11.5,
                        lineHeight: 1.35,
                      }}
                    >
                      {seller.daysWithRevenue}{' '}
                      {seller.daysWithRevenue === 1 ? 'dia com faturamento' : 'dias com faturamento'}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 12.5,
            minWidth: 820,
          }}
        >
          <thead>
            <tr style={{ borderBottom: `1px solid ${UI.borderSoft}` }}>
              <th style={{ padding: '12px 14px', textAlign: 'left', color: UI.textMuted }}>
                Data
              </th>
              <th style={{ padding: '12px 14px', textAlign: 'right', color: UI.textMuted }}>
                Faturamento Real
              </th>
              <th style={{ padding: '12px 14px', textAlign: 'center', color: UI.textMuted }}>
                Vendas do dia
              </th>
              <th style={{ padding: '12px 14px', textAlign: 'center', color: UI.textMuted }}>
                Ajuste
              </th>
            </tr>
          </thead>

          <tbody>
            {sortedDates.map((date) => {
              const realValue = calendarData[date] ?? 0
              const canEdit = sourceType === 'seller' || sourceType === 'extra'
              const canOpenSales = sourceType !== 'extra'

              return (
                <tr
                  key={date}
                  style={{
                    borderBottom: `1px solid ${UI.borderMuted}`,
                    background: realValue > 0 ? 'rgba(34, 197, 94, 0.035)' : 'transparent',
                  }}
                >
                  <td style={{ padding: '13px 14px', color: UI.textSecondary, fontWeight: 750 }}>
                    {faturamentoService.formatDate(date)}
                  </td>

                  <td
                    style={{
                      padding: '13px 14px',
                      textAlign: 'right',
                      fontWeight: 950,
                      color: realValue > 0 ? UI.textPrimary : UI.textMuted,
                    }}
                  >
                    {faturamentoService.formatCurrency(realValue)}
                  </td>

                  <td style={{ padding: '13px 14px', textAlign: 'center' }}>
                    <button
                      type="button"
                      onClick={() => void handleOpenSalesDetails(date)}
                      disabled={!canOpenSales}
                      title={!canOpenSales ? 'Fontes extras não possuem vendas do Kanban vinculadas.' : undefined}
                      style={{
                        ...buttonBase,
                        height: 32,
                        border: canOpenSales
                          ? '1px solid rgba(59, 130, 246, 0.34)'
                          : `1px solid ${UI.borderMuted}`,
                        background: canOpenSales
                          ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.18), rgba(37, 99, 235, 0.08))'
                          : 'rgba(9, 11, 15, 0.42)',
                        color: canOpenSales ? '#bfdbfe' : UI.textSubtle,
                        cursor: canOpenSales ? 'pointer' : 'not-allowed',
                        opacity: canOpenSales ? 1 : 0.5,
                      }}
                    >
                      Ver vendas
                    </button>
                  </td>

                  <td style={{ padding: '13px 14px', textAlign: 'center' }}>
                    <button
                      type="button"
                      onClick={() => {
                        if (!canEdit) {
                          alert('Selecione um vendedor ou fonte extra para editar o faturamento do dia.')
                          return
                        }

                        if (sourceType === 'seller' && selectedSellerId) {
                          void handleEditCell('seller', selectedSellerId, date, realValue)
                          return
                        }

                        if (sourceType === 'extra' && selectedExtraId) {
                          void handleEditCell('extra', selectedExtraId, date, realValue)
                        }
                      }}
                      style={{
                        ...buttonBase,
                        height: 32,
                        border: `1px solid ${UI.borderSoft}`,
                        background: 'rgba(9, 11, 15, 0.64)',
                        color: UI.textSecondary,
                      }}
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      {salesModalOpen ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(2, 6, 23, 0.72)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 18,
          }}
          onClick={() => setSalesModalOpen(false)}
        >
          <div
            style={{
              width: 'min(920px, 100%)',
              maxHeight: '86vh',
              overflow: 'hidden',
              border: `1px solid ${UI.borderSoft}`,
              background:
                'linear-gradient(135deg, rgba(18, 22, 33, 0.98) 0%, rgba(9, 11, 15, 0.98) 100%)',
              borderRadius: 22,
              color: UI.textPrimary,
              boxShadow:
                '0 24px 80px rgba(0, 0, 0, 0.48), inset 0 1px 0 rgba(255, 255, 255, 0.04)',
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              style={{
                padding: '18px 20px',
                borderBottom: `1px solid ${UI.borderMuted}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 14,
              }}
            >
              <div>
                <div style={{ fontSize: 18, fontWeight: 950, letterSpacing: -0.3 }}>
                  Vendas registradas no dia
                </div>

                <div style={{ marginTop: 5, color: UI.textMuted, fontSize: 13 }}>
                  {salesModalDate ? faturamentoService.formatDate(salesModalDate) : 'Data não informada'}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSalesModalOpen(false)}
                style={{
                  ...buttonBase,
                  border: `1px solid ${UI.borderSoft}`,
                  background: 'rgba(9, 11, 15, 0.72)',
                  color: UI.textSecondary,
                }}
              >
                Fechar
              </button>
            </div>

            <div
              style={{
                padding: 20,
                overflow: 'auto',
                maxHeight: 'calc(86vh - 76px)',
              }}
            >
              {salesModalLoading ? (
                <div style={{ color: UI.textMuted, fontSize: 13 }}>
                  Carregando vendas...
                </div>
              ) : null}

              {salesModalError ? (
                <div
                  style={{
                    border: '1px solid rgba(239, 68, 68, 0.28)',
                    background: UI.redSoft,
                    color: '#fecaca',
                    borderRadius: 14,
                    padding: 12,
                    fontSize: 13,
                    fontWeight: 750,
                  }}
                >
                  {salesModalError}
                </div>
              ) : null}

              {!salesModalLoading && !salesModalError && salesDetails.length === 0 ? (
                <div
                  style={{
                    border: `1px solid ${UI.borderMuted}`,
                    background: 'rgba(9, 11, 15, 0.46)',
                    borderRadius: 16,
                    padding: 18,
                    color: UI.textMuted,
                    fontSize: 13,
                    lineHeight: 1.5,
                  }}
                >
                  Nenhuma venda do Kanban foi encontrada para este dia no escopo selecionado.
                </div>
              ) : null}

              {!salesModalLoading && !salesModalError && salesDetails.length > 0 ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  {salesDetails.map((sale) => (
                    <div
                      key={sale.cycle_id}
                      style={{
                        border: `1px solid ${UI.borderMuted}`,
                        background: 'rgba(9, 11, 15, 0.46)',
                        borderRadius: 16,
                        padding: 14,
                        display: 'grid',
                        gap: 12,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 12,
                          alignItems: 'flex-start',
                          flexWrap: 'wrap',
                        }}
                      >
                        <div>
                          <div style={{ color: UI.textPrimary, fontSize: 15, fontWeight: 950 }}>
                            {sale.lead_name || 'Lead sem nome'}
                          </div>

                          <div style={{ marginTop: 4, color: UI.textMuted, fontSize: 12.5 }}>
                            Vendedor: {formatPerson(sale.seller_name, sale.seller_email)}
                          </div>
                        </div>

                        <div
                          style={{
                            color: '#86efac',
                            fontSize: 18,
                            fontWeight: 950,
                            letterSpacing: -0.25,
                          }}
                        >
                          {faturamentoService.formatCurrency(Number(sale.won_total || 0))}
                        </div>
                      </div>

                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                          gap: 10,
                        }}
                      >
                        <div
                          style={{
                            border: `1px solid ${UI.borderMuted}`,
                            background: 'rgba(13, 15, 20, 0.62)',
                            borderRadius: 12,
                            padding: 11,
                          }}
                        >
                          <div style={{ color: UI.textSubtle, fontSize: 11.5, fontWeight: 850 }}>
                            Produto
                          </div>

                          <div
                            style={{
                              marginTop: 6,
                              color: UI.textSecondary,
                              fontSize: 13,
                              fontWeight: 800,
                            }}
                          >
                            {sale.product_name || 'Sem produto vinculado'}
                          </div>

                          {sale.product_category ? (
                            <div style={{ marginTop: 3, color: UI.textSubtle, fontSize: 11.5 }}>
                              {sale.product_category}
                            </div>
                          ) : null}
                        </div>

                        <div
                          style={{
                            border: `1px solid ${UI.borderMuted}`,
                            background: 'rgba(13, 15, 20, 0.62)',
                            borderRadius: 12,
                            padding: 11,
                          }}
                        >
                          <div style={{ color: UI.textSubtle, fontSize: 11.5, fontWeight: 850 }}>
                            Meio de pagamento
                          </div>

                          <div
                            style={{
                              marginTop: 6,
                              color: UI.textSecondary,
                              fontSize: 13,
                              fontWeight: 800,
                            }}
                          >
                            {formatPaymentLabel(sale.payment_method)}
                          </div>
                        </div>

                        <div
                          style={{
                            border: `1px solid ${UI.borderMuted}`,
                            background: 'rgba(13, 15, 20, 0.62)',
                            borderRadius: 12,
                            padding: 11,
                          }}
                        >
                          <div style={{ color: UI.textSubtle, fontSize: 11.5, fontWeight: 850 }}>
                            Estrutura
                          </div>

                          <div
                            style={{
                              marginTop: 6,
                              color: UI.textSecondary,
                              fontSize: 13,
                              fontWeight: 800,
                            }}
                          >
                            {formatPaymentLabel(sale.payment_type)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {showAddSourceModal ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(2, 6, 23, 0.72)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 18,
          }}
          onClick={() => setShowAddSourceModal(false)}
        >
          <div
            style={{
              background: UI.surface,
              border: `1px solid ${UI.borderSoft}`,
              borderRadius: 18,
              padding: 22,
              width: 'min(420px, 100%)',
              color: UI.textPrimary,
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ fontSize: 16, fontWeight: 950, marginBottom: 16 }}>
              Adicionar Fonte de Faturamento
            </div>

            <input
              type="text"
              placeholder="Nome da fonte (ex: Consultoria, Parceria)"
              value={newSourceName}
              onChange={(event) => setNewSourceName(event.target.value)}
              style={{
                ...inputBase,
                width: '100%',
                marginBottom: 16,
              }}
            />

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={handleAddSource}
                disabled={saving}
                style={{
                  ...buttonBase,
                  flex: 1,
                  border: '1px solid rgba(34, 197, 94, 0.38)',
                  background: UI.green,
                  color: '#052e16',
                  opacity: saving ? 0.5 : 1,
                  cursor: saving ? 'not-allowed' : 'pointer',
                }}
              >
                {saving ? 'Criando...' : 'Criar'}
              </button>

              <button
                type="button"
                onClick={() => setShowAddSourceModal(false)}
                disabled={saving}
                style={{
                  ...buttonBase,
                  flex: 1,
                  border: `1px solid ${UI.borderSoft}`,
                  background: 'rgba(9, 11, 15, 0.72)',
                  color: UI.textSecondary,
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showEditModal && editingCell ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(2, 6, 23, 0.72)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 18,
          }}
          onClick={() => setShowEditModal(false)}
        >
          <div
            style={{
              background: UI.surface,
              border: `1px solid ${UI.borderSoft}`,
              borderRadius: 18,
              padding: 22,
              width: 'min(460px, 100%)',
              color: UI.textPrimary,
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ fontSize: 16, fontWeight: 950, marginBottom: 18 }}>
              Editar Faturamento Real
            </div>

            <div style={{ marginBottom: 14 }}>
              <label
                style={{
                  fontSize: 12,
                  fontWeight: 850,
                  display: 'block',
                  marginBottom: 7,
                  color: UI.textMuted,
                }}
              >
                Valor Real
              </label>

              <input
                type="number"
                step="0.01"
                value={editRealValue}
                onChange={(event) => setEditRealValue(event.target.value)}
                style={{ ...inputBase, width: '100%' }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label
                style={{
                  fontSize: 12,
                  fontWeight: 850,
                  display: 'block',
                  marginBottom: 7,
                  color: UI.textMuted,
                }}
              >
                Motivo
              </label>

              <select
                value={editReason}
                onChange={(event) => setEditReason(event.target.value)}
                style={{ ...inputBase, width: '100%' }}
              >
                <option>Conciliação</option>
                <option>Venda fora do cockpit</option>
                <option>Cancelamento</option>
                <option>Correção</option>
                <option>Outro</option>
              </select>
            </div>

            <div style={{ marginBottom: 18 }}>
              <label
                style={{
                  fontSize: 12,
                  fontWeight: 850,
                  display: 'block',
                  marginBottom: 7,
                  color: UI.textMuted,
                }}
              >
                Notas
              </label>

              <textarea
                value={editNotes}
                onChange={(event) => setEditNotes(event.target.value)}
                placeholder="Detalhes adicionais..."
                style={{
                  width: '100%',
                  minHeight: 82,
                  borderRadius: 12,
                  border: `1px solid ${UI.borderSoft}`,
                  background: 'rgba(9, 11, 15, 0.72)',
                  color: UI.textPrimary,
                  padding: 11,
                  fontSize: 12.5,
                  resize: 'vertical',
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={saving}
                style={{
                  ...buttonBase,
                  flex: 1,
                  border: '1px solid rgba(34, 197, 94, 0.38)',
                  background: UI.green,
                  color: '#052e16',
                  opacity: saving ? 0.5 : 1,
                  cursor: saving ? 'not-allowed' : 'pointer',
                }}
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </button>

              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                disabled={saving}
                style={{
                  ...buttonBase,
                  flex: 1,
                  border: `1px solid ${UI.borderSoft}`,
                  background: 'rgba(9, 11, 15, 0.72)',
                  color: UI.textSecondary,
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}