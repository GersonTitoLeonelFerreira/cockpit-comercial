'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'

type LeadBasics = {
  id: string
  company_id: string
  name: string
  phone: string | null
  status: string
}

export default function ConversationPasteAI({
  lead,
  trigger,
  onSaved,
}: {
  lead: LeadBasics
  trigger: React.ReactNode
  onSaved?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [pastedText, setPastedText] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [result, setResult] = useState<any | null>(null)

  const canSubmit = useMemo(() => pastedText.trim().length >= 40, [pastedText])

  useEffect(() => {
    if (!open) {
      setPastedText('')
      setErrorMsg(null)
      setResult(null)
      setLoading(false)
    }
  }, [open])

  const submit = useCallback(async () => {
    if (!canSubmit) return
    setLoading(true)
    setErrorMsg(null)
    setResult(null)

    try {
      // garante que está logado (opcional)
      const { data: auth } = await supabase.auth.getUser()
      if (!auth?.user?.id) throw new Error('Você precisa estar logado.')

      const r = await fetch('/api/ai/analyze-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: lead.id,
          companyId: lead.company_id,
          pastedText,
          context: {
            leadName: lead.name,
            leadPhone: lead.phone,
            leadStatus: lead.status,
          },
        }),
      })

      const json = await r.json()
      if (!r.ok) throw new Error(json?.error ?? 'Falha ao analisar conversa.')

      setResult(json)
      onSaved?.()
    } catch (e: any) {
      setErrorMsg(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }, [canSubmit, lead, onSaved, pastedText])

  const pillBtnStyle: React.CSSProperties = {
    border: '1px solid #2a2a2a',
    background: 'transparent',
    color: '#cbd5e1',
    fontSize: 12,
    padding: '6px 10px',
    borderRadius: 999,
    cursor: 'pointer',
    fontWeight: 700,
  }

  return (
    <>
      <span
        onClick={() => setOpen(true)}
        style={{ display: 'inline-flex' }}
      >
        {trigger}
      </span>

      {open ? (
        <div
          onMouseDown={() => setOpen(false)}
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
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              width: 'min(980px, 100%)',
              maxHeight: '85vh',
              overflow: 'auto',
              background: '#0b0b0b',
              border: '1px solid #222',
              borderRadius: 14,
              padding: 14,
              color: 'white',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 900 }}>Colar conversa (WhatsApp) → IA</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  Lead: <b>{lead.name}</b> • Status: <b style={{ textTransform: 'capitalize' }}>{lead.status}</b>
                </div>
              </div>

              <button type="button" onClick={() => setOpen(false)} style={pillBtnStyle}>
                Fechar
              </button>
            </div>

            <div style={{ marginTop: 12, fontSize: 12, opacity: 0.75, lineHeight: 1.4 }}>
              No WhatsApp Web: abra a conversa → <b>Ctrl+A</b> → <b>Ctrl+C</b>.
              Aqui: clique no campo abaixo → <b>Ctrl+V</b>. Não armazenamos o texto bruto, só o resumo/análise.
            </div>

            <textarea
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder="Cole aqui a conversa…"
              style={{
                marginTop: 10,
                width: '100%',
                minHeight: 220,
                background: '#111',
                border: '1px solid #2a2a2a',
                color: 'white',
                padding: 12,
                borderRadius: 12,
                outline: 'none',
                fontSize: 13,
                lineHeight: 1.4,
              }}
            />

            {errorMsg ? (
              <div style={{ marginTop: 10, padding: 10, border: '1px solid #7f1d1d', background: '#1a0b0b', borderRadius: 12, color: '#fecaca' }}>
                {errorMsg}
              </div>
            ) : null}

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                Mínimo recomendado: <b>40+</b> caracteres.
              </div>

              <button
                type="button"
                onClick={submit}
                disabled={!canSubmit || loading}
                style={{
                  border: '1px solid #334155',
                  background: loading ? '#0b1220' : '#111827',
                  color: 'white',
                  borderRadius: 12,
                  padding: '10px 12px',
                  cursor: !canSubmit || loading ? 'not-allowed' : 'pointer',
                  opacity: !canSubmit || loading ? 0.7 : 1,
                  fontWeight: 900,
                }}
              >
                {loading ? 'Analisando…' : 'Gerar resumo + análise'}
              </button>
            </div>

            {result?.parsed ? (
              <div style={{ marginTop: 14, borderTop: '1px solid #222', paddingTop: 12 }}>
                <div style={{ fontWeight: 900 }}>Resumo</div>
                <div style={{ opacity: 0.9, whiteSpace: 'pre-wrap', marginTop: 8 }}>{result.parsed.summary}</div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginTop: 12 }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>Destaques</div>
                    <ul style={{ marginTop: 8, opacity: 0.9 }}>
                      {(result.parsed.highlights ?? []).slice(0, 8).map((x: string, i: number) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <div style={{ fontWeight: 900 }}>Objeções</div>
                    <ul style={{ marginTop: 8, opacity: 0.9 }}>
                      {(result.parsed.objections ?? []).slice(0, 8).map((x: string, i: number) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <div style={{ fontWeight: 900 }}>Próximas ações</div>
                    <ul style={{ marginTop: 8, opacity: 0.9 }}>
                      {(result.parsed.next_actions ?? []).slice(0, 8).map((x: string, i: number) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div style={{ marginTop: 12, fontSize: 12, opacity: 0.75 }}>
                  Score: <b>{result.parsed.performance_score ?? 0}</b> • Sentimento: <b>{result.parsed.sentiment ?? 'indefinido'}</b>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  )
}