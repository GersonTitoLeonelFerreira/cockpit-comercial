'use client'

import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { supabaseBrowser } from '@/app/lib/supabaseBrowser'

export type OwnerOption = { id: string; label: string }

export type LeadRow = {
  id: string
  name: string
  phone: string | null
  status: string
  created_at: string
  owner_id: string | null
}

type AssignMode = 'manual' | 'round_robin'
type AssignSource = 'selected' | 'pool' | 'owner'
type OrderMode = 'oldest' | 'newest' | 'random'

export default function AdminLeadsTable({
  title,
  companyId,
  ownerOptions,
  defaultOwnerId,
  fetchPage,
}: {
  title?: string
  companyId: string
  ownerOptions: OwnerOption[]
  defaultOwnerId?: string | null
  fetchPage: (args: {
    ownerId: string | null
    status: string | null
    search: string
    page: number
    pageSize: number
  }) => Promise<{ rows: LeadRow[]; total: number }>
}) {
  const supabase = useMemo(() => supabaseBrowser(), [])

  const normalizedDefaultOwnerId = useMemo(() => {
    const v = (defaultOwnerId ?? '').trim()
    if (!v) return 'ALL'
    if (v === 'ALL') return 'ALL'
    if (v === 'POOL') return 'POOL'
    return v
  }, [defaultOwnerId])

  const [ownerId, setOwnerId] = useState<string>(normalizedDefaultOwnerId)
  const [status, setStatus] = useState<string>('all')
  const [search, setSearch] = useState<string>('')

  const [pageSize, setPageSize] = useState<number>(30)
  const [page, setPage] = useState<number>(1)

  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [rows, setRows] = useState<LeadRow[]>([])
  const [total, setTotal] = useState<number>(0)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const [assignMode, setAssignMode] = useState<AssignMode>('manual')
  const [assignSource, setAssignSource] = useState<AssignSource>('selected')

  const [qty, setQty] = useState<string>('')
  const [batchSize, setBatchSize] = useState<string>('1000')

  const [onlyPool, setOnlyPool] = useState<boolean>(true)

  const [toOwnerId, setToOwnerId] = useState<string>('')

  const [useAllSellers, setUseAllSellers] = useState<boolean>(true)
  const [sellerIds, setSellerIds] = useState<string[]>([])

  const [orderMode, setOrderMode] = useState<OrderMode>('oldest')

  const [assigning, setAssigning] = useState<boolean>(false)
  const [assignProgress, setAssignProgress] = useState<{ done: number; total: number } | null>(null)
  const [assignResult, setAssignResult] = useState<string | null>(null)

  const [actionsOpen, setActionsOpen] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize])

  const ownerLabelById = useMemo(() => {
    const m = new Map<string, string>()
    for (const o of ownerOptions) m.set(o.id, o.label)
    return m
  }, [ownerOptions])

  const ownerLabelFromFilter = useMemo(() => {
    if (ownerId === 'ALL') return 'Todos'
    if (ownerId === 'POOL') return 'POOL'
    return ownerLabelById.get(ownerId) ?? ownerId
  }, [ownerId, ownerLabelById])

  const selectedSellerName = useMemo(() => {
    if (ownerId === 'ALL' || ownerId === 'POOL') return ''
    return ownerLabelById.get(ownerId) ?? ownerId
  }, [ownerId, ownerLabelById])

  const selectedCount = selectedIds.size

  const sourceLabel = useMemo(() => {
    if (assignSource === 'pool') return 'POOL'
    if (assignSource === 'selected') return `Selecionados (${selectedCount})`
    return selectedSellerName ? `Vendedor: ${selectedSellerName}` : 'Vendedor (não selecionado no filtro)'
  }, [assignSource, selectedCount, selectedSellerName])

  const destinationLabel = useMemo(() => {
    if (assignMode === 'round_robin') {
      if (useAllSellers) return 'Round-robin (todos vendedores)'
      return `Round-robin (${sellerIds.length} vendedor(es))`
    }
    if (!toOwnerId) return 'POOL'
    return ownerLabelById.get(toOwnerId) ?? toOwnerId
  }, [assignMode, ownerLabelById, sellerIds.length, toOwnerId, useAllSellers])

  const qtyLabel = useMemo(() => {
    const t = qty.trim()
    return t ? t : 'todas'
  }, [qty])

  const requiresQty = useMemo(() => {
    return assignSource === 'owner'
  }, [assignSource])

  const qtyParsed = useMemo(() => parsePositiveInt(qty), [qty])
  const batchParsed = useMemo(() => parsePositiveInt(batchSize), [batchSize])

  function requireQtyAndBatchForAuto() {
    if (qtyParsed === null || Number.isNaN(qtyParsed)) {
      alert('Informe uma quantidade válida.')
      return null
    }
    if (batchParsed === null || Number.isNaN(batchParsed)) {
      alert('Informe um lote válido (ex.: 1000).')
      return null
    }
    return { total: qtyParsed, batch: batchParsed }
  }

  const qtyOk = useMemo(() => {
    if (!requiresQty) return true
    return qtyParsed !== null && !Number.isNaN(qtyParsed)
  }, [qtyParsed, requiresQty])

  const actionValidationMsg = useMemo(() => {
    if (assignSource === 'owner' && (ownerId === 'ALL' || ownerId === 'POOL')) {
      return 'No filtro "Dono", selecione um vendedor para usar Origem = Vendedor.'
    }
    if (assignSource === 'selected' && selectedCount === 0) {
      return 'Selecione pelo menos 1 lead na tabela.'
    }
    if (assignMode === 'manual' && !toOwnerId && assignSource !== 'owner') {
      return 'Selecione o vendedor de destino.'
    }
    if (assignMode === 'round_robin' && !useAllSellers && sellerIds.length === 0) {
      return 'Selecione pelo menos 1 vendedor (ou marque "Usar todos").'
    }
    if (!qtyOk) {
      return 'Informe a Quantidade (obrigatória) para administrar leads do vendedor.'
    }
    return null
  }, [assignMode, assignSource, ownerId, qtyOk, selectedCount, sellerIds.length, toOwnerId, useAllSellers])

  const canRunAssign = useMemo(() => {
    return !assigning && !actionValidationMsg
  }, [assigning, actionValidationMsg])

  const returnIsPrimary = assignSource === 'owner' && assignMode === 'manual' && !toOwnerId

  useEffect(() => {
    setOwnerId(normalizedDefaultOwnerId)
    setPage(1)
    setSelectedIds(new Set())
    setAssignResult(null)
    setAssignProgress(null)
  }, [normalizedDefaultOwnerId, ownerId, status, search, pageSize])

  useEffect(() => {
    if (assignSource === 'pool') {
      setOnlyPool(true)
    }
  }, [assignSource])

  const reloadPage = useCallback(async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      const res = await fetchPage({
        ownerId: ownerId === 'ALL' ? 'ALL' : ownerId === 'POOL' ? null : ownerId,
        status: status === 'all' ? null : status,
        search,
        page,
        pageSize,
      })
      setRows(res.rows)
      setTotal(res.total)
    } catch (e: any) {
      setErrorMsg(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }, [fetchPage, ownerId, status, search, page, pageSize])

  useEffect(() => {
    ;(async () => {
      await reloadPage()
    })()
  }, [reloadPage])

  const isRowSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds])

  const toggleRow = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  const pageIds = useMemo(() => rows.map((r) => r.id), [rows])

  const allPageSelected = useMemo(() => {
    if (pageIds.length === 0) return false
    return pageIds.every((id) => selectedIds.has(id))
  }, [pageIds, selectedIds])

  const toggleSelectPage = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      const everySelected = pageIds.length > 0 && pageIds.every((id) => next.has(id))
      if (everySelected) {
        for (const id of pageIds) next.delete(id)
      } else {
        for (const id of pageIds) next.add(id)
      }
      return next
    })
  }, [pageIds])

  const effectiveSellerIds = useMemo(() => {
    if (useAllSellers) return ownerOptions.map((o) => o.id)
    return sellerIds
  }, [useAllSellers, sellerIds, ownerOptions])

  const effectiveSellerIdsNoSource = useMemo(() => {
    if (assignSource !== 'owner') return effectiveSellerIds
    if (ownerId === 'ALL' || ownerId === 'POOL') return effectiveSellerIds
    return effectiveSellerIds.filter((id) => id !== ownerId)
  }, [assignSource, effectiveSellerIds, ownerId])

  function parsePositiveInt(s: string) {
    if (!s.trim()) return null
    const n = Number(s)
    if (!Number.isFinite(n) || n <= 0) return NaN
    return Math.floor(n)
  }

  const CONFIRM_HARD_LIMIT = 1000

  const requireHardConfirm = useCallback((actionLabel: string, n: number) => {
    if (n < CONFIRM_HARD_LIMIT) return true
    const text = prompt(`${actionLabel}\n\nVocê está prestes a afetar ${n} leads (>= ${CONFIRM_HARD_LIMIT}).\nDigite DEVOLVER para confirmar:`)
    return (text ?? '').trim().toUpperCase() === 'DEVOLVER'
  }, [])

  const applyPreset = useCallback(
    (preset: 'pool_rr' | 'pool_manual' | 'owner_transfer' | 'owner_return' | 'selected_manual') => {
      setAssignResult(null)
      setAssignProgress(null)

      if (preset === 'pool_rr') {
        setAssignSource('pool')
        setAssignMode('round_robin')
        setUseAllSellers(true)
        setSellerIds([])
        setOrderMode('oldest')
        setQty((q) => (q.trim() ? q : '1000'))
        setBatchSize((b) => (b.trim() ? b : '1000'))
        setOnlyPool(true)
        setToOwnerId('')
        return
      }

      if (preset === 'pool_manual') {
        setAssignSource('pool')
        setAssignMode('manual')
        setOrderMode('oldest')
        setQty((q) => (q.trim() ? q : '1000'))
        setBatchSize((b) => (b.trim() ? b : '1000'))
        setOnlyPool(true)
        return
      }

      if (preset === 'owner_transfer') {
        setAssignSource('owner')
        setAssignMode('manual')
        setOrderMode('oldest')
        setQty((q) => (q.trim() ? q : '1000'))
        setBatchSize((b) => (b.trim() ? b : '1000'))
        setOnlyPool(true)
        return
      }

      if (preset === 'owner_return') {
        setAssignSource('owner')
        setAssignMode('manual')
        setOrderMode('oldest')
        setQty((q) => (q.trim() ? q : '1000'))
        setBatchSize((b) => (b.trim() ? b : '1000'))
        setOnlyPool(true)
        setToOwnerId('')
        return
      }

      if (preset === 'selected_manual') {
        setAssignSource('selected')
        setAssignMode('manual')
        setOrderMode('oldest')
        setQty('')
        setBatchSize('1000')
        setOnlyPool(true)
        return
      }
    },
    []
  )

  const rpcAssignLeads = useCallback(
    async (args: {
      source: 'selected' | 'pool'
      limit: number | null
      leadIds: string[]
      mode: AssignMode
      toOwner: string | null
      onlyIfPoolOverride?: boolean
    }) => {
      const { data, error } = await supabase.rpc('assign_leads', {
        p_company_id: companyId,
        p_source: args.source,
        p_limit: args.limit,
        p_lead_ids: args.leadIds,

        p_status: status === 'all' ? null : status,
        p_search: search.trim() ? search.trim() : null,

        p_mode: args.mode,
        p_to_owner_id: args.mode === 'manual' ? args.toOwner : null,
        p_seller_ids: args.mode === 'round_robin' ? effectiveSellerIds : [],

        p_only_if_pool: args.source === 'pool' ? true : args.onlyIfPoolOverride ?? onlyPool,

        p_order_mode: orderMode,
      })

      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      return {
        assigned: Number(row?.assigned_count ?? 0),
        skipped: Number(row?.skipped_count ?? 0),
      }
    },
    [companyId, effectiveSellerIds, onlyPool, orderMode, search, status, supabase]
  )

  const rpcReassignOwnerLeads = useCallback(
    async (args: { fromOwnerId: string; toOwnerId: string | null; limit: number }) => {
      const { data, error } = await supabase.rpc('reassign_owner_leads', {
        p_company_id: companyId,
        p_from_owner_id: args.fromOwnerId,
        p_to_owner_id: args.toOwnerId,
        p_limit: args.limit,

        p_status: status === 'all' ? null : status,
        p_search: search.trim() ? search.trim() : null,

        p_order_mode: orderMode,
      })
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      return { changed: Number(row?.changed_count ?? 0) }
    },
    [companyId, orderMode, search, status, supabase]
  )

  const rpcRoundRobinFromOwner = useCallback(
    async (args: { fromOwnerId: string; limit: number; sellerIds: string[] }) => {
      const { data, error } = await supabase.rpc('round_robin_from_owner_leads', {
        p_company_id: companyId,
        p_from_owner_id: args.fromOwnerId,
        p_seller_ids: args.sellerIds,
        p_limit: args.limit,

        p_status: status === 'all' ? null : status,
        p_search: search.trim() ? search.trim() : null,

        p_order_mode: orderMode,
      })
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      return { changed: Number(row?.changed_count ?? 0) }
    },
    [companyId, orderMode, search, status, supabase]
  )

  const doReturnToPool = useCallback(async () => {
    setAssignResult(null)
    setAssignProgress(null)

    if (assignSource === 'selected') {
      if (selectedIds.size === 0) {
        alert('Selecione pelo menos 1 lead OU use a origem "Vendedor" para devolver por quantidade.')
        return
      }

      const ok = confirm('Devolver os leads selecionados para o POOL?')
      if (!ok) return

      if (!requireHardConfirm('CONFIRMAÇÃO EXTRA: devolver leads selecionados ao POOL.', selectedIds.size)) {
        alert('Operação cancelada.')
        return
      }

      setAssigning(true)
      try {
        const leadIds = Array.from(selectedIds)
        const res = await rpcAssignLeads({
          source: 'selected',
          limit: qtyParsed === null ? null : qtyParsed,
          leadIds,
          mode: 'manual',
          toOwner: null,
          onlyIfPoolOverride: false,
        })
        setAssignResult(`Devolvidos ao POOL: ${res.assigned} | Ignorados: ${res.skipped}`)
        clearSelection()
        await reloadPage()
      } catch (e: any) {
        alert('Erro ao devolver ao POOL: ' + (e?.message ?? String(e)))
      } finally {
        setAssigning(false)
      }
      return
    }

    if (assignSource === 'owner') {
      if (ownerId === 'ALL' || ownerId === 'POOL') {
        alert('No filtro "Dono", selecione um vendedor para usar Origem=Vendedor.')
        return
      }

      const cfg = requireQtyAndBatchForAuto()
      if (!cfg) return

      const ok = confirm(`Devolver ${cfg.total} leads do vendedor "${ownerLabelFromFilter}" para o POOL?`)
      if (!ok) return

      if (!requireHardConfirm(`CONFIRMAÇÃO EXTRA: devolver por quantidade para o POOL.\nVendedor: ${ownerLabelFromFilter}`, cfg.total)) {
        alert('Operação cancelada.')
        return
      }

      setAssigning(true)
      try {
        let done = 0
        let returnedTotal = 0
        setAssignProgress({ done: 0, total: cfg.total })

        while (done < cfg.total) {
          const current = Math.min(cfg.batch, cfg.total - done)
          const r = await rpcReassignOwnerLeads({ fromOwnerId: ownerId, toOwnerId: null, limit: current })
          returnedTotal += r.changed
          done += current
          setAssignProgress({ done, total: cfg.total })
          if (r.changed === 0) break
        }

        setAssignResult(`Devolvidos ao POOL: ${returnedTotal}`)
        await reloadPage()
      } catch (e: any) {
        alert('Erro ao devolver por quantidade: ' + (e?.message ?? String(e)))
      } finally {
        setAssigning(false)
        setAssignProgress(null)
      }
      return
    }

    alert('Para devolver por quantidade, use Origem = Vendedor.')
  }, [
    assignSource,
    clearSelection,
    ownerId,
    ownerLabelFromFilter,
    qtyParsed,
    reloadPage,
    requireHardConfirm,
    rpcAssignLeads,
    rpcReassignOwnerLeads,
    selectedIds,
  ])

  const doAssign = useCallback(async () => {
    setAssignResult(null)
    setAssignProgress(null)

    if (assignSource === 'selected') {
      if (selectedIds.size === 0) {
        alert('Selecione pelo menos 1 lead (ou mude a origem para "POOL" ou "Vendedor").')
        return
      }

      if (assignMode === 'manual' && !toOwnerId) {
        alert('Selecione o vendedor de destino.')
        return
      }
      if (assignMode === 'round_robin' && effectiveSellerIds.length === 0) {
        alert('Selecione pelo menos 1 vendedor (ou marque "Usar todos").')
        return
      }

      setAssigning(true)
      try {
        const leadIds = Array.from(selectedIds)
        const res = await rpcAssignLeads({
          source: 'selected',
          limit: qtyParsed === null ? null : qtyParsed,
          leadIds,
          mode: assignMode,
          toOwner: assignMode === 'manual' ? toOwnerId : null,
        })

        setAssignResult(`Atribuídos: ${res.assigned} | Ignorados: ${res.skipped}` + (onlyPool ? ' (não estavam no POOL)' : ''))
        clearSelection()
        await reloadPage()
      } catch (e: any) {
        alert('Erro ao atribuir: ' + (e?.message ?? String(e)))
      } finally {
        setAssigning(false)
      }
      return
    }

    if (assignSource === 'pool') {
      const cfg = requireQtyAndBatchForAuto()
      if (!cfg) return

      if (assignMode === 'manual' && !toOwnerId) {
        alert('Selecione o vendedor de destino.')
        return
      }
      if (assignMode === 'round_robin' && effectiveSellerIds.length === 0) {
        alert('Selecione pelo menos 1 vendedor (ou marque "Usar todos").')
        return
      }

      setAssigning(true)
      try {
        let done = 0
        let assignedTotal = 0
        setAssignProgress({ done: 0, total: cfg.total })

        while (done < cfg.total) {
          const current = Math.min(cfg.batch, cfg.total - done)
          const res = await rpcAssignLeads({
            source: 'pool',
            limit: current,
            leadIds: [],
            mode: assignMode,
            toOwner: assignMode === 'manual' ? toOwnerId : null,
          })

          assignedTotal += res.assigned
          done += current
          setAssignProgress({ done, total: cfg.total })
          if (res.assigned === 0) break
        }

        setAssignResult(`Atribuídos: ${assignedTotal} | Não encontrados no POOL para completar: ${Math.max(cfg.total - assignedTotal, 0)}`)
        await reloadPage()
      } catch (e: any) {
        alert('Erro ao distribuir do POOL: ' + (e?.message ?? String(e)))
      } finally {
        setAssigning(false)
        setAssignProgress(null)
      }
      return
    }

    if (assignSource === 'owner') {
      if (ownerId === 'ALL' || ownerId === 'POOL') {
        alert('No filtro "Dono", selecione um vendedor para usar Origem=Vendedor.')
        return
      }
      const cfg = requireQtyAndBatchForAuto()
      if (!cfg) return

      if (assignMode === 'manual') {
        if (!toOwnerId) {
          alert('Selecione o vendedor de destino.')
          return
        }
        if (toOwnerId === ownerId) {
          alert('O vendedor de destino é o mesmo do filtro. Escolha outro.')
          return
        }

        const ok = confirm(`Transferir ${cfg.total} leads do vendedor "${ownerLabelFromFilter}" para "${ownerLabelById.get(toOwnerId) ?? toOwnerId}"?`)
        if (!ok) return

        setAssigning(true)
        try {
          let done = 0
          let changedTotal = 0
          setAssignProgress({ done, total: cfg.total })

          while (done < cfg.total) {
            const current = Math.min(cfg.batch, cfg.total - done)
            const r = await rpcReassignOwnerLeads({ fromOwnerId: ownerId, toOwnerId, limit: current })
            changedTotal += r.changed
            done += current
            setAssignProgress({ done, total: cfg.total })
            if (r.changed === 0) break
          }

          setAssignResult(`Transferidos: ${changedTotal}`)
          await reloadPage()
        } catch (e: any) {
          alert('Erro ao transferir por quantidade: ' + (e?.message ?? String(e)))
        } finally {
          setAssigning(false)
          setAssignProgress(null)
        }
        return
      }

      if (effectiveSellerIdsNoSource.length === 0) {
        alert('Selecione pelo menos 1 vendedor (diferente do vendedor de origem).')
        return
      }

      const ok = confirm(`Distribuir ${cfg.total} leads do vendedor "${ownerLabelFromFilter}" via round-robin?`)
      if (!ok) return

      setAssigning(true)
      try {
        let done = 0
        let changedTotal = 0
        setAssignProgress({ done, total: cfg.total })

        while (done < cfg.total) {
          const current = Math.min(cfg.batch, cfg.total - done)
          const r = await rpcRoundRobinFromOwner({
            fromOwnerId: ownerId,
            limit: current,
            sellerIds: effectiveSellerIdsNoSource,
          })
          changedTotal += r.changed
          done += current
          setAssignProgress({ done, total: cfg.total })
          if (r.changed === 0) break
        }

        setAssignResult(`Redistribuídos: ${changedTotal}`)
        await reloadPage()
      } catch (e: any) {
        alert('Erro no round-robin do vendedor: ' + (e?.message ?? String(e)))
      } finally {
        setAssigning(false)
        setAssignProgress(null)
      }
      return
    }
  }, [
    assignMode,
    assignSource,
    clearSelection,
    effectiveSellerIds,
    effectiveSellerIdsNoSource,
    onlyPool,
    ownerId,
    ownerLabelById,
    ownerLabelFromFilter,
    qtyParsed,
    reloadPage,
    rpcAssignLeads,
    rpcReassignOwnerLeads,
    rpcRoundRobinFromOwner,
    selectedIds,
    toOwnerId,
  ])

  const container: React.CSSProperties = { border: '1px solid #333', borderRadius: 12, padding: 14, background: '#0f0f0f' }

  const bar: React.CSSProperties = {
    border: '1px solid #222',
    background: '#0b0b0b',
    borderRadius: 12,
    padding: 12,
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  }

  const labelSmall: React.CSSProperties = { fontSize: 12, opacity: 0.75 }

  const inputBase: React.CSSProperties = {
    background: '#111',
    border: '1px solid #2a2a2a',
    color: 'white',
    padding: '10px 12px',
    borderRadius: 10,
    outline: 'none',
  }
  const inputSearch: React.CSSProperties = { ...inputBase, flex: 1, minWidth: 280 }
  const selectBase: React.CSSProperties = { ...inputBase, minWidth: 210 }

  const chipBtn: React.CSSProperties = {
    border: '1px solid #2a2a2a',
    background: '#111',
    color: 'white',
    fontSize: 12,
    padding: '8px 10px',
    borderRadius: 999,
    cursor: 'pointer',
    fontWeight: 900,
  }

  const secondaryBtn: React.CSSProperties = {
    border: '1px solid #2a2a2a',
    background: '#111',
    color: 'white',
    borderRadius: 10,
    padding: '10px 12px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 900,
  }

  const primaryBtn: React.CSSProperties = {
    border: '1px solid #334155',
    background: assigning ? '#0b1220' : '#111827',
    color: 'white',
    borderRadius: 10,
    padding: '10px 14px',
    cursor: assigning ? 'not-allowed' : 'pointer',
    fontSize: 13,
    opacity: assigning ? 0.75 : 1,
    minWidth: 140,
    fontWeight: 900,
  }

  const dangerBtn: React.CSSProperties = {
    border: '1px solid #7f1d1d',
    background: '#1a0b0b',
    color: '#fecaca',
    fontSize: 13,
    padding: '10px 14px',
    borderRadius: 10,
    cursor: assigning ? 'not-allowed' : 'pointer',
    opacity: assigning ? 0.7 : 1,
    fontWeight: 900,
  }

  const modalOverlay: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    zIndex: 1000,
  }

  const modal: React.CSSProperties = {
    width: 'min(980px, 100%)',
    maxHeight: 'min(80vh, 720px)',
    overflow: 'auto',
    borderRadius: 14,
    border: '1px solid #2a2a2a',
    background: '#0b0b0b',
    boxShadow: '0 30px 80px rgba(0,0,0,.6)',
  }

  const modalHeader: React.CSSProperties = {
    padding: 14,
    borderBottom: '1px solid #1f1f1f',
    display: 'flex',
    justifyContent: 'space-between',
    gap: 10,
    alignItems: 'center',
    position: 'sticky',
    top: 0,
    background: '#0b0b0b',
    zIndex: 1,
  }

  const modalTitle: React.CSSProperties = { fontWeight: 900 }

  const modalBody: React.CSSProperties = { padding: 14, display: 'grid', gap: 12 }

  useEffect(() => {
    if (!actionsOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActionsOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [actionsOpen])

  const showBar = true

  return (
    <div style={container}>
      {title ? <h3 style={{ marginTop: 0, marginBottom: 10 }}>{title}</h3> : null}

      {/* FILTROS */}
      <div style={bar}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', width: '100%' }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome ou telefone…" style={inputSearch} />

          <select
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
            disabled={assignSource === 'pool'}
            style={{ ...selectBase, opacity: assignSource === 'pool' ? 0.7 : 1 }}
            title={assignSource === 'pool' ? 'Travado porque a origem está em POOL automático.' : ''}
          >
            <option value="ALL">Todos</option>
            <option value="POOL">Somente POOL</option>
            {ownerOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>

          <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ ...selectBase, minWidth: 180 }}>
            <option value="all">Todos os status</option>
            <option value="novo">Novo</option>
            <option value="contato">Contato</option>
            <option value="respondeu">Respondeu</option>
            <option value="negociacao">Negociação</option>
            <option value="ganho">Ganho</option>
            <option value="perdido">Perdido</option>
          </select>

          <div style={{ ...labelSmall, marginLeft: 'auto' }}>
            {loading ? 'Carregando…' : `Total: ${total}`} • Dono: <b>{ownerLabelFromFilter}</b>
          </div>
        </div>
      </div>

      {/* SELEÇÃO */}
      <div style={bar}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', width: '100%' }}>
          <div style={{ fontSize: 12, opacity: 0.9 }}>
            Selecionados: <b>{selectedCount}</b>
          </div>

          <button type="button" onClick={toggleSelectPage} style={chipBtn} disabled={assigning || loading || rows.length === 0}>
            {allPageSelected ? 'Desmarcar página' : 'Selecionar página'}
          </button>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={labelSmall}>Dica: filtre → selecione → AÇÕES.</div>

            <button
              type="button"
              onClick={() => {
                setAssignResult(null)
                setAssignProgress(null)

                const hasSellerFiltered = ownerId !== 'ALL' && ownerId !== 'POOL'

                if (hasSellerFiltered) {
                  setAssignSource('owner')
                  setAssignMode('manual')
                  setToOwnerId('')
                  setQty('')
                  setBatchSize('1000')
                  setOrderMode('oldest')
                  setOnlyPool(true)
                } else {
                  setAssignSource('pool')
                  setAssignMode('manual')
                  setToOwnerId('')
                  setQty('')
                  setBatchSize('1000')
                  setOrderMode('oldest')
                  setOnlyPool(true)
                }

                setShowAdvanced(false)
                setActionsOpen(true)
              }}
              style={primaryBtn}
              disabled={assigning}
            >
              AÇÕES
            </button>
          </div>
        </div>
      </div>

      {assignResult ? <div style={{ marginBottom: 10, color: '#a7f3d0', fontSize: 13 }}>{assignResult}</div> : null}
      {errorMsg ? <div style={{ marginBottom: 10, color: '#ef4444', fontSize: 13 }}>Erro: {errorMsg}</div> : null}

      {/* MODAL DE AÇÕES */}
      {actionsOpen ? (
        <div
          style={modalOverlay}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setActionsOpen(false)
          }}
        >
          <div style={modal} role="dialog" aria-modal="true" aria-label="Ações em lote">
            <div style={modalHeader}>
              <div>
                <div style={modalTitle}>Ações em lote</div>

                <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>
                  Aplicar em: <b>{selectedCount}</b> selecionados • ESC para fechar
                </div>

                <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
                  Filtro Dono: <b>{ownerLabelFromFilter}</b>
                </div>

                {assignSource === 'owner' && selectedSellerName ? (
                  <div style={{ fontSize: 12, opacity: 0.85, marginTop: 6 }}>
                    Vendedor selecionado: <b>{selectedSellerName}</b>
                  </div>
                ) : null}

                <div style={{ fontSize: 12, opacity: 0.85, marginTop: 8 }}>
                  Ação: <b>{sourceLabel}</b> → <b>{destinationLabel}</b> • Quantidade: <b>{qtyLabel}</b>
                  {assignSource === 'pool' ? ' • Somente POOL: ON' : onlyPool ? ' • Somente POOL: ON' : ' • Somente POOL: OFF'}
                </div>

                {actionValidationMsg ? (
                  <div style={{ fontSize: 12, color: '#fca5a5', marginTop: 8 }}>{actionValidationMsg}</div>
                ) : null}
              </div>

              <button type="button" onClick={() => setActionsOpen(false)} style={secondaryBtn}>
                Fechar
              </button>
            </div>

            <div style={modalBody}>
              {/* Ações rápidas */}
              <div style={{ border: '1px solid #1f1f1f', borderRadius: 12, padding: 12, background: '#0f0f0f' }}>
                <div style={{ fontWeight: 900, marginBottom: 10 }}>Ações rápidas</div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => applyPreset('pool_manual')} disabled={assigning} style={chipBtn} title="Pegar do POOL e enviar para um vendedor">
                    POOL → vendedor
                  </button>

                  <button type="button" onClick={() => applyPreset('pool_rr')} disabled={assigning} style={chipBtn} title="Distribuir do POOL para todos os vendedores (round-robin)">
                    Distribuir POOL
                  </button>

                  <button type="button" onClick={() => applyPreset('selected_manual')} disabled={assigning} style={chipBtn} title="Enviar os leads selecionados para um vendedor">
                    Selecionados → vendedor
                  </button>

                  <button type="button" onClick={() => applyPreset('owner_transfer')} disabled={assigning} style={chipBtn} title='Transferir leads do vendedor filtrado em "Dono" para outro vendedor'>
                    Transferir vendedor
                  </button>

                  <button type="button" onClick={() => applyPreset('owner_return')} disabled={assigning} style={chipBtn} title='Devolver leads do vendedor filtrado em "Dono" para o POOL'>
                    Devolver p/ POOL
                  </button>
                </div>

                <div style={{ fontSize: 12, opacity: 0.7, marginTop: 10 }}>
                  Dica: clique numa ação rápida para preencher o formulário abaixo.
                </div>
              </div>

              {/* Configurar ação */}
              {showBar ? (
                <div style={{ border: '1px solid #1f1f1f', borderRadius: 12, padding: 12, background: '#0f0f0f' }}>
                  <div style={{ fontWeight: 900, marginBottom: 10 }}>Configurar ação</div>

                  <div
                    style={{
                      display: 'grid',
                      gap: 10,
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                      alignItems: 'end',
                    }}
                  >
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={{ fontSize: 12, opacity: 0.8, fontWeight: 800 }}>Origem</span>
                      <select
                        value={assignSource}
                        onChange={(e) => setAssignSource(e.target.value as AssignSource)}
                        disabled={assigning}
                        style={{ ...selectBase, width: '100%', minWidth: 0 }}
                      >
                        <option value="selected">Selecionados (checkbox)</option>
                        <option value="pool">POOL (automático)</option>
                        <option value="owner">Vendedor (pelo filtro "Dono")</option>
                      </select>
                    </label>

                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={{ fontSize: 12, opacity: 0.8, fontWeight: 800 }}>Modo</span>
                      <select
                        value={assignMode}
                        onChange={(e) => setAssignMode(e.target.value as AssignMode)}
                        disabled={assigning}
                        style={{ ...selectBase, width: '100%', minWidth: 0 }}
                      >
                        <option value="manual">Manual (1 vendedor)</option>
                        <option value="round_robin">Automático (round-robin)</option>
                      </select>
                    </label>

                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={{ fontSize: 12, opacity: 0.8, fontWeight: 800 }}>Destino</span>

                      {assignMode === 'manual' ? (
                        <select
                          value={toOwnerId}
                          onChange={(e) => setToOwnerId(e.target.value)}
                          disabled={assigning}
                          style={{ ...selectBase, width: '100%', minWidth: 0 }}
                        >
                          <option value="">— selecione o vendedor —</option>
                          {ownerOptions.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div style={{ display: 'grid', gap: 8 }}>
                          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, opacity: 0.9 }}>
                            <input type="checkbox" checked={useAllSellers} onChange={(e) => setUseAllSellers(e.target.checked)} disabled={assigning} />
                            Usar todos vendedores
                          </label>

                          {!useAllSellers ? (
                            <select
                              multiple
                              value={sellerIds}
                              onChange={(e) => setSellerIds(Array.from(e.target.selectedOptions).map((o) => o.value))}
                              disabled={assigning}
                              style={{ ...selectBase, width: '100%', minWidth: 0, height: 120, padding: '8px 10px' }}
                            >
                              {ownerOptions.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          ) : null}
                        </div>
                      )}
                    </label>

                    {assignSource === 'owner' ? (
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span style={{ fontSize: 12, opacity: 0.8, fontWeight: 800 }}>Quantidade (obrigatória)</span>
                        <input
                          value={qty}
                          onChange={(e) => setQty(e.target.value)}
                          inputMode="numeric"
                          placeholder="Ex.: 1000"
                          style={{ ...inputBase, width: '100%' }}
                          disabled={assigning}
                        />
                      </label>
                    ) : null}
                  </div>

                  <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                    <button
                      type="button"
                      onClick={doReturnToPool}
                      disabled={!canRunAssign}
                      style={returnIsPrimary ? primaryBtn : dangerBtn}
                      title={assignSource === 'owner' ? `Origem: ${ownerLabelFromFilter}` : ''}
                    >
                      Devolver ao POOL
                    </button>

                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={doAssign}
                        disabled={!canRunAssign || returnIsPrimary}
                        style={!returnIsPrimary ? primaryBtn : secondaryBtn}
                      >
                        {assigning ? 'Processando…' : assignMode === 'manual' ? 'Transferir / Atribuir' : 'Distribuir'}
                      </button>

                      {assignProgress ? (
                        <div style={{ fontSize: 12, opacity: 0.8 }}>
                          Progresso: <b>{assignProgress.done}</b> / <b>{assignProgress.total}</b>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <button type="button" onClick={() => setShowAdvanced((v) => !v)} disabled={assigning} style={chipBtn}>
                      {showAdvanced ? 'Ocultar opções avançadas' : 'Opções avançadas'}
                    </button>
                  </div>

                  {showAdvanced ? (
                    <div
                      style={{
                        marginTop: 12,
                        paddingTop: 12,
                        borderTop: '1px solid #1f1f1f',
                        display: 'grid',
                        gap: 10,
                        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                        alignItems: 'end',
                      }}
                    >
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span style={{ fontSize: 12, opacity: 0.8, fontWeight: 800 }}>
                          Quantidade {assignSource === 'selected' ? '(opcional)' : '(obrigatória)'}
                        </span>
                        <input
                          value={qty}
                          onChange={(e) => setQty(e.target.value)}
                          inputMode="numeric"
                          placeholder={assignSource === 'selected' ? 'Ex.: 50 (opcional)' : 'Ex.: 1000'}
                          style={{ ...inputBase, width: '100%' }}
                          disabled={assigning}
                        />
                      </label>

                      {assignSource !== 'selected' ? (
                        <label style={{ display: 'grid', gap: 6 }}>
                          <span style={{ fontSize: 12, opacity: 0.8, fontWeight: 800 }}>Lote</span>
                          <input
                            value={batchSize}
                            onChange={(e) => setBatchSize(e.target.value)}
                            inputMode="numeric"
                            placeholder="Ex.: 1000"
                            style={{ ...inputBase, width: '100%' }}
                            disabled={assigning}
                          />
                        </label>
                      ) : null}

                      <label style={{ display: 'grid', gap: 6 }}>
                        <span style={{ fontSize: 12, opacity: 0.8, fontWeight: 800 }}>Ordem</span>
                        <select
                          value={orderMode}
                          onChange={(e) => setOrderMode(e.target.value as OrderMode)}
                          disabled={assigning}
                          style={{ ...selectBase, width: '100%', minWidth: 0 }}
                        >
                          <option value="oldest">Mais antigos</option>
                          <option value="newest">Mais recentes</option>
                          <option value="random">Aleatório</option>
                        </select>
                      </label>

                      <div>
                        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, opacity: 0.9, marginTop: 18 }}>
                          <input
                            type="checkbox"
                            checked={assignSource === 'pool' ? true : onlyPool}
                            onChange={(e) => setOnlyPool(e.target.checked)}
                            disabled={assigning || assignSource === 'pool' || assignSource === 'owner'}
                          />
                          Somente POOL (evita reatribuição)
                        </label>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* Tabela */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #222' }}>
              <th style={{ padding: '10px 8px', width: 36 }}>
                <input type="checkbox" checked={allPageSelected} onChange={toggleSelectPage} disabled={loading || rows.length === 0} />
              </th>
              <th style={{ padding: '10px 8px' }}>Nome</th>
              <th style={{ padding: '10px 8px' }}>Telefone</th>
              <th style={{ padding: '10px 8px' }}>Status</th>
              <th style={{ padding: '10px 8px' }}>Criado</th>
              <th style={{ padding: '10px 8px' }}>Dono</th>
              <th style={{ padding: '10px 8px' }}>Ações</th>
            </tr>
          </thead>

          <tbody>
            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: 12, opacity: 0.7 }}>
                  Nenhum lead encontrado.
                </td>
              </tr>
            ) : (
              rows.map((l) => {
                const ownerLabel = l.owner_id ? ownerLabelById.get(l.owner_id) ?? 'Vendedor' : 'POOL'
                const selected = isRowSelected(l.id)

                const statusLabel =
                  String(l.status ?? '')
                    .trim()
                    .toLowerCase() === 'negociacao'
                    ? 'Negociação'
                    : String(l.status ?? '')
                        .trim()
                        .toLowerCase() === 'ganho'
                      ? 'Ganho'
                      : String(l.status ?? '')
                          .trim()
                          .toLowerCase() === 'fechado'
                        ? 'Ganho'
                        : String(l.status ?? '')
                            .trim()
                            .toLowerCase()

                return (
                  <tr
                    key={l.id}
                    onClick={() => toggleRow(l.id)}
                    style={{
                      borderBottom: '1px solid #1f1f1f',
                      background: selected ? 'rgba(59,130,246,0.10)' : 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    <td style={{ padding: '10px 8px' }}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleRow(l.id)}
                        onClick={(e) => e.stopPropagation()}
                        disabled={loading}
                      />
                    </td>

                    <td style={{ padding: '10px 8px' }}>
                      <a
                        href={`/leads/${l.id}`}
                        onClick={(e) => e.stopPropagation()}
                        style={{ color: 'white', textDecoration: 'none' }}
                      >
                        <b>{l.name}</b>
                      </a>
                    </td>
                    <td style={{ padding: '10px 8px', opacity: 0.9 }}>{l.phone ?? '—'}</td>
                    <td style={{ padding: '10px 8px', textTransform: 'capitalize' }}>{statusLabel}</td>
                    <td style={{ padding: '10px 8px', opacity: 0.75 }}>{new Date(l.created_at).toLocaleString()}</td>
                    <td style={{ padding: '10px 8px', opacity: 0.85 }}>{ownerLabel}</td>
                    <td style={{ padding: '10px 8px' }}>
                      <a
                        href={`/leads/${l.id}`}
                        onClick={(e) => e.stopPropagation()}
                        style={{ color: '#9aa', textDecoration: 'none' }}
                      >
                        Abrir →
                      </a>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 12, alignItems: 'center' }}>
        <div style={{ opacity: 0.7, fontSize: 12 }}>
          Página <b>{page}</b> de <b>{totalPages}</b>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            disabled={loading}
            style={{
              background: '#111',
              border: '1px solid #333',
              color: 'white',
              padding: '8px 10px',
              borderRadius: 10,
              outline: 'none',
              minWidth: 130,
              opacity: loading ? 0.7 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            <option value={20}>20 / página</option>
            <option value={30}>30 / página</option>
            <option value={40}>40 / página</option>
            <option value={50}>50 / página</option>
          </select>

          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            style={{
              border: '1px solid #333',
              background: '#111',
              color: 'white',
              borderRadius: 10,
              padding: '8px 10px',
              cursor: page <= 1 || loading ? 'not-allowed' : 'pointer',
              opacity: page <= 1 || loading ? 0.6 : 1,
            }}
          >
            ← Anterior
          </button>

          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
            style={{
              border: '1px solid #333',
              background: '#111',
              color: 'white',
              borderRadius: 10,
              padding: '8px 10px',
              cursor: page >= totalPages || loading ? 'not-allowed' : 'pointer',
              opacity: page >= totalPages || loading ? 0.6 : 1,
            }}
          >
            Próxima →
          </button>
        </div>
      </div>
    </div>
  )
}