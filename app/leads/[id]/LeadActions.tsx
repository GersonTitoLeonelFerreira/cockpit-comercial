'use client'

import React, { useMemo, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import { getStageLabel } from '@/app/config/stageActions'
import type { LeadStatus } from '@/app/types/sales_cycles'

function onlyDigits(v: string) {
  return (v || '').replace(/\D/g, '')
}
function whatsappLink(phone: string | null) {
  const digits = onlyDigits(phone ?? '')
  if (!digits) return null
  const full = digits.startsWith('55') ? digits : `55${digits}`
  return `https://wa.me/${full}`
}

/** Returns the next active stage in the funnel, or null if there is none */
function getNextStage(currentStatus: string): LeadStatus | null {
  const flow: LeadStatus[] = ['novo', 'contato', 'respondeu', 'negociacao']
  const idx = flow.indexOf(currentStatus as LeadStatus)
  return idx >= 0 && idx < flow.length - 1 ? flow[idx + 1] : null
}

const LOSS_REASONS = [
  'Sem resposta',
  'Sem interesse',
  'Preço',
  'Já fechou com concorrente',
  'Sem tempo / prioridade baixa',
  'Não é o perfil (qualificação)',
  'Telefone inválido / contato incorreto',
  'Outro',
] as const

export default function LeadActions(props: {
  leadId: string
  companyId: string
  userId: string
  currentStatus: string
  phone: string | null
}) {
  const router = useRouter()
  const wa = useMemo(() => whatsappLink(props.phone), [props.phone])

  const [busy, setBusy] = useState(false)

  // modal perdido
  const [openLost, setOpenLost] = useState(false)
  const [lossReason, setLossReason] = useState('')
  const [lossOther, setLossOther] = useState('')

  const doMove = useCallback(
    async (toStage: LeadStatus, meta?: any) => {
      if (busy) return
      setBusy(true)

      try {
        const nowIso = new Date().toISOString()

        const { error: updateErr } = await supabase
          .from('leads')
          .update({ status: toStage, stage_entered_at: nowIso })
          .eq('id', props.leadId)
          .eq('company_id', props.companyId)

        if (updateErr) throw new Error(updateErr.message)

        const { error: eventErr } = await supabase.from('lead_events').insert({
          company_id: props.companyId,
          lead_id: props.leadId,
          user_id: props.userId,
          event_type: 'stage_changed',
          from_stage: props.currentStatus,
          to_stage: toStage,
          seconds_in_from_stage: null,
          metadata: { source: 'lead_detail_action', ...meta },
          created_at: nowIso,
        })

        if (eventErr) console.log('Erro ao registrar lead_events:', eventErr)

        router.refresh()
      } catch (e: any) {
        alert('Falha ao atualizar lead: ' + (e?.message ?? String(e)))
      } finally {
        setBusy(false)
      }
    },
    [busy, props.companyId, props.leadId, props.userId, props.currentStatus, router]
  )

  const confirmLost = useCallback(async () => {
    const reason = (lossReason || '').trim()
    if (!reason) {
      alert('Selecione um motivo.')
      return
    }

    let finalReason = reason
    if (reason === 'Outro') {
      const other = (lossOther || '').trim()
      if (!other) {
        alert('Descreva o motivo em "Outro".')
        return
      }
      finalReason = other
    }

    await doMove('perdido', { reason: finalReason })
    setOpenLost(false)
    setLossReason('')
    setLossOther('')
  }, [lossReason, lossOther, doMove])

  const btn: React.CSSProperties = {
    border: '1px solid #333',
    background: '#111',
    color: 'white',
    borderRadius: 10,
    padding: '8px 10px',
    fontSize: 12,
    cursor: busy ? 'not-allowed' : 'pointer',
    opacity: busy ? 0.65 : 1,
  }

  const ghost: React.CSSProperties = {
    border: '1px solid #333',
    background: 'transparent',
    color: '#9aa',
    borderRadius: 10,
    padding: '8px 10px',
    fontSize: 12,
    cursor: busy ? 'not-allowed' : 'pointer',
    opacity: busy ? 0.65 : 1,
    textDecoration: 'none',
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {wa ? (
          <a href={wa} target="_blank" rel="noreferrer" style={ghost}>
            WhatsApp →
          </a>
        ) : null}

        {(() => {
          const nextStage = getNextStage(props.currentStatus)
          const isNegociacao = props.currentStatus === 'negociacao'
          return (
            <>
              {nextStage && (
                <button type="button" style={btn} disabled={busy} onClick={() => doMove(nextStage)}>
                  Avançar p/ {getStageLabel(nextStage)}
                </button>
              )}
              {isNegociacao && (
                <button type="button" style={btn} disabled={busy} onClick={() => doMove('ganho')}>
                  Fechar ✅
                </button>
              )}
              <button
                type="button"
                style={{ ...btn, borderColor: '#ef4444', color: '#ef4444' }}
                disabled={busy}
                onClick={() => setOpenLost(true)}
              >
                Perder ✖
              </button>
            </>
          )
        })()}
      </div>

      {openLost && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 16,
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) setOpenLost(false)
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 520,
              background: '#0b0b0b',
              border: '1px solid #2a2a2a',
              borderRadius: 14,
              padding: 16,
              color: 'white',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
              <h3 style={{ margin: 0 }}>Motivo da perda (obrigatório)</h3>
              <button type="button" onClick={() => !busy && setOpenLost(false)} style={ghost} disabled={busy}>
                Cancelar
              </button>
            </div>

            <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
              <label style={{ fontSize: 12, opacity: 0.8 }}>Selecione um motivo</label>

              <select
                value={lossReason}
                onChange={(e) => setLossReason(e.target.value)}
                disabled={busy}
                style={{
                  width: '100%',
                  background: '#111',
                  border: '1px solid #2a2a2a',
                  color: 'white',
                  padding: '10px 12px',
                  borderRadius: 10,
                  outline: 'none',
                }}
              >
                <option value="">— selecione —</option>
                {LOSS_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>

              {lossReason === 'Outro' && (
                <>
                  <label style={{ fontSize: 12, opacity: 0.8 }}>Descreva</label>
                  <input
                    value={lossOther}
                    onChange={(e) => setLossOther(e.target.value)}
                    disabled={busy}
                    placeholder="Ex.: Mudou de cidade / etc."
                    style={{
                      width: '100%',
                      background: '#111',
                      border: '1px solid #2a2a2a',
                      color: 'white',
                      padding: '10px 12px',
                      borderRadius: 10,
                      outline: 'none',
                    }}
                  />
                </>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button type="button" onClick={confirmLost} disabled={busy} style={btn}>
                {busy ? 'Salvando...' : 'Confirmar perda'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
