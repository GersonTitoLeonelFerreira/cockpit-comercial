'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { supabaseBrowser } from '@/app/lib/supabaseBrowser'
import * as faturamentoService from '@/app/lib/services/faturamento'

type SourceType = 'empresa' | 'seller' | 'extra'

export default function FaturamentoPage() {
  const supabase = useMemo(() => supabaseBrowser(), [])

  // Estado de data
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)

  // Estado de filtro
  const [sourceType, setSourceType] = useState<SourceType>('empresa')
  const [selectedSellerId, setSelectedSellerId] = useState<string | null>(null)
  const [selectedExtraId, setSelectedExtraId] = useState<string | null>(null)

  // Dados
  const [sellers, setSellers] = useState<faturamentoService.Seller[]>([])
  const [extras, setExtras] = useState<faturamentoService.RevenueExtraSource[]>([])
  const [revenueSellers, setRevenueSellers] = useState<
    faturamentoService.RevenueDailySeller[]
  >([])
  const [revenueExtras, setRevenueExtras] = useState<
    faturamentoService.RevenueDailyExtra[]
  >([])

  // Estados de UI
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

  // Carregar dados iniciais
  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const [sellersData, extrasData, revenueSellerData, revenueExtraData] =
        await Promise.all([
          faturamentoService.getSellers(supabase),
          faturamentoService.getRevenueExtraSources(supabase),
          faturamentoService.getRevenueDailySellers(supabase),
          faturamentoService.getRevenueDailyExtras(supabase),
        ])

      setSellers(sellersData)
      setExtras(extrasData)
      setRevenueSellers(revenueSellerData)
      setRevenueExtras(revenueExtraData)
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao carregar dados')
      console.error('Erro ao carregar dados:', e)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    void loadData()
  }, [loadData])

  // Handlers
  const handlePreviousMonth = () => {
    const { year: newYear, month: newMonth } =
      faturamentoService.getPreviousMonth(year, month)
    setYear(newYear)
    setMonth(newMonth)
  }

  const handleNextMonth = () => {
    const { year: newYear, month: newMonth } =
      faturamentoService.getNextMonth(year, month)
    setYear(newYear)
    setMonth(newMonth)
  }

  const handleSourceChange = (value: string) => {
    if (value === '') {
      setSourceType('empresa')
      setSelectedSellerId(null)
      setSelectedExtraId(null)
    } else {
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
  }

  const handleAddSource = async () => {
    if (!newSourceName.trim()) {
      alert('Nome da fonte não pode estar vazio')
      return
    }

    try {
      setSaving(true)
      await faturamentoService.createRevenueExtraSource(supabase, newSourceName)
      setNewSourceName('')
      setShowAddSourceModal(false)
      await loadData()
      alert('✓ Fonte de faturamento criada com sucesso!')
    } catch (e: any) {
      alert(`❌ Erro: ${e?.message ?? String(e)}`)
    } finally {
      setSaving(false)
    }
  }

  const handleEditCell = async (
    sourceKind: 'seller' | 'extra',
    sourceId: string,
    refDate: string,
    currentValue: number
  ) => {
    setEditingCell({ sourceKind, sourceId, refDate })
    setEditRealValue(currentValue.toString())
    setEditReason('Conciliação')
    setEditNotes('')
    setShowEditModal(true)
  }

  const handleSaveEdit = async () => {
    if (!editingCell) return

    const realValue = parseFloat(editRealValue) || 0

    try {
      setSaving(true)
      await faturamentoService.upsertRevenueOverride(
        supabase,
        editingCell.sourceKind,
        editingCell.sourceId,
        editingCell.refDate,
        realValue,
        editReason,
        editNotes
      )
      setShowEditModal(false)
      await loadData()
      alert('✓ Faturamento atualizado com sucesso!')
    } catch (e: any) {
      alert(`❌ Erro: ${e?.message ?? String(e)}`)
    } finally {
      setSaving(false)
    }
  }

  // Calcular KPIs
  const kpis = useMemo(() => {
    const datesOfMonth = faturamentoService.getDatesOfMonth(year, month)
    let totalReal = 0

    if (sourceType === 'empresa') {
      revenueSellers.forEach((r) => {
        if (datesOfMonth.includes(r.ref_date)) {
          totalReal += r.real_value
        }
      })
      revenueExtras.forEach((r) => {
        if (datesOfMonth.includes(r.ref_date)) {
          totalReal += r.real_value
        }
      })
    } else if (sourceType === 'seller' && selectedSellerId) {
      revenueSellers.forEach((r) => {
        if (
          r.seller_id === selectedSellerId &&
          datesOfMonth.includes(r.ref_date)
        ) {
          totalReal += r.real_value
        }
      })
    } else if (sourceType === 'extra' && selectedExtraId) {
      revenueExtras.forEach((r) => {
        if (
          r.extra_id === selectedExtraId &&
          datesOfMonth.includes(r.ref_date)
        ) {
          totalReal += r.real_value
        }
      })
    }

    return { real: totalReal }
  }, [year, month, sourceType, selectedSellerId, selectedExtraId, revenueSellers, revenueExtras])

  // Dados para exibição no calendário
  const datesOfMonth = useMemo(
    () => faturamentoService.getDatesOfMonth(year, month),
    [year, month]
  )

  const calendarData = useMemo(() => {
    const result: Record<string, number> = {}

    datesOfMonth.forEach((date) => {
      result[date] = 0
    })

    if (sourceType === 'empresa') {
      revenueSellers.forEach((r) => {
        if (result[r.ref_date] !== undefined) {
          result[r.ref_date] += r.real_value
        }
      })
      revenueExtras.forEach((r) => {
        if (result[r.ref_date] !== undefined) {
          result[r.ref_date] += r.real_value
        }
      })
    } else if (sourceType === 'seller' && selectedSellerId) {
      revenueSellers.forEach((r) => {
        if (r.seller_id === selectedSellerId && result[r.ref_date] !== undefined) {
          result[r.ref_date] = r.real_value
        }
      })
    } else if (sourceType === 'extra' && selectedExtraId) {
      revenueExtras.forEach((r) => {
        if (r.extra_id === selectedExtraId && result[r.ref_date] !== undefined) {
          result[r.ref_date] = r.real_value
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

  const sortedDates = useMemo(() => {
    return [...datesOfMonth].sort()
  }, [datesOfMonth])

  const selectValue = useMemo(() => {
    if (sourceType === 'empresa') return ''
    if (sourceType === 'seller') return selectedSellerId || ''
    if (sourceType === 'extra') return selectedExtraId || ''
    return ''
  }, [sourceType, selectedSellerId, selectedExtraId])

  if (loading) {
    return <div style={{ color: 'white', opacity: 0.7 }}>Carregando…</div>
  }

  return (
    <div style={{ color: 'white' }}>
      {/* HEADER */}
      <div
        style={{
          display: 'flex',
          gap: 16,
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: 24,
        }}
      >
        {/* Seletor de Mês */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={handlePreviousMonth}
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid #2a2a2a',
              background: '#111',
              color: 'white',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            ◀
          </button>
          <div style={{ minWidth: 140, textAlign: 'center', fontWeight: 900 }}>
            {faturamentoService.formatMonthYear(year, month)}
          </div>
          <button
            onClick={handleNextMonth}
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid #2a2a2a',
              background: '#111',
              color: 'white',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            ▶
          </button>
        </div>

        {/* Seletor de Fonte */}
        <select
          value={selectValue}
          onChange={(e) => handleSourceChange(e.target.value)}
          style={{
            padding: '8px 12px',
            borderRadius: 6,
            border: '1px solid #2a2a2a',
            background: '#111',
            color: 'white',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          <option value="">Empresa (Todos)</option>
          <optgroup label="Vendedores">
            {sellers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name || s.email || 'Sem nome'} ({s.role})
              </option>
            ))}
          </optgroup>
          {extras.length > 0 && (
            <optgroup label="Fontes Extras">
              {extras.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} (extra)
                </option>
              ))}
            </optgroup>
          )}
        </select>

        {/* Botão Adicionar Faturamento */}
        <button
          onClick={() => setShowAddSourceModal(true)}
          style={{
            padding: '8px 16px',
            borderRadius: 6,
            border: 'none',
            background: '#10b981',
            color: 'white',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 900,
          }}
        >
          + Adicionar Faturamento
        </button>

        {/* Botão Atualizar */}
        <button
          onClick={() => void loadData()}
          style={{
            padding: '8px 12px',
            borderRadius: 6,
            border: '1px solid #2a2a2a',
            background: '#111',
            color: 'white',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          Atualizar
        </button>
      </div>

      {error && (
        <div
          style={{
            background: '#7f1d1d',
            color: '#fecaca',
            padding: 12,
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}

      {/* KPI: Apenas Real */}
      <div
        style={{
          border: '1px solid #2a2a2a',
          borderRadius: 8,
          padding: 16,
          background: '#111',
          marginBottom: 24,
          maxWidth: 300,
        }}
      >
        <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 8 }}>
          Faturamento Real ({faturamentoService.formatMonthYear(year, month)})
        </div>
        <div style={{ fontSize: 28, fontWeight: 900, color: '#10b981' }}>
          {faturamentoService.formatCurrency(kpis.real)}
        </div>
      </div>

      {/* CALENDÁRIO */}
      <div
        style={{
          border: '1px solid #2a2a2a',
          borderRadius: 8,
          background: '#0f0f0f',
          padding: 16,
          overflowX: 'auto',
        }}
      >
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 12,
          }}
        >
          <thead>
            <tr style={{ borderBottom: '1px solid #2a2a2a' }}>
              <th
                style={{
                  padding: 12,
                  textAlign: 'left',
                  fontWeight: 900,
                  opacity: 0.7,
                }}
              >
                Data
              </th>
              <th
                style={{
                  padding: 12,
                  textAlign: 'right',
                  fontWeight: 900,
                  opacity: 0.7,
                }}
              >
                Faturamento Real
              </th>
              <th
                style={{
                  padding: 12,
                  textAlign: 'center',
                  fontWeight: 900,
                  opacity: 0.7,
                }}
              >
                Ação
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedDates.map((date) => {
              const realValue = calendarData[date] ?? 0
              return (
                <tr
                  key={date}
                  style={{ borderBottom: '1px solid #1a1a1a' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#151515'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <td style={{ padding: 12 }}>
                    {faturamentoService.formatDate(date)}
                  </td>
                  <td style={{ padding: 12, textAlign: 'right', fontWeight: 900 }}>
                    {faturamentoService.formatCurrency(realValue)}
                  </td>
                  <td style={{ padding: 12, textAlign: 'center' }}>
                    <button
                      onClick={() => {
                        if (sourceType === 'empresa') {
                          alert('Selecione um vendedor ou fonte extra para editar')
                        } else if (sourceType === 'seller' && selectedSellerId) {
                          void handleEditCell(
                            'seller',
                            selectedSellerId,
                            date,
                            realValue
                          )
                        } else if (sourceType === 'extra' && selectedExtraId) {
                          void handleEditCell(
                            'extra',
                            selectedExtraId,
                            date,
                            realValue
                          )
                        }
                      }}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 4,
                        border: '1px solid #2a2a2a',
                        background: '#111',
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: 11,
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
      </div>

      {/* MODAL: Adicionar Fonte */}
      {showAddSourceModal && (
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
          onClick={() => setShowAddSourceModal(false)}
        >
          <div
            style={{
              background: '#111',
              border: '1px solid #333',
              borderRadius: 12,
              padding: 24,
              width: '90%',
              maxWidth: 400,
              color: 'white',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 16 }}>
              + Adicionar Fonte de Faturamento
            </div>

            <input
              type="text"
              placeholder="Nome da fonte (ex: Consultoria, Parceria)"
              value={newSourceName}
              onChange={(e) => setNewSourceName(e.target.value)}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: 6,
                border: '1px solid #2a2a2a',
                background: '#0f0f0f',
                color: 'white',
                marginBottom: 16,
                fontSize: 12,
              }}
            />

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleAddSource}
                disabled={saving}
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
                  opacity: saving ? 0.5 : 1,
                }}
              >
                {saving ? 'Criando…' : 'Criar'}
              </button>
              <button
                onClick={() => setShowAddSourceModal(false)}
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
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Editar Real */}
      {showEditModal && editingCell && (
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
          onClick={() => setShowEditModal(false)}
        >
          <div
            style={{
              background: '#111',
              border: '1px solid #333',
              borderRadius: 12,
              padding: 24,
              width: '90%',
              maxWidth: 450,
              color: 'white',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 20 }}>
              Editar Faturamento Real
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 900, display: 'block', marginBottom: 8 }}>
                Valor Real
              </label>
              <input
                type="number"
                step="0.01"
                value={editRealValue}
                onChange={(e) => setEditRealValue(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: 6,
                  border: '1px solid #2a2a2a',
                  background: '#0f0f0f',
                  color: 'white',
                  fontSize: 12,
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 900, display: 'block', marginBottom: 8 }}>
                Motivo
              </label>
              <select
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: 6,
                  border: '1px solid #2a2a2a',
                  background: '#0f0f0f',
                  color: 'white',
                  fontSize: 12,
                }}
              >
                <option>Conciliação</option>
                <option>Venda fora do cockpit</option>
                <option>Cancelamento</option>
                <option>Correção</option>
                <option>Outro</option>
              </select>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 900, display: 'block', marginBottom: 8 }}>
                Notas (opcional)
              </label>
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Detalhes adicionais..."
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: 6,
                  border: '1px solid #2a2a2a',
                  background: '#0f0f0f',
                  color: 'white',
                  fontSize: 12,
                  minHeight: 80,
                  fontFamily: 'monospace',
                  resize: 'vertical',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleSaveEdit}
                disabled={saving}
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
                  opacity: saving ? 0.5 : 1,
                }}
              >
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
              <button
                onClick={() => setShowEditModal(false)}
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
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}