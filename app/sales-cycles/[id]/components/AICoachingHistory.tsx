'use client'

import {
  useCallback,
  useEffect,
  useState,
} from 'react'
import type {
  AICoaching,
  AICoachingHistoryItem,
} from '@/app/types/ai-coaching'
import { getAICoachingHistory } from '@/app/lib/services/ai-coaching'

const DS = {
  panelBg: '#0d0f14',
  inputBg: '#090b0f',
  border: '#1a1d2e',
  borderSubtle: '#13162a',
  textPrimary: '#edf2f7',
  textSecondary: '#8fa3bc',
  textMuted: '#546070',
  blueSoft: '#93c5fd',
  amberSoft: '#fcd34d',
  greenSoft: '#86efac',
} as const

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

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

function CoachingContent({
  coaching,
}: {
  coaching: AICoaching
}) {
  return (
    <div
      style={{
        display: 'grid',
        gap: 16,
        marginTop: 14,
      }}
    >
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
          Resumo do atendimento
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
    </div>
  )
}

export default function AICoachingHistory({
  cycleId,
}: {
  cycleId: string
}) {
  const [items, setItems] = useState<AICoachingHistoryItem[]>(
    []
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadHistory = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const result = await getAICoachingHistory(cycleId)

      setItems(result.items)
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao buscar orientações salvas.'
      )
    } finally {
      setLoading(false)
    }
  }, [cycleId])

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  useEffect(() => {
    const handleSaved = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          cycleId?: string
        }>
      ).detail

      if (detail?.cycleId === cycleId) {
        void loadHistory()
      }
    }

    window.addEventListener(
      'yolen:ai-coaching-saved',
      handleSaved
    )

    return () => {
      window.removeEventListener(
        'yolen:ai-coaching-saved',
        handleSaved
      )
    }
  }, [cycleId, loadHistory])

  const latest = items[0] ?? null

  return (
    <section
      style={{
        background: DS.panelBg,
        border: `1px solid ${DS.border}`,
        borderRadius: 16,
        padding: 16,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 14,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div
            style={{
              color: DS.blueSoft,
              fontSize: 10,
              fontWeight: 900,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              marginBottom: 6,
            }}
          >
            Orientações da IA
          </div>

          <div
            style={{
              color: DS.textSecondary,
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            Leituras comerciais salvas para esta oportunidade.
          </div>
        </div>

        <span
          style={{
            border: `1px solid ${DS.borderSubtle}`,
            borderRadius: 999,
            padding: '5px 9px',
            color: DS.textSecondary,
            fontSize: 10,
            fontWeight: 900,
          }}
        >
          {items.length} salva{items.length === 1 ? '' : 's'}
        </span>
      </div>

      {loading && (
        <div
          style={{
            marginTop: 14,
            color: DS.textMuted,
            fontSize: 12,
          }}
        >
          Carregando orientações...
        </div>
      )}

      {error && (
        <div
          style={{
            marginTop: 14,
            border: '1px solid rgba(248,113,113,0.35)',
            borderRadius: 8,
            background: 'rgba(127,29,29,0.34)',
            color: '#fecaca',
            padding: '10px 12px',
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}

      {!loading && !error && !latest && (
        <div
          style={{
            marginTop: 14,
            border: `1px dashed ${DS.borderSubtle}`,
            borderRadius: 10,
            padding: '12px 14px',
            color: DS.textMuted,
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          Nenhuma orientação foi salva ainda. O vendedor decide quando guardar
          uma leitura comercial no histórico deste lead.
        </div>
      )}

      {!loading && !error && latest && (
        <div
          style={{
            marginTop: 14,
            border: `1px solid ${DS.borderSubtle}`,
            borderRadius: 10,
            background: 'rgba(9,11,15,0.45)',
            padding: '12px 14px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
              marginBottom: 8,
            }}
          >
            <span
              style={{
                color: DS.textPrimary,
                fontSize: 12,
                fontWeight: 850,
              }}
            >
              Última orientação salva
            </span>

            <span
              style={{
                color: DS.textMuted,
                fontSize: 11,
              }}
            >
              {formatDateTime(latest.created_at)}
            </span>
          </div>

          <div
            style={{
              color: DS.textSecondary,
              fontSize: 12,
              lineHeight: 1.55,
            }}
          >
            {latest.coaching.conversation_summary}
          </div>

          <details style={{ marginTop: 12 }}>
            <summary
              style={{
                cursor: 'pointer',
                color: DS.blueSoft,
                fontSize: 12,
                fontWeight: 850,
              }}
            >
              Ver leitura completa
            </summary>

            <CoachingContent coaching={latest.coaching} />
          </details>

          {items.length > 1 && (
            <details style={{ marginTop: 16 }}>
              <summary
                style={{
                  cursor: 'pointer',
                  color: DS.textSecondary,
                  fontSize: 12,
                  fontWeight: 850,
                }}
              >
                Ver histórico anterior
              </summary>

              <div
                style={{
                  display: 'grid',
                  gap: 12,
                  marginTop: 12,
                }}
              >
                {items.slice(1).map((item) => (
                  <details
                    key={item.id}
                    style={{
                      border: `1px solid ${DS.borderSubtle}`,
                      borderRadius: 8,
                      padding: '10px 12px',
                    }}
                  >
                    <summary
                      style={{
                        cursor: 'pointer',
                        color: DS.textSecondary,
                        fontSize: 12,
                        fontWeight: 800,
                      }}
                    >
                      Orientação de {formatDateTime(item.created_at)}
                    </summary>

                    <CoachingContent coaching={item.coaching} />
                  </details>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </section>
  )
}