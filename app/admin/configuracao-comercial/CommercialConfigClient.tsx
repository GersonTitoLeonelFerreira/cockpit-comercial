'use client'

import * as React from 'react'

import CommercialConfigDraftEditor from './CommercialConfigDraftEditor'
import type {
  CommercialConfigBundle,
  CommercialConfigVersion,
  CommercialConfigWorkspace,
} from '@/app/types/commercial-config'

const DS = {
  contentBg: '#090b0f',
  cardBg: '#141722',
  surfaceBg: '#111318',
  surfaceRaised: '#171a25',

  border: '#1a1d2e',
  borderStrong: '#252a3d',

  textPrimary: '#edf2f7',
  textSecondary: '#8fa3bc',
  textMuted: '#546070',
  textLabel: '#4a5569',

  blue: '#3b82f6',
  blueSoft: '#93c5fd',
  blueLight: '#60a5fa',

  green: '#22c55e',
  greenSoft: '#86efac',

  yellow: '#f59e0b',
  yellowSoft: '#fcd34d',

  red: '#ef4444',
  redSoft: '#fca5a5',

  radius: 8,
  radiusContainer: 10,

  shadowCard: '0 2px 8px rgba(0,0,0,0.32)',
} as const

type WorkspaceResponse =
  | {
      ok: true
      workspace: CommercialConfigWorkspace
    }
  | {
      ok: false
      error: string
    }

type SelectedVersion =
  | {
      type: 'draft'
      bundle: CommercialConfigBundle
    }
  | {
      type: 'published'
      bundle: CommercialConfigBundle
    }
  | {
      type: 'archived'
      version: CommercialConfigVersion
    }
  | null

function getErrorMessage(
  value: unknown,
  fallback: string,
): string {
  if (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof value.error === 'string'
  ) {
    return value.error
  }

  return fallback
}

function formatDate(value: string | null): string {
  if (!value) {
    return 'Ainda não registrado'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Data inválida'
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

function cardStyle(): React.CSSProperties {
  return {
    background: DS.cardBg,
    border: `1px solid ${DS.border}`,
    borderRadius: DS.radiusContainer,
    boxShadow: DS.shadowCard,
  }
}

function StatusBadge({
  status,
}: {
  status: 'draft' | 'published' | 'archived'
}) {
  const config = {
    draft: {
      label: 'Rascunho',
      color: DS.yellowSoft,
      background: 'rgba(245,158,11,0.08)',
      border: 'rgba(252,211,77,0.18)',
    },

    published: {
      label: 'Publicada',
      color: DS.greenSoft,
      background: 'rgba(34,197,94,0.08)',
      border: 'rgba(134,239,172,0.18)',
    },

    archived: {
      label: 'Arquivada',
      color: DS.textSecondary,
      background: 'rgba(143,163,188,0.07)',
      border: 'rgba(143,163,188,0.16)',
    },
  }[status]

  return (
    <span
      style={{
        alignItems: 'center',
        background: config.background,
        border: `1px solid ${config.border}`,
        borderRadius: 999,
        color: config.color,
        display: 'inline-flex',
        fontSize: 10,
        fontWeight: 850,
        letterSpacing: '0.06em',
        padding: '5px 9px',
        textTransform: 'uppercase',
      }}
    >
      {config.label}
    </span>
  )
}

function MetricCard({
  label,
  value,
  description,
  accent = DS.blueSoft,
}: {
  label: string
  value: string
  description: string
  accent?: string
}) {
  return (
    <div
      style={{
        ...cardStyle(),
        display: 'flex',
        flex: '1 1 210px',
        flexDirection: 'column',
        minHeight: 124,
        padding: '18px 19px',
      }}
    >
      <div
        style={{
          color: DS.textLabel,
          fontSize: 10,
          fontWeight: 850,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>

      <div
        style={{
          color: accent,
          fontSize: 25,
          fontWeight: 900,
          letterSpacing: '-0.035em',
          lineHeight: 1,
          marginTop: 13,
        }}
      >
        {value}
      </div>

      <div
        style={{
          color: DS.textSecondary,
          fontSize: 11,
          lineHeight: 1.5,
          marginTop: 'auto',
          paddingTop: 11,
        }}
      >
        {description}
      </div>
    </div>
  )
}

function VersionCard({
  title,
  version,
  selected,
  onClick,
}: {
  title: string
  version: CommercialConfigVersion
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...cardStyle(),
        background: selected
          ? 'linear-gradient(135deg, rgba(37,99,235,0.15), rgba(20,23,34,0.96))'
          : DS.cardBg,
        border: selected
          ? `1px solid rgba(96,165,250,0.38)`
          : `1px solid ${DS.border}`,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 158,
        padding: 18,
        textAlign: 'left',
        transition:
          'border-color 160ms ease, background 160ms ease, transform 160ms ease',
        width: '100%',
      }}
    >
      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          gap: 10,
          justifyContent: 'space-between',
          width: '100%',
        }}
      >
        <span
          style={{
            color: DS.textPrimary,
            fontSize: 13,
            fontWeight: 800,
          }}
        >
          {title}
        </span>

        <StatusBadge status={version.status} />
      </div>

      <div
        style={{
          color: DS.blueSoft,
          fontSize: 28,
          fontWeight: 900,
          letterSpacing: '-0.04em',
          marginTop: 18,
        }}
      >
        V{version.version_number}
      </div>

      <div
        style={{
          color: DS.textSecondary,
          fontSize: 11,
          lineHeight: 1.5,
          marginTop: 'auto',
          paddingTop: 12,
        }}
      >
        Atualizada em {formatDate(version.updated_at)}
      </div>
    </button>
  )
}

