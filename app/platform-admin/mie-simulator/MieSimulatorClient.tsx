'use client'

import * as React from 'react'

import {
  appendOutboundMessage,
  type SimulatorMessage,
} from '@/app/lib/companion/message-intelligence/simulator/conversation-engine'

const C = {
  page: '#090b0f',
  panel: '#0d0f14',
  panelSoft: '#111318',
  border: '#1a1d2e',
  text: '#edf2f7',
  textSoft: '#8fa3bc',
  textMuted: '#546070',
  blue: '#3b82f6',
  green: '#22c55e',
  amber: '#f59e0b',
  red: '#ef4444',
} as const

type ScenarioSummary = {
  key: string
  label: string
  short_description: string
  default_seller_intent: string
}

type MieResult = {
  status: string
  final_message_text: string | null
  would_surface_message: boolean
  hard_gate_status: string
  candidate_count: number
  hard_gate_pass_count: number
  selected_critic_status: string | null
  selected_overall_score: number | null
}

function box(border: string = C.border): React.CSSProperties {
  return {
    border: `1px solid ${border}`,
    background: C.panel,
    borderRadius: 14,
    padding: 16,
  }
}

function buttonStyle(variant: 'primary' | 'neutral' | 'danger' = 'neutral'): React.CSSProperties {
  const colors = {
    primary: { border: C.blue, color: '#93c5fd', bg: 'rgba(59,130,246,0.16)' },
    neutral: { border: C.border, color: C.textSoft, bg: C.panelSoft },
    danger: { border: C.red, color: '#fca5a5', bg: 'rgba(239,68,68,0.10)' },
  }[variant]

  return {
    border: `1px solid ${colors.border}`,
    background: colors.bg,
    color: colors.color,
    padding: '9px 14px',
    borderRadius: 10,
    fontWeight: 800,
    fontSize: 13,
    cursor: 'pointer',
  }
}

