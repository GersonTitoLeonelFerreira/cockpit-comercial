'use client'

import * as React from 'react'
import Link from 'next/link'
import { supabaseBrowser } from '../lib/supabaseBrowser'

type Profile = {
  id: string
  full_name: string | null
  email: string | null
  role: string
}

type Lead = {
  id: string
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
  const [leads, setLeads] = React.useState<Lead[]>([])
  const [loading, setLoading] = React.useState(true)
  const [assigningId, setAssigningId] = React.useState<string | null>(null)

  async function load() {
    setLoading(true)

    const [{ data: sellersData, error: sellersErr }, { data: leadsData, error: leadsErr }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .eq('company_id', companyId)
        .in('role', ['seller', 'consultor']) // ajuste para os seus roles reais
        .order('full_name', { ascending: true }),
      supabase
        .from('leads')
        .select('id, name, phone, status, owner_id, created_at')
        .eq('company_id', companyId)
        .eq('status', 'novo') // ✅ status do sistema é minúsculo
        .is('owner_id', null) // ✅ pool: não atribuído
        .order('created_at', { ascending: false }),
    ])

    if (!sellersErr) setSellers((sellersData ?? []) as any)
    if (!leadsErr) setLeads((leadsData ?? []) as any)

    setLoading(false)
  }

  React.useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId])

  async function assignLead(leadId: string, newOwnerId: string) {
    if (!newOwnerId) return
    setAssigningId(leadId)

    // ✅ encaminhar lead para vendedor
    // Recomendado: mover para "contato" ao atribuir (para aparecer no Kanban do vendedor)
    const { error } = await supabase
      .from('leads')
      .update({
        owner_id: newOwnerId,
        status: 'contato',
      })
      .eq('id', leadId)
      .eq('company_id', companyId)

    setAssigningId(null)

    if (error) {
      alert(`Erro ao encaminhar lead: ${error.message}`)
      return
    }

    // remove da lista local (porque saiu do pool)
    setLeads((prev) => prev.filter((l) => l.id !== leadId))
  }

  return (
    <div style={{ color: 'white' }}>
      {/* Topo da página admin */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Pool de Leads (Admin)</div>
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

          <button
            onClick={load}
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid #2a2a2a',
              background: '#111',
              color: 'white',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Atualizar
          </button>
        </div>
      </div>

      {/* Coluna única: Novos */}
      <div
        style={{
          marginTop: 14,
          border: '1px solid #222',
          borderRadius: 14,
          background: '#0f0f0f',
          padding: 12,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ fontWeight: 800 }}>Novos</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>{leads.length} lead(s)</div>
        </div>

        <div style={{ marginTop: 12 }}>
          {loading ? (
            <div style={{ opacity: 0.8 }}>Carregando…</div>
          ) : leads.length === 0 ? (
            <div style={{ opacity: 0.7 }}>Nenhum lead novo no pool.</div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {leads.map((lead) => (
                <div
                  key={lead.id}
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
                  <div>
                    <div style={{ fontWeight: 800 }}>{lead.name}</div>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                      {lead.phone ?? 'Sem telefone'} • {new Date(lead.created_at).toLocaleString()}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <select
                      defaultValue=""
                      onChange={(e) => assignLead(lead.id, e.target.value)}
                      disabled={assigningId === lead.id}
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

                    {assigningId === lead.id ? <div style={{ fontSize: 12, opacity: 0.7 }}>Encaminhando…</div> : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}