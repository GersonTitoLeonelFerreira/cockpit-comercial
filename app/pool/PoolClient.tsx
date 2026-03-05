'use client'

import * as React from 'react'
import Link from 'next/link'
import { supabaseBrowser } from '../lib/supabaseBrowser'
import { getPoolCycles, assignCycleOwner } from '../lib/salesCyclesService'
import type { PoolCycle } from '../types/sales_cycles'

type Profile = {
  id: string
  full_name: string | null
  email: string | null
  role: string
}

function onlyDigits(v: string | null) {
  return (v ?? '').replace(/\D/g, '')
}

function formatPhone(phone: string | null) {
  if (!phone) return 'Sem telefone'
  const d = onlyDigits(phone)
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return phone
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function PoolClient({
  userId,
  companyId,
  userLabel,
}: {
  userId: string
  companyId: string
  userLabel: string
}) {
  const sb = React.useMemo(() => supabaseBrowser(), [])

  const [sellers, setSellers] = React.useState<Profile[]>([])
  const [cycles, setCycles] = React.useState<PoolCycle[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [assigningId, setAssigningId] = React.useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [{ data: sellersData, error: sellersErr }, poolCycles] = await Promise.all([
        sb
          .from('profiles')
          .select('id, full_name, email, role')
          .eq('company_id', companyId)
          .in('role', ['seller', 'consultor'])
          .order('full_name', { ascending: true }),
        getPoolCycles(companyId),
      ])

      if (!sellersErr) setSellers((sellersData ?? []) as Profile[])
      setCycles(poolCycles)
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao carregar pool.')
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId])

  async function assignCycle(cycleId: string, newOwnerId: string) {
    if (!newOwnerId) return
    setAssigningId(cycleId)
    try {
      await assignCycleOwner(cycleId, companyId, newOwnerId, userId)
      setCycles((prev) => prev.filter((c) => c.id !== cycleId))
    } catch (e: any) {
      alert(`Erro ao encaminhar ciclo: ${e?.message ?? String(e)}`)
    } finally {
      setAssigningId(null)
    }
  }

  return (
    <div style={{ color: 'white' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Pool de Ciclos (Admin)</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Logado como: {userLabel}</div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link
            href="/leads"
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid #2a2a2a',
              background: '#111',
              color: 'white',
              textDecoration: 'none',
              fontSize: 13,
            }}
          >
            Ver Pipeline
          </Link>

          <Link
            href="/sales-cycles"
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid #2a2a2a',
              background: '#111',
              color: 'white',
              textDecoration: 'none',
              fontSize: 13,
            }}
          >
            Ciclos de Vendas
          </Link>

          <button
            type="button"
            onClick={load}
            disabled={loading}
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid #2a2a2a',
              background: '#111',
              color: 'white',
              cursor: 'pointer',
              fontSize: 13,
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Carregando…' : '↺ Atualizar'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error ? (
        <div style={{ marginTop: 14, color: '#f66', fontSize: 13 }}>{error}</div>
      ) : null}

      {/* Cycles list */}
      <div
        style={{
          marginTop: 14,
          border: '1px solid #222',
          borderRadius: 14,
          background: '#0f0f0f',
          padding: 12,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
          <div style={{ fontWeight: 800 }}>Novos (sem responsável)</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>{cycles.length} ciclo(s)</div>
        </div>

        {loading ? (
          <div style={{ opacity: 0.8 }}>Carregando…</div>
        ) : cycles.length === 0 ? (
          <div style={{ opacity: 0.7, fontSize: 13 }}>Nenhum ciclo no pool.</div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {cycles.map((cycle) => (
              <div
                key={cycle.id}
                style={{
                  border: '1px solid #2a2a2a',
                  borderRadius: 12,
                  padding: 12,
                  background: '#0b0b0b',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                  alignItems: 'center',
                }}
              >
                <div style={{ minWidth: 200 }}>
                  <div style={{ fontWeight: 800 }}>{cycle.lead_name ?? 'Lead sem nome'}</div>
                  <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>
                    {formatPhone(cycle.lead_phone)}
                  </div>
                  {cycle.next_action ? (
                    <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                      Próxima ação: {cycle.next_action}
                    </div>
                  ) : null}
                  <div style={{ fontSize: 11, opacity: 0.5, marginTop: 4 }}>
                    Criado em: {formatDate(cycle.created_at)}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select
                    defaultValue=""
                    onChange={(e) => assignCycle(cycle.id, e.target.value)}
                    disabled={assigningId === cycle.id}
                    aria-label={`Encaminhar ciclo de ${cycle.lead_name ?? 'lead'}`}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '1px solid #2a2a2a',
                      background: '#111',
                      color: 'white',
                      cursor: 'pointer',
                      minWidth: 220,
                    }}
                  >
                    <option value="" disabled>
                      Encaminhar para…
                    </option>
                    {sellers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {(s.full_name ?? s.email ?? s.id) + ` (${s.role})`}
                      </option>
                    ))}
                  </select>

                  {assigningId === cycle.id ? (
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Encaminhando…</div>
                  ) : null}

                  <Link
                    href={`/sales-cycles/${cycle.id}`}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '1px solid #2a2a2a',
                      background: '#111',
                      color: 'white',
                      textDecoration: 'none',
                      fontSize: 12,
                    }}
                  >
                    Detalhe →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}