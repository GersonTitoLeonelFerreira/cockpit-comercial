'use client'

import React, { useState } from 'react'
import { supabaseBrowser } from '../../lib/supabaseBrowser'

export default function DeleteLeadsDialog({
  companyId,
  isAdmin,
  onDeleted,
  trigger,
}: {
  companyId: string
  isAdmin: boolean
  onDeleted: () => void
  trigger: React.ReactNode
}) {
  const supabase = React.useMemo(() => supabaseBrowser(), [])
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [groups, setGroups] = useState<Array<{ id: string; name: string }>>([])
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteMode, setDeleteMode] = useState<'search' | 'group' | 'no-group'>('search')

  // Carregar grupos quando abrir
  React.useEffect(() => {
    if (!isOpen || !isAdmin) return

    const loadGroups = async () => {
      try {
        const { data, error } = await supabase
          .from('lead_groups')
          .select('id, name')
          .eq('company_id', companyId)
          .is('archived_at', null)
          .order('name', { ascending: true })

        if (error) throw error
        setGroups((data ?? []) as any[])
      } catch (e) {
        console.error('Erro ao carregar grupos:', e)
      }
    }

    loadGroups()
  }, [isOpen, companyId, isAdmin, supabase])

  // Buscar leads por nome/telefone/CPF
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }

    setIsLoading(true)
    try {
      const query = searchQuery.toLowerCase().trim()

      const { data, error } = await supabase
        .from('v_pipeline_items')
        .select('id, lead_id, name, phone, status, group_id')
        .eq('company_id', companyId)
        .is('owner_id', null)
        .or(
          `name.ilike.%${query}%,phone.ilike.%${query}%`
        )
        .limit(100)

      if (error) throw error
      setSearchResults((data ?? []) as any[])
    } catch (e) {
      console.error('Erro ao buscar leads:', e)
      alert('Erro ao buscar leads')
    } finally {
      setIsLoading(false)
    }
  }

  // Buscar leads de um grupo
  const handleLoadGroupLeads = async () => {
    if (!selectedGroupId) return

    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from('v_pipeline_items')
        .select('id, lead_id, name, phone, status, group_id')
        .eq('company_id', companyId)
        .eq('group_id', selectedGroupId)
        .is('owner_id', null)
        .limit(500)

      if (error) throw error
      setSearchResults((data ?? []) as any[])
    } catch (e) {
      console.error('Erro ao carregar leads do grupo:', e)
      alert('Erro ao carregar leads')
    } finally {
      setIsLoading(false)
    }
  }

  // Buscar leads SEM grupo
  const handleLoadNoGroupLeads = async () => {
    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from('v_pipeline_items')
        .select('id, lead_id, name, phone, status, group_id')
        .eq('company_id', companyId)
        .is('owner_id', null)
        .is('group_id', null)
        .limit(500)

      if (error) throw error
      setSearchResults((data ?? []) as any[])
    } catch (e) {
      console.error('Erro ao carregar leads sem grupo:', e)
      alert('Erro ao carregar leads')
    } finally {
      setIsLoading(false)
    }
  }

  // Deletar leads selecionados
  const handleDelete = async () => {
    if (selectedLeads.size === 0) {
      alert('Selecione pelo menos um lead para deletar')
      return
    }

    if (!confirm(`Tem certeza que deseja deletar ${selectedLeads.size} lead(s)? Esta ação NÃO pode ser desfeita!`)) {
      return
    }

    setIsDeleting(true)
    try {
      const leadIds = Array.from(selectedLeads)

      // Deletar em chunks de 100
      for (let i = 0; i < leadIds.length; i += 100) {
        const chunk = leadIds.slice(i, i + 100)
        const { error } = await supabase
          .from('leads')
          .delete()
          .in('id', chunk)

        if (error) throw error
      }

      alert(`${selectedLeads.size} lead(s) deletado(s) com sucesso!`)
      setSelectedLeads(new Set())
      setSearchResults([])
      setSearchQuery('')
      setSelectedGroupId(null)
      onDeleted()
    } catch (e) {
      console.error('Erro ao deletar leads:', e)
      alert('Erro ao deletar leads')
    } finally {
      setIsDeleting(false)
    }
  }

  const toggleSelect = (leadId: string) => {
    const newSet = new Set(selectedLeads)
    if (newSet.has(leadId)) {
      newSet.delete(leadId)
    } else {
      newSet.add(leadId)
    }
    setSelectedLeads(newSet)
  }

  const toggleSelectAll = () => {
    if (selectedLeads.size === searchResults.length) {
      setSelectedLeads(new Set())
    } else {
      const allIds = new Set(searchResults.map((r) => r.id))
      setSelectedLeads(allIds)
    }
  }

  return (
    <>
      <div onClick={() => setIsOpen(true)}>{trigger}</div>

      {isOpen && (
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
            zIndex: 10000,
          }}
          onClick={() => setIsOpen(false)}
        >
          <div
            style={{
              background: '#111',
              border: '1px solid #333',
              borderRadius: 12,
              padding: 24,
              width: '90%',
              maxWidth: 700,
              color: 'white',
              maxHeight: '80vh',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 900 }}>Deletar Leads</div>
              <button
                onClick={() => setIsOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'white',
                  fontSize: 24,
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            {/* TABS / MODES */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '1px solid #222', paddingBottom: 12 }}>
              <button
                onClick={() => setDeleteMode('search')}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  background: deleteMode === 'search' ? '#3b82f6' : 'transparent',
                  color: deleteMode === 'search' ? '#000' : '#999',
                  cursor: 'pointer',
                  borderRadius: 6,
                  fontWeight: deleteMode === 'search' ? 900 : 400,
                  fontSize: 12,
                }}
              >
                Pesquisar Lead
              </button>

              {isAdmin && (
                <>
                  <button
                    onClick={() => setDeleteMode('group')}
                    style={{
                      padding: '8px 16px',
                      border: 'none',
                      background: deleteMode === 'group' ? '#3b82f6' : 'transparent',
                      color: deleteMode === 'group' ? '#000' : '#999',
                      cursor: 'pointer',
                      borderRadius: 6,
                      fontWeight: deleteMode === 'group' ? 900 : 400,
                      fontSize: 12,
                    }}
                  >
                    Deletar Grupo
                  </button>

                  <button
                    onClick={() => setDeleteMode('no-group')}
                    style={{
                      padding: '8px 16px',
                      border: 'none',
                      background: deleteMode === 'no-group' ? '#3b82f6' : 'transparent',
                      color: deleteMode === 'no-group' ? '#000' : '#999',
                      cursor: 'pointer',
                      borderRadius: 6,
                      fontWeight: deleteMode === 'no-group' ? 900 : 400,
                      fontSize: 12,
                    }}
                  >
                    Leads Sem Grupo
                  </button>
                </>
              )}
            </div>

            {/* MODE: SEARCH */}
            {deleteMode === 'search' && (
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 12, fontWeight: 900, display: 'block', marginBottom: 8 }}>
                  Pesquisar por nome ou telefone:
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="Digite para buscar..."
                    style={{
                      flex: 1,
                      padding: '10px',
                      borderRadius: 6,
                      border: '1px solid #444',
                      background: '#222',
                      color: 'white',
                      fontSize: 12,
                    }}
                  />
                  <button
                    onClick={handleSearch}
                    disabled={isLoading}
                    style={{
                      padding: '10px 16px',
                      borderRadius: 6,
                      border: 'none',
                      background: '#3b82f6',
                      color: 'white',
                      cursor: isLoading ? 'not-allowed' : 'pointer',
                      fontSize: 12,
                      fontWeight: 900,
                      opacity: isLoading ? 0.5 : 1,
                    }}
                  >
                    {isLoading ? 'Buscando...' : 'Buscar'}
                  </button>
                </div>
              </div>
            )}

            {/* MODE: GROUP */}
            {deleteMode === 'group' && (
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 12, fontWeight: 900, display: 'block', marginBottom: 8 }}>
                  Selecione um grupo para deletar:
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select
                    value={selectedGroupId || ''}
                    onChange={(e) => setSelectedGroupId(e.target.value || null)}
                    style={{
                      flex: 1,
                      padding: '10px',
                      borderRadius: 6,
                      border: '1px solid #444',
                      background: '#222',
                      color: 'white',
                      fontSize: 12,
                    }}
                  >
                    <option value="">Selecione um grupo...</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleLoadGroupLeads}
                    disabled={!selectedGroupId || isLoading}
                    style={{
                      padding: '10px 16px',
                      borderRadius: 6,
                      border: 'none',
                      background: selectedGroupId && !isLoading ? '#3b82f6' : '#444',
                      color: 'white',
                      cursor: selectedGroupId && !isLoading ? 'pointer' : 'not-allowed',
                      fontSize: 12,
                      fontWeight: 900,
                      opacity: selectedGroupId && !isLoading ? 1 : 0.5,
                    }}
                  >
                    {isLoading ? 'Carregando...' : 'Carregar'}
                  </button>
                </div>
              </div>
            )}

            {/* MODE: NO GROUP */}
            {deleteMode === 'no-group' && (
              <div style={{ marginBottom: 20 }}>
                <button
                  onClick={handleLoadNoGroupLeads}
                  disabled={isLoading}
                  style={{
                    padding: '10px 16px',
                    borderRadius: 6,
                    border: 'none',
                    background: '#3b82f6',
                    color: 'white',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    fontSize: 12,
                    fontWeight: 900,
                    opacity: isLoading ? 0.5 : 1,
                  }}
                >
                  {isLoading ? 'Carregando...' : 'Carregar Leads Sem Grupo'}
                </button>
              </div>
            )}

            {/* RESULTS */}
            {searchResults.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 900 }}>
                    Encontrados: {searchResults.length} leads
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={selectedLeads.size === searchResults.length && searchResults.length > 0}
                      onChange={toggleSelectAll}
                      style={{ width: 16, height: 16, cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: 12, fontWeight: 700 }}>Selecionar Todos</span>
                  </label>
                </div>

                <div
                  style={{
                    maxHeight: 300,
                    overflowY: 'auto',
                    border: '1px solid #333',
                    borderRadius: 6,
                    display: 'grid',
                    gap: 1,
                  }}
                >
                  {searchResults.map((lead) => (
                    <div
                      key={lead.id}
                      style={{
                        padding: '12px',
                        background: selectedLeads.has(lead.id) ? '#1a3a2a' : '#0b0b0b',
                        borderBottom: '1px solid #222',
                        display: 'flex',
                        gap: 12,
                        alignItems: 'center',
                        cursor: 'pointer',
                      }}
                      onClick={() => toggleSelect(lead.id)}
                    >
                      <input
                        type="checkbox"
                        checked={selectedLeads.has(lead.id)}
                        onChange={() => {}}
                        style={{ width: 18, height: 18, cursor: 'pointer' }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 12 }}>{lead.name}</div>
                        <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}>
                          {lead.phone || 'Sem telefone'}
                        </div>
                      </div>
                      <div style={{ fontSize: 10, opacity: 0.5, textAlign: 'right' }}>
                        {lead.status}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* FOOTER */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setIsOpen(false)}
                style={{
                  padding: '10px 16px',
                  borderRadius: 6,
                  border: '1px solid #444',
                  background: 'transparent',
                  color: 'white',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: 12,
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={selectedLeads.size === 0 || isDeleting}
                style={{
                  padding: '10px 16px',
                  borderRadius: 6,
                  border: 'none',
                  background: selectedLeads.size > 0 && !isDeleting ? '#ef4444' : '#444',
                  color: 'white',
                  cursor: selectedLeads.size > 0 && !isDeleting ? 'pointer' : 'not-allowed',
                  fontWeight: 700,
                  fontSize: 12,
                  opacity: selectedLeads.size > 0 && !isDeleting ? 1 : 0.5,
                }}
              >
                {isDeleting ? 'Deletando...' : `Deletar (${selectedLeads.size})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}