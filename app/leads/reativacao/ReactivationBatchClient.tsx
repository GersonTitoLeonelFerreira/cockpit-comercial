'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'

type TerminalStatus = 'ganho' | 'perdido'

type OpportunityType =
  | 'reativacao'
  | 'renovacao'
  | 'recompra'
  | 'upgrade'
  | 'novo_produto'

type AssignmentMode =
  | 'same_seller'
  | 'pool'
  | 'auto_balance'
  | 'specific_seller'

type SellerOption = {
  id: string
  label: string
}

type GroupOption = {
  id: string
  name: string
}

type TerminalOpportunity = {
  cycle_id: string
  lead_id: string
  name: string
  phone: string | null
  email: string | null
  status: TerminalStatus
  closed_at: string
  terminal_owner_id: string | null
  terminal_owner_label: string
  active_cycle_id: string | null
}

type BatchListResponse = {
  ok: boolean
  items?: TerminalOpportunity[]
  sellers?: SellerOption[]
  groups?: GroupOption[]
  has_more?: boolean
  error?: string
}

type BatchRunResult = {
  ok: boolean
  created?: Array<{
    source_cycle_id: string
    cycle_id: string
    lead_id: string
  }>
  skipped?: Array<{
    source_cycle_id: string
    reason: string
    active_cycle_id: string | null
  }>
  failed?: Array<{
    source_cycle_id: string
    reason: string
  }>
  error?: string
}

const OPPORTUNITY_TYPE_LABELS: Record<OpportunityType, string> = {
  reativacao: 'Reativação',
  renovacao: 'Renovação',
  recompra: 'Recompra',
  upgrade: 'Upgrade',
  novo_produto: 'Novo produto',
}

const ASSIGNMENT_MODE_LABELS: Record<AssignmentMode, string> = {
  same_seller: 'Manter vendedor anterior',
  pool: 'Enviar ao Pool',
  auto_balance: 'Distribuir automaticamente',
  specific_seller: 'Escolher vendedor específico',
}

const DS = {
  page: '#090b0f',
  panel: '#0d0f14',
  surface: '#111318',
  field: '#090b0f',
  border: '#1a1d2e',
  borderSubtle: '#13162a',
  text: '#edf2f7',
  muted: '#8fa3bc',
  weak: '#546070',
  blue: '#3b82f6',
  blueSoft: '#93c5fd',
  green: '#86efac',
  greenBg: 'rgba(34,197,94,0.10)',
  greenBorder: 'rgba(34,197,94,0.26)',
  red: '#fca5a5',
  redBg: 'rgba(239,68,68,0.10)',
  redBorder: 'rgba(239,68,68,0.28)',
  amber: '#fcd34d',
  amberBg: 'rgba(245,158,11,0.10)',
  amberBorder: 'rgba(245,158,11,0.28)',
} as const

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return fallback
}

function formatDate(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Data não informada'
  }

  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function statusStyle(status: TerminalStatus) {
  return status === 'ganho'
    ? {
        color: DS.green,
        border: DS.greenBorder,
        background: DS.greenBg,
        label: 'Ganho',
      }
    : {
        color: DS.red,
        border: DS.redBorder,
        background: DS.redBg,
        label: 'Perdido',
      }
}

