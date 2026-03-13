'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { supabaseBrowser } from '../../../lib/supabaseBrowser'

type LeadGroup = {
  id: string
  name: string
  description: string | null
  archived_at: string | null
}

export default function GruposClient({ companyId, userId }: { companyId: string; userId: string }) {
  const supabase = useMemo(() => supabaseBrowser(), [])

  const [groups, setGroups] = useState<LeadGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupDesc, setNewGroupDesc] = useState('')
  const [creatingGroup, setCreatingGroup] = useState(false)

  const loadGroups = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const { data, error: err } = await supabase
        .from('lead_groups')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })

      if (err) throw err
      setGroups((data ?? []) as LeadGroup[])
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao carregar grupos')
    } finally {
      setLoading(false)
    }
  }, [companyId, supabase])

  useEffect(() => {
    void loadGroups()
  }, [loadGroups])

  const createGroup = useCallback(async () => {
    if (!newGroupName.trim()) {
      setError('Nome do grupo é obrigatório')
      return
    }

    setCreatingGroup(true)
    setError(null)

    try {
      const { error: err } = await supabase.from('lead_groups').insert({
        company_id: companyId,
        name: newGroupName.trim(),
        description: newGroupDesc.trim() || null,
        created_by: userId,
      })

      if (err) throw err

      setNewGroupName('')
      setNewGroupDesc('')
      await loadGroups()
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao criar grupo')
    } finally {
      setCreatingGroup(false)
    }
  }, [newGroupName, newGroupDesc, companyId, userId, supabase, loadGroups])

  const archiveGroup = useCallback(
    async (groupId: string) => {
      if (!confirm('Tem certeza? Isso vai arquivar o grupo.')) return

      try {
        const { error: err } = await supabase
          .from('lead_groups')
          .update({ archived_at: new Date().toISOString() })
          .eq('id', groupId)
          .eq('company_id', companyId)

        if (err) throw err
        await loadGroups()
      } catch (e: any) {
        setError(e?.message ?? 'Erro ao arquivar grupo')
      }
    },
    [companyId, supabase, loadGroups]
  )

  const detachGroupCycles = useCallback(
    async (groupId: string) => {
      if (!confirm('Tem certeza? Isso vai desvincular todos os ciclos do grupo.')) return

      try {
        const { error: err } = await supabase.rpc('rpc_set_cycle_group', {
          p_cycle_id: groupId, // ⚠️ Aplicar a todos do grupo
          p_group_id: null,
        })

        if (err) throw err
        await loadGroups()
      } catch (e: any) {
        setError(e?.message ?? 'Erro ao desvincular ciclos')
      }
    },
    [supabase, loadGroups]
  )

  const recallGroupToPool = useCallback(
    async (groupId: string) => {
      if (!confirm('Tem certeza? Isso vai recolher todos os ciclos do grupo ao pool.')) return

      try {
        const { error: err } = await supabase.rpc('rpc_recall_group_to_pool', {
          p_group_id: groupId,
        })

        if (err) throw err
        setError('Grupo recolhido ao pool com sucesso!')
        await loadGroups()
      } catch (e: any) {
        setError(e?.message ?? 'Erro ao recolher grupo')
      }
    },
    [supabase, loadGroups]
  )

  return (
    <div style={{ color: 'white', padding: 24 }}>
      <div style={{ fontSize: 24, fontWeight: 900, marginBottom: 20 }}>Gerenciar Grupos</div>

      {error && (
        <div
          style={{
            background: '#7f1d1d',
            color: '#fecaca',
            padding: 12,
            borderRadius: 10,
            marginBottom: 20,
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}

      {/* Criar novo grupo */}
      <div
        style={{
          border: '1px solid #333',
          borderRadius: 12,
          padding: 16,
          marginBottom: 24,
          background: '#0f0f0f',
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 12 }}>Criar Novo Grupo</div>

        <input
          type="text"
          placeholder="Nome do grupo"
          value={newGroupName}
          onChange={(e) => setNewGroupName(e.target.value)}
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 10,
            border: '1px solid #2a2a2a',
            background: '#111',
            color: 'white',
            marginBottom: 10,
            fontSize: 13,
          }}
        />

        <textarea
          placeholder="Descrição (opcional)"
          value={newGroupDesc}
          onChange={(e) => setNewGroupDesc(e.target.value)}
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 10,
            border: '1px solid #2a2a2a',
            background: '#111',
            color: 'white',
            marginBottom: 10,
            fontSize: 13,
            minHeight: 60,
            fontFamily: 'monospace',
          }}
        />

        <button
          onClick={() => void createGroup()}
          disabled={creatingGroup}
          style={{
            padding: '10px 20px',
            borderRadius: 10,
            border: 'none',
            background: '#3b82f6',
            color: 'white',
            cursor: 'pointer',
            fontWeight: 900,
            fontSize: 13,
          }}
        >
          {creatingGroup ? 'Criando…' : 'Criar Grupo'}
        </button>
      </div>

      {/* Lista de grupos */}
      {loading ? (
        <div style={{ opacity: 0.7 }}>Carregando…</div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {groups.map((group) => (
            <div
              key={group.id}
              style={{
                border: `1px solid ${group.archived_at ? '#555' : '#333'}`,
                borderRadius: 12,
                padding: 16,
                background: group.archived_at ? '#0a0a0a' : '#0f0f0f',
                opacity: group.archived_at ? 0.6 : 1,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>
                    {group.name} {group.archived_at && '(arquivado)'}
                  </div>
                  {group.description && (
                    <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>{group.description}</div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {!group.archived_at && (
                    <>
                      <button
                        onClick={() => void recallGroupToPool(group.id)}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 8,
                          border: '1px solid #f59e0b',
                          background: '#78350f',
                          color: '#fcd34d',
                          cursor: 'pointer',
                          fontSize: 11,
                          fontWeight: 900,
                        }}
                      >
                        Recolher ao Pool
                      </button>

                      <button
                        onClick={() => void detachGroupCycles(group.id)}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 8,
                          border: '1px solid #ec4899',
                          background: '#500724',
                          color: '#fbcfe8',
                          cursor: 'pointer',
                          fontSize: 11,
                          fontWeight: 900,
                        }}
                      >
                        Desvincular Ciclos
                      </button>
                    </>
                  )}

                  <button
                    onClick={() => void archiveGroup(group.id)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: '1px solid #666',
                      background: '#222',
                      color: '#999',
                      cursor: 'pointer',
                      fontSize: 11,
                      fontWeight: 900,
                    }}
                  >
                    {group.archived_at ? 'Arquivado' : 'Arquivar'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}