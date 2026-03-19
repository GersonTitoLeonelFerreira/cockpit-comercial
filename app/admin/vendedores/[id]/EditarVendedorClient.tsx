'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/app/lib/supabaseBrowser'
import * as adminSellers from '@/app/lib/services/admin-sellers'
import type { AdminEvent } from '@/app/lib/services/admin-sellers'

interface SellerData {
  id: string
  full_name: string | null
  email: string | null
  role: string
  is_active: boolean
}

interface Props {
  seller: SellerData
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  role_changed: 'Role alterada',
  seller_activated: 'Ativado',
  seller_deactivated: 'Desativado',
  seller_invited: 'Convidado',
}

export default function EditarVendedorClient({ seller }: Props) {
  const router = useRouter()
  const supabase = useMemo(() => supabaseBrowser(), [])

  const [role, setRole] = useState(seller.role)
  const [isActive, setIsActive] = useState(seller.is_active)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [events, setEvents] = useState<AdminEvent[]>([])
  const [loadingEvents, setLoadingEvents] = useState(false)

  const loadEvents = useCallback(async () => {
    setLoadingEvents(true)
    try {
      const data = await adminSellers.getSellerEvents(supabase, seller.id)
      setEvents(data)
    } catch {
      // Silenciar erro de auditoria — não crítico
    } finally {
      setLoadingEvents(false)
    }
  }, [supabase, seller.id])

  useEffect(() => {
    void loadEvents()
  }, [loadEvents])

  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    setSaveMsg(null)
    setSaveError(null)
    try {
      await adminSellers.updateSellerAccess(supabase, seller.id, role, isActive)
      setSaveMsg('Alterações salvas com sucesso!')
      void loadEvents()
    } catch (e: unknown) {
      setSaveError(
        e instanceof Error ? e.message : 'Erro ao salvar alterações'
      )
    } finally {
      setSaving(false)
    }
  }

  const formatMetadata = (metadata: Record<string, unknown>) => {
    try {
      return Object.entries(metadata)
        .map(([k, v]) => `${k}: ${v}`)
        .join(' | ')
    } catch {
      return JSON.stringify(metadata)
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      {/* Voltar */}
      <button
        onClick={() => router.push('/admin/vendedores')}
        style={{
          background: 'none',
          border: 'none',
          color: 'white',
          opacity: 0.7,
          cursor: 'pointer',
          fontSize: 13,
          marginBottom: 20,
          padding: 0,
        }}
      >
        ← Voltar
      </button>

      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>
        Editar Vendedor
      </h1>
      <p style={{ fontSize: 13, opacity: 0.6, marginBottom: 24 }}>
        Gerencie acesso e permissões do vendedor.
      </p>

      {/* Dados do vendedor */}
      <div
        style={{
          border: '1px solid #222',
          borderRadius: 10,
          padding: 20,
          marginBottom: 20,
          background: '#0f0f0f',
        }}
      >
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>
          Dados do Vendedor
        </h2>

        <div style={{ display: 'grid', gap: 12 }}>
          {/* Nome — read-only */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                opacity: 0.6,
                marginBottom: 4,
              }}
            >
              Nome
            </label>
            <div
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #1a1a1a',
                background: '#0a0a0a',
                fontSize: 13,
                opacity: 0.8,
              }}
            >
              {seller.full_name || '—'}
            </div>
          </div>

          {/* Email — read-only */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                opacity: 0.6,
                marginBottom: 4,
              }}
            >
              Email
            </label>
            <div
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #1a1a1a',
                background: '#0a0a0a',
                fontSize: 13,
                opacity: 0.8,
              }}
            >
              {seller.email || '—'}
            </div>
          </div>

          {/* Role — editável */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                opacity: 0.6,
                marginBottom: 4,
              }}
            >
              Função / Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #2a2a2a',
                background: '#111',
                color: 'white',
                fontSize: 13,
                boxSizing: 'border-box',
              }}
            >
              <option value="member">Vendedor (member)</option>
              <option value="manager">Gerente (manager)</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          {/* Status — editável */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                opacity: 0.6,
                marginBottom: 4,
              }}
            >
              Status
            </label>
            <select
              value={isActive ? 'active' : 'inactive'}
              onChange={(e) => setIsActive(e.target.value === 'active')}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #2a2a2a',
                background: '#111',
                color: 'white',
                fontSize: 13,
                boxSizing: 'border-box',
              }}
            >
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </select>
          </div>
        </div>

        {/* Feedback */}
        {saveMsg && (
          <div
            style={{
              marginTop: 12,
              padding: '10px 14px',
              borderRadius: 8,
              background: '#0d2a1a',
              border: '1px solid #166534',
              color: '#4ade80',
              fontSize: 13,
            }}
          >
            ✅ {saveMsg}
          </div>
        )}
        {saveError && (
          <div
            style={{
              marginTop: 12,
              padding: '10px 14px',
              borderRadius: 8,
              background: '#2a0a0a',
              border: '1px solid #6b2020',
              color: '#f87171',
              fontSize: 13,
            }}
          >
            ⚠️ {saveError}
          </div>
        )}

        <button
          onClick={() => void handleSave()}
          disabled={saving}
          style={{
            marginTop: 16,
            padding: '10px 20px',
            borderRadius: 10,
            border: 'none',
            background: saving ? '#1a4a2a' : '#1a6b3c',
            color: 'white',
            fontSize: 14,
            fontWeight: 700,
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>

      {/* Log de auditoria */}
      <div
        style={{
          border: '1px solid #222',
          borderRadius: 10,
          padding: 20,
          background: '#0f0f0f',
        }}
      >
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>
          Log de auditoria recente
        </h2>

        {loadingEvents && (
          <p style={{ opacity: 0.5, fontSize: 13 }}>Carregando eventos...</p>
        )}

        {!loadingEvents && events.length === 0 && (
          <p style={{ opacity: 0.5, fontSize: 13 }}>
            Nenhum evento registrado.
          </p>
        )}

        {events.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 12,
              }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: '1px solid #222',
                    opacity: 0.6,
                  }}
                >
                  <th style={{ padding: '6px 10px', textAlign: 'left' }}>
                    Data/hora
                  </th>
                  <th style={{ padding: '6px 10px', textAlign: 'left' }}>
                    Tipo do evento
                  </th>
                  <th style={{ padding: '6px 10px', textAlign: 'left' }}>
                    Detalhes
                  </th>
                  <th style={{ padding: '6px 10px', textAlign: 'left' }}>
                    Admin
                  </th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => (
                  <tr
                    key={ev.id}
                    style={{ borderBottom: '1px solid #1a1a1a' }}
                  >
                    <td
                      style={{
                        padding: '8px 10px',
                        whiteSpace: 'nowrap',
                        opacity: 0.7,
                      }}
                    >
                      {new Date(ev.occurred_at).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 20,
                          background: '#1a1a2a',
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        {EVENT_TYPE_LABELS[ev.event_type] ?? ev.event_type}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: '8px 10px',
                        opacity: 0.7,
                        maxWidth: 260,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {formatMetadata(ev.metadata)}
                    </td>
                    <td
                      style={{
                        padding: '8px 10px',
                        opacity: 0.6,
                        fontFamily: 'monospace',
                        fontSize: 11,
                      }}
                    >
                      {ev.actor_user_id.slice(0, 8)}…
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
