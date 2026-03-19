'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/app/lib/supabaseBrowser'
import * as adminSellers from '@/app/lib/services/admin-sellers'
import type { SellerStats } from '@/app/lib/services/admin-sellers'

const PERIOD_OPTIONS = [
  { label: '7 dias', value: 7 },
  { label: '30 dias', value: 30 },
  { label: '90 dias', value: 90 },
]

export default function VendedoresClient() {
  const router = useRouter()
  const supabase = useMemo(() => supabaseBrowser(), [])

  const [sellers, setSellers] = useState<SellerStats[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all')
  const [pDays, setPDays] = useState(30)
  const [saving, setSaving] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await adminSellers.listSellersStats(supabase, pDays)
      setSellers(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar vendedores')
    } finally {
      setLoading(false)
    }
  }, [supabase, pDays])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const filtered = sellers.filter((s) => {
    const matchSearch =
      !search ||
      s.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      s.email?.toLowerCase().includes(search.toLowerCase())
    const matchActive =
      filterActive === 'all' ||
      (filterActive === 'active' && s.is_active) ||
      (filterActive === 'inactive' && !s.is_active)
    return matchSearch && matchActive
  })

  const handleToggleActive = async (seller: SellerStats) => {
    if (saving) return
    setSaving(seller.seller_id)
    try {
      await adminSellers.updateSellerAccess(
        supabase,
        seller.seller_id,
        seller.role,
        !seller.is_active
      )
      setSellers((prev) =>
        prev.map((s) =>
          s.seller_id === seller.seller_id
            ? { ...s, is_active: !s.is_active }
            : s
        )
      )
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Erro ao atualizar vendedor')
    } finally {
      setSaving(null)
    }
  }

  const roleLabel = (role: string) => {
    if (role === 'admin') return 'Admin'
    if (role === 'manager') return 'Gerente'
    return 'Vendedor'
  }

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 24,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>
            Gestão de Vendedores
          </h1>
          <p style={{ fontSize: 13, opacity: 0.6, margin: '4px 0 0' }}>
            Visualize métricas e gerencie acesso dos vendedores
          </p>
        </div>
        <button
          onClick={() => router.push('/admin/vendedores/novo')}
          style={{
            padding: '10px 18px',
            borderRadius: 10,
            border: '1px solid #2a2a2a',
            background: '#1a6b3c',
            color: 'white',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + Cadastrar vendedor
        </button>
      </div>

      {/* Filtros */}
      <div
        style={{
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          marginBottom: 16,
        }}
      >
        <input
          type="text"
          placeholder="Buscar por nome ou email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: '1 1 200px',
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid #2a2a2a',
            background: '#111',
            color: 'white',
            fontSize: 13,
          }}
        />

        <select
          value={filterActive}
          onChange={(e) =>
            setFilterActive(e.target.value as 'all' | 'active' | 'inactive')
          }
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid #2a2a2a',
            background: '#111',
            color: 'white',
            fontSize: 13,
          }}
        >
          <option value="all">Todos</option>
          <option value="active">Ativos</option>
          <option value="inactive">Inativos</option>
        </select>

        <select
          value={pDays}
          onChange={(e) => setPDays(Number(e.target.value))}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid #2a2a2a',
            background: '#111',
            color: 'white',
            fontSize: 13,
          }}
        >
          {PERIOD_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <button
          onClick={() => void loadData()}
          disabled={loading}
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            border: '1px solid #2a2a2a',
            background: '#111',
            color: 'white',
            fontSize: 13,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Carregando...' : 'Atualizar'}
        </button>
      </div>

      {/* Erro */}
      {error && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 8,
            background: '#2a0a0a',
            border: '1px solid #6b2020',
            color: '#f87171',
            marginBottom: 16,
            fontSize: 13,
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {/* Tabela */}
      <div
        style={{
          overflowX: 'auto',
          borderRadius: 10,
          border: '1px solid #222',
        }}
      >
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 13,
          }}
        >
          <thead>
            <tr style={{ background: '#111', borderBottom: '1px solid #222' }}>
              {[
                'Nome',
                'Email',
                'Role',
                'Ativo',
                'Carteira',
                'Novo',
                'Contato',
                'Respondeu',
                'Negoc.',
                `Ganhos (${pDays}d)`,
                `Perdidos (${pDays}d)`,
                'Últ. atividade',
                'Ações',
              ].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: '10px 12px',
                    textAlign: 'left',
                    fontWeight: 700,
                    opacity: 0.7,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && !loading && (
              <tr>
                <td
                  colSpan={13}
                  style={{
                    padding: '24px 12px',
                    textAlign: 'center',
                    opacity: 0.5,
                  }}
                >
                  Nenhum vendedor encontrado.
                </td>
              </tr>
            )}
            {filtered.map((s) => (
              <tr
                key={s.seller_id}
                style={{
                  borderBottom: '1px solid #1a1a1a',
                  opacity: s.is_active ? 1 : 0.55,
                }}
              >
                <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                  {s.full_name || '—'}
                </td>
                <td style={{ padding: '10px 12px', opacity: 0.8 }}>
                  {s.email || '—'}
                </td>
                <td style={{ padding: '10px 12px' }}>{roleLabel(s.role)}</td>
                <td style={{ padding: '10px 12px' }}>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 20,
                      fontSize: 11,
                      fontWeight: 600,
                      background: s.is_active ? '#0d2a1a' : '#2a0d0d',
                      color: s.is_active ? '#4ade80' : '#f87171',
                    }}
                  >
                    {s.is_active ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                  {s.active_cycles_count}
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                  {s.novo_count}
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                  {s.contato_count}
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                  {s.respondeu_count}
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                  {s.negociacao_count}
                </td>
                <td
                  style={{
                    padding: '10px 12px',
                    textAlign: 'center',
                    color: '#4ade80',
                  }}
                >
                  {s.ganho_count_period}
                </td>
                <td
                  style={{
                    padding: '10px 12px',
                    textAlign: 'center',
                    color: '#f87171',
                  }}
                >
                  {s.perdido_count_period}
                </td>
                <td
                  style={{
                    padding: '10px 12px',
                    opacity: 0.7,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {s.last_activity_at
                    ? new Date(s.last_activity_at).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: 'short',
                        year: '2-digit',
                      })
                    : '—'}
                </td>
                <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() =>
                        router.push(`/admin/vendedores/${s.seller_id}`)
                      }
                      style={{
                        padding: '5px 10px',
                        borderRadius: 6,
                        border: '1px solid #2a2a2a',
                        background: '#111',
                        color: 'white',
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      Ver detalhes
                    </button>
                    <button
                      onClick={() => void handleToggleActive(s)}
                      disabled={saving === s.seller_id}
                      style={{
                        padding: '5px 10px',
                        borderRadius: 6,
                        border: '1px solid #2a2a2a',
                        background: s.is_active ? '#2a1010' : '#102a10',
                        color: s.is_active ? '#f87171' : '#4ade80',
                        fontSize: 12,
                        cursor:
                          saving === s.seller_id ? 'not-allowed' : 'pointer',
                        opacity: saving === s.seller_id ? 0.6 : 1,
                      }}
                    >
                      {saving === s.seller_id
                        ? '...'
                        : s.is_active
                        ? 'Desativar'
                        : 'Ativar'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {loading && (
        <p style={{ textAlign: 'center', opacity: 0.5, marginTop: 16 }}>
          Carregando...
        </p>
      )}
    </div>
  )
}
