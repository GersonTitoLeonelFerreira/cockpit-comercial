'use client'

import React, { useCallback, useEffect, useState } from 'react'

type LeadGroup = {
  id: string
  name: string
  description: string | null
  archived_at: string | null
}

type GroupActionResponse = {
  ok?: boolean
  success?: boolean
  error?: string
  updated_count?: number
}

async function postGroupAction(body: Record<string, unknown>): Promise<GroupActionResponse> {
  const response = await fetch('/api/admin/configuracoes/grupos/actions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify(body),
  })

  const json = (await response.json()) as GroupActionResponse

  if (!response.ok || !json.ok) {
    throw new Error(json.error ?? 'Erro ao executar ação do grupo.')
  }

  return json
}

export default function GruposClient({ companyId }: { companyId: string; userId: string }) {
  void companyId

  const [groups, setGroups] = useState<LeadGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupDesc, setNewGroupDesc] = useState('')
  const [creatingGroup, setCreatingGroup] = useState(false)

  const loadGroups = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/admin/configuracoes/grupos/actions', {
        method: 'GET',
        cache: 'no-store',
      })

      const json = (await response.json()) as {
        ok?: boolean
        error?: string
        groups?: LeadGroup[]
      }

      if (!response.ok || !json.ok) {
        throw new Error(json.error ?? 'Erro ao carregar grupos')
      }

      setGroups(json.groups ?? [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar grupos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadGroups()
  }, [loadGroups])

  const createGroup = useCallback(async () => {
    if (!newGroupName.trim()) {
      setError('Nome do grupo é obrigatório')
      setNotice(null)
      return
    }

    setCreatingGroup(true)
    setError(null)
    setNotice(null)

    try {
      await postGroupAction({
        action: 'create_group',
        name: newGroupName.trim(),
        description: newGroupDesc.trim() || null,
      })

      setNewGroupName('')
      setNewGroupDesc('')
      setNotice('Grupo criado com sucesso.')
      await loadGroups()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao criar grupo')
      setNotice(null)
    } finally {
      setCreatingGroup(false)
    }
  }, [newGroupName, newGroupDesc, loadGroups])

  const archiveGroup = useCallback(
    async (groupId: string) => {
      if (!confirm('Tem certeza? Isso vai arquivar o grupo.')) return

      setError(null)
      setNotice(null)

      try {
        await postGroupAction({
          action: 'archive_group',
          group_id: groupId,
        })

        setNotice('Grupo arquivado com sucesso.')
        await loadGroups()
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Erro ao arquivar grupo')
        setNotice(null)
      }
    },
    [loadGroups]
  )

  const detachGroupCycles = useCallback(
    async (groupId: string) => {
      if (!confirm('Tem certeza? Isso vai desvincular todos os ciclos do grupo.')) return

      setError(null)
      setNotice(null)

      try {
        const data = await postGroupAction({
          action: 'detach_group_cycles',
          group_id: groupId,
        })

        setNotice(`${data.updated_count ?? 0} ciclo(s) desvinculado(s) do grupo.`)
        await loadGroups()
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Erro ao desvincular ciclos')
        setNotice(null)
      }
    },
    [loadGroups]
  )

  const recallGroupToPool = useCallback(
    async (groupId: string) => {
      if (!confirm('Tem certeza? Isso vai recolher todos os ciclos do grupo ao pool.')) return

      setError(null)
      setNotice(null)

      try {
        const data = await postGroupAction({
          action: 'recall_group_to_pool',
          group_id: groupId,
        })

        setNotice(`${data.updated_count ?? 0} ciclo(s) recolhido(s) ao Pool com sucesso.`)
        await loadGroups()
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Erro ao recolher grupo')
        setNotice(null)
      }
    },
    [loadGroups]
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

      {notice && (
        <div
          style={{
            background: 'rgba(22, 163, 74, 0.16)',
            color: '#86efac',
            border: '1px solid rgba(34, 197, 94, 0.35)',
            padding: 12,
            borderRadius: 10,
            marginBottom: 20,
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {notice}
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