'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import ConversationPasteAI from '../components/ConversationPasteAI'

type AnalysisRow = {
  id: string
  created_at: string
  summary: string
  highlights: string[]
  objections: string[]
  next_actions: string[]
  performance_score: number
  sentiment: string | null
}

type LeadBasics = {
  id: string
  company_id: string
  name: string
  phone: string | null
  status: string
}

export default function LeadAIBoxClient({ lead }: { lead: LeadBasics }) {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [analyses, setAnalyses] = useState<AnalysisRow[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setErrorMsg(null)

    const { data, error } = await supabase
      .from('lead_conversation_analyses')
      .select('id, created_at, summary, highlights, objections, next_actions, performance_score, sentiment')
      .eq('company_id', lead.company_id)
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: false })
      .limit(5)

    if (error) {
      setErrorMsg('Erro ao carregar análises: ' + error.message)
      setAnalyses([])
      setLoading(false)
      return
    }

    setAnalyses((data ?? []) as any)
    setLoading(false)
  }, [lead.company_id, lead.id])

  useEffect(() => {
    void load()
  }, [load])

  const pillBtnStyle: React.CSSProperties = useMemo(
    () => ({
      border: '1px solid #2a2a2a',
      background: 'transparent',
      color: '#cbd5e1',
      fontSize: 12,
      padding: '6px 10px',
      borderRadius: 999,
      cursor: 'pointer',
      fontWeight: 800,
    }),
    []
  )

  const badgeStyle = useCallback((): React.CSSProperties => {
    return {
      display: 'inline-block',
      fontSize: 11,
      padding: '2px 8px',
      borderRadius: 999,
      border: '1px solid #2a2a2a',
      background: '#0b1220',
      color: '#e5e7eb',
      opacity: 0.95,
      whiteSpace: 'nowrap',
    }
  }, [])

  return (
    <div style={{ marginTop: 18, padding: 16, border: '1px solid #333', borderRadius: 10, background: '#0f0f0f' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ marginTop: 0, marginBottom: 6 }}>IA — Resumo da conversa (WhatsApp)</h3>
          <div style={{ opacity: 0.75, fontSize: 12 }}>
            Cole a conversa do WhatsApp Web e gere resumo + insights. Não salvamos o texto bruto.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" onClick={load} style={pillBtnStyle}>
            Atualizar
          </button>

          <ConversationPasteAI
            lead={lead}
            onSaved={async () => {
              await load()
              // mantém o server em sync (eventos, status, etc.)
              router.refresh()
            }}
            trigger={<button style={pillBtnStyle}>Colar conversa (IA)</button>}
          />
        </div>
      </div>

      {errorMsg ? (
        <div style={{ marginTop: 12, padding: 10, border: '1px solid #7f1d1d', background: '#1a0b0b', borderRadius: 12, color: '#fecaca' }}>
          {errorMsg}
        </div>
      ) : null}

      {loading ? <div style={{ marginTop: 12, opacity: 0.8 }}>Carregando análises…</div> : null}

      {!loading && analyses.length === 0 ? (
        <div style={{ marginTop: 12, opacity: 0.75 }}>Nenhuma análise ainda. Clique em “Colar conversa (IA)”.</div>
      ) : null}

      {!loading && analyses.length > 0 ? (
        <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
          {analyses.map((a, idx) => {
            const header = idx === 0 ? 'Última análise' : `Análise #${idx + 1}`
            return (
              <details
                key={a.id}
                open={idx === 0}
                style={{
                  border: '1px solid #222',
                  borderRadius: 12,
                  background: '#111',
                  padding: 12,
                }}
              >
                <summary style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 900 }}>{header}</span>
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ opacity: 0.7, fontSize: 12 }}>{a.created_at}</span>
                    <span style={badgeStyle()}>{`Score: ${a.performance_score}`}</span>
                    <span style={badgeStyle()}>{`Sent: ${a.sentiment ?? 'indef.'}`}</span>
                  </span>
                </summary>

                <div style={{ marginTop: 10, whiteSpace: 'pre-wrap', opacity: 0.92 }}>{a.summary}</div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginTop: 12 }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>Destaques</div>
                    {a.highlights?.length ? (
                      <ul style={{ marginTop: 8, opacity: 0.9 }}>
                        {a.highlights.slice(0, 8).map((x, i) => (
                          <li key={i}>{x}</li>
                        ))}
                      </ul>
                    ) : (
                      <div style={{ marginTop: 8, opacity: 0.7 }}>—</div>
                    )}
                  </div>

                  <div>
                    <div style={{ fontWeight: 900 }}>Objeções</div>
                    {a.objections?.length ? (
                      <ul style={{ marginTop: 8, opacity: 0.9 }}>
                        {a.objections.slice(0, 8).map((x, i) => (
                          <li key={i}>{x}</li>
                        ))}
                      </ul>
                    ) : (
                      <div style={{ marginTop: 8, opacity: 0.7 }}>—</div>
                    )}
                  </div>

                  <div>
                    <div style={{ fontWeight: 900 }}>Próximas ações</div>
                    {a.next_actions?.length ? (
                      <ul style={{ marginTop: 8, opacity: 0.9 }}>
                        {a.next_actions.slice(0, 8).map((x, i) => (
                          <li key={i}>{x}</li>
                        ))}
                      </ul>
                    ) : (
                      <div style={{ marginTop: 8, opacity: 0.7 }}>—</div>
                    )}
                  </div>
                </div>
              </details>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}