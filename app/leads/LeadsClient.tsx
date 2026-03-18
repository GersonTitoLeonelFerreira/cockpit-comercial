'use client'

import * as React from 'react'
import SalesCyclesKanban from './components/SalesCyclesKanban'
import CreateLeadModal from './components/CreateLeadModal'
import ImportExcelDialog from './components/ImportExcelDialog'
import DeleteLeadsDialog from './components/DeleteLeadsDialog'
import { supabaseBrowser } from '../lib/supabaseBrowser'

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
  const [showCreateLeadModal, setShowCreateLeadModal] = React.useState(false)

  return (
    <div style={{ color: 'white' }}>
      {/* ============================================================================
          HEADER
          ============================================================================ */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 20,
        }}
      >
        <div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>Pipeline Comercial</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Logado como: {userLabel} ({role})
          </div>
        </div>

        {/* ============================================================================
            BOTÕES
            ============================================================================ */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* + Criar Lead */}
          <button
            onClick={() => setShowCreateLeadModal(true)}
            style={{
              padding: '10px 16px',
              borderRadius: 8,
              border: 'none',
              background: '#10b981',
              color: 'white',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            + Criar Lead
          </button>

          {/* Importar Excel - ADMIN ONLY */}
          {isAdmin && (
            <ImportExcelDialog
            userId={userId}
            companyId={companyId}
            onImported={() => window.location.reload() /* TODO: substituir por router.refresh() */}
            trigger={
                <button
                  style={{
                    padding: '10px 16px',
                    borderRadius: 8,
                    border: '1px solid #10b981',
                    background: 'transparent',
                    color: '#10b981',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  Importar Excel
                </button>
              }
            />
          )}

          {/* Deletar Leads - ADMIN ONLY */}
          {isAdmin && (
            <DeleteLeadsDialog
              companyId={companyId}
              isAdmin={isAdmin}
              onDeleted={() => window.location.reload() /* TODO: substituir por router.refresh() */}
              trigger={
                <button
                  style={{
                    padding: '10px 16px',
                    borderRadius: 8,
                    border: '1px solid #ef4444',
                    background: 'transparent',
                    color: '#ef4444',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  Deletar Leads
                </button>
              }
            />
          )}

          {/* Atualizar (Refresh) */}
          <button
            onClick={() => window.location.reload() /* TODO: substituir por router.refresh() */}
            style={{
              padding: '10px 16px',
              borderRadius: 8,
              border: '1px solid #444',
              background: 'transparent',
              color: 'white',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 500,
              marginLeft: 'auto',
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* ============================================================================
          KANBAN UNIFICADO
          ============================================================================ */}
      <div style={{ marginTop: 24 }}>
        <SalesCyclesKanban
          userId={userId}
          companyId={companyId}
          isAdmin={isAdmin}
          defaultOwnerId={defaultOwnerId ?? undefined}
        />
      </div>

      {/* ============================================================================
          MODAL CRIAR LEAD
          ============================================================================ */}
      {showCreateLeadModal && (
        <CreateLeadModal
          companyId={companyId}
          userId={userId}
          isAdmin={isAdmin}
          groups={[]}
          onLeadCreated={() => {
            setShowCreateLeadModal(false)
            window.location.reload() // TODO: substituir por router.refresh()
          }}
          onClose={() => setShowCreateLeadModal(false)}
        />
      )}
    </div>
  )
}