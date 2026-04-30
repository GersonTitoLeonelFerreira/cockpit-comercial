'use client'

import * as React from 'react'
import { supabaseBrowser } from '../lib/supabaseBrowser'
import CreateLeadModal from '../leads/components/CreateLeadModal'
import ImportExcelDialog from '../leads/components/ImportExcelDialog'
import DeleteLeadsDialog from '../leads/components/DeleteLeadsDialog'

const DS = {
  contentBg: '#090b0f',
  panelBg: '#0d0f14',
  cardBg: '#141722',
  surfaceBg: '#111318',
  border: '#1a1d2e',
  borderSubtle: '#13162a',
  textPrimary: '#edf2f7',
  textSecondary: '#8fa3bc',
  textMuted: '#546070',
  textLabel: '#4a5569',
  blue: '#3b82f6',
  blueSoft: '#93c5fd',
  greenBg: 'rgba(22,163,74,0.10)',
  greenBorder: 'rgba(34,197,94,0.25)',
  greenText: '#86efac',
  amberBg: 'rgba(245,158,11,0.12)',
  amberBorder: 'rgba(245,158,11,0.3)',
  amberText: '#fef3c7',
  redBg: 'rgba(239,68,68,0.10)',
  redBorder: 'rgba(239,68,68,0.3)',
  redText: '#fca5a5',
  radius: 7,
  radiusContainer: 10,
} as const

const PAGE_SIZE = 50

const RETURN_REASONS = [
  { value: 'contato_incorreto', label: 'Contato Incorreto' },
  { value: 'incontactavel', label: 'Incontactável' },
  { value: 'duplicado', label: 'Duplicado' },
  { value: 'invalido_dados_incompletos', label: 'Dados Inválidos/Incompletos' },
  { value: 'fora_do_icp', label: 'Fora do ICP' },
  { value: 'fora_da_regiao_unidade', label: 'Fora da Região/Unidade' },
  { value: 'opt_out_lgpd', label: 'Opt-out LGPD' },
  { value: 'reatribuicao_melhor_fit', label: 'Reatribuição (Melhor fit)' },
  { value: 'outro', label: 'Outro' },
]

type SupabaseBrowserClient = ReturnType<typeof supabaseBrowser>

type Profile = {
  id: string
  full_name: string | null
  email: string | null
  role: string
}

type LeadGroup = {
  id: string
  name: string
}

type LeadGroupRelation = {
  name?: string | null
}

type PoolItem = {
  id: string
  lead_id: string
  name: string
  phone: string | null
  email: string | null
  status: string
  owner_id: string | null
  group_id: string | null
  created_at: string
  lead_groups?: LeadGroupRelation | null
  last_return_reason?: string | null
  last_return_details?: string | null
  last_return_at?: string | null
  last_return_by?: string | null
}

type VPipelinePoolRow = Omit<PoolItem, 'lead_groups'> & {
  lead_groups?: LeadGroupRelation | LeadGroupRelation[] | null
}

type CycleEventRow = {
  cycle_id: string
  metadata: {
    reason?: string | null
    details?: string | null
  } | null
  occurred_at: string | null
  created_by: string | null
}

type PoolPage = {
  items: PoolItem[]
  total: number
  hasMore: boolean
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message
  return fallback
}

function normalizeLeadGroupRelation(
  relation: LeadGroupRelation | LeadGroupRelation[] | null | undefined
): LeadGroupRelation | null {
  if (Array.isArray(relation)) return relation[0] ?? null
  return relation ?? null
}

