'use client'

import { useMemo, useState } from 'react'

export type DemoRequestRow = {
  id: string
  created_at: string
  name: string
  company: string | null
  whatsapp: string | null
  email: string | null
  segment: string | null
  team_size: string | null
  current_control: string | null
  main_bottleneck: string | null
  leads_volume: string | null
  timeline: string | null
  message: string | null
  status: string | null
}

const STATUS_OPTIONS = [
  { value: 'new', label: 'Novo' },
  { value: 'contacted', label: 'Contatado' },
  { value: 'qualified', label: 'Qualificado' },
  { value: 'demo_scheduled', label: 'Demo agendada' },
  { value: 'closed', label: 'Fechado' },
  { value: 'lost', label: 'Perdido' },
] as const

const DS = {
  border: '#1a1d2e',
  text: '#edf2f7',
  textSoft: '#8fa3bc',
  textMuted: '#546070',
  blueSoft: '#93c5fd',
}

function normalizeText(value: string | null | undefined) {
  return (value || '').toLowerCase().trim()
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-'

  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return value
  }
}

function statusLabel(status: string | null | undefined) {
  return STATUS_OPTIONS.find((item) => item.value === status)?.label || status || 'Novo'
}

function statusTone(status: string | null | undefined) {
  switch (status) {
    case 'closed':
      return {
        border: 'rgba(34,197,94,0.24)',
        background: 'rgba(34,197,94,0.10)',
        color: '#bbf7d0',
      }
    case 'lost':
      return {
        border: 'rgba(239,68,68,0.24)',
        background: 'rgba(239,68,68,0.10)',
        color: '#fecaca',
      }
    case 'demo_scheduled':
      return {
        border: 'rgba(245,158,11,0.24)',
        background: 'rgba(245,158,11,0.10)',
        color: '#fde68a',
      }
    case 'qualified':
      return {
        border: 'rgba(59,130,246,0.24)',
        background: 'rgba(59,130,246,0.10)',
        color: '#bfdbfe',
      }
    case 'contacted':
      return {
        border: 'rgba(59,130,246,0.18)',
        background: 'rgba(59,130,246,0.08)',
        color: '#93c5fd',
      }
    default:
      return {
        border: '#1a1d2e',
        background: 'rgba(255,255,255,0.02)',
        color: '#8fa3bc',
      }
  }
}

