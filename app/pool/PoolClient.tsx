'use client'

import * as React from 'react'
import { supabaseBrowser } from '../lib/supabaseBrowser'

type Profile = {
  id: string
  full_name: string | null
  email: string | null
  role: string
}

type PipelineItem = {
  id: string // cycle_id
  lead_id: string
  name: string
  phone: string | null
  status: string
  owner_id: string | null
  created_at: string
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

  const [sellers, setSellers] = React.useState<Profile[]>([])
  const [cycles, setCycles] = React.useState<PipelineItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [assigningId, setAssigningId] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  // ✅ Carregar vendedores e ciclos do POOL
  async function load() {
    setLoading(true)
    setError(null)

    try {
      const [{ data: sellersData, error: sellersErr }, { data: cyclesData, error: cyclesErr }] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, email, role')
          .eq('company_id', companyId)
          .in('role', ['seller', 'consultor'])
          .order('full_name', { ascending: true }),
        supabase
          .from('v_pipeline_items')
          .select('*')
          .eq('company_id', companyId)
          .eq('status', 'novo')
          .is('owner_id', null) // ✅ POOL
          .order('created_at', { ascending: false }),
      ])

      if (sellersErr) throw sellersErr
      if (cyclesErr) throw cyclesErr

      setSellers((sellersData ?? []) as Profile[])
      setCycles((cyclesData ?? []) as PipelineItem[])
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao carregar')
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId])

  // ✅ Atribuir ciclo para vendedor
  async function assignCycle(cycleId: string, newOwnerId: string) {
    if (!newOwnerId) return
    setAssigningId(cycleId)
  
    try {
      const { data, error: err } = await supabase.rpc('rpc_reset_cycle_state_on_assignment', {
        p_cycle_id: cycleId,
        p_new_owner_user_id: newOwnerId,
      })
      
      if (err) throw err
      if (!data?.success) throw new Error('Falha ao redistribuir ciclo')
      
      const { error: touchErr } = await supabase.rpc('rpc_touch_cycle_in_current_competency', {
        p_cycle_id: cycleId,
        p_touch_type: 'worked',
        p_touch_at: new Date().toISOString(),
        p_won_total: null,
      })
      
      if (touchErr) {
        console.log('Erro ao registrar atividade por período:', touchErr)
      }
      
      setCycles((prev) => prev.filter((c) => c.id !== cycleId))
    } catch (e: any) {
      setError(`Erro ao atribuir: ${e?.message ?? String(e)}`)
    } finally {
      setAssigningId(null)
    }
  }

  return (
    <div style={{ color: 'white' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>Pool de Leads (Admin)</div>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
            Distribua leads para seus vendedores
          </div>
        </div>

        <button
          onClick={() => void load()}
          style={{
            padding: '10px 12px',
            borderRadius: 10,
            border: '1px solid #2a2a2a',
            background: '#111',
            color: 'white',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 900,
          }}
        >
          Atualizar
        </button>
      </div>

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

      {loading ? (
        <div style={{ opacity: 0.7 }}>Carregando…</div>
      ) : (
        <div style={{ display: 'flex', gap: 20 }}>
          {/* Sidebar: Vendedores */}
          <div style={{ minWidth: 240 }}>
            <div style={{ fontSize: 14, fontWeight: 900, marginBottom: 12 }}>Vendedores ({sellers.length})</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sellers.length === 0 ? (
                <div style={{ opacity: 0.6, fontSize: 12 }}>Nenhum vendedor encontrado</div>
              ) : (
                sellers.map((seller) => (
                  <div
                    key={seller.id}
                    style={{
                      background: '#0f0f0f',
                      border: '1px solid #2a2a2a',
                      borderRadius: 10,
                      padding: 12,
                      fontSize: 12,
                    }}
                  >
                    <div style={{ fontWeight: 900 }}>{seller.full_name ?? 'N/A'}</div>
                    <div style={{ opacity: 0.6, fontSize: 11, marginTop: 4 }}>{seller.email}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Main: Ciclos do Pool */}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 900, marginBottom: 12 }}>
              Ciclos no Pool ({cycles.length})
            </div>

            {cycles.length === 0 ? (
              <div style={{ opacity: 0.6, fontSize: 12 }}>
                Pool vazio! Todos os leads foram distribuídos. 🎉
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {cycles.map((cycle) => (
                  <div
                    key={cycle.id}
                    style={{
                      background: '#0f0f0f',
                      border: '1px solid #2a2a2a',
                      borderRadius: 10,
                      padding: 12,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: 12,
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 4 }}>{cycle.name}</div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>{cycle.phone || '—'}</div>
                        <div style={{ fontSize: 11, opacity: 0.5, marginTop: 4 }}>
                          {new Date(cycle.created_at).toLocaleDateString('pt-BR')}
                        </div>
                      </div>

                      <select
                        value=""
                        onChange={(e) => {
                          const sellerId = e.target.value
                          if (sellerId) {
                            void assignCycle(cycle.id, sellerId)
                          }
                        }}
                        disabled={assigningId === cycle.id}
                        style={{
                          padding: '8px 10px',
                          borderRadius: 6,
                          border: '1px solid #2a2a2a',
                          background: '#111',
                          color: 'white',
                          cursor: assigningId === cycle.id ? 'not-allowed' : 'pointer',
                          fontSize: 12,
                          fontWeight: 900,
                          minWidth: 180,
                        }}
                      >
                        <option value="">
                          {assigningId === cycle.id ? 'Atribuindo…' : 'Atribuir para…'}
                        </option>
                        {sellers.map((seller) => (
                          <option key={seller.id} value={seller.id}>
                            {seller.full_name || seller.email}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}