async function loadPoolWithOffset(
  supabase: SupabaseBrowserClient,
  companyId: string,
  selectedGroupId: string | null,
  pageNum: number,
  pageSize: number
): Promise<PoolPage> {
  const offset = (pageNum - 1) * pageSize

  let countQuery = supabase
    .from('v_pipeline_items')
    .select('id', { head: true, count: 'exact' })
    .eq('company_id', companyId)
    .eq('status', 'novo')
    .is('owner_id', null)

  if (selectedGroupId) {
    countQuery = countQuery.eq('group_id', selectedGroupId)
  }

  const { count, error: countErr } = await countQuery
  if (countErr) throw countErr

  let query = supabase
    .from('v_pipeline_items')
    .select('id, lead_id, name, phone, email, status, owner_id, group_id, lead_groups(name), created_at')
    .eq('company_id', companyId)
    .eq('status', 'novo')
    .is('owner_id', null)
    .order('created_at', { ascending: false })

  if (selectedGroupId) {
    query = query.eq('group_id', selectedGroupId)
  }

  const { data, error } = await query.range(offset, offset + pageSize - 1)
  if (error) throw error

  const items: PoolItem[] = ((data ?? []) as VPipelinePoolRow[]).map((item) => ({
    ...item,
    lead_groups: normalizeLeadGroupRelation(item.lead_groups),
  }))

  if (items.length > 0) {
    const cycleIds = items.map((item) => item.id)

    const { data: events, error: eventsErr } = await supabase
      .from('cycle_events')
      .select('cycle_id, metadata, occurred_at, created_by')
      .eq('event_type', 'returned_to_pool')
      .eq('company_id', companyId)
      .in('cycle_id', cycleIds)
      .order('occurred_at', { ascending: false })

    if (eventsErr) throw eventsErr

    const latestByCycle: Record<string, CycleEventRow> = {}

    for (const event of (events ?? []) as CycleEventRow[]) {
      if (!latestByCycle[event.cycle_id]) {
        latestByCycle[event.cycle_id] = event
      }
    }

    for (const item of items) {
      const event = latestByCycle[item.id]

      if (event) {
        item.last_return_reason = event.metadata?.reason ?? null
        item.last_return_details = event.metadata?.details ?? null
        item.last_return_at = event.occurred_at ?? null
        item.last_return_by = event.created_by ?? null
      }
    }
  }

  return {
    items,
    total: count ?? 0,
    hasMore: offset + pageSize < (count ?? 0),
  }
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
  const supabase = React.useMemo(() => supabaseBrowser(), [])
  void userLabel

  const [groups, setGroups] = React.useState<LeadGroup[]>([])
  const [selectedGroupId, setSelectedGroupId] = React.useState<string | null>(null)

  const [sellers, setSellers] = React.useState<Profile[]>([])
  const [poolCycles, setPoolCycles] = React.useState<PoolItem[]>([])

  const [loading, setLoading] = React.useState(true)
  const [poolLoading, setPoolLoading] = React.useState(false)
  const [assigningId, setAssigningId] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [allPoolSelected, setAllPoolSelected] = React.useState(false)

  const [poolTotal, setPoolTotal] = React.useState(0)
  const [poolPageNum, setPoolPageNum] = React.useState(1)

  const [bulkSeller, setBulkSeller] = React.useState<string>('')
  const [bulkGroup, setBulkGroup] = React.useState<string>('')
  const [showBulkModal, setShowBulkModal] = React.useState(false)
  const [distributeGroupLoading, setDistributeGroupLoading] = React.useState(false)
  const [creatingGroup, setCreatingGroup] = React.useState(false)

  const [showDeleteLeadConfirm, setShowDeleteLeadConfirm] = React.useState(false)
  const [deletePassword, setDeletePassword] = React.useState('')
  const [deletingLeads, setDeletingLeads] = React.useState(false)

  const [showCreateLeadModal, setShowCreateLeadModal] = React.useState(false)

  const loadGroups = React.useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('lead_groups')
        .select('id, name')
        .eq('company_id', companyId)
        .is('archived_at', null)
        .order('name', { ascending: true })

      if (error) throw error

      setGroups((data ?? []) as LeadGroup[])
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Erro ao carregar grupos.'))
    }
  }, [companyId, supabase])

  const loadPoolAndSellers = React.useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const [sellersResult, poolPage] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, email, role')
          .eq('company_id', companyId)
          .in('role', ['member', 'seller', 'consultor'])
          .order('full_name', { ascending: true }),
        loadPoolWithOffset(supabase, companyId, selectedGroupId, 1, PAGE_SIZE),
      ])

      if (sellersResult.error) throw sellersResult.error

      setSellers((sellersResult.data ?? []) as Profile[])
      setPoolCycles(poolPage.items)
      setPoolTotal(poolPage.total)
      setPoolPageNum(1)
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Erro ao carregar pool.'))
    } finally {
      setLoading(false)
    }
  }, [companyId, selectedGroupId, supabase])

  const loadPoolPage = React.useCallback(
    async (pageNum: number) => {
      setPoolLoading(true)
      setError(null)

      try {
        const poolPage = await loadPoolWithOffset(supabase, companyId, selectedGroupId, pageNum, PAGE_SIZE)

        setPoolCycles(poolPage.items)
        setPoolPageNum(pageNum)
      } catch (err: unknown) {
        setError(getErrorMessage(err, 'Erro ao carregar página.'))
      } finally {
        setPoolLoading(false)
      }
    },
    [companyId, selectedGroupId, supabase]
  )

  React.useEffect(() => {
    void loadGroups()
  }, [loadGroups])

  React.useEffect(() => {
    void loadPoolAndSellers()
  }, [loadPoolAndSellers])

  React.useEffect(() => {
    setSelectedIds(new Set())
    setAllPoolSelected(false)
    setShowBulkModal(false)
    setShowDeleteLeadConfirm(false)
    setDeletePassword('')
  }, [selectedGroupId, poolCycles])

  function toggleSelect(cycleId: string) {
    const next = new Set(selectedIds)

    if (next.has(cycleId)) {
      next.delete(cycleId)
    } else {
      next.add(cycleId)
    }

    setSelectedIds(next)
  }

  function toggleSelectAllPool() {
    if (allPoolSelected) {
      setSelectedIds(new Set())
      setAllPoolSelected(false)
      return
    }

    setSelectedIds(new Set(poolCycles.map((cycle) => cycle.id)))
    setAllPoolSelected(true)
  }

  async function assignCycleToSeller(cycleId: string, sellerId: string) {
    if (!sellerId) return

    setAssigningId(cycleId)
    setError(null)

    try {
      const { data, error } = await supabase.rpc('rpc_bulk_assign_cycles_owner', {
        p_cycle_ids: [cycleId],
        p_owner_user_id: sellerId,
      })

      if (error) throw error
      if (!data?.success) throw new Error('Operação não confirmada')

      await loadPoolAndSellers()
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Erro ao atribuir lead.'))
    } finally {
      setAssigningId(null)
    }
  }

  async function bulkReassignToSeller(sellerId: string) {
    if (selectedIds.size === 0 || !sellerId) return

    setAssigningId('bulk')
    setError(null)

    try {
      const cycleIds = Array.from(selectedIds)

      const { data, error } = await supabase.rpc('rpc_bulk_assign_cycles_owner', {
        p_cycle_ids: cycleIds,
        p_owner_user_id: sellerId,
      })

      if (error) throw error
      if (!data?.success) throw new Error('Operação não confirmada')

      await loadPoolAndSellers()

      setSelectedIds(new Set())
      setAllPoolSelected(false)
      setBulkSeller('')
      setShowBulkModal(false)
      setShowDeleteLeadConfirm(false)
      setDeletePassword('')

      window.alert(`${cycleIds.length} leads redistribuídos!`)
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Erro ao redistribuir leads.'))
    } finally {
      setAssigningId(null)
    }
  }

  async function bulkSetGroup(groupId: string) {
    if (selectedIds.size === 0 || !groupId) return

    setAssigningId('bulk')
    setError(null)

    try {
      const cycleIds = Array.from(selectedIds)

      const { data, error } = await supabase.rpc('rpc_bulk_set_cycles_group', {
        p_cycle_ids: cycleIds,
        p_group_id: groupId,
      })

      if (error) throw error
      if (!data?.success) throw new Error('Operação não confirmada')

      await Promise.all([loadGroups(), loadPoolAndSellers()])

      setSelectedIds(new Set())
      setAllPoolSelected(false)
      setBulkGroup('')
      setShowBulkModal(false)
      setShowDeleteLeadConfirm(false)
      setDeletePassword('')

      window.alert(`${cycleIds.length} leads vinculados ao grupo!`)
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Erro ao agrupar leads.'))
    } finally {
      setAssigningId(null)
    }
  }

  async function distributeAutomatically() {
    if (selectedIds.size === 0 || sellers.length === 0) return

    setAssigningId('bulk')
    setError(null)

    try {
      const cycleIds = Array.from(selectedIds)
      const sellerIds = sellers.map((seller) => seller.id)

      const { data, error } = await supabase.rpc('rpc_bulk_assign_round_robin', {
        p_cycle_ids: cycleIds,
        p_owner_ids: sellerIds,
      })

      if (error) throw error
      if (!data?.success) throw new Error('Operação não confirmada')

      await loadPoolAndSellers()

      setSelectedIds(new Set())
      setAllPoolSelected(false)
      setShowBulkModal(false)
      setShowDeleteLeadConfirm(false)
      setDeletePassword('')

      window.alert(`${cycleIds.length} leads distribuídos automaticamente!`)
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Erro ao distribuir leads.'))
    } finally {
      setAssigningId(null)
    }
  }

  async function recallGroupToPool() {
    if (!selectedGroupId) return

    const confirmRecall = window.confirm(
      'Tem certeza? Isso vai recolher todos os leads do grupo de volta para o pool.'
    )

    if (!confirmRecall) return

    setError(null)

    try {
      const { error } = await supabase.rpc('rpc_recall_group_to_pool', {
        p_group_id: selectedGroupId,
      })

      if (error) throw error

      window.alert('Grupo recolhido ao pool com sucesso!')
      await loadPoolAndSellers()
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Erro ao recolher grupo.'))
    }
  }

  async function distributeGroupPoolRoundRobin() {
    if (!selectedGroupId || sellers.length === 0) return

    const confirmDistribute = window.confirm(
      'Distribuir TODOS os leads do grupo entre os vendedores em round-robin?'
    )

    if (!confirmDistribute) return

    setDistributeGroupLoading(true)
    setError(null)

    try {
      const sellerIds = sellers.map((seller) => seller.id)

      const { data: allGroupLeads, error: fetchErr } = await supabase
        .from('v_pipeline_items')
        .select('id')
        .eq('company_id', companyId)
        .eq('status', 'novo')
        .eq('group_id', selectedGroupId)
        .is('owner_id', null)

      if (fetchErr) throw fetchErr

      const allLeadIds = ((allGroupLeads ?? []) as Array<{ id: string }>).map((lead) => lead.id)

      if (allLeadIds.length === 0) {
        window.alert('Nenhum lead no pool para este grupo.')
        return
      }

      const { data, error } = await supabase.rpc('rpc_bulk_assign_round_robin', {
        p_cycle_ids: allLeadIds,
        p_owner_ids: sellerIds,
      })

      if (error) throw error
      if (!data?.success) throw new Error('Operação não confirmada')

      const updatedCount = data.updated_count ?? allLeadIds.length

      window.alert(`${updatedCount} leads distribuídos do grupo com sucesso!`)

      setSelectedGroupId(null)
      await loadPoolAndSellers()
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Erro ao distribuir grupo.'))
    } finally {
      setDistributeGroupLoading(false)
    }
  }

  async function deleteSelectedGroup() {
    if (!selectedGroupId) return

    const confirmDelete = window.confirm(
      'Tem certeza que deseja excluir este grupo? Os leads serão desvinculados do grupo e o grupo será arquivado.'
    )

    if (!confirmDelete) return

    setError(null)

    try {
      const { data: cyclesInGroup, error: fetchErr } = await supabase
        .from('v_pipeline_items')
        .select('id')
        .eq('company_id', companyId)
        .eq('group_id', selectedGroupId)

      if (fetchErr) throw fetchErr

      const cycleIds = ((cyclesInGroup ?? []) as Array<{ id: string }>).map((cycle) => cycle.id)

      if (cycleIds.length > 0) {
        const { data, error } = await supabase.rpc('rpc_bulk_set_cycles_group', {
          p_cycle_ids: cycleIds,
          p_group_id: null,
        })

        if (error) throw error
        if (!data?.success) throw new Error('Falha ao desvincular os leads do grupo')
      }

      const { error: archiveErr } = await supabase
        .from('lead_groups')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', selectedGroupId)
        .eq('company_id', companyId)

      if (archiveErr) throw archiveErr

      setSelectedGroupId(null)

      await Promise.all([loadGroups(), loadPoolAndSellers()])

      window.alert('Grupo excluído com sucesso!')
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Erro ao excluir grupo.'))
    }
  }

  async function deleteSelectedLeadsWithPassword() {
    if (selectedIds.size === 0) {
      window.alert('Selecione pelo menos um lead.')
      return
    }

    if (!deletePassword.trim()) {
      window.alert('Digite sua senha.')
      return
    }

    setDeletingLeads(true)
    setError(null)

    try {
      const verifyRes = await fetch('/api/admin/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: deletePassword }),
      })

      const verifyJson = (await verifyRes.json()) as { ok?: boolean; error?: string }

      if (!verifyRes.ok || !verifyJson.ok) {
        window.alert(verifyJson?.error ?? 'Senha incorreta.')
        setDeletingLeads(false)
        return
      }

      const selectedLeadIds = poolCycles
        .filter((cycle) => selectedIds.has(cycle.id))
        .map((cycle) => cycle.lead_id)

      if (selectedLeadIds.length === 0) {
        window.alert('Nenhum lead válido encontrado para exclusão.')
        setDeletingLeads(false)
        return
      }

      const confirmDelete = window.confirm(
        `Tem certeza que deseja excluir ${selectedLeadIds.length} lead(s)? Esta ação não pode ser desfeita.`
      )

      if (!confirmDelete) {
        setDeletingLeads(false)
        return
      }

      for (let i = 0; i < selectedLeadIds.length; i += 100) {
        const chunk = selectedLeadIds.slice(i, i + 100)

        const { error } = await supabase
          .from('leads')
          .delete()
          .in('id', chunk)

        if (error) throw error
      }

      setSelectedIds(new Set())
      setAllPoolSelected(false)
      setShowDeleteLeadConfirm(false)
      setDeletePassword('')
      setShowBulkModal(false)

      await loadPoolAndSellers()

      window.alert(`${selectedLeadIds.length} lead(s) excluído(s) com sucesso!`)
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Erro ao excluir leads.'))
    } finally {
      setDeletingLeads(false)
    }
  }

  async function handleCreateGroupInline() {
    const groupName = window.prompt('Nome do novo grupo:')

    if (!groupName || !groupName.trim()) return

    setCreatingGroup(true)
    setError(null)

    try {
      const { data, error } = await supabase.rpc('rpc_create_lead_group', {
        p_name: groupName.trim(),
      })

      if (error) throw error
      if (!data?.success) throw new Error('Falha ao criar grupo')

      await loadGroups()

      setBulkGroup(data.id)

      window.alert(`Grupo "${data.name}" criado!`)
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Erro ao criar grupo.'))
    } finally {
      setCreatingGroup(false)
    }
  }

  const totalPages = Math.ceil(poolTotal / PAGE_SIZE)

  return (
    <div
      style={{
        background: DS.contentBg,
        color: DS.textPrimary,
        minHeight: '100%',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
          flexWrap: 'wrap',
          marginBottom: 18,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 800,
              letterSpacing: '-0.02em',
              marginBottom: 6,
            }}
          >
            Pool
          </div>

          <div style={{ fontSize: 13, color: DS.textSecondary }}>
            Administração, triagem e distribuição de leads
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowCreateLeadModal(true)}
            style={{
              padding: '10px 14px',
              borderRadius: DS.radius,
              border: `1px solid ${DS.greenBorder}`,
              background: DS.greenBg,
              color: DS.greenText,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            + Criar Lead
          </button>

          <ImportExcelDialog
            userId={userId}
            companyId={companyId}
            onImported={() => {
              void Promise.all([loadGroups(), loadPoolAndSellers()])
            }}
            trigger={
              <button
                style={{
                  padding: '10px 14px',
                  borderRadius: DS.radius,
                  border: `1px solid ${DS.border}`,
                  background: DS.surfaceBg,
                  color: DS.textPrimary,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                Importar Excel
              </button>
            }
          />

          <DeleteLeadsDialog
            companyId={companyId}
            isAdmin={true}
            onDeleted={() => {
              void Promise.all([loadGroups(), loadPoolAndSellers()])
            }}
            trigger={
              <button
                style={{
                  padding: '10px 14px',
                  borderRadius: DS.radius,
                  border: `1px solid ${DS.redBorder}`,
                  background: DS.redBg,
                  color: DS.redText,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                Deletar Leads
              </button>
            }
          />

          <button
            onClick={() => void loadPoolAndSellers()}
            style={{
              padding: '10px 14px',
              borderRadius: DS.radius,
              border: `1px solid ${DS.border}`,
              background: DS.surfaceBg,
              color: DS.textPrimary,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            Atualizar
          </button>
        </div>
      </div>

      {showCreateLeadModal && (
        <CreateLeadModal
          companyId={companyId}
          userId={userId}
          isAdmin={true}
          groups={groups}
          onLeadCreated={() => {
            setShowCreateLeadModal(false)
            void Promise.all([loadGroups(), loadPoolAndSellers()])
          }}
          onClose={() => setShowCreateLeadModal(false)}
        />
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 12,
          marginBottom: 18,
        }}
      >
        <div
          style={{
            background: DS.panelBg,
            border: `1px solid ${DS.border}`,
            borderRadius: DS.radiusContainer,
            padding: 14,
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: DS.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            Vendedores
          </div>

          <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6 }}>
            {sellers.length}
          </div>
        </div>

        <div
          style={{
            background: DS.panelBg,
            border: `1px solid ${DS.border}`,
            borderRadius: DS.radiusContainer,
            padding: 14,
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: DS.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            Leads no Pool
          </div>

          <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6 }}>
            {poolTotal}
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: 16,
          padding: '12px 14px',
          background: DS.surfaceBg,
          border: `1px solid ${DS.border}`,
          borderRadius: DS.radiusContainer,
        }}
      >
        <select
          value={selectedGroupId || ''}
          onChange={(e) => setSelectedGroupId(e.target.value || null)}
          style={{
            padding: '9px 12px',
            borderRadius: DS.radius,
            border: `1px solid ${DS.border}`,
            background: DS.panelBg,
            color: DS.textPrimary,
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 700,
            outline: 'none',
            minWidth: 220,
          }}
        >
          <option value="">Todos os grupos</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>

        {selectedGroupId && (
          <button
            onClick={() => void recallGroupToPool()}
            style={{
              padding: '9px 12px',
              borderRadius: DS.radius,
              border: `1px solid ${DS.redBorder}`,
              background: DS.redBg,
              color: DS.redText,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            Recolher Grupo
          </button>
        )}

        {selectedGroupId && sellers.length > 0 && (
          <button
            onClick={() => void distributeGroupPoolRoundRobin()}
            disabled={distributeGroupLoading}
            style={{
              padding: '9px 12px',
              borderRadius: DS.radius,
              border: `1px solid ${DS.greenBorder}`,
              background: DS.greenBg,
              color: DS.greenText,
              cursor: distributeGroupLoading ? 'not-allowed' : 'pointer',
              fontSize: 12,
              fontWeight: 700,
              opacity: distributeGroupLoading ? 0.5 : 1,
            }}
          >
            {distributeGroupLoading ? 'Distribuindo...' : 'Distribuir Grupo'}
          </button>
        )}

        {selectedGroupId && (
          <button
            onClick={() => void deleteSelectedGroup()}
            style={{
              padding: '9px 12px',
              borderRadius: DS.radius,
              border: `1px solid ${DS.redBorder}`,
              background: DS.redBg,
              color: DS.redText,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            Excluir Grupo
          </button>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button
            onClick={toggleSelectAllPool}
            style={{
              padding: '9px 12px',
              borderRadius: DS.radius,
              border: `1px solid ${allPoolSelected ? DS.blue : DS.border}`,
              background: allPoolSelected ? 'rgba(59,130,246,0.15)' : DS.panelBg,
              color: allPoolSelected ? DS.blueSoft : DS.textSecondary,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {allPoolSelected ? 'Desmarcar' : 'Selecionar'} ({poolCycles.length})
          </button>

          {selectedIds.size > 0 && (
            <button
              onClick={() => setShowBulkModal(true)}
              style={{
                padding: '9px 12px',
                borderRadius: DS.radius,
                border: `1px solid ${DS.amberBorder}`,
                background: DS.amberBg,
                color: DS.amberText,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              Ações ({selectedIds.size})
            </button>
          )}
        </div>
      </div>

      {error && (
        <div
          style={{
            background: DS.redBg,
            color: DS.redText,
            border: `1px solid ${DS.redBorder}`,
            borderRadius: DS.radiusContainer,
            padding: 12,
            marginBottom: 16,
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          background: DS.panelBg,
          border: `1px solid ${DS.border}`,
          borderRadius: DS.radiusContainer,
          padding: 14,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: 14,
            paddingBottom: 12,
            borderBottom: `1px solid ${DS.borderSubtle}`,
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 14, color: DS.textPrimary }}>
            Pool de Leads
            {selectedGroupId && (
              <span style={{ color: DS.textMuted, fontWeight: 500 }}> (filtrado)</span>
            )}
          </div>

          <div style={{ fontSize: 12, color: DS.textMuted }}>
            {poolCycles.length} de {poolTotal}
          </div>
        </div>

        {loading ? (
          <div style={{ color: DS.textMuted, fontSize: 12 }}>Carregando pool...</div>
        ) : poolCycles.length === 0 ? (
          <div style={{ color: DS.textMuted, fontSize: 12, textAlign: 'center', paddingTop: 30 }}>
            Nenhum lead no pool
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {poolCycles.map((cycle) => (
              <div
                key={cycle.id}
                style={{
                  borderTop: `1px solid ${selectedIds.has(cycle.id) ? DS.blue : DS.border}`,
                  borderRight: `1px solid ${selectedIds.has(cycle.id) ? DS.blue : DS.border}`,
                  borderBottom: `1px solid ${selectedIds.has(cycle.id) ? DS.blue : DS.border}`,
                  borderLeft: `3px solid ${DS.blue}`,
                  borderRadius: DS.radiusContainer,
                  padding: '14px 14px',
                  background: selectedIds.has(cycle.id) ? 'rgba(59,130,246,0.07)' : DS.cardBg,
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                  alignItems: 'flex-start',
                }}
              >
                <div style={{ display: 'flex', gap: 12, flex: 1, minWidth: 220 }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(cycle.id)}
                    onChange={() => toggleSelect(cycle.id)}
                    style={{ width: 16, height: 16, cursor: 'pointer', marginTop: 3 }}
                  />

                  <div
                    style={{ flex: 1, minWidth: 180, cursor: 'pointer' }}
                    onClick={() => {
                      window.location.href = `/sales-cycles/${cycle.id}`
                    }}
                  >
                    <div style={{ fontWeight: 800, color: DS.textPrimary, fontSize: 14 }}>
                      {cycle.name}
                    </div>

                    <div style={{ fontSize: 12, color: DS.textSecondary, marginTop: 6 }}>
                      {cycle.phone ?? 'Sem telefone'} · {new Date(cycle.created_at).toLocaleString('pt-BR')}
                    </div>

                    {cycle.lead_groups?.name ? (
                      <div
                        style={{
                          fontSize: 10,
                          marginTop: 8,
                          color: DS.greenText,
                          fontWeight: 800,
                          background: DS.greenBg,
                          padding: '4px 8px',
                          borderRadius: 6,
                          display: 'inline-block',
                          border: `1px solid ${DS.greenBorder}`,
                        }}
                      >
                        [G] {cycle.lead_groups.name}
                      </div>
                    ) : (
                      <div style={{ fontSize: 10, marginTop: 8, color: DS.textLabel, fontStyle: 'italic' }}>
                        Sem grupo
                      </div>
                    )}

                    {cycle.last_return_reason && (
                      <div
                        style={{
                          fontSize: 10,
                          marginTop: 8,
                          background: DS.amberBg,
                          padding: '8px 10px',
                          borderRadius: DS.radius,
                          border: `1px solid ${DS.amberBorder}`,
                          color: DS.amberText,
                        }}
                      >
                        <div style={{ fontWeight: 800, marginBottom: 3 }}>
                          Retornado ao Pool
                        </div>

                        <div>
                          <strong>Motivo:</strong>{' '}
                          {RETURN_REASONS.find((reason) => reason.value === cycle.last_return_reason)?.label ||
                            cycle.last_return_reason}
                        </div>

                        <div style={{ marginTop: 3, color: DS.textSecondary }}>
                          {cycle.last_return_details}
                        </div>

                        {cycle.last_return_at && (
                          <div style={{ marginTop: 3, fontSize: 9, color: DS.textMuted }}>
                            {new Date(cycle.last_return_at).toLocaleString('pt-BR')}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        void assignCycleToSeller(cycle.id, e.target.value)
                        e.target.value = ''
                      }
                    }}
                    disabled={assigningId === cycle.id}
                    style={{
                      padding: '10px 12px',
                      borderRadius: DS.radius,
                      border: `1px solid ${DS.border}`,
                      background: DS.surfaceBg,
                      color: DS.textPrimary,
                      cursor: assigningId === cycle.id ? 'not-allowed' : 'pointer',
                      minWidth: 220,
                      fontWeight: 700,
                      fontSize: 12,
                      outline: 'none',
                      opacity: assigningId === cycle.id ? 0.6 : 1,
                    }}
                  >
                    <option value="">
                      {assigningId === cycle.id ? 'Encaminhando...' : 'Encaminhar para...'}
                    </option>

                    {sellers.map((seller) => (
                      <option key={seller.id} value={seller.id}>
                        {(seller.full_name ?? seller.email ?? seller.id) + ` (${seller.role})`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}

        {poolTotal > PAGE_SIZE && (
          <div
            style={{
              display: 'flex',
              gap: 6,
              justifyContent: 'center',
              flexWrap: 'wrap',
              alignItems: 'center',
              marginTop: 16,
              paddingTop: 14,
              borderTop: `1px solid ${DS.border}`,
            }}
          >
            <button
              onClick={() => void loadPoolPage(poolPageNum - 1)}
              disabled={poolLoading || poolPageNum === 1}
              style={{
                padding: '6px 10px',
                borderRadius: DS.radius,
                border: `1px solid ${DS.border}`,
                background: DS.surfaceBg,
                color: DS.textSecondary,
                cursor: poolLoading || poolPageNum === 1 ? 'not-allowed' : 'pointer',
                fontSize: 12,
                fontWeight: 700,
                opacity: poolLoading || poolPageNum === 1 ? 0.4 : 1,
              }}
            >
              {'<<'}
            </button>

            {Array.from({ length: totalPages }).map((_, index) => {
              const pageNum = index + 1
              const isCurrentPage = poolPageNum === pageNum
              const show = pageNum <= 7 || isCurrentPage

              if (!show) return null

              return (
                <button
                  key={pageNum}
                  onClick={() => void loadPoolPage(pageNum)}
                  disabled={poolLoading}
                  style={{
                    padding: '6px 10px',
                    borderRadius: DS.radius,
                    border: isCurrentPage ? `1px solid ${DS.blue}` : `1px solid ${DS.border}`,
                    background: isCurrentPage ? DS.blue : DS.surfaceBg,
                    color: isCurrentPage ? '#fff' : DS.textSecondary,
                    cursor: poolLoading ? 'not-allowed' : 'pointer',
                    fontSize: 12,
                    fontWeight: isCurrentPage ? 800 : 500,
                    opacity: poolLoading ? 0.5 : 1,
                  }}
                >
                  {pageNum}
                </button>
              )
            })}

            {totalPages > 7 && <span style={{ color: DS.textMuted, fontSize: 12 }}>…</span>}

            <button
              onClick={() => void loadPoolPage(poolPageNum + 1)}
              disabled={poolLoading || poolPageNum >= totalPages}
              style={{
                padding: '6px 10px',
                borderRadius: DS.radius,
                border: `1px solid ${DS.border}`,
                background: DS.surfaceBg,
                color: DS.textSecondary,
                cursor: poolLoading || poolPageNum >= totalPages ? 'not-allowed' : 'pointer',
                fontSize: 12,
                fontWeight: 700,
                opacity: poolLoading || poolPageNum >= totalPages ? 0.4 : 1,
              }}
            >
              {'>>'}
            </button>
          </div>
        )}
      </div>

      {showBulkModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.72)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
          onClick={() => {
            setShowBulkModal(false)
            setShowDeleteLeadConfirm(false)
            setDeletePassword('')
          }}
        >
          <div
            style={{
              background: DS.surfaceBg,
              border: `1px solid ${DS.border}`,
              borderRadius: DS.radiusContainer + 3,
              padding: 24,
              width: '90%',
              maxWidth: 600,
              color: DS.textPrimary,
              maxHeight: '80vh',
              overflowY: 'auto',
              boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 20, color: DS.textPrimary }}>
              Ações em Massa ({selectedIds.size} leads)
            </div>

            <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${DS.borderSubtle}` }}>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  display: 'block',
                  marginBottom: 10,
                  color: DS.textMuted,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                }}
              >
                Distribuição Automática
              </label>

              <p style={{ fontSize: 11, color: DS.textMuted, marginBottom: 12 }}>
                Distribui {selectedIds.size} leads uniformemente entre {sellers.length} vendedores
              </p>

              <button
                onClick={() => void distributeAutomatically()}
                disabled={assigningId === 'bulk' || sellers.length === 0}
                style={{
                  width: '100%',
                  padding: '11px',
                  borderRadius: DS.radius,
                  border: `1px solid ${sellers.length > 0 && assigningId !== 'bulk' ? DS.greenBorder : DS.border}`,
                  background: sellers.length > 0 && assigningId !== 'bulk' ? DS.greenBg : DS.panelBg,
                  color: sellers.length > 0 && assigningId !== 'bulk' ? DS.greenText : DS.textMuted,
                  cursor: sellers.length > 0 && assigningId !== 'bulk' ? 'pointer' : 'not-allowed',
                  fontWeight: 700,
                  fontSize: 12,
                  opacity: sellers.length > 0 && assigningId !== 'bulk' ? 1 : 0.5,
                }}
              >
                {assigningId === 'bulk' ? 'Distribuindo...' : 'Distribuir Automaticamente'}
              </button>
            </div>

            <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${DS.borderSubtle}` }}>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  display: 'block',
                  marginBottom: 8,
                  color: DS.textMuted,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                }}
              >
                Atribuir para Um Vendedor
              </label>

              <select
                value={bulkSeller}
                onChange={(e) => setBulkSeller(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: DS.radius,
                  border: `1px solid ${DS.border}`,
                  background: DS.panelBg,
                  color: DS.textPrimary,
                  fontSize: 12,
                  marginBottom: 10,
                  outline: 'none',
                }}
              >
                <option value="">Selecione vendedor…</option>
                {sellers.map((seller) => (
                  <option key={seller.id} value={seller.id}>
                    {seller.full_name ?? seller.email} ({seller.role})
                  </option>
                ))}
              </select>

              <button
                onClick={() => void bulkReassignToSeller(bulkSeller)}
                disabled={!bulkSeller || assigningId === 'bulk'}
                style={{
                  width: '100%',
                  padding: '11px',
                  borderRadius: DS.radius,
                  border: 'none',
                  background: bulkSeller && assigningId !== 'bulk' ? DS.blue : DS.panelBg,
                  color: 'white',
                  cursor: bulkSeller && assigningId !== 'bulk' ? 'pointer' : 'not-allowed',
                  fontWeight: 700,
                  fontSize: 12,
                  opacity: bulkSeller && assigningId !== 'bulk' ? 1 : 0.5,
                }}
              >
                {assigningId === 'bulk' ? 'Atribuindo...' : 'Atribuir Todos'}
              </button>
            </div>

            <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${DS.borderSubtle}` }}>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  display: 'block',
                  marginBottom: 8,
                  color: DS.textMuted,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                }}
              >
                Vincular Grupo
              </label>

              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <select
                  value={bulkGroup}
                  onChange={(e) => setBulkGroup(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '8px 10px',
                    borderRadius: DS.radius,
                    border: `1px solid ${DS.border}`,
                    background: DS.panelBg,
                    color: DS.textPrimary,
                    fontSize: 12,
                    outline: 'none',
                  }}
                >
                  <option value="">Selecione grupo…</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => void handleCreateGroupInline()}
                  disabled={creatingGroup}
                  style={{
                    padding: '8px 12px',
                    borderRadius: DS.radius,
                    border: `1px solid ${DS.greenBorder}`,
                    background: DS.greenBg,
                    color: DS.greenText,
                    cursor: creatingGroup ? 'not-allowed' : 'pointer',
                    fontSize: 12,
                    fontWeight: 700,
                    opacity: creatingGroup ? 0.5 : 1,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {creatingGroup ? 'Criando...' : '+'}
                </button>
              </div>

              <button
                onClick={() => void bulkSetGroup(bulkGroup)}
                disabled={!bulkGroup || assigningId === 'bulk'}
                style={{
                  width: '100%',
                  padding: '11px',
                  borderRadius: DS.radius,
                  border: 'none',
                  background: bulkGroup && assigningId !== 'bulk' ? 'rgba(139,92,246,0.7)' : DS.panelBg,
                  color: 'white',
                  cursor: bulkGroup && assigningId !== 'bulk' ? 'pointer' : 'not-allowed',
                  fontWeight: 700,
                  fontSize: 12,
                  opacity: bulkGroup && assigningId !== 'bulk' ? 1 : 0.5,
                }}
              >
                {assigningId === 'bulk' ? 'Agrupando...' : 'Agrupar Todos'}
              </button>
            </div>

            <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${DS.borderSubtle}` }}>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  display: 'block',
                  marginBottom: 8,
                  color: DS.textMuted,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                }}
              >
                Excluir Leads
              </label>

              {!showDeleteLeadConfirm ? (
                <button
                  onClick={() => setShowDeleteLeadConfirm(true)}
                  style={{
                    width: '100%',
                    padding: '11px',
                    borderRadius: DS.radius,
                    border: `1px solid ${DS.redBorder}`,
                    background: DS.redBg,
                    color: DS.redText,
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: 12,
                  }}
                >
                  Excluir Lead(s) Selecionado(s)
                </button>
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gap: 10,
                    padding: 12,
                    borderRadius: DS.radius,
                    border: `1px solid ${DS.redBorder}`,
                    background: 'rgba(127,29,29,0.18)',
                  }}
                >
                  <input
                    type="password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    placeholder="Digite sua senha para excluir"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: DS.radius,
                      border: `1px solid ${DS.border}`,
                      background: DS.panelBg,
                      color: DS.textPrimary,
                      fontSize: 12,
                      outline: 'none',
                    }}
                  />

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => {
                        setShowDeleteLeadConfirm(false)
                        setDeletePassword('')
                      }}
                      style={{
                        flex: 1,
                        padding: '10px',
                        borderRadius: DS.radius,
                        border: `1px solid ${DS.border}`,
                        background: DS.panelBg,
                        color: DS.textSecondary,
                        cursor: 'pointer',
                        fontWeight: 700,
                        fontSize: 12,
                      }}
                    >
                      Cancelar
                    </button>

                    <button
                      onClick={() => void deleteSelectedLeadsWithPassword()}
                      disabled={!deletePassword || deletingLeads}
                      style={{
                        flex: 1,
                        padding: '10px',
                        borderRadius: DS.radius,
                        border: 'none',
                        background: !deletePassword || deletingLeads ? DS.panelBg : '#dc2626',
                        color: !deletePassword || deletingLeads ? DS.textMuted : '#fff',
                        cursor: !deletePassword || deletingLeads ? 'not-allowed' : 'pointer',
                        fontWeight: 700,
                        fontSize: 12,
                        opacity: !deletePassword || deletingLeads ? 0.5 : 1,
                      }}
                    >
                      {deletingLeads ? 'Validando...' : `Confirmar Exclusão (${selectedIds.size})`}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => {
                setShowBulkModal(false)
                setShowDeleteLeadConfirm(false)
                setDeletePassword('')
              }}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: DS.radius,
                border: `1px solid ${DS.border}`,
                background: DS.panelBg,
                color: DS.textSecondary,
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: 12,
              }}
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}