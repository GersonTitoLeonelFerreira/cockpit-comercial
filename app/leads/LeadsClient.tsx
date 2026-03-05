'use client'

import * as React from 'react'
import LeadForm from './components/LeadForm'
import AdminLeadsTable from './components/AdminLeadsTable'
import ImportExcelDialog from './components/ImportExcelDialog'
import SellerKanban from './components/SellerKanban'
import { supabaseBrowser } from '../lib/supabaseBrowser'

type LeadRow = {
  id: string
  name: string
  phone: string | null
  status: string
  created_at: string
  stage_entered_at: string | null
  owner_id: string | null
  pinned?: boolean
  importance?: number
}

export default function LeadsClient({
  userId,
  companyId,
  role,
  userLabel,
  defaultOwnerId,
}: {
  userId: string
  companyId: string
  role: string
  userLabel: string
  defaultOwnerId?: string | null
}) {
  const supabase = React.useMemo(() => supabaseBrowser(), [])
  const isAdmin = role === 'admin'

  const [loading, setLoading] = React.useState(false)
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null)
  const [ownerOptions, setOwnerOptions] = React.useState<{ id: string; label: string }[]>([])

  // Carrega lista de vendedores para admin
  React.useEffect(() => {
    if (!isAdmin) return

    let alive = true
    ;(async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id,full_name,email,role')
        .eq('company_id', companyId)
        .neq('role', 'admin')
        .order('created_at', { ascending: true })

      if (!alive) return
      if (error) {
        console.warn('Erro ao carregar vendedores (profiles):', error.message)
        setOwnerOptions([])
        return
      }

      const opts =
        (data ?? []).map((p: any) => ({
          id: String(p.id),
          label: `${p.full_name || p.email || p.id}`,
        })) ?? []

      setOwnerOptions(opts)
    })()

    return () => {
      alive = false
    }
  }, [isAdmin, companyId, supabase])

  return (
    <div style={{ color: 'white' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>Pipeline Comercial</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Logado como: {userLabel} ({role})
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => window.location.reload()}
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

          <ImportExcelDialog
            userId={userId}
            companyId={companyId}
            importMode={isAdmin ? 'POOL' : 'PRIVATE'}
            onImported={() => window.location.reload()}
            trigger={
              <button
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
                Importar Excel
              </button>
            }
          />

          <LeadForm userId={userId} companyId={companyId} role={role} onSaved={() => window.location.reload()} />
        </div>
      </div>

      {loading ? <div style={{ opacity: 0.8, marginTop: 12 }}>Carregando…</div> : null}

      {errorMsg ? (
        <div style={{ marginTop: 12, border: '1px solid #3a1d1d', background: '#140b0b', padding: 12, borderRadius: 12 }}>
          <div style={{ fontWeight: 900 }}>Erro</div>
          <div style={{ opacity: 0.85, marginTop: 6 }}>{errorMsg}</div>
        </div>
      ) : null}

      <div style={{ marginTop: 14 }}>
        {isAdmin ? (
          <AdminLeadsTable
            title="Leads"
            companyId={companyId}
            ownerOptions={ownerOptions}
            defaultOwnerId={defaultOwnerId ?? null}
            fetchPage={async ({ ownerId, status, search, page, pageSize }) => {
              const from = (page - 1) * pageSize
              const to = from + pageSize - 1

              let q = supabase
                .from('leads')
                .select('id,name,phone,status,created_at,owner_id', { count: 'exact' })
                .eq('company_id', companyId)
                .order('created_at', { ascending: false })

              // Dono: ALL | POOL(null) | vendedor(uuid)
              if (ownerId === null) q = q.is('owner_id', null)
              else if (ownerId !== 'ALL') q = q.eq('owner_id', ownerId)

              if (status) q = q.eq('status', status)

              if (search.trim()) {
                const s = search.trim()
                q = q.or(`name.ilike.%${s}%,phone.ilike.%${s}%`)
              }

              const { data, error, count } = await q.range(from, to)
              if (error) throw error

              return { rows: (data ?? []) as any, total: Number(count ?? 0) }
            }}
          />
        ) : (
          <SellerKanban userId={userId} companyId={companyId} />
        )}
      </div>
    </div>
  )
}