async function callSimulatorApi<T>(payload: Record<string, unknown>): Promise<T> {
  const res = await fetch('/api/platform-admin/mie-simulator', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>

  if (!res.ok || json.ok !== true) {
    throw new Error(
      typeof json.error === 'string' ? json.error : `Falha na requisição. HTTP ${res.status}`,
    )
  }

  return json as T
}

export default function MieSimulatorClient({
  scenarios,
}: {
  scenarios: ScenarioSummary[]
}) {
  const [scenarioKey, setScenarioKey] = React.useState<string>(scenarios[0]?.key ?? '')
  const [started, setStarted] = React.useState(false)
  const [conversation, setConversation] = React.useState<SimulatorMessage[]>([])
  const [sellerIntent, setSellerIntent] = React.useState('')
  const [manualReply, setManualReply] = React.useState('')
  const [mieResult, setMieResult] = React.useState<MieResult | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<
    'start' | 'mie' | 'client_reply' | null
  >(null)

  const currentScenario = scenarios.find((item) => item.key === scenarioKey) ?? null

  async function requestClientReply(nextConversation: SimulatorMessage[]) {
    setBusy('client_reply')
    setError(null)

    try {
      const json = await callSimulatorApi<{ conversation: SimulatorMessage[] }>({
        action: 'client_reply',
        scenario: scenarioKey,
        conversation: nextConversation,
      })

      setConversation(json.conversation)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao gerar resposta do cliente.')
    } finally {
      setBusy(null)
    }
  }

  async function handleStartScenario() {
    if (!scenarioKey) return

    setBusy('start')
    setError(null)
    setMieResult(null)

    try {
      const json = await callSimulatorApi<{ conversation: SimulatorMessage[] }>({
        action: 'start',
        scenario: scenarioKey,
      })

      setConversation(json.conversation)
      setSellerIntent(currentScenario?.default_seller_intent ?? '')
      setStarted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao iniciar cenário.')
    } finally {
      setBusy(null)
    }
  }

  async function handleGenerateWithMie() {
    if (!sellerIntent.trim()) {
      setError('Descreva a intenção do vendedor antes de gerar com o MIE.')
      return
    }

    setBusy('mie')
    setError(null)

    try {
      const json = await callSimulatorApi<{ result: MieResult }>({
        action: 'run_mie',
        scenario: scenarioKey,
        conversation,
        seller_intent: sellerIntent,
      })

      setMieResult(json.result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao executar o MIE.')
    } finally {
      setBusy(null)
    }
  }

  async function handleUseAsResponse() {
    if (!mieResult?.final_message_text) return

    const nextConversation = appendOutboundMessage(
      conversation,
      mieResult.final_message_text,
      new Date().toISOString(),
    )

    setConversation(nextConversation)
    setMieResult(null)

    await requestClientReply(nextConversation)
  }

  async function handleManualSend() {
    if (!manualReply.trim()) return

    const nextConversation = appendOutboundMessage(
      conversation,
      manualReply,
      new Date().toISOString(),
    )

    setConversation(nextConversation)
    setManualReply('')
    setMieResult(null)

    await requestClientReply(nextConversation)
  }

  function handleRestartScenario() {
    setStarted(false)
    setConversation([])
    setMieResult(null)
    setError(null)
    setSellerIntent('')
    setManualReply('')
  }

  return (
    <main style={{ minHeight: '100%', background: C.page, color: C.text, padding: 4 }}>
      <section
        style={{
          border: `1px solid ${C.border}`,
          background:
            'linear-gradient(135deg, rgba(59,130,246,0.13) 0%, rgba(59,130,246,0.04) 55%, #0d0f14 100%)',
          borderRadius: 18,
          padding: 20,
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            border: '1px solid rgba(59,130,246,0.28)',
            background: 'rgba(59,130,246,0.10)',
            color: '#93c5fd',
            borderRadius: 999,
            padding: '5px 10px',
            fontSize: 11,
            fontWeight: 900,
            marginBottom: 10,
          }}
        >
          Ferramenta interna e descartável
        </div>

        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 950 }}>
          SIMULADOR MIE V1
        </h1>

        <p style={{ margin: '8px 0 0', color: C.textSoft, fontSize: 13, lineHeight: 1.6, maxWidth: 720 }}>
          Testa o Message Intelligence Engine V1 real contra uma conversa comercial sintética.
          Nenhum dado gerado aqui é gravado em lead, ciclo de venda, mensagem real ou CRM.
        </p>
      </section>

      <section style={{ ...box(), marginTop: 16, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 12, color: C.textMuted, fontWeight: 800 }}>Cenário</label>
          <select
            value={scenarioKey}
            onChange={(event) => setScenarioKey(event.target.value)}
            disabled={busy !== null}
            style={{
              background: C.panelSoft,
              color: C.text,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              padding: '8px 10px',
              minWidth: 260,
            }}
          >
            {scenarios.map((scenario) => (
              <option key={scenario.key} value={scenario.key}>
                {scenario.label} — {scenario.short_description}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={handleStartScenario}
          disabled={busy !== null || !scenarioKey}
          style={buttonStyle('primary')}
        >
          {busy === 'start' ? 'Iniciando…' : 'Iniciar cenário'}
        </button>

        {started && (
          <button
            type="button"
            onClick={handleRestartScenario}
            disabled={busy !== null}
            style={buttonStyle('neutral')}
          >
            Reiniciar cenário
          </button>
        )}
      </section>

      {error && (
        <div
          style={{
            ...box(C.red),
            marginTop: 14,
            color: '#fca5a5',
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {started && (
        <>
          <section style={{ ...box(), marginTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: C.textMuted, marginBottom: 10 }}>
              CONVERSA
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 420, overflowY: 'auto' }}>
              {conversation.map((message) => (
                <div
                  key={message.id}
                  style={{
                    alignSelf: message.direction === 'inbound' ? 'flex-start' : 'flex-end',
                    maxWidth: '80%',
                  }}
                >
                  <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 900, marginBottom: 4 }}>
                    {message.direction === 'inbound' ? 'CLIENTE' : 'VENDEDOR'}
                  </div>
                  <div
                    style={{
                      border: `1px solid ${C.border}`,
                      background: message.direction === 'inbound' ? C.panelSoft : 'rgba(59,130,246,0.14)',
                      borderRadius: 12,
                      padding: '9px 12px',
                      fontSize: 13,
                      lineHeight: 1.5,
                      color: C.text,
                    }}
                  >
                    {message.text}
                  </div>
                </div>
              ))}
            </div>

            {busy === 'client_reply' && (
              <div style={{ marginTop: 10, fontSize: 12, color: C.textMuted }}>
                Cliente está respondendo…
              </div>
            )}
          </section>

          <section style={{ ...box(), marginTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: C.textMuted, marginBottom: 8 }}>
              INTENÇÃO DO VENDEDOR
            </div>

            <textarea
              value={sellerIntent}
              onChange={(event) => setSellerIntent(event.target.value)}
              rows={2}
              placeholder='Ex.: "Quero responder à objeção de preço sem pressionar."'
              style={{
                width: '100%',
                background: C.panelSoft,
                color: C.text,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                padding: 10,
                fontSize: 13,
                resize: 'vertical',
              }}
            />

            <div style={{ marginTop: 10, display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={handleGenerateWithMie}
                disabled={busy !== null}
                style={buttonStyle('primary')}
              >
                {busy === 'mie' ? 'Gerando…' : 'GERAR COM MIE'}
              </button>

              {mieResult && (
                <button
                  type="button"
                  onClick={handleGenerateWithMie}
                  disabled={busy !== null}
                  style={buttonStyle('neutral')}
                >
                  GERAR NOVAMENTE
                </button>
              )}
            </div>
          </section>

          {mieResult && (
            <section style={{ ...box(), marginTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: C.textMuted, marginBottom: 8 }}>
                RESULTADO
              </div>

              <div style={{ fontSize: 13, marginBottom: 8 }}>
                Status:{' '}
                <strong
                  style={{
                    color: mieResult.status === 'selected' ? C.green : C.amber,
                  }}
                >
                  {mieResult.status}
                </strong>
              </div>

              {mieResult.final_message_text ? (
                <div
                  style={{
                    border: `1px solid ${C.green}`,
                    background: 'rgba(34,197,94,0.08)',
                    borderRadius: 10,
                    padding: 12,
                    fontSize: 13,
                    lineHeight: 1.5,
                    marginBottom: 10,
                  }}
                >
                  {mieResult.final_message_text}
                </div>
              ) : (
                <div style={{ color: C.textSoft, fontSize: 13, marginBottom: 10 }}>
                  Nenhuma mensagem elegível para este turno.
                </div>
              )}

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                  gap: 8,
                  fontSize: 12,
                  color: C.textSoft,
                }}
              >
                <div>would_surface_message: <strong style={{ color: C.text }}>{String(mieResult.would_surface_message)}</strong></div>
                <div>hard_gate_status: <strong style={{ color: C.text }}>{mieResult.hard_gate_status}</strong></div>
                <div>candidate_count: <strong style={{ color: C.text }}>{mieResult.candidate_count}</strong></div>
                <div>hard_gate_pass_count: <strong style={{ color: C.text }}>{mieResult.hard_gate_pass_count}</strong></div>
                <div>selected_critic_status: <strong style={{ color: C.text }}>{mieResult.selected_critic_status ?? '—'}</strong></div>
                <div>selected_overall_score: <strong style={{ color: C.text }}>{mieResult.selected_overall_score ?? '—'}</strong></div>
              </div>

              {mieResult.final_message_text && (
                <div style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    onClick={handleUseAsResponse}
                    disabled={busy !== null}
                    style={buttonStyle('primary')}
                  >
                    USAR COMO RESPOSTA
                  </button>
                </div>
              )}
            </section>
          )}

          <section style={{ ...box(), marginTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: C.textMuted, marginBottom: 8 }}>
              ESCREVER RESPOSTA MANUAL
            </div>

            <textarea
              value={manualReply}
              onChange={(event) => setManualReply(event.target.value)}
              rows={2}
              placeholder="Escreva a resposta do vendedor manualmente…"
              style={{
                width: '100%',
                background: C.panelSoft,
                color: C.text,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                padding: 10,
                fontSize: 13,
                resize: 'vertical',
              }}
            />

            <div style={{ marginTop: 10 }}>
              <button
                type="button"
                onClick={handleManualSend}
                disabled={busy !== null || !manualReply.trim()}
                style={buttonStyle('neutral')}
              >
                ENVIAR RESPOSTA MANUAL
              </button>
            </div>
          </section>
        </>
      )}
    </main>
  )
}