function EmptyVersionCard({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div
      style={{
        ...cardStyle(),
        borderStyle: 'dashed',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        minHeight: 158,
        padding: 18,
      }}
    >
      <div
        style={{
          color: DS.textPrimary,
          fontSize: 13,
          fontWeight: 800,
        }}
      >
        {title}
      </div>

      <div
        style={{
          color: DS.textMuted,
          fontSize: 12,
          lineHeight: 1.55,
          marginTop: 10,
          maxWidth: 340,
        }}
      >
        {description}
      </div>
    </div>
  )
}

function BundleSummary({
  bundle,
}: {
  bundle: CommercialConfigBundle
}) {
  const { version } = bundle

  return (
    <div
      style={{
        ...cardStyle(),
        padding: 20,
      }}
    >
      <div
        style={{
          alignItems: 'flex-start',
          display: 'flex',
          gap: 16,
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div
            style={{
              color: DS.textLabel,
              fontSize: 10,
              fontWeight: 850,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            Versão selecionada
          </div>

          <div
            style={{
              alignItems: 'center',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 10,
              marginTop: 9,
            }}
          >
            <span
              style={{
                color: DS.textPrimary,
                fontSize: 18,
                fontWeight: 900,
              }}
            >
              Versão {version.version_number}
            </span>

            <StatusBadge status={version.status} />
          </div>
        </div>

        <div
          style={{
            color: DS.textMuted,
            fontSize: 11,
            textAlign: 'right',
          }}
        >
          Contrato {version.contract_version}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gap: 12,
          gridTemplateColumns:
            'repeat(auto-fit, minmax(155px, 1fr))',
          marginTop: 22,
        }}
      >
        {[
          {
            label: 'Etapas do método',
            value: bundle.method_steps.length,
          },
          {
            label: 'Perfis de produto',
            value: bundle.product_profiles.length,
          },
          {
            label: 'Fatos oficiais',
            value: bundle.facts.length,
          },
          {
            label: 'Guias de objeção',
            value: bundle.objection_guides.length,
          },
        ].map((item) => (
          <div
            key={item.label}
            style={{
              background: DS.surfaceBg,
              border: `1px solid ${DS.border}`,
              borderRadius: DS.radius,
              padding: '14px 15px',
            }}
          >
            <div
              style={{
                color: DS.textLabel,
                fontSize: 9,
                fontWeight: 850,
                letterSpacing: '0.07em',
                textTransform: 'uppercase',
              }}
            >
              {item.label}
            </div>

            <div
              style={{
                color: DS.blueSoft,
                fontSize: 21,
                fontWeight: 900,
                marginTop: 8,
              }}
            >
              {item.value}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          display: 'grid',
          gap: 14,
          gridTemplateColumns:
            'repeat(auto-fit, minmax(250px, 1fr))',
          marginTop: 18,
        }}
      >
        <div
          style={{
            background: DS.surfaceBg,
            border: `1px solid ${DS.border}`,
            borderRadius: DS.radius,
            padding: 16,
          }}
        >
          <div
            style={{
              color: DS.textLabel,
              fontSize: 9,
              fontWeight: 850,
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
            }}
          >
            Contexto da empresa
          </div>

          <div
            style={{
              color: DS.textSecondary,
              fontSize: 12,
              lineHeight: 1.6,
              marginTop: 9,
              whiteSpace: 'pre-wrap',
            }}
          >
            {version.business_description ||
              'Descrição ainda não preenchida.'}
          </div>
        </div>

        <div
          style={{
            background: DS.surfaceBg,
            border: `1px solid ${DS.border}`,
            borderRadius: DS.radius,
            padding: 16,
          }}
        >
          <div
            style={{
              color: DS.textLabel,
              fontSize: 9,
              fontWeight: 850,
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
            }}
          >
            Método comercial
          </div>

          <div
            style={{
              color: DS.textPrimary,
              fontSize: 13,
              fontWeight: 800,
              marginTop: 9,
            }}
          >
            {version.commercial_method_name ||
              'Método ainda não nomeado'}
          </div>

          <div
            style={{
              color: DS.textSecondary,
              fontSize: 12,
              lineHeight: 1.6,
              marginTop: 7,
            }}
          >
            {version.commercial_method_description ||
              'Descrição do método ainda não preenchida.'}
          </div>
        </div>
      </div>
    </div>
  )
}

function ArchivedSummary({
  version,
}: {
  version: CommercialConfigVersion
}) {
  return (
    <div
      style={{
        ...cardStyle(),
        padding: 20,
      }}
    >
      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          gap: 10,
        }}
      >
        <div
          style={{
            color: DS.textPrimary,
            fontSize: 18,
            fontWeight: 900,
          }}
        >
          Versão {version.version_number}
        </div>

        <StatusBadge status="archived" />
      </div>

      <div
        style={{
          color: DS.textSecondary,
          fontSize: 12,
          lineHeight: 1.65,
          marginTop: 16,
        }}
      >
        Esta versão foi arquivada em{' '}
        {formatDate(version.archived_at)}. O conteúdo completo será
        carregado quando o editor de histórico for implementado no
        próximo bloco.
      </div>
    </div>
  )
}

export default function CommercialConfigClient() {
  const [workspace, setWorkspace] =
    React.useState<CommercialConfigWorkspace | null>(null)

  const [selectedVersion, setSelectedVersion] =
    React.useState<SelectedVersion>(null)

  const [loading, setLoading] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const loadWorkspace = React.useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (mode === 'refresh') {
        setRefreshing(true)
      } else {
        setLoading(true)
      }

      setError(null)

      try {
        const response = await fetch(
          '/api/admin/commercial-config',
          {
            method: 'GET',
            cache: 'no-store',
          },
        )

        const json =
          (await response.json()) as WorkspaceResponse

        if (!response.ok || !json.ok) {
          throw new Error(
            getErrorMessage(
              json,
              'Erro ao carregar a configuração comercial.',
            ),
          )
        }

        setWorkspace(json.workspace)

        if (json.workspace.draft) {
          setSelectedVersion({
            type: 'draft',
            bundle: json.workspace.draft,
          })
        } else if (json.workspace.published) {
          setSelectedVersion({
            type: 'published',
            bundle: json.workspace.published,
          })
        } else {
          setSelectedVersion(null)
        }
      } catch (loadError: unknown) {
        setWorkspace(null)
        setSelectedVersion(null)
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Erro ao carregar a configuração comercial.',
        )
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [],
  )

  React.useEffect(() => {
    void loadWorkspace()
  }, [loadWorkspace])

  if (loading) {
    return (
      <div
        style={{
          ...cardStyle(),
          alignItems: 'center',
          display: 'flex',
          justifyContent: 'center',
          minHeight: 260,
          padding: 24,
        }}
      >
        <div
          style={{
            color: DS.textSecondary,
            fontSize: 13,
          }}
        >
          Carregando configuração comercial...
        </div>
      </div>
    )
  }

  if (error || !workspace) {
    return (
      <div
        style={{
          ...cardStyle(),
          borderColor: 'rgba(239,68,68,0.28)',
          padding: 22,
        }}
      >
        <div
          style={{
            color: DS.redSoft,
            fontSize: 14,
            fontWeight: 850,
          }}
        >
          Não foi possível carregar a configuração
        </div>

        <div
          style={{
            color: DS.textSecondary,
            fontSize: 12,
            lineHeight: 1.6,
            marginTop: 9,
          }}
        >
          {error}
        </div>

        <button
          type="button"
          onClick={() => {
            void loadWorkspace('refresh')
          }}
          style={{
            background: DS.surfaceBg,
            border: `1px solid ${DS.borderStrong}`,
            borderRadius: DS.radius,
            color: DS.textPrimary,
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 750,
            marginTop: 16,
            padding: '9px 13px',
          }}
        >
          Tentar novamente
        </button>
      </div>
    )
  }

  const activeProducts = workspace.products.filter(
    (product) => product.active,
  ).length

  return (
    <div
      style={{
        margin: '0 auto',
        maxWidth: 1440,
        width: '100%',
      }}
    >
      <div
        style={{
          alignItems: 'flex-start',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 20,
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
            Companion V2
          </div>

          <h1
            style={{
              color: DS.textPrimary,
              fontSize: 26,
              fontWeight: 900,
              letterSpacing: '-0.035em',
              margin: '8px 0 0',
            }}
          >
            Método Comercial
          </h1>

          <p
            style={{
              color: DS.textSecondary,
              fontSize: 13,
              lineHeight: 1.65,
              margin: '9px 0 0',
              maxWidth: 720,
            }}
          >
            Configure o contexto da empresa, o método de vendas,
            os produtos, os fatos oficiais e os limites que orientarão
            o Companion.
          </p>
        </div>

        <button
          type="button"
          disabled={refreshing}
          onClick={() => {
            void loadWorkspace('refresh')
          }}
          style={{
            background: DS.surfaceBg,
            border: `1px solid ${DS.borderStrong}`,
            borderRadius: DS.radius,
            color: refreshing
              ? DS.textMuted
              : DS.textSecondary,
            cursor: refreshing ? 'wait' : 'pointer',
            fontSize: 12,
            fontWeight: 750,
            minWidth: 112,
            padding: '10px 14px',
          }}
        >
          {refreshing ? 'Atualizando...' : 'Atualizar'}
        </button>
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 14,
          marginTop: 26,
        }}
      >
        <MetricCard
          label="Versão publicada"
          value={
            workspace.published
              ? `V${workspace.published.version.version_number}`
              : 'Nenhuma'
          }
          description={
            workspace.published
              ? `Publicada em ${formatDate(
                  workspace.published.version.published_at,
                )}`
              : 'A empresa ainda não possui uma configuração ativa.'
          }
          accent={
            workspace.published
              ? DS.greenSoft
              : DS.textMuted
          }
        />

        <MetricCard
          label="Rascunho atual"
          value={
            workspace.draft
              ? `V${workspace.draft.version.version_number}`
              : 'Nenhum'
          }
          description={
            workspace.draft
              ? `Atualizado em ${formatDate(
                  workspace.draft.version.updated_at,
                )}`
              : 'Nenhuma edição está em andamento.'
          }
          accent={
            workspace.draft
              ? DS.yellowSoft
              : DS.textMuted
          }
        />

        <MetricCard
          label="Produtos ativos"
          value={String(activeProducts)}
          description={`${workspace.products.length} produto(s) cadastrado(s) no catálogo.`}
        />

        <MetricCard
          label="Histórico"
          value={String(workspace.archived_versions.length)}
          description="Versões anteriores preservadas para consulta."
          accent={DS.textSecondary}
        />
      </div>

      <div
        style={{
          display: 'grid',
          gap: 18,
          gridTemplateColumns:
            'minmax(250px, 340px) minmax(0, 1fr)',
          marginTop: 24,
        }}
      >
        <aside
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {workspace.draft ? (
            <VersionCard
              title="Rascunho em edição"
              version={workspace.draft.version}
              selected={
                selectedVersion?.type === 'draft'
              }
              onClick={() => {
                setSelectedVersion({
                  type: 'draft',
                  bundle: workspace.draft!,
                })
              }}
            />
          ) : (
            <EmptyVersionCard
              title="Nenhum rascunho"
              description="Use o editor ao lado para iniciar a primeira configuração comercial."
            />
          )}

          {workspace.published ? (
            <VersionCard
              title="Configuração vigente"
              version={workspace.published.version}
              selected={
                selectedVersion?.type === 'published'
              }
              onClick={() => {
                setSelectedVersion({
                  type: 'published',
                  bundle: workspace.published!,
                })
              }}
            />
          ) : (
            <EmptyVersionCard
              title="Nenhuma versão publicada"
              description="O Companion ainda não possui uma configuração comercial ativa para esta empresa."
            />
          )}

          {workspace.archived_versions.length > 0 && (
            <div
              style={{
                ...cardStyle(),
                padding: 14,
              }}
            >
              <div
                style={{
                  color: DS.textLabel,
                  fontSize: 9,
                  fontWeight: 850,
                  letterSpacing: '0.08em',
                  marginBottom: 10,
                  textTransform: 'uppercase',
                }}
              >
                Histórico
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 7,
                }}
              >
                {workspace.archived_versions.map(
                  (version) => (
                    <button
                      key={version.id}
                      type="button"
                      onClick={() => {
                        setSelectedVersion({
                          type: 'archived',
                          version,
                        })
                      }}
                      style={{
                        alignItems: 'center',
                        background:
                          selectedVersion?.type ===
                            'archived' &&
                          selectedVersion.version.id ===
                            version.id
                            ? 'rgba(59,130,246,0.12)'
                            : DS.surfaceBg,
                        border: `1px solid ${
                          selectedVersion?.type ===
                            'archived' &&
                          selectedVersion.version.id ===
                            version.id
                            ? 'rgba(96,165,250,0.3)'
                            : DS.border
                        }`,
                        borderRadius: DS.radius,
                        color: DS.textSecondary,
                        cursor: 'pointer',
                        display: 'flex',
                        fontSize: 11,
                        justifyContent: 'space-between',
                        padding: '10px 11px',
                        textAlign: 'left',
                        width: '100%',
                      }}
                    >
                      <span>
                        Versão {version.version_number}
                      </span>

                      <span
                        style={{
                          color: DS.textMuted,
                          fontSize: 10,
                        }}
                      >
                        {formatDate(version.archived_at)}
                      </span>
                    </button>
                  ),
                )}
              </div>
            </div>
          )}
        </aside>

        <section>
          {selectedVersion?.type === 'draft' ? (
            <CommercialConfigDraftEditor
              workspace={workspace}
              onSaved={async () => {
                await loadWorkspace('refresh')
              }}
            />
          ) : selectedVersion?.type === 'published' ? (
            <BundleSummary
              bundle={selectedVersion.bundle}
            />
          ) : selectedVersion?.type === 'archived' ? (
            <ArchivedSummary
              version={selectedVersion.version}
            />
          ) : (
            <CommercialConfigDraftEditor
              workspace={workspace}
              onSaved={async () => {
                await loadWorkspace('refresh')
              }}
            />
          )}
        </section>
      </div>
    </div>
  )
}