'use client'

import {
  useEffect,
  useState,
} from 'react'
import type {
  AICoaching,
} from '@/app/types/ai-coaching'
import type {
  AISalesSuggestion,
  ConversationSource,
} from '@/app/types/ai-sales'
import {
  generateAICoaching,
  saveAICoaching,
} from '@/app/lib/services/ai-coaching'

const DS = {
  inputBg: '#090b0f',
  border: '#1a1d2e',
  borderSubtle: '#13162a',
  textPrimary: '#edf2f7',
  textSecondary: '#8fa3bc',
  blueSoft: '#93c5fd',
  blueBorder: 'rgba(59,130,246,0.32)',
  amberSoft: '#fcd34d',
  greenSoft: '#86efac',
} as const

function CoachingList({
  title,
  items,
}: {
  title: string
  items: string[]
}) {
  if (items.length === 0) {
    return null
  }

  return (
    <div>
      <div
        style={{
          color: DS.textSecondary,
          fontSize: 10,
          fontWeight: 900,
          letterSpacing: '0.07em',
          textTransform: 'uppercase',
          marginBottom: 7,
        }}
      >
        {title}
      </div>

      <div style={{ display: 'grid', gap: 7 }}>
        {items.map((item, index) => (
          <div
            key={`${title}-${index}-${item}`}
            style={{
              border: `1px solid ${DS.borderSubtle}`,
              borderRadius: 8,
              background: DS.inputBg,
              padding: '9px 10px',
              color: DS.textPrimary,
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function AICoachingReview({
  cycleId,
  conversationText,
  source,
  suggestion,
  persistenceSource,
}: {
  cycleId: string
  conversationText: string
  source: ConversationSource
  suggestion: AISalesSuggestion
  persistenceSource:
    | 'ai_copilot_detail'
    | 'ai_copilot_kanban'
}) {
  const [open, setOpen] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [coaching, setCoaching] = useState<AICoaching | null>(
    null
  )

  useEffect(() => {
    setCoaching(null)
    setSaved(false)
    setCopied(false)
    setError(null)
  }, [conversationText, suggestion])

  const handleGenerate = async () => {
    try {
      setGenerating(true)
      setError(null)
      setSaved(false)

      const result = await generateAICoaching({
        cycle_id: cycleId,
        conversation_text: conversationText,
        source,
        suggestion,
      })

      setCoaching(result.coaching)
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao gerar leitura comercial.'
      )
    } finally {
      setGenerating(false)
    }
  }

  const handleSave = async () => {
    if (!coaching) {
      return
    }

    try {
      setSaving(true)
      setError(null)

      await saveAICoaching({
        cycle_id: cycleId,
        coaching,
        suggestion,
        source: persistenceSource,
      })

      setSaved(true)

      window.dispatchEvent(
        new CustomEvent('yolen:ai-coaching-saved', {
          detail: {
            cycleId,
          },
        })
      )
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao salvar leitura comercial.'
      )
    } finally {
      setSaving(false)
    }
  }

  const handleCopyMessage = async () => {
    if (!coaching?.suggested_message) {
      return
    }

    try {
      await navigator.clipboard.writeText(
        coaching.suggested_message
      )

      setCopied(true)

      window.setTimeout(() => {
        setCopied(false)
      }, 1800)
    } catch {
      setError(
        'Não foi possível copiar a mensagem automaticamente.'
      )
    }
  }

  return (
    <div
      style={{
        marginTop: 18,
        border: `1px solid ${DS.blueBorder}`,
        borderRadius: 14,
        background: 'rgba(59,130,246,0.07)',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        style={{
          width: '100%',
          border: 0,
          background: 'transparent',
          color: DS.textPrimary,
          padding: '14px 16px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 14,
          textAlign: 'left',
        }}
      >
        <span>
          <span
            style={{
              display: 'block',
              color: DS.blueSoft,
              fontSize: 10,
              fontWeight: 900,
              letterSpacing: '0.09em',
              textTransform: 'uppercase',
              marginBottom: 4,
            }}
          >
            Leitura comercial da IA
          </span>

          <span
            style={{
              display: 'block',
              color: DS.textSecondary,
              fontSize: 12,
              lineHeight: 1.45,
            }}
          >
            Resumo completo, objeções, pontos fortes e melhorias opcionais.
          </span>
        </span>

        <span
          style={{
            border: `1px solid ${DS.border}`,
            borderRadius: 999,
            padding: '6px 10px',
            color: DS.textSecondary,
            fontSize: 10,
            fontWeight: 900,
            whiteSpace: 'nowrap',
          }}
        >
          {open ? 'Ocultar' : 'Ver leitura'}
        </span>
      </button>

      {open && (
        <div
          style={{
            borderTop: `1px solid ${DS.border}`,
            padding: 16,
            display: 'grid',
            gap: 16,
          }}
        >
          {!coaching && (
            <div
              style={{
                border: `1px solid ${DS.borderSubtle}`,
                borderRadius: 10,
                background: DS.inputBg,
                padding: '13px 14px',
              }}
            >
              <div
                style={{
                  color: DS.textSecondary,
                  fontSize: 12,
                  lineHeight: 1.55,
                  marginBottom: 12,
                }}
              >
                Esta leitura não altera estágio, agenda, ganho ou perda.
                Ela apenas organiza o atendimento e aponta oportunidades de melhoria.
              </div>

              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating}
                style={{
                  border: `1px solid ${DS.blueBorder}`,
                  borderRadius: 8,
                  background: 'rgba(59,130,246,0.16)',
                  color: DS.blueSoft,
                  padding: '9px 12px',
                  cursor: generating ? 'default' : 'pointer',
                  fontSize: 12,
                  fontWeight: 900,
                  opacity: generating ? 0.7 : 1,
                }}
              >
                {generating
                  ? 'Gerando leitura...'
                  : 'Gerar leitura comercial'}
              </button>
            </div>
          )}

          {error && (
            <div
              style={{
                border: '1px solid rgba(248,113,113,0.35)',
                borderRadius: 8,
                background: 'rgba(127,29,29,0.34)',
                color: '#fecaca',
                padding: '10px 12px',
                fontSize: 12,
                lineHeight: 1.45,
              }}
            >
              {error}
            </div>
          )}

          {coaching && (
            <>
              <div>
                <div
                  style={{
                    color: DS.textSecondary,
                    fontSize: 10,
                    fontWeight: 900,
                    letterSpacing: '0.07em',
                    textTransform: 'uppercase',
                    marginBottom: 7,
                  }}
                >
                  Resumo da conversa
                </div>

                <div
                  style={{
                    border: `1px solid ${DS.borderSubtle}`,
                    borderRadius: 8,
                    background: DS.inputBg,
                    padding: '10px 12px',
                    color: DS.textPrimary,
                    fontSize: 12,
                    lineHeight: 1.55,
                  }}
                >
                  {coaching.conversation_summary}
                </div>
              </div>

              <CoachingList
                title="Interesses do cliente"
                items={coaching.customer_interests}
              />

              <CoachingList
                title="Objeções e riscos"
                items={coaching.objections}
              />

              <CoachingList
                title="O que foi bem conduzido"
                items={coaching.what_went_well}
              />

              <CoachingList
                title="O que poderia ser melhor"
                items={coaching.what_to_improve}
              />

              {coaching.recommended_next_approach && (
                <div>
                  <div
                    style={{
                      color: DS.amberSoft,
                      fontSize: 10,
                      fontWeight: 900,
                      letterSpacing: '0.07em',
                      textTransform: 'uppercase',
                      marginBottom: 7,
                    }}
                  >
                    Melhor próxima abordagem
                  </div>

                  <div
                    style={{
                      border: `1px solid ${DS.borderSubtle}`,
                      borderRadius: 8,
                      background: DS.inputBg,
                      padding: '10px 12px',
                      color: DS.textPrimary,
                      fontSize: 12,
                      lineHeight: 1.55,
                    }}
                  >
                    {coaching.recommended_next_approach}
                  </div>
                </div>
              )}

              {coaching.suggested_message && (
                <div>
                  <div
                    style={{
                      color: DS.greenSoft,
                      fontSize: 10,
                      fontWeight: 900,
                      letterSpacing: '0.07em',
                      textTransform: 'uppercase',
                      marginBottom: 7,
                    }}
                  >
                    Mensagem sugerida
                  </div>

                  <div
                    style={{
                      border: `1px solid ${DS.borderSubtle}`,
                      borderRadius: 8,
                      background: DS.inputBg,
                      padding: '10px 12px',
                      color: DS.textPrimary,
                      fontSize: 12,
                      lineHeight: 1.55,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {coaching.suggested_message}
                  </div>
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  flexWrap: 'wrap',
                }}
              >
                {coaching.suggested_message && (
                  <button
                    type="button"
                    onClick={handleCopyMessage}
                    style={{
                      border: `1px solid ${DS.blueBorder}`,
                      borderRadius: 8,
                      background: 'rgba(59,130,246,0.12)',
                      color: DS.blueSoft,
                      padding: '9px 12px',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 900,
                    }}
                  >
                    {copied
                      ? 'Mensagem copiada'
                      : 'Copiar mensagem'}
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || saved}
                  style={{
                    border: `1px solid ${
                      saved
                        ? 'rgba(134,239,172,0.35)'
                        : DS.blueBorder
                    }`,
                    borderRadius: 8,
                    background: saved
                      ? 'rgba(134,239,172,0.10)'
                      : 'rgba(59,130,246,0.16)',
                    color: saved ? DS.greenSoft : DS.blueSoft,
                    padding: '9px 12px',
                    cursor:
                      saving || saved
                        ? 'default'
                        : 'pointer',
                    fontSize: 12,
                    fontWeight: 900,
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  {saving
                    ? 'Salvando...'
                    : saved
                      ? 'Orientação salva no lead'
                      : 'Salvar no lead'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}