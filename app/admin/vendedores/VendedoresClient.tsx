'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { supabaseBrowser } from '@/app/lib/supabaseBrowser'

type SellerRole = 'member' | 'seller' | 'consultor'

interface SellerStats {
  seller_id: string
  full_name: string | null
  email: string | null
  role: string
  is_active: boolean
  active_cycles_count: number
  novo_count: number
  contato_count: number
  respondeu_count: number
  negociacao_count: number
  ganho_count_period: number
  perdido_count_period: number
  last_activity_at: string | null
}

const ROLE_LABELS: Record<string, string> = {
  member: 'Membro',
  seller: 'Vendedor',
  consultor: 'Consultor',
}

const ALLOWED_ROLES: SellerRole[] = ['member', 'seller', 'consultor']

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

interface EditState {
  role: string
  is_active: boolean
}

export default function VendedoresClient() {
  const [sellers, setSellers] = useState<SellerStats[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState(30)
  const [editing, setEditing] = useState<Record<string, EditState>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [saveError, setSaveError] = useState<Record<string, string>>({})

  const fetchSellers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const supabase = supabaseBrowser()
      const { data, error: rpcErr } = await supabase.rpc('rpc_admin_list_sellers_stats', {
        p_days: days,
      })
      if (rpcErr) throw new Error(rpcErr.message)
      setSellers((data as SellerStats[]) || [])
    } catch (e: any) {
      setError(e?.message || 'Erro ao carregar vendedores')
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => {
    fetchSellers()
  }, [fetchSellers])

  const startEdit = (seller: SellerStats) => {
    setEditing((prev) => ({
      ...prev,
      [seller.seller_id]: { role: seller.role, is_active: seller.is_active },
    }))
    setSaveError((prev) => {
      const next = { ...prev }
      delete next[seller.seller_id]
      return next
    })
  }

  const cancelEdit = (sellerId: string) => {
    setEditing((prev) => {
      const next = { ...prev }
      delete next[sellerId]
      return next
    })
  }

  const saveEdit = async (sellerId: string) => {
    const state = editing[sellerId]
    if (!state) return
    setSaving((prev) => ({ ...prev, [sellerId]: true }))
    setSaveError((prev) => {
      const next = { ...prev }
      delete next[sellerId]
      return next
    })
    try {
      const supabase = supabaseBrowser()
      const { error: rpcErr } = await supabase.rpc('rpc_admin_update_seller_access', {
        p_seller_id: sellerId,
        p_role: state.role,
        p_is_active: state.is_active,
      })
      if (rpcErr) throw new Error(rpcErr.message)
      cancelEdit(sellerId)
      await fetchSellers()
    } catch (e: any) {
      setSaveError((prev) => ({ ...prev, [sellerId]: e?.message || 'Erro ao salvar' }))
    } finally {
      setSaving((prev) => ({ ...prev, [sellerId]: false }))
    }
  }

  const cell: React.CSSProperties = {
    padding: '10px 12px',
    borderBottom: '1px solid #1e1e1e',
    fontSize: 13,
    verticalAlign: 'middle',
  }

  const headerCell: React.CSSProperties = {
    ...cell,
    fontWeight: 700,
    opacity: 0.55,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    borderBottom: '1px solid #2a2a2a',
    paddingTop: 8,
    paddingBottom: 8,
  }

  return (
    <div>
      {/* Filtro de período */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <span style={{ fontSize: 13, opacity: 0.7 }}>Período de ganhos/perdidos:</span>
        {[7, 14, 30, 60, 90].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            style={{
              padding: '5px 12px',
              borderRadius: 8,
              border: '1px solid #2a2a2a',
              background: days === d ? '#222' : 'transparent',
              color: 'white',
              fontSize: 12,
              cursor: 'pointer',
              fontWeight: days === d ? 700 : 400,
            }}
          >
            {d}d
          </button>
        ))}
        <button
          onClick={fetchSellers}
          style={{
            marginLeft: 'auto',
            padding: '5px 14px',
            borderRadius: 8,
            border: '1px solid #2a2a2a',
            background: 'transparent',
            color: 'white',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          ↻ Atualizar
        </button>
      </div>

      {error && (
        <div
          style={{
            background: '#2a0000',
            border: '1px solid #660000',
            color: '#ff6666',
            padding: '10px 14px',
            borderRadius: 8,
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ opacity: 0.5, fontSize: 13 }}>Carregando vendedores…</div>
      ) : sellers.length === 0 ? (
        <div style={{ opacity: 0.5, fontSize: 13 }}>Nenhum vendedor encontrado.</div>
      ) : (
        <div
          style={{
            border: '1px solid #222',
            borderRadius: 10,
            overflow: 'auto',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead>
              <tr>
                <th style={headerCell}>Vendedor</th>
                <th style={headerCell}>Role</th>
                <th style={{ ...headerCell, textAlign: 'center' }}>Status</th>
                <th style={{ ...headerCell, textAlign: 'right' }}>Ativos</th>
                <th style={{ ...headerCell, textAlign: 'right' }}>Novo</th>
                <th style={{ ...headerCell, textAlign: 'right' }}>Contato</th>
                <th style={{ ...headerCell, textAlign: 'right' }}>Respondeu</th>
                <th style={{ ...headerCell, textAlign: 'right' }}>Negoc.</th>
                <th style={{ ...headerCell, textAlign: 'right' }}>✅ Ganhos</th>
                <th style={{ ...headerCell, textAlign: 'right' }}>❌ Perdidos</th>
                <th style={headerCell}>Última ação</th>
                <th style={{ ...headerCell, textAlign: 'center' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {sellers.map((s) => {
                const isEditing = Boolean(editing[s.seller_id])
                const editState = editing[s.seller_id]
                const isSaving = Boolean(saving[s.seller_id])
                const errMsg = saveError[s.seller_id]

                return (
                  <tr
                    key={s.seller_id}
                    style={{ background: isEditing ? '#111' : 'transparent' }}
                  >
                    <td style={cell}>
                      <div style={{ fontWeight: 600 }}>{s.full_name || '(sem nome)'}</div>
                      <div style={{ fontSize: 11, opacity: 0.5 }}>{s.email}</div>
                    </td>

                    <td style={cell}>
                      {isEditing ? (
                        <select
                          value={editState.role}
                          onChange={(e) =>
                            setEditing((prev) => ({
                              ...prev,
                              [s.seller_id]: { ...prev[s.seller_id], role: e.target.value },
                            }))
                          }
                          style={{
                            background: '#1a1a1a',
                            border: '1px solid #333',
                            color: 'white',
                            borderRadius: 6,
                            padding: '4px 8px',
                            fontSize: 12,
                          }}
                        >
                          {ALLOWED_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r] ?? r}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span style={{ fontSize: 12, opacity: 0.75 }}>
                          {ROLE_LABELS[s.role] ?? s.role}
                        </span>
                      )}
                    </td>

                    <td style={{ ...cell, textAlign: 'center' }}>
                      {isEditing ? (
                        <label
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            cursor: 'pointer',
                            fontSize: 12,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={editState.is_active}
                            onChange={(e) =>
                              setEditing((prev) => ({
                                ...prev,
                                [s.seller_id]: {
                                  ...prev[s.seller_id],
                                  is_active: e.target.checked,
                                },
                              }))
                            }
                          />
                          {editState.is_active ? 'Ativo' : 'Inativo'}
                        </label>
                      ) : (
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 12,
                            fontSize: 11,
                            fontWeight: 700,
                            background: s.is_active ? '#0a2a0a' : '#2a0a0a',
                            color: s.is_active ? '#4caf50' : '#f44336',
                            border: `1px solid ${s.is_active ? '#2a5a2a' : '#5a2a2a'}`,
                          }}
                        >
                          {s.is_active ? 'Ativo' : 'Inativo'}
                        </span>
                      )}
                    </td>

                    <td style={{ ...cell, textAlign: 'right' }}>{s.active_cycles_count}</td>
                    <td style={{ ...cell, textAlign: 'right', opacity: 0.6 }}>{s.novo_count}</td>
                    <td style={{ ...cell, textAlign: 'right', opacity: 0.6 }}>{s.contato_count}</td>
                    <td style={{ ...cell, textAlign: 'right', opacity: 0.6 }}>{s.respondeu_count}</td>
                    <td style={{ ...cell, textAlign: 'right', opacity: 0.6 }}>{s.negociacao_count}</td>
                    <td style={{ ...cell, textAlign: 'right', fontWeight: 600, color: '#4caf50' }}>
                      {s.ganho_count_period}
                    </td>
                    <td style={{ ...cell, textAlign: 'right', fontWeight: 600, color: '#f44336' }}>
                      {s.perdido_count_period}
                    </td>
                    <td style={{ ...cell, fontSize: 11, opacity: 0.6 }}>
                      {formatDate(s.last_activity_at)}
                    </td>

                    <td style={{ ...cell, textAlign: 'center' }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              onClick={() => saveEdit(s.seller_id)}
                              disabled={isSaving}
                              style={{
                                padding: '4px 12px',
                                borderRadius: 6,
                                border: '1px solid #2a5a2a',
                                background: '#0a2a0a',
                                color: '#4caf50',
                                fontSize: 12,
                                cursor: isSaving ? 'not-allowed' : 'pointer',
                              }}
                            >
                              {isSaving ? '…' : 'Salvar'}
                            </button>
                            <button
                              onClick={() => cancelEdit(s.seller_id)}
                              disabled={isSaving}
                              style={{
                                padding: '4px 12px',
                                borderRadius: 6,
                                border: '1px solid #2a2a2a',
                                background: 'transparent',
                                color: 'white',
                                fontSize: 12,
                                cursor: isSaving ? 'not-allowed' : 'pointer',
                              }}
                            >
                              Cancelar
                            </button>
                          </div>
                          {errMsg && (
                            <span style={{ color: '#f44336', fontSize: 11 }}>{errMsg}</span>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={() => startEdit(s)}
                          style={{
                            padding: '4px 12px',
                            borderRadius: 6,
                            border: '1px solid #2a2a2a',
                            background: 'transparent',
                            color: 'white',
                            fontSize: 12,
                            cursor: 'pointer',
                          }}
                        >
                          Editar
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