export default function ReactivationBatchClient() {
  const [items, setItems] = useState<TerminalOpportunity[]>([])
  const [sellers, setSellers] = useState<SellerOption[]>([])
  const [groups, setGroups] = useState<GroupOption[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const [statusFilter, setStatusFilter] = useState<'all' | TerminalStatus>('perdido')
  const [search, setSearch] = useState('')
  const [ownerFilter, setOwnerFilter] = useState('')

  const [opportunityType, setOpportunityType] =
    useState<OpportunityType>('reativacao')

  const [assignmentMode, setAssignmentMode] =
    useState<AssignmentMode>('same_seller')

  const [specificSellerId, setSpecificSellerId] = useState('')
  const [groupId, setGroupId] = useState('')
  const [note, setNote] = useState('')

  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<BatchRunResult | null>(null)
  const [hasMore, setHasMore] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()

      if (statusFilter !== 'all') {
        params.set('status', statusFilter)
      }

      if (search.trim()) {
        params.set('search', search.trim())
      }

      if (ownerFilter) {
        params.set('owner_user_id', ownerFilter)
      }

      const response = await fetch(
        `/api/sales-cycles/successor/batch?${params.toString()}`,
        {
          cache: 'no-store',
        },
      )

      const payload = (await response.json()) as BatchListResponse

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? 'Erro ao carregar oportunidades.')
      }

      const nextItems = payload.items ?? []

      setItems(nextItems)
      setSellers(payload.sellers ?? [])
      setGroups(payload.groups ?? [])
      setHasMore(Boolean(payload.has_more))

      const selectableIds = new Set(
        nextItems
          .filter((item) => !item.active_cycle_id)
          .map((item) => item.cycle_id),
      )

      setSelectedIds((current) => {
        const next = new Set<string>()

        for (const id of current) {
          if (selectableIds.has(id)) {
            next.add(id)
          }
        }

        return next
      })
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, 'Erro ao carregar oportunidades.'))
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [ownerFilter, search, statusFilter])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const selectableItems = useMemo(
    () => items.filter((item) => !item.active_cycle_id),
    [items],
  )

  const selectedCount = selectedIds.size

  const allSelectableSelected =
    selectableItems.length > 0 &&
    selectableItems.every((item) => selectedIds.has(item.cycle_id))

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.has(item.cycle_id)),
    [items, selectedIds],
  )

  const selectedLostCount = selectedItems.filter(
    (item) => item.status === 'perdido',
  ).length

  const selectedWonCount = selectedItems.filter(
    (item) => item.status === 'ganho',
  ).length

  const canRun =
    selectedCount > 0 &&
    !running &&
    (assignmentMode !== 'specific_seller' || Boolean(specificSellerId))

  function toggleItem(cycleId: string) {
    setSelectedIds((current) => {
      const next = new Set(current)

      if (next.has(cycleId)) {
        next.delete(cycleId)
      } else {
        next.add(cycleId)
      }

      return next
    })
  }

  function toggleAllSelectable() {
    setSelectedIds((current) => {
      const next = new Set(current)

      if (allSelectableSelected) {
        for (const item of selectableItems) {
          next.delete(item.cycle_id)
        }
      } else {
        for (const item of selectableItems) {
          next.add(item.cycle_id)
        }
      }

      return next
    })
  }

  async function handleRun() {
    if (!canRun) {
      return
    }

    const confirmation = window.confirm(
      [
        `Criar ${selectedCount} nova(s) oportunidade(s)?`,
        '',
        `Tipo: ${OPPORTUNITY_TYPE_LABELS[opportunityType]}`,
        `Destino: ${ASSIGNMENT_MODE_LABELS[assignmentMode]}`,
        '',
        'Os ciclos antigos permanecerão fechados e preservados no histórico.',
      ].join('\n'),
    )

    if (!confirmation) {
      return
    }

    setRunning(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch('/api/sales-cycles/successor/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source_cycle_ids: Array.from(selectedIds),
          opportunity_type: opportunityType,
          assignment_mode: assignmentMode,
          owner_user_id:
            assignmentMode === 'specific_seller'
              ? specificSellerId
              : null,
          group_id: groupId || null,
          note: note.trim() || null,
        }),
      })

      const payload = (await response.json()) as BatchRunResult

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? 'Erro ao criar oportunidades.')
      }

      setResult(payload)
      setSelectedIds(new Set())
      setNote('')

      await loadData()
    } catch (requestError: unknown) {
      setError(
        getErrorMessage(
          requestError,
          'Erro ao executar a reativação em massa.',
        ),
      )
    } finally {
      setRunning(false)
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        background: DS.page,
        color: DS.text,
        padding: '24px',
      }}
    >
      <div
        style={{
          maxWidth: 1440,
          margin: '0 auto',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
            marginBottom: 20,
          }}
        >
          <div>
            <Link
              href="/leads"
              style={{
                display: 'inline-block',
                color: DS.muted,
                fontSize: 12,
                textDecoration: 'none',
                marginBottom: 10,
              }}
            >
              ← Voltar para Leads
            </Link>

            <h1
              style={{
                fontSize: 22,
                lineHeight: 1.2,
                margin: 0,
                fontWeight: 850,
                letterSpacing: '-0.02em',
              }}
            >
              Reativação em massa
            </h1>

            <p
              style={{
                margin: '7px 0 0',
                color: DS.muted,
                fontSize: 13,
                lineHeight: 1.5,
                maxWidth: 760,
              }}
            >
              Crie novas oportunidades para ciclos Ganhos ou Perdidos sem
              reabrir nem alterar o histórico original.
            </p>
          </div>

          <div
            style={{
              padding: '10px 12px',
              borderRadius: 9,
              border: `1px solid ${DS.blue}55`,
              background: 'rgba(59,130,246,0.08)',
              color: DS.blueSoft,
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            Até 250 oportunidades por lote
          </div>
        </div>

        <section
          style={{
            border: `1px solid ${DS.border}`,
            borderRadius: 12,
            background: DS.panel,
            padding: 16,
            marginBottom: 14,
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(180px, 0.8fr) minmax(220px, 1.4fr) minmax(220px, 1fr)',
              gap: 10,
            }}
          >
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: DS.weak }}>
                STATUS ORIGINAL
              </span>

              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(
                    event.target.value as 'all' | TerminalStatus,
                  )
                }
                style={selectStyle}
              >
                <option value="perdido">Somente Perdidos</option>
                <option value="ganho">Somente Ganhos</option>
                <option value="all">Ganhos e Perdidos</option>
              </select>
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: DS.weak }}>
                BUSCAR LEAD
              </span>

              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Nome, telefone ou e-mail"
                style={inputStyle}
              />
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: DS.weak }}>
                VENDEDOR ANTERIOR
              </span>

              <select
                value={ownerFilter}
                onChange={(event) => setOwnerFilter(event.target.value)}
                style={selectStyle}
              >
                <option value="">Todos os vendedores</option>

                {sellers.map((seller) => (
                  <option key={seller.id} value={seller.id}>
                    {seller.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {hasMore ? (
            <div
              style={{
                marginTop: 12,
                padding: '9px 10px',
                borderRadius: 8,
                border: `1px solid ${DS.amberBorder}`,
                background: DS.amberBg,
                color: DS.amber,
                fontSize: 12,
              }}
            >
              Há mais de 250 resultados para este filtro. Refine a busca,
              status ou vendedor antes de executar o lote.
            </div>
          ) : null}
        </section>

        <section
          style={{
            border: `1px solid ${DS.border}`,
            borderRadius: 12,
            background: DS.surface,
            padding: 16,
            marginBottom: 14,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
              marginBottom: 14,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 14,
                  color: DS.text,
                  fontWeight: 850,
                }}
              >
                Nova oportunidade para selecionados
              </div>

              <div
                style={{
                  fontSize: 12,
                  color: DS.muted,
                  marginTop: 4,
                }}
              >
                {selectedCount === 0
                  ? 'Selecione oportunidades fechadas abaixo.'
                  : `${selectedCount} selecionada(s) — ${selectedLostCount} perdida(s) e ${selectedWonCount} ganha(s).`}
              </div>
            </div>

            {selectedCount > 0 ? (
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                disabled={running}
                style={secondaryButtonStyle}
              >
                Limpar seleção
              </button>
            ) : null}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, minmax(170px, 1fr))',
              gap: 10,
            }}
          >
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={fieldLabelStyle}>TIPO DA NOVA OPORTUNIDADE</span>

              <select
                value={opportunityType}
                onChange={(event) =>
                  setOpportunityType(event.target.value as OpportunityType)
                }
                disabled={running}
                style={selectStyle}
              >
                {Object.entries(OPPORTUNITY_TYPE_LABELS).map(
                  ([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ),
                )}
              </select>
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={fieldLabelStyle}>DESTINO</span>

              <select
                value={assignmentMode}
                onChange={(event) =>
                  setAssignmentMode(event.target.value as AssignmentMode)
                }
                disabled={running}
                style={selectStyle}
              >
                {Object.entries(ASSIGNMENT_MODE_LABELS).map(
                  ([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ),
                )}
              </select>
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={fieldLabelStyle}>GRUPO OPCIONAL</span>

              <select
                value={groupId}
                onChange={(event) => setGroupId(event.target.value)}
                disabled={running}
                style={selectStyle}
              >
                <option value="">Sem grupo</option>

                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={fieldLabelStyle}>OBSERVAÇÃO OPCIONAL</span>

              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                disabled={running}
                maxLength={2000}
                placeholder="Ex.: campanha de renovação"
                style={inputStyle}
              />
            </label>
          </div>

          {assignmentMode === 'specific_seller' ? (
            <label
              style={{
                display: 'grid',
                gap: 6,
                marginTop: 10,
                maxWidth: 360,
              }}
            >
              <span style={fieldLabelStyle}>VENDEDOR DE DESTINO</span>

              <select
                value={specificSellerId}
                onChange={(event) => setSpecificSellerId(event.target.value)}
                disabled={running}
                style={selectStyle}
              >
                <option value="">Selecione um vendedor</option>

                {sellers.map((seller) => (
                  <option key={seller.id} value={seller.id}>
                    {seller.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              marginTop: 16,
            }}
          >
            <button
              type="button"
              onClick={handleRun}
              disabled={!canRun}
              style={{
                minHeight: 40,
                padding: '0 16px',
                borderRadius: 8,
                border: 'none',
                background: canRun ? DS.blue : '#1a2230',
                color: canRun ? '#ffffff' : DS.weak,
                fontSize: 12,
                fontWeight: 850,
                cursor: canRun ? 'pointer' : 'not-allowed',
                opacity: running ? 0.7 : 1,
              }}
            >
              {running
                ? 'Criando oportunidades...'
                : `Criar ${selectedCount} nova(s) oportunidade(s)`}
            </button>
          </div>
        </section>

        {error ? (
          <section
            style={{
              border: `1px solid ${DS.redBorder}`,
              borderRadius: 10,
              background: DS.redBg,
              color: DS.red,
              padding: 12,
              fontSize: 12,
              marginBottom: 14,
            }}
          >
            {error}
          </section>
        ) : null}

        {result ? (
          <section
            style={{
              border: `1px solid ${DS.border}`,
              borderRadius: 12,
              background: DS.panel,
              padding: 16,
              marginBottom: 14,
            }}
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 850,
                marginBottom: 12,
              }}
            >
              Resultado do lote
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(150px, 1fr))',
                gap: 10,
              }}
            >
              <ResultCard
                label="Criadas"
                value={result.created?.length ?? 0}
                color={DS.green}
                border={DS.greenBorder}
                background={DS.greenBg}
              />

              <ResultCard
                label="Ignoradas"
                value={result.skipped?.length ?? 0}
                color={DS.amber}
                border={DS.amberBorder}
                background={DS.amberBg}
              />

              <ResultCard
                label="Com erro"
                value={result.failed?.length ?? 0}
                color={DS.red}
                border={DS.redBorder}
                background={DS.redBg}
              />
            </div>

            {(result.skipped?.length ?? 0) > 0 ? (
              <div
                style={{
                  marginTop: 12,
                  color: DS.muted,
                  fontSize: 12,
                  lineHeight: 1.5,
                }}
              >
                Ignoradas porque o lead já possui uma oportunidade ativa.
              </div>
            ) : null}
          </section>
        ) : null}

        <section
          style={{
            border: `1px solid ${DS.border}`,
            borderRadius: 12,
            overflow: 'hidden',
            background: DS.panel,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              padding: '14px 16px',
              borderBottom: `1px solid ${DS.border}`,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 850 }}>
                Oportunidades encerradas
              </div>

              <div
                style={{
                  fontSize: 12,
                  color: DS.muted,
                  marginTop: 4,
                }}
              >
                {loading
                  ? 'Carregando...'
                  : `${items.length} oportunidade(s) encontrada(s).`}
              </div>
            </div>

            <button
              type="button"
              onClick={toggleAllSelectable}
              disabled={loading || selectableItems.length === 0}
              style={secondaryButtonStyle}
            >
              {allSelectableSelected
                ? 'Desmarcar visíveis'
                : 'Selecionar disponíveis'}
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                minWidth: 950,
              }}
            >
              <thead>
                <tr style={{ borderBottom: `1px solid ${DS.border}` }}>
                  <HeaderCell align="center">Selecionar</HeaderCell>
                  <HeaderCell>Lead</HeaderCell>
                  <HeaderCell>Status original</HeaderCell>
                  <HeaderCell>Encerramento</HeaderCell>
                  <HeaderCell>Vendedor anterior</HeaderCell>
                  <HeaderCell>Situação atual</HeaderCell>
                </tr>
              </thead>

              <tbody>
                {!loading && items.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      style={{
                        padding: 28,
                        textAlign: 'center',
                        color: DS.weak,
                        fontSize: 13,
                      }}
                    >
                      Nenhuma oportunidade encerrada encontrada para este filtro.
                    </td>
                  </tr>
                ) : null}

                {items.map((item) => {
                  const badge = statusStyle(item.status)
                  const blocked = Boolean(item.active_cycle_id)
                  const checked = selectedIds.has(item.cycle_id)

                  return (
                    <tr
                      key={item.cycle_id}
                      style={{
                        borderBottom: `1px solid ${DS.borderSubtle}`,
                        background: checked
                          ? 'rgba(59,130,246,0.05)'
                          : 'transparent',
                      }}
                    >
                      <td
                        style={{
                          padding: '12px 14px',
                          textAlign: 'center',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={blocked}
                          onChange={() => toggleItem(item.cycle_id)}
                          title={
                            blocked
                              ? 'Este lead já possui oportunidade ativa.'
                              : 'Selecionar oportunidade'
                          }
                          style={{
                            width: 15,
                            height: 15,
                            cursor: blocked ? 'not-allowed' : 'pointer',
                          }}
                        />
                      </td>

                      <td style={{ padding: '12px 14px' }}>
                        <div
                          style={{
                            fontSize: 13,
                            color: DS.text,
                            fontWeight: 800,
                          }}
                        >
                          {item.name}
                        </div>

                        <div
                          style={{
                            color: DS.weak,
                            fontSize: 11,
                            marginTop: 3,
                          }}
                        >
                          {item.phone ?? item.email ?? 'Contato não informado'}
                        </div>
                      </td>

                      <td style={{ padding: '12px 14px' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            borderRadius: 999,
                            border: `1px solid ${badge.border}`,
                            background: badge.background,
                            color: badge.color,
                            padding: '4px 8px',
                            fontSize: 10,
                            fontWeight: 850,
                          }}
                        >
                          {badge.label}
                        </span>
                      </td>

                      <td
                        style={{
                          padding: '12px 14px',
                          color: DS.muted,
                          fontSize: 12,
                        }}
                      >
                        {formatDate(item.closed_at)}
                      </td>

                      <td
                        style={{
                          padding: '12px 14px',
                          color: DS.muted,
                          fontSize: 12,
                        }}
                      >
                        {item.terminal_owner_label}
                      </td>

                      <td style={{ padding: '12px 14px' }}>
                        {blocked ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              borderRadius: 999,
                              border: `1px solid ${DS.amberBorder}`,
                              background: DS.amberBg,
                              color: DS.amber,
                              padding: '4px 8px',
                              fontSize: 10,
                              fontWeight: 800,
                            }}
                          >
                            Já possui oportunidade ativa
                          </span>
                        ) : (
                          <span
                            style={{
                              display: 'inline-flex',
                              borderRadius: 999,
                              border: `1px solid ${DS.greenBorder}`,
                              background: DS.greenBg,
                              color: DS.green,
                              padding: '4px 8px',
                              fontSize: 10,
                              fontWeight: 800,
                            }}
                          >
                            Disponível para nova oportunidade
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  )
}

function HeaderCell({
  children,
  align = 'left',
}: {
  children: React.ReactNode
  align?: 'left' | 'center'
}) {
  return (
    <th
      style={{
        padding: '11px 14px',
        textAlign: align,
        color: DS.weak,
        fontSize: 10,
        fontWeight: 850,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </th>
  )
}

function ResultCard({
  label,
  value,
  color,
  border,
  background,
}: {
  label: string
  value: number
  color: string
  border: string
  background: string
}) {
  return (
    <div
      style={{
        border: `1px solid ${border}`,
        borderRadius: 9,
        background,
        padding: 12,
      }}
    >
      <div
        style={{
          color,
          fontSize: 22,
          fontWeight: 900,
          lineHeight: 1,
        }}
      >
        {value}
      </div>

      <div
        style={{
          color,
          fontSize: 11,
          fontWeight: 800,
          marginTop: 6,
        }}
      >
        {label}
      </div>
    </div>
  )
}

const fieldLabelStyle = {
  fontSize: 11,
  fontWeight: 800,
  color: DS.weak,
} as const

const inputStyle = {
  width: '100%',
  minHeight: 36,
  borderRadius: 7,
  border: `1px solid ${DS.border}`,
  background: DS.field,
  color: DS.text,
  padding: '0 10px',
  fontSize: 12,
  outline: 'none',
  boxSizing: 'border-box',
} as const

const selectStyle = {
  ...inputStyle,
  cursor: 'pointer',
} as const

const secondaryButtonStyle = {
  minHeight: 34,
  padding: '0 11px',
  borderRadius: 7,
  border: `1px solid ${DS.border}`,
  background: DS.surface,
  color: DS.muted,
  fontSize: 12,
  fontWeight: 750,
  cursor: 'pointer',
} as const