'use client'

// Leitura do Companion no cadastro do ciclo (rodada 9, Fase 2) — só no
// HML. A página só monta esta seção com a leitura completa ligada; a rota
// confere a empresa e o acesso ao ciclo antes de ler as leituras. Os
// textos são os mesmos do painel do Companion.

import { useCallback, useEffect, useState } from 'react'

type ConductView = {
  moment: string
  steps: { technique: string; how: string; example: string }[]
  avoid: string[]
}

type PendingView = {
  owner: string
  label: string
  text: string
}

type OpportunityView = {
  text: string
  status_label: string
}

type ClientView = {
  said: { text: string; date: string | null }[]
  seems: string[]
  missing: string[]
}

type ReadingDetail = {
  run_id: string
  when_label: string
  mode_label: string
  situation: string
  next_step: {
    title: string
    complement: string
    turn_label: string
    why: string
  } | null
  conduct: ConductView | null
  pending: PendingView[]
  opportunities: OpportunityView[]
  to_confirm: string[]
  client: ClientView | null
  manager_notes: string[]
}

type ReadingSummary = {
  run_id: string
  when_label: string
  mode_label: string
  title: string
}

type ReadingsGroup = {
  cycle_id: string
  label: string
  readings: ReadingSummary[]
  latest: ReadingDetail | null
}

type ReadingsPayload = {
  ok: true
  current: ReadingsGroup
  origins: ReadingsGroup[]
  selected: ReadingDetail | null
}

const DS = {
  panelBg: '#0d0f14',
  surfaceBg: '#111318',
  border: '#1a1d2e',
  textPrimary: '#edf2f7',
  textSecondary: '#8fa3bc',
  textMuted: '#546070',
  blueSoft: '#93c5fd',
} as const

function Block({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <div style={{ color: DS.textMuted, fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>
        {title}
      </div>
      <div style={{ color: DS.textPrimary, fontSize: 13, lineHeight: 1.5 }}>{children}</div>
    </div>
  )
}

function List({ items }: { items: string[] }) {
  return (
    <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 2 }}>
      {items.map((item, index) => (
        <li key={`${index}-${item}`}>{item}</li>
      ))}
    </ul>
  )
}

function ReadingDetailView({ detail }: { detail: ReadingDetail }) {
  const said =
    detail.client?.said ?? []

  return (
    <div data-companion-reading={detail.run_id} style={{ display: 'grid', gap: 12 }}>
      <div style={{ color: DS.textSecondary, fontSize: 12 }}>
        {detail.mode_label} · {detail.when_label}
      </div>

      {detail.situation ? <Block title="Situação">{detail.situation}</Block> : null}

      {detail.next_step ? (
        <Block title="Próximo passo">
          <div style={{ fontWeight: 600 }}>{detail.next_step.title}</div>
          {detail.next_step.complement ? <div>{detail.next_step.complement}</div> : null}
          {detail.next_step.turn_label ? (
            <div style={{ color: DS.textSecondary, fontSize: 12 }}>{detail.next_step.turn_label}</div>
          ) : null}
        </Block>
      ) : null}

      {detail.conduct && (detail.conduct.moment || detail.conduct.steps.length > 0) ? (
        <Block title="Como conduzir">
          {detail.conduct.moment ? <div>{detail.conduct.moment}</div> : null}
          <List items={detail.conduct.steps.map((step) => [step.technique, step.how].filter(Boolean).join(' — '))} />
          {detail.conduct.avoid.length > 0 ? (
            <div style={{ color: DS.textSecondary, fontSize: 12 }}>Evite: {detail.conduct.avoid.join(' ')}</div>
          ) : null}
        </Block>
      ) : null}

      {detail.pending.length > 0 ? (
        <Block title="Pendências">
          <List items={detail.pending.map((item) => (item.label ? `${item.label}: ${item.text}` : item.text))} />
        </Block>
      ) : null}

      {detail.opportunities.length > 0 ? (
        <Block title="Oportunidades">
          <List items={detail.opportunities.map((item) => `${item.text} (${item.status_label})`)} />
        </Block>
      ) : null}

      {detail.to_confirm.length > 0 ? (
        <Block title="A confirmar">
          <List items={detail.to_confirm} />
        </Block>
      ) : null}

      {said.length > 0 || (detail.client?.seems.length ?? 0) > 0 || (detail.client?.missing.length ?? 0) > 0 ? (
        <Block title="O que sabemos do cliente">
          {said.length > 0 ? <List items={said.map((item) => (item.date ? `${item.text} (${item.date})` : item.text))} /> : null}
          {(detail.client?.seems.length ?? 0) > 0 ? <List items={detail.client?.seems ?? []} /> : null}
          {(detail.client?.missing.length ?? 0) > 0 ? (
            <div style={{ color: DS.textSecondary, fontSize: 12 }}>Falta descobrir: {detail.client?.missing.join(' ')}</div>
          ) : null}
        </Block>
      ) : null}

      {detail.manager_notes.length > 0 ? (
        <Block title="Para o gestor">
          <List items={detail.manager_notes} />
        </Block>
      ) : null}
    </div>
  )
}

