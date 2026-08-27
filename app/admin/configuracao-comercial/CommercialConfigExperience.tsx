'use client'

import * as React from 'react'

import AssistedMethodConstruction from './AssistedMethodConstruction'
import CommercialConfigClient from './CommercialConfigClient'
import GuidedMethodJourney from './guided-journey/GuidedMethodJourney'
import {
  deriveCommercialMethodHomeState,
  type CommercialMethodHomeState,
} from '@/app/lib/commercial-config/commercial-method-home'
import type { CommercialConfigWorkspace } from '@/app/types/commercial-config'
import type {
  CommercialMethodBuilderDraftRecord,
} from '@/app/types/commercial-method-builder'
import type {
  CommercialMethodConstructionRecord,
} from '@/app/types/commercial-method-construction'

const DS = {
  cardBg: '#141722',
  surfaceBg: '#111318',
  border: '#1a1d2e',
  borderStrong: '#252a3d',
  textPrimary: '#edf2f7',
  textSecondary: '#8fa3bc',
  textMuted: '#546070',
  blue: '#3b82f6',
  blueSoft: '#93c5fd',
  greenSoft: '#86efac',
  yellowSoft: '#fcd34d',
  redSoft: '#fca5a5',
  radius: 8,
  radiusContainer: 12,
} as const

type ExperienceMode =
  | 'home'
  | 'diagnosis'
  | 'construction'
  | 'advanced'

type BuilderResponse =
  | { ok: true; draft: CommercialMethodBuilderDraftRecord | null }
  | { ok: false; error: string }

type ConstructionResponse =
  | { ok: true; construction: CommercialMethodConstructionRecord | null }
  | { ok: false; error: string }

type WorkspaceResponse =
  | { ok: true; workspace: CommercialConfigWorkspace }
  | { ok: false; error: string }

interface LifecycleSnapshot {
  builder: CommercialMethodBuilderDraftRecord | null
  construction: CommercialMethodConstructionRecord | null
  workspace: CommercialConfigWorkspace
  home: CommercialMethodHomeState
}

function cardStyle(): React.CSSProperties {
  return {
    background: DS.cardBg,
    border: `1px solid ${DS.border}`,
    borderRadius: DS.radiusContainer,
  }
}

function formatDate(value: string | null): string {
  if (!value) return 'Ainda não registrado'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Data inválida'

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

function requirementLabel(
  requirement: 'required' | 'conditional' | 'optional',
): string {
  if (requirement === 'required') return 'Obrigatória'
  if (requirement === 'conditional') return 'Condicional'
  return 'Opcional'
}

function StatusPill({
  children,
  tone,
}: {
  children: React.ReactNode
  tone: 'green' | 'yellow' | 'blue' | 'neutral'
}) {
  const tones = {
    green: {
      color: DS.greenSoft,
      background: 'rgba(34,197,94,0.08)',
      border: 'rgba(134,239,172,0.22)',
    },
    yellow: {
      color: DS.yellowSoft,
      background: 'rgba(245,158,11,0.08)',
      border: 'rgba(252,211,77,0.22)',
    },
    blue: {
      color: DS.blueSoft,
      background: 'rgba(59,130,246,0.09)',
      border: 'rgba(147,197,253,0.22)',
    },
    neutral: {
      color: DS.textSecondary,
      background: 'rgba(143,163,188,0.06)',
      border: 'rgba(143,163,188,0.16)',
    },
  }[tone]

  return (
    <span
      style={{
        background: tones.background,
        border: `1px solid ${tones.border}`,
        borderRadius: 999,
        color: tones.color,
        display: 'inline-flex',
        fontSize: 10,
        fontWeight: 850,
        letterSpacing: '0.04em',
        padding: '5px 9px',
        textTransform: 'uppercase',
      }}
    >
      {children}
    </span>
  )
}

function PrimaryButton({
  children,
  onClick,
  disabled = false,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        background: disabled ? DS.borderStrong : DS.blue,
        border: 0,
        borderRadius: DS.radius,
        color: disabled ? DS.textMuted : '#fff',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 12,
        fontWeight: 850,
        padding: '11px 16px',
      }}
    >
      {children}
    </button>
  )
}

function SecondaryButton({
  children,
  onClick,
}: {
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: DS.surfaceBg,
        border: `1px solid ${DS.borderStrong}`,
        borderRadius: DS.radius,
        color: DS.textSecondary,
        cursor: 'pointer',
        fontSize: 11,
        fontWeight: 750,
        padding: '10px 13px',
      }}
    >
      {children}
    </button>
  )
}

