'use client'

import { useMemo, useState } from 'react'
import LeadQuickDrawer, { type WorklistItem } from '@/app/leads/components/LeadQuickDrawer'

function createPreviewSupabase() {
  return {
    from() {
      return {
        update() {
          return {
            async eq() {
              return {
                error: new Error('Preview visual: nenhuma alteração foi salva no banco.'),
              }
            },
          }
        },
      }
    },
  }
}

export default function DrawerPreviewClient() {
  const [open, setOpen] = useState(false)
  const supabase = useMemo(() => createPreviewSupabase(), [])

  const previewItem: WorklistItem = {
    id: 'preview-cycle-id',
    lead_id: 'preview-lead-id',
    name: 'Maria Exemplo',
    phone: '(49) 99999-0000',
    status: 'negociacao',
    next_action: 'Retomar negociação',
    next_action_date: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    stage_entered_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 6).toISOString(),
  }

  return (
    <div className="min-h-full bg-[#090b0f] p-8 text-[#edf2f7]">
      <div className="max-w-3xl rounded-3xl border border-[#1a1d2e] bg-[#0d0f14] p-6 shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#3b82f6]">
          Preview temporário
        </div>
        <h1 className="mt-2 text-3xl font-black tracking-tight">LeadQuickDrawer</h1>
        <p className="mt-3 text-sm leading-6 text-[#8fa3bc]">
          Esta tela serve apenas para avaliar se o drawer rápido vale ser reaproveitado no Kanban.
          O item é demonstrativo e o botão de salvar agenda não grava nada no banco.
        </p>

        <div className="mt-6 rounded-2xl border border-[#1a1d2e] bg-[#111318] p-4">
          <div className="text-sm font-black">Item demonstrativo</div>
          <div className="mt-2 text-sm text-[#8fa3bc]">
            Lead em Negociação, próxima ação vencida e vários dias parado na etapa. Isso força o
            bloco de Pulso Comercial a aparecer no drawer.
          </div>
        </div>

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-6 rounded-xl border border-blue-500/40 bg-blue-500/15 px-5 py-3 text-sm font-black text-blue-100 hover:bg-blue-500/20"
        >
          Abrir preview do drawer
        </button>
      </div>

      <LeadQuickDrawer
        item={open ? previewItem : null}
        onClose={() => setOpen(false)}
        supabase={supabase}
        onSaved={() => undefined}
      />
    </div>
  )
}