function ReadingsList({
  group,
  activeRunId,
  onOpen,
}: {
  group: ReadingsGroup
  activeRunId: string | null
  onOpen: (runId: string) => void
}) {
  if (group.readings.length === 0) {
    return <div style={{ color: DS.textMuted, fontSize: 12 }}>Nenhuma leitura.</div>
  }

  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
      {group.readings.map((reading) => (
        <li key={reading.run_id}>
          <button
            type="button"
            onClick={() => onOpen(reading.run_id)}
            style={{
              width: '100%',
              textAlign: 'left',
              background: reading.run_id === activeRunId ? 'rgba(59,130,246,0.10)' : 'transparent',
              border: `1px solid ${DS.border}`,
              borderRadius: 8,
              padding: '6px 9px',
              color: DS.textPrimary,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            <span style={{ color: DS.textSecondary }}>{reading.when_label} · {reading.mode_label}</span>
            {reading.title ? <span> — {reading.title}</span> : null}
          </button>
        </li>
      ))}
    </ul>
  )
}

export default function CompanionReadingsSection({ cycleId }: { cycleId: string }) {
  const [payload, setPayload] = useState<ReadingsPayload | null>(null)
  const [selected, setSelected] = useState<ReadingDetail | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'hidden'>('loading')

  useEffect(() => {
    let cancelled = false

    fetch(`/api/sales-cycles/companion-readings?cycle_id=${encodeURIComponent(cycleId)}`, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(String(response.status))
        }

        return response.json() as Promise<ReadingsPayload>
      })
      .then((body) => {
        if (!cancelled) {
          setPayload(body)
          setSelected(null)
          setStatus('ready')
        }
      })
      .catch(() => {
        // Sem acesso ou fora do HML: a seção não aparece.
        if (!cancelled) {
          setStatus('hidden')
        }
      })

    return () => {
      cancelled = true
    }
  }, [cycleId])

  const openReading = useCallback((runId: string) => {
    fetch(
      `/api/sales-cycles/companion-readings?cycle_id=${encodeURIComponent(cycleId)}&run_id=${encodeURIComponent(runId)}`,
      { cache: 'no-store' },
    )
      .then(async (response) => (response.ok ? (response.json() as Promise<ReadingsPayload>) : null))
      .then((body) => {
        if (body?.selected) {
          setSelected(body.selected)
        }
      })
      .catch(() => {})
  }, [cycleId])

  if (status === 'hidden') {
    return null
  }

  const shown =
    selected ?? payload?.current.latest ?? null

  return (
    <section
      id="leitura-do-companion"
      data-companion-readings-section=""
      style={{
        background: DS.panelBg,
        border: `1px solid ${DS.border}`,
        borderRadius: 16,
        padding: 16,
        display: 'grid',
        gap: 14,
      }}
    >
      <div style={{ color: DS.textPrimary, fontSize: 15, fontWeight: 700 }}>Leitura do Companion</div>

      {status === 'loading' ? (
        <div style={{ color: DS.textSecondary, fontSize: 12 }}>Carregando…</div>
      ) : shown ? (
        <>
          {selected ? (
            <button
              type="button"
              onClick={() => setSelected(null)}
              style={{ justifySelf: 'start', background: 'none', border: 'none', color: DS.blueSoft, fontSize: 12, cursor: 'pointer', padding: 0 }}
            >
              Voltar para a última leitura
            </button>
          ) : null}
          <ReadingDetailView detail={shown} />
        </>
      ) : (
        <div style={{ color: DS.textSecondary, fontSize: 12 }}>Nenhuma leitura do Companion nesta oportunidade.</div>
      )}

      {payload && payload.current.readings.length > 0 ? (
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ color: DS.textMuted, fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>
            Leituras desta oportunidade
          </div>
          <ReadingsList group={payload.current} activeRunId={shown?.run_id ?? null} onOpen={openReading} />
        </div>
      ) : null}

      {payload?.origins.map((group) => (
        <div key={group.cycle_id} data-companion-readings-origin={group.cycle_id} style={{ display: 'grid', gap: 6 }}>
          <div style={{ color: DS.textMuted, fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>
            {group.label}
          </div>
          <ReadingsList group={group} activeRunId={shown?.run_id ?? null} onOpen={openReading} />
        </div>
      ))}
    </section>
  )
}