function MethodExecutiveView({
  home,
}: {
  home: CommercialMethodHomeState
}) {
  const definition = home.published.definition

  if (!definition) {
    return (
      <div style={{ ...cardStyle(), padding: 20 }}>
        <div
          style={{
            color: DS.textMuted,
            fontSize: 11,
            fontWeight: 850,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          Visualizar método
        </div>
        <div
          style={{
            color: DS.textSecondary,
            fontSize: 12,
            lineHeight: 1.6,
            marginTop: 10,
          }}
        >
          {home.published.exists
            ? 'Existe uma versão publicada, mas ela não possui um commercial-method-v2 válido para consulta operacional.'
            : 'Depois da primeira publicação, o método ativo aparecerá aqui para consulta sem entrar em modo de edição.'}
        </div>
      </div>
    )
  }

  const orderedStages = [...definition.stages].sort(
    (left, right) => left.display_order - right.display_order,
  )

  return (
    <section
      id="metodo-ativo"
      aria-labelledby="metodo-ativo-title"
      style={{ ...cardStyle(), padding: 20 }}
    >
      <div
        style={{
          alignItems: 'flex-start',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div
            style={{
              color: DS.greenSoft,
              fontSize: 10,
              fontWeight: 850,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            Visão executiva · método ativo
          </div>
          <h2
            id="metodo-ativo-title"
            style={{
              color: DS.textPrimary,
              fontSize: 20,
              margin: '7px 0 0',
            }}
          >
            {definition.name}
          </h2>
          {definition.description && (
            <p
              style={{
                color: DS.textSecondary,
                fontSize: 11,
                lineHeight: 1.55,
                margin: '7px 0 0',
                maxWidth: 720,
              }}
            >
              {definition.description}
            </p>
          )}
        </div>
        <StatusPill tone="green">
          Em uso pelo Yolen Companion
        </StatusPill>
      </div>

      <div
        style={{
          display: 'grid',
          gap: 8,
          marginTop: 18,
        }}
      >
        {orderedStages.map((stage, index) => (
          <details
            key={stage.key}
            style={{
              background: DS.surfaceBg,
              border: `1px solid ${DS.border}`,
              borderRadius: DS.radius,
              padding: '12px 14px',
            }}
          >
            <summary
              style={{
                alignItems: 'center',
                color: DS.textPrimary,
                cursor: 'pointer',
                display: 'flex',
                gap: 10,
                listStyle: 'none',
                minHeight: 28,
              }}
            >
              <span
                style={{
                  color: DS.textMuted,
                  fontSize: 10,
                  minWidth: 18,
                }}
              >
                {index + 1}
              </span>
              <strong style={{ fontSize: 12 }}>{stage.name}</strong>
              <span
                style={{
                  color:
                    stage.requirement === 'required'
                      ? DS.blueSoft
                      : stage.requirement === 'conditional'
                        ? DS.yellowSoft
                        : DS.textMuted,
                  fontSize: 9,
                  marginLeft: 'auto',
                  textTransform: 'uppercase',
                }}
              >
                {requirementLabel(stage.requirement)}
              </span>
            </summary>

            <div
              style={{
                color: DS.textSecondary,
                display: 'grid',
                fontSize: 10,
                gap: 12,
                lineHeight: 1.55,
                padding: '12px 0 4px 28px',
              }}
            >
              <div>
                <strong style={{ color: DS.textPrimary }}>Objetivo</strong>
                <div>{stage.objective}</div>
              </div>

              {stage.completion_criteria.length > 0 && (
                <div>
                  <strong style={{ color: DS.textPrimary }}>
                    Evidência de conclusão
                  </strong>
                  <ul style={{ marginBottom: 0 }}>
                    {stage.completion_criteria.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {stage.advance_when.length > 0 && (
                <div>
                  <strong style={{ color: DS.textPrimary }}>
                    Quando avançar
                  </strong>
                  <ul style={{ marginBottom: 0 }}>
                    {stage.advance_when.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {stage.wait_when.length > 0 && (
                <div>
                  <strong style={{ color: DS.textPrimary }}>
                    Quando aguardar
                  </strong>
                  <ul style={{ marginBottom: 0 }}>
                    {stage.wait_when.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {stage.skip_conditions.length > 0 && (
                <div>
                  <strong style={{ color: DS.textPrimary }}>
                    Quando pular
                  </strong>
                  <ul style={{ marginBottom: 0 }}>
                    {stage.skip_conditions.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {stage.recommended_questions.length > 0 && (
                <div>
                  <strong style={{ color: DS.textPrimary }}>
                    Perguntas recomendadas
                  </strong>
                  <ul style={{ marginBottom: 0 }}>
                    {stage.recommended_questions.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </details>
        ))}
      </div>

      {definition.principles.length > 0 && (
        <div
          style={{
            borderTop: `1px solid ${DS.border}`,
            marginTop: 16,
            paddingTop: 14,
          }}
        >
          <div
            style={{
              color: DS.textMuted,
              fontSize: 9,
              fontWeight: 850,
              textTransform: 'uppercase',
            }}
          >
            Princípios do método
          </div>
          <div
            style={{
              color: DS.textSecondary,
              display: 'flex',
              flexWrap: 'wrap',
              fontSize: 10,
              gap: 7,
              marginTop: 9,
            }}
          >
            {definition.principles.map((principle) => (
              <span
                key={principle}
                style={{
                  background: DS.surfaceBg,
                  border: `1px solid ${DS.border}`,
                  borderRadius: 999,
                  padding: '6px 9px',
                }}
              >
                {principle}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

export default function CommercialConfigExperience() {
  const [mode, setMode] = React.useState<ExperienceMode>('home')
  const [forceDiagnosticReview, setForceDiagnosticReview] = React.useState(false)
  const [snapshot, setSnapshot] = React.useState<LifecycleSnapshot | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const loadLifecycle = React.useCallback(
    async (refresh = false) => {
      if (refresh) setRefreshing(true)
      else setLoading(true)

      setError(null)

      try {
        const [builderResponse, constructionResponse, workspaceResponse] =
          await Promise.all([
            fetch('/api/admin/commercial-method-builder', {
              cache: 'no-store',
            }),
            fetch('/api/admin/commercial-method-builder/method', {
              cache: 'no-store',
            }),
            fetch('/api/admin/commercial-config', {
              cache: 'no-store',
            }),
          ])

        const [builderJson, constructionJson, workspaceJson] =
          (await Promise.all([
            builderResponse.json(),
            constructionResponse.json(),
            workspaceResponse.json(),
          ])) as [
            BuilderResponse,
            ConstructionResponse,
            WorkspaceResponse,
          ]

        if (!builderResponse.ok || !builderJson.ok) {
          throw new Error(
            builderJson.ok
              ? 'Erro ao carregar o diagnóstico.'
              : builderJson.error,
          )
        }

        if (!constructionResponse.ok || !constructionJson.ok) {
          throw new Error(
            constructionJson.ok
              ? 'Erro ao carregar a construção do método.'
              : constructionJson.error,
          )
        }

        if (!workspaceResponse.ok || !workspaceJson.ok) {
          throw new Error(
            workspaceJson.ok
              ? 'Erro ao carregar a versão publicada.'
              : workspaceJson.error,
          )
        }

        setSnapshot({
          builder: builderJson.draft,
          construction: constructionJson.construction,
          workspace: workspaceJson.workspace,
          home: deriveCommercialMethodHomeState({
            builder: builderJson.draft,
            construction: constructionJson.construction,
            workspace: workspaceJson.workspace,
          }),
        })
      } catch (loadError: unknown) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Erro ao carregar a central do método comercial.',
        )
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [],
  )

  React.useEffect(() => {
    void loadLifecycle()
  }, [loadLifecycle])

  const returnHome = React.useCallback(() => {
    setForceDiagnosticReview(false)
    setMode('home')
    void loadLifecycle(true)
  }, [loadLifecycle])

  if (mode === 'advanced') {
    return (
      <div>
        <SecondaryButton onClick={returnHome}>
          ← Voltar à central do método
        </SecondaryButton>
        <div
          style={{
            ...cardStyle(),
            background: 'rgba(59,130,246,0.05)',
            margin: '14px 0',
            padding: 14,
          }}
        >
          <strong style={{ color: DS.blueSoft, fontSize: 11 }}>
            Configuração avançada
          </strong>
          <div
            style={{
              color: DS.textSecondary,
              fontSize: 10,
              lineHeight: 1.55,
              marginTop: 4,
            }}
          >
            Esta área serve para produtos, fatos oficiais, objeções e
            diretrizes comerciais. O método estruturado continua sendo
            construído, revisado e publicado pela jornada principal acima.
          </div>
        </div>
        <CommercialConfigClient />
      </div>
    )
  }

  if (mode === 'construction') {
    return <AssistedMethodConstruction onBack={returnHome} />
  }

  if (mode === 'diagnosis') {
    return (
      <GuidedMethodJourney
        onBack={returnHome}
        onReadyForConstruction={() => {
          setForceDiagnosticReview(false)
          setMode('construction')
        }}
      />
    )
  }

  if (loading) {
    return (
      <div
        aria-live="polite"
        style={{
          ...cardStyle(),
          color: DS.textSecondary,
          padding: 24,
          textAlign: 'center',
        }}
      >
        Carregando central do método comercial...
      </div>
    )
  }

  if (error || !snapshot) {
    return (
      <div
        role="alert"
        style={{
          ...cardStyle(),
          borderColor: 'rgba(239,68,68,0.3)',
          padding: 22,
        }}
      >
        <strong style={{ color: DS.redSoft, fontSize: 13 }}>
          Não foi possível carregar o Método Comercial
        </strong>
        <div
          style={{
            color: DS.textSecondary,
            fontSize: 11,
            lineHeight: 1.6,
            marginTop: 7,
          }}
        >
          {error}
        </div>
        <div style={{ marginTop: 14 }}>
          <PrimaryButton onClick={() => void loadLifecycle(true)}>
            Tentar novamente
          </PrimaryButton>
        </div>
      </div>
    )
  }

  const { home } = snapshot
  const publishedLabel = home.published.exists
    ? `${home.published.name || 'Método comercial'} · V${home.published.version}`
    : 'Nenhum método publicado'

  const draftTone = home.draft.has_unpublished_changes
    ? 'yellow'
    : home.draft.exists
      ? 'blue'
      : 'neutral'

  const draftLabel = home.draft.has_unpublished_changes
    ? 'Alterações ainda não publicadas'
    : home.draft.exists
      ? 'Nenhuma alteração pendente'
      : 'Ainda não iniciado'

  function runNextAction() {
    if (
      home.next_action.key === 'start_diagnosis' ||
      home.next_action.key === 'continue_diagnosis'
    ) {
      setForceDiagnosticReview(false)
      setMode('diagnosis')
      return
    }

    if (home.next_action.key === 'up_to_date') {
      document
        .getElementById('metodo-ativo')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }

    setMode('construction')
  }

  return (
    <main
      style={{
        display: 'grid',
        gap: 16,
        margin: '0 auto',
        maxWidth: 1180,
        width: '100%',
      }}
    >
      <section
        style={{
          ...cardStyle(),
          background:
            'linear-gradient(135deg, rgba(59,130,246,0.09), rgba(20,23,34,0.98) 45%)',
          padding: '24px 24px 22px',
        }}
      >
        <div
          style={{
            alignItems: 'flex-start',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 14,
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div
              style={{
                color: DS.blueSoft,
                fontSize: 10,
                fontWeight: 850,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              Central de gestão
            </div>
            <h1
              style={{
                color: DS.textPrimary,
                fontSize: 27,
                letterSpacing: '-0.035em',
                margin: '7px 0 0',
              }}
            >
              Método Comercial
            </h1>
            <p
              style={{
                color: DS.textSecondary,
                fontSize: 12,
                lineHeight: 1.6,
                margin: '9px 0 0',
                maxWidth: 720,
              }}
            >
              Veja o que está ativo, o que ainda está em rascunho e qual
              é a próxima ação antes de alterar a versão usada pela equipe.
            </p>
          </div>

          <SecondaryButton onClick={() => void loadLifecycle(true)}>
            {refreshing ? 'Atualizando...' : 'Atualizar status'}
          </SecondaryButton>
        </div>
      </section>

      <section
        aria-label="Estado do método comercial"
        style={{
          display: 'grid',
          gap: 12,
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        }}
      >
        <div style={{ ...cardStyle(), padding: 18 }}>
          <div
            style={{
              color: DS.textMuted,
              fontSize: 9,
              fontWeight: 850,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            Ativo na Yolen
          </div>
          <div
            style={{
              color: home.published.exists
                ? DS.greenSoft
                : DS.textMuted,
              fontSize: 18,
              fontWeight: 900,
              marginTop: 9,
            }}
          >
            {publishedLabel}
          </div>
          <div
            style={{
              color: DS.textSecondary,
              fontSize: 10,
              lineHeight: 1.5,
              marginTop: 7,
            }}
          >
            {home.published.exists
              ? `Publicado em ${formatDate(home.published.published_at)}`
              : 'A empresa ainda não publicou um método comercial.'}
          </div>
          <div style={{ marginTop: 12 }}>
            <StatusPill
              tone={home.published.companion_using ? 'green' : 'neutral'}
            >
              {home.published.companion_using
                ? 'Em uso pelo Yolen Companion'
                : 'Companion sem método V2 ativo'}
            </StatusPill>
          </div>
        </div>

        <div style={{ ...cardStyle(), padding: 18 }}>
          <div
            style={{
              color: DS.textMuted,
              fontSize: 9,
              fontWeight: 850,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            Rascunho
          </div>
          <div
            style={{
              color: home.draft.has_unpublished_changes
                ? DS.yellowSoft
                : DS.textPrimary,
              fontSize: 16,
              fontWeight: 900,
              marginTop: 9,
            }}
          >
            {draftLabel}
          </div>
          <div
            style={{
              color: DS.textSecondary,
              fontSize: 10,
              lineHeight: 1.5,
              marginTop: 7,
            }}
          >
            {home.draft.updated_at
              ? `Última alteração: ${formatDate(home.draft.updated_at)}`
              : 'Nenhuma alteração registrada.'}
          </div>
          <div style={{ marginTop: 12 }}>
            <StatusPill tone={draftTone}>
              {home.progress.label}
            </StatusPill>
          </div>
        </div>

        <div style={{ ...cardStyle(), padding: 18 }}>
          <div
            style={{
              color: DS.textMuted,
              fontSize: 9,
              fontWeight: 850,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            Próxima ação
          </div>
          <div
            style={{
              color: DS.textPrimary,
              fontSize: 15,
              fontWeight: 900,
              lineHeight: 1.3,
              marginTop: 9,
            }}
          >
            {home.next_action.label}
          </div>
          <div
            style={{
              color: DS.textSecondary,
              fontSize: 10,
              lineHeight: 1.55,
              marginTop: 7,
            }}
          >
            {home.next_action.description}
          </div>
          <div style={{ marginTop: 13 }}>
            <PrimaryButton onClick={runNextAction}>
              {home.next_action.key === 'up_to_date'
                ? 'Ver método ativo'
                : home.next_action.label}
            </PrimaryButton>
          </div>
        </div>
      </section>

      <section
        aria-label="Progresso da construção do método"
        style={{ ...cardStyle(), padding: 16 }}
      >
        <div
          style={{
            alignItems: 'center',
            display: 'flex',
            gap: 12,
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div
              style={{
                color: DS.textMuted,
                fontSize: 9,
                fontWeight: 850,
                textTransform: 'uppercase',
              }}
            >
              Jornada
            </div>
            <div
              style={{
                color: DS.textPrimary,
                fontSize: 11,
                fontWeight: 800,
                marginTop: 4,
              }}
            >
              Entender operação → Construir → Revisar → Publicar → Evoluir
            </div>
          </div>
          <div
            style={{
              color: DS.textMuted,
              fontSize: 10,
              whiteSpace: 'nowrap',
            }}
          >
            {home.progress.step}/{home.progress.total}
          </div>
        </div>
        <div
          aria-label={`Progresso ${home.progress.step} de ${home.progress.total}`}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={home.progress.total}
          aria-valuenow={home.progress.step}
          style={{
            background: DS.surfaceBg,
            borderRadius: 999,
            height: 7,
            marginTop: 12,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              background: DS.blue,
              borderRadius: 999,
              height: '100%',
              transition: 'width 180ms ease',
              width: `${(home.progress.step / home.progress.total) * 100}%`,
            }}
          />
        </div>
      </section>

      <MethodExecutiveView home={home} />

      <section
        style={{
          ...cardStyle(),
          alignItems: 'center',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 14,
          justifyContent: 'space-between',
          padding: 17,
        }}
      >
        <div>
          <div
            style={{
              color: DS.textPrimary,
              fontSize: 12,
              fontWeight: 850,
            }}
          >
            Precisa corrigir respostas ou dados auxiliares?
          </div>
          <div
            style={{
              color: DS.textSecondary,
              fontSize: 10,
              lineHeight: 1.5,
              marginTop: 4,
              maxWidth: 720,
            }}
          >
            Revisar diagnóstico volta ao mapeamento guiado. Configuração
            avançada é secundária e serve para produtos, fatos, objeções e
            diretrizes — ela não substitui a fonte de verdade do método
            publicado.
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {snapshot.builder && (
            <SecondaryButton
              onClick={() => {
                setForceDiagnosticReview(true)
                setMode('diagnosis')
              }}
            >
              Revisar diagnóstico
            </SecondaryButton>
          )}
          <SecondaryButton onClick={() => setMode('advanced')}>
            Configuração avançada
          </SecondaryButton>
        </div>
      </section>
    </main>
  )
}