export default function DemoRequestsClient({
  initialRows,
}: {
  initialRows: DemoRequestRow[]
}) {
  const [rows, setRows] = useState<DemoRequestRow[]>(initialRows)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [loadingRefresh, setLoadingRefresh] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const visibleRows = useMemo(() => {
    const q = normalizeText(search)

    return rows.filter((row) => {
      const matchesStatus = statusFilter === 'all' ? true : (row.status || 'new') === statusFilter

      const haystack = [
        row.name,
        row.company,
        row.email,
        row.whatsapp,
        row.segment,
        row.team_size,
        row.current_control,
        row.main_bottleneck,
        row.leads_volume,
        row.timeline,
        row.message,
      ]
        .map(normalizeText)
        .join(' ')

      const matchesSearch = q ? haystack.includes(q) : true

      return matchesStatus && matchesSearch
    })
  }, [rows, search, statusFilter])

  const counters = useMemo(() => {
    const map: Record<string, number> = {
      all: rows.length,
      new: 0,
      contacted: 0,
      qualified: 0,
      demo_scheduled: 0,
      closed: 0,
      lost: 0,
    }

    for (const row of rows) {
      const st = row.status || 'new'
      if (map[st] == null) map[st] = 0
      map[st] += 1
    }

    return map
  }, [rows])

  async function refreshRows() {
    if (loadingRefresh) return
    setErrorMessage(null)
    setLoadingRefresh(true)

    try {
      const res = await fetch('/api/platform/demo-requests', {
        method: 'GET',
        cache: 'no-store',
      })

      const json = await res.json()

      if (!res.ok) {
        throw new Error(json?.error || 'Falha ao carregar solicitações.')
      }

      setRows((json?.rows || []) as DemoRequestRow[])
    } catch (e: any) {
      setErrorMessage(e?.message || 'Erro ao atualizar lista.')
    } finally {
      setLoadingRefresh(false)
    }
  }

  async function updateStatus(id: string, status: string) {
    if (!id || !status) return

    setErrorMessage(null)
    setSavingId(id)

    try {
      const res = await fetch('/api/platform/demo-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })

      const json = await res.json()

      if (!res.ok) {
        throw new Error(json?.error || 'Falha ao atualizar status.')
      }

      setRows((prev) =>
        prev.map((row) =>
          row.id === id
            ? {
                ...row,
                status,
              }
            : row
        )
      )
    } catch (e: any) {
      setErrorMessage(e?.message || 'Erro ao atualizar status.')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div
        style={{
          borderRadius: 20,
          border: `1px solid ${DS.border}`,
          background: `linear-gradient(180deg, rgba(17,19,24,0.98) 0%, rgba(13,15,20,0.98) 100%)`,
          padding: 18,
          display: 'grid',
          gap: 14,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
            alignItems: 'center',
          }}
        >
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, empresa, email, WhatsApp ou contexto"
            style={{
              width: '100%',
              height: 46,
              borderRadius: 12,
              border: `1px solid ${DS.border}`,
              background: 'rgba(9,11,15,0.92)',
              color: DS.text,
              padding: '0 14px',
              outline: 'none',
              fontSize: 14,
              boxSizing: 'border-box',
            }}
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              width: '100%',
              height: 46,
              borderRadius: 12,
              border: `1px solid ${DS.border}`,
              background: 'rgba(9,11,15,0.92)',
              color: DS.text,
              padding: '0 14px',
              outline: 'none',
              fontSize: 14,
              boxSizing: 'border-box',
            }}
          >
            <option value="all">Todos os status</option>
            {STATUS_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={refreshRows}
            disabled={loadingRefresh}
            style={{
              height: 46,
              borderRadius: 12,
              border: '1px solid rgba(59,130,246,0.30)',
              background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              color: '#f8fbff',
              padding: '0 16px',
              fontSize: 14,
              fontWeight: 800,
              cursor: loadingRefresh ? 'not-allowed' : 'pointer',
            }}
          >
            {loadingRefresh ? 'Atualizando...' : 'Atualizar lista'}
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <CounterChip label="Todos" value={counters.all} active={statusFilter === 'all'} />
          {STATUS_OPTIONS.map((item) => (
            <CounterChip
              key={item.value}
              label={item.label}
              value={counters[item.value] || 0}
              active={statusFilter === item.value}
            />
          ))}
        </div>

        {errorMessage ? (
          <div
            style={{
              borderRadius: 12,
              border: '1px solid rgba(239,68,68,0.24)',
              background: 'rgba(239,68,68,0.10)',
              color: '#fecaca',
              padding: '12px 14px',
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            {errorMessage}
          </div>
        ) : null}
      </div>

      <div style={{ display: 'grid', gap: 14 }}>
        {visibleRows.length === 0 ? (
          <div
            style={{
              borderRadius: 20,
              border: `1px solid ${DS.border}`,
              background: 'rgba(17,19,24,0.90)',
              padding: 20,
              color: DS.textSoft,
              fontSize: 14,
            }}
          >
            Nenhuma solicitação encontrada com os filtros atuais.
          </div>
        ) : null}

        {visibleRows.map((row) => {
          const tone = statusTone(row.status)

          return (
            <div
              key={row.id}
              style={{
                borderRadius: 20,
                border: `1px solid ${DS.border}`,
                background: 'linear-gradient(180deg, rgba(17,19,24,0.98) 0%, rgba(13,15,20,0.98) 100%)',
                padding: 18,
                display: 'grid',
                gap: 14,
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) auto',
                  gap: 12,
                  alignItems: 'start',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 18,
                      fontWeight: 800,
                      color: DS.text,
                      letterSpacing: '-0.02em',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {row.name || 'Sem nome'}
                  </div>

                  <div
                    style={{
                      marginTop: 6,
                      display: 'flex',
                      gap: 8,
                      flexWrap: 'wrap',
                    }}
                  >
                    <MetaPill label={`Empresa: ${row.company || '-'}`} />
                    <MetaPill label={`Segmento: ${row.segment || '-'}`} />
                    <MetaPill label={`Entrada: ${formatDateTime(row.created_at)}`} />
                  </div>
                </div>

                <div
                  style={{
                    borderRadius: 999,
                    border: `1px solid ${tone.border}`,
                    background: tone.background,
                    color: tone.color,
                    padding: '8px 12px',
                    fontSize: 12,
                    fontWeight: 800,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {statusLabel(row.status || 'new')}
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 12,
                }}
              >
                <DataCard label="WhatsApp" value={row.whatsapp || '-'} />
                <DataCard label="Email" value={row.email || '-'} />
                <DataCard label="ID" value={row.id} mono />
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 12,
                }}
              >
                <DataCard label="Time comercial" value={row.team_size || '-'} />
                <DataCard label="Controle atual" value={row.current_control || '-'} />
                <DataCard label="Principal gargalo" value={row.main_bottleneck || '-'} />
                <DataCard label="Volume de leads" value={row.leads_volume || '-'} />
                <DataCard label="Prazo" value={row.timeline || '-'} />
              </div>

              <div
                style={{
                  borderRadius: 16,
                  border: `1px solid ${DS.border}`,
                  background: 'rgba(9,11,15,0.54)',
                  padding: 14,
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    color: DS.textSoft,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  Contexto informado
                </div>

                <div
                  style={{
                    marginTop: 10,
                    fontSize: 14,
                    lineHeight: 1.7,
                    color: DS.text,
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {row.message || 'Sem mensagem informada.'}
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 12,
                  alignItems: 'center',
                }}
              >
                <select
                  value={row.status || 'new'}
                  onChange={(e) => updateStatus(row.id, e.target.value)}
                  disabled={savingId === row.id}
                  style={{
                    width: '100%',
                    height: 44,
                    borderRadius: 12,
                    border: `1px solid ${DS.border}`,
                    background: 'rgba(9,11,15,0.92)',
                    color: DS.text,
                    padding: '0 14px',
                    outline: 'none',
                    fontSize: 14,
                    boxSizing: 'border-box',
                  }}
                >
                  {STATUS_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>

                <div
                  style={{
                    fontSize: 13,
                    color: DS.textSoft,
                    lineHeight: 1.6,
                  }}
                >
                  {savingId === row.id
                    ? 'Atualizando status...'
                    : 'Altere o status para organizar o funil interno de demonstração.'}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CounterChip({
  label,
  value,
  active,
}: {
  label: string
  value: number
  active?: boolean
}) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        minHeight: 34,
        padding: '0 12px',
        borderRadius: 999,
        border: active ? '1px solid rgba(59,130,246,0.30)' : `1px solid ${DS.border}`,
        background: active ? 'rgba(59,130,246,0.10)' : 'rgba(255,255,255,0.02)',
        color: active ? DS.blueSoft : DS.textSoft,
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      <span>{label}</span>
      <span
        style={{
          minWidth: 20,
          height: 20,
          borderRadius: 999,
          background: 'rgba(255,255,255,0.08)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          color: '#f8fbff',
        }}
      >
        {value}
      </span>
    </div>
  )
}

function MetaPill({ label }: { label: string }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        minHeight: 30,
        padding: '0 10px',
        borderRadius: 999,
        border: `1px solid ${DS.border}`,
        background: 'rgba(255,255,255,0.02)',
        color: DS.textSoft,
        fontSize: 12,
        fontWeight: 600,
        maxWidth: '100%',
      }}
    >
      <span style={{ overflowWrap: 'anywhere' }}>{label}</span>
    </div>
  )
}

function DataCard({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div
      style={{
        borderRadius: 16,
        border: `1px solid ${DS.border}`,
        background: 'rgba(9,11,15,0.54)',
        padding: 14,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          color: DS.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: 14,
          lineHeight: 1.55,
          color: DS.text,
          overflowWrap: 'anywhere',
          fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined,
        }}
      >
        {value}
      </div>
    </div>
  )
}