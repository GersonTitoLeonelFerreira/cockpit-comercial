'use client'

import * as React from 'react'

import AssistedMethodConstruction from './AssistedMethodConstruction'
import CommercialConfigClient from './CommercialConfigClient'
import CommercialMethodBuilder from './CommercialMethodBuilder'
import type {
  CommercialMethodBuilderDraftRecord,
} from '@/app/types/commercial-method-builder'

const DS = {
  cardBg: '#141722',
  surfaceBg: '#111318',
  border: '#1a1d2e',
  borderStrong: '#252a3d',
  textPrimary: '#edf2f7',
  textSecondary: '#8fa3bc',
  textMuted: '#546070',
  blueSoft: '#93c5fd',
  greenSoft: '#86efac',
  radius: 8,
  radiusContainer: 10,
} as const

type ExperienceMode =
  | 'choose'
  | 'assisted'
  | 'construction'
  | 'advanced'

type BuilderResponse =
  | { ok: true; draft: CommercialMethodBuilderDraftRecord | null }
  | { ok: false; error: string }

function ChoiceCard({
  title,
  description,
  primary,
  badge,
  onClick,
}: {
  title: string
  description: string
  primary?: boolean
  badge?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: primary
          ? 'linear-gradient(135deg, rgba(59,130,246,0.18), rgba(20,23,34,0.98))'
          : DS.cardBg,
        border: `1px solid ${primary ? 'rgba(96,165,250,0.42)' : DS.border}`,
        borderRadius: DS.radiusContainer,
        cursor: 'pointer',
        minHeight: 170,
        padding: 20,
        textAlign: 'left',
        width: '100%',
      }}
    >
      {badge && (
        <div style={{ color: DS.greenSoft, fontSize: 9, fontWeight: 850, marginBottom: 8, textTransform: 'uppercase' }}>
          {badge}
        </div>
      )}
      <div style={{ color: primary ? DS.blueSoft : DS.textPrimary, fontSize: 15, fontWeight: 900 }}>
        {title}
      </div>
      <div style={{ color: DS.textSecondary, fontSize: 12, lineHeight: 1.65, marginTop: 10 }}>
        {description}
      </div>
      <div style={{ color: primary ? DS.blueSoft : DS.textMuted, fontSize: 11, fontWeight: 800, marginTop: 18 }}>
        Continuar →
      </div>
    </button>
  )
}

export default function CommercialConfigExperience() {
  const [mode, setMode] = React.useState<ExperienceMode>('choose')
  const [readyForMethod, setReadyForMethod] = React.useState(false)
  const [forceDiagnosticReview, setForceDiagnosticReview] = React.useState(false)

  const refreshReadiness = React.useCallback(async () => {
    try {
      const response = await fetch('/api/admin/commercial-method-builder', {
        method: 'GET',
        cache: 'no-store',
      })
      const json = (await response.json()) as BuilderResponse
      if (response.ok && json.ok) {
        setReadyForMethod(json.draft?.ready_for_method === true)
        return json.draft?.ready_for_method === true
      }
    } catch {
      // O construtor filho exibirá o erro de carregamento quando necessário.
    }
    return false
  }, [])

  React.useEffect(() => {
    void refreshReadiness()
  }, [refreshReadiness])

  React.useEffect(() => {
    if (mode !== 'assisted' || forceDiagnosticReview) return

    const timer = window.setInterval(() => {
      void refreshReadiness().then((ready) => {
        if (ready) setMode('construction')
      })
    }, 1000)

    return () => window.clearInterval(timer)
  }, [forceDiagnosticReview, mode, refreshReadiness])

  if (mode === 'advanced') {
    return (
      <div>
        <button
          type="button"
          onClick={() => setMode('choose')}
          style={{
            background: DS.surfaceBg,
            border: `1px solid ${DS.borderStrong}`,
            borderRadius: DS.radius,
            color: DS.textSecondary,
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 750,
            marginBottom: 14,
            padding: '9px 12px',
          }}
        >
          ← Voltar às opções de criação
        </button>
        <CommercialConfigClient />
      </div>
    )
  }

  if (mode === 'construction') {
    return (
      <AssistedMethodConstruction
        onBack={() => {
          setForceDiagnosticReview(false)
          setMode('choose')
          void refreshReadiness()
        }}
      />
    )
  }

  if (mode === 'assisted') {
    return (
      <CommercialMethodBuilder
        onBack={() => {
          setForceDiagnosticReview(false)
          setMode('choose')
          void refreshReadiness()
        }}
      />
    )
  }

  return (
    <div style={{ margin: '0 auto', maxWidth: 1040, width: '100%' }}>
      <div style={{ background: DS.cardBg, border: `1px solid ${DS.border}`, borderRadius: DS.radiusContainer, padding: '28px 28px 24px' }}>
        <div style={{ color: DS.blueSoft, fontSize: 10, fontWeight: 850, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Método Comercial
        </div>
        <h1 style={{ color: DS.textPrimary, fontSize: 28, fontWeight: 900, letterSpacing: '-0.035em', margin: '9px 0 0' }}>
          {readyForMethod ? 'Transforme sua operação em um método' : 'Crie seu processo comercial'}
        </h1>
        <p style={{ color: DS.textSecondary, fontSize: 13, lineHeight: 1.7, margin: '12px 0 0', maxWidth: 760 }}>
          {readyForMethod
            ? 'O diagnóstico da sua operação já está concluído. Agora a Yolen pode ajudar você a transformar essas informações em etapas claras, sempre com confirmação humana antes de qualquer publicação.'
            : 'A Yolen vai ajudar você a organizar como sua empresa vende hoje antes de transformar isso em um método para sua equipe. Não é necessário conhecer metodologias de vendas para começar.'}
        </p>
      </div>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', marginTop: 16 }}>
        {readyForMethod ? (
          <>
            <ChoiceCard
              primary
              badge="Diagnóstico concluído"
              title="Construir meu método"
              description="Veja uma estrutura inicial baseada no diagnóstico, ajuste as etapas e construa objetivos, critérios e princípios com ajuda da Yolen."
              onClick={() => setMode('construction')}
            />
            <ChoiceCard
              title="Revisar diagnóstico"
              description="Volte ao mapeamento da operação para corrigir alguma informação antes de continuar a construção do método."
              onClick={() => {
                setForceDiagnosticReview(true)
                setMode('assisted')
              }}
            />
          </>
        ) : (
          <ChoiceCard
            primary
            title="Começar com ajuda da Yolen"
            description="Mapeie sua operação, regras comerciais e processo atual em um fluxo guiado. Você pode salvar e continuar depois."
            onClick={() => {
              setForceDiagnosticReview(false)
              setMode('assisted')
            }}
          />
        )}

        <ChoiceCard
          title="Já sei como quero estruturar"
          description="Abra o editor avançado existente para editar diretamente método, produtos, fatos, objeções e diretrizes comerciais."
          onClick={() => setMode('advanced')}
        />
      </div>
    </div>
  )
}
