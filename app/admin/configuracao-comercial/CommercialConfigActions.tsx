'use client'

import * as React from 'react'

import { validateCommercialConfigForPublish } from '@/app/lib/commercial-config/validation'
import type {
  CommercialConfigSectionKey,
  CommercialConfigWorkspace,
  CommercialConfigValidationIssue,
} from '@/app/types/commercial-config'

type Operation =
  | 'publish'
  | 'clone'
  | 'delete'
  | null

type Feedback =
  | {
      type: 'success' | 'error'
      message: string
    }
  | null

interface Props {
  workspace: CommercialConfigWorkspace
  draftDirty: boolean
  onCompleted: () => Promise<void> | void
}

const DS = {
  cardBg: '#141722',
  surfaceBg: '#111318',
  surfaceRaised: '#171a25',

  border: '#1a1d2e',
  borderStrong: '#252a3d',

  textPrimary: '#edf2f7',
  textSecondary: '#8fa3bc',
  textMuted: '#546070',

  blueSoft: '#93c5fd',
  greenSoft: '#86efac',
  yellowSoft: '#fcd34d',
  redSoft: '#fca5a5',

  radius: 8,
  radiusContainer: 10,
} as const

const SECTION_LABELS: Record<
  CommercialConfigSectionKey,
  string
> = {
  company_context: 'Contexto da empresa',
  commercial_method: 'Método comercial',
  product_profiles: 'Perfis dos produtos',
  official_facts: 'Fatos oficiais',
  objection_guides: 'Tratamento de objeções',
  seller_guidelines: 'Diretrizes do vendedor',
}

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

function groupIssues(
  issues: CommercialConfigValidationIssue[],
): Array<{
  section: CommercialConfigSectionKey
  issues: CommercialConfigValidationIssue[]
}> {
  const grouped = new Map<
    CommercialConfigSectionKey,
    CommercialConfigValidationIssue[]
  >()

  issues.forEach((issue) => {
    const current =
      grouped.get(issue.section) ?? []

    current.push(issue)
    grouped.set(issue.section, current)
  })

  return Array.from(grouped.entries()).map(
    ([section, sectionIssues]) => ({
      section,
      issues: sectionIssues,
    }),
  )
}

function ActionButton({
  children,
  disabled,
  onClick,
  tone,
}: {
  children: React.ReactNode
  disabled: boolean
  onClick: () => void
  tone: 'primary' | 'danger' | 'secondary'
}) {
  const enabledStyle = {
    primary: {
      background: '#166534',
      border: 'rgba(134,239,172,0.24)',
      color: '#f0fdf4',
    },

    danger: {
      background: 'rgba(127,29,29,0.55)',
      border: 'rgba(252,165,165,0.24)',
      color: '#fee2e2',
    },

    secondary: {
      background: 'rgba(37,99,235,0.14)',
      border: 'rgba(96,165,250,0.28)',
      color: DS.blueSoft,
    },
  }[tone]

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        background: disabled
          ? DS.surfaceBg
          : enabledStyle.background,
        border: `1px solid ${
          disabled
            ? DS.borderStrong
            : enabledStyle.border
        }`,
        borderRadius: DS.radius,
        color: disabled
          ? DS.textMuted
          : enabledStyle.color,
        cursor: disabled
          ? 'not-allowed'
          : 'pointer',
        fontSize: 11,
        fontWeight: 850,
        minHeight: 38,
        padding: '9px 13px',
      }}
    >
      {children}
    </button>
  )
}

export default function CommercialConfigActions({
  workspace,
  draftDirty,
  onCompleted,
}: Props) {
  const [operation, setOperation] =
    React.useState<Operation>(null)

  const [feedback, setFeedback] =
    React.useState<Feedback>(null)

  const validation = React.useMemo(
    () =>
      workspace.draft
        ? validateCommercialConfigForPublish(
            workspace.draft,
            workspace.products,
          )
        : null,
    [workspace.draft, workspace.products],
  )

  const groupedIssues = React.useMemo(
    () =>
      validation
        ? groupIssues(validation.issues)
        : [],
    [validation],
  )

  const busy = operation !== null

  const executeAction = async ({
    operationName,
    endpoint,
    method,
    body,
    confirmation,
    successMessage,
  }: {
    operationName: Exclude<Operation, null>
    endpoint: string
    method: 'POST' | 'DELETE'
    body: Record<string, string>
    confirmation?: string
    successMessage: string
  }) => {
    if (
      confirmation &&
      !window.confirm(confirmation)
    ) {
      return
    }

    setOperation(operationName)
    setFeedback(null)

    try {
      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })

      const json = await response
        .json()
        .catch(() => null)

      if (
        !response.ok ||
        typeof json !== 'object' ||
        json === null ||
        !('ok' in json) ||
        json.ok !== true
      ) {
        throw new Error(
          getErrorMessage(
            json,
            'A operação não pôde ser concluída.',
          ),
        )
      }

      await onCompleted()

      setFeedback({
        type: 'success',
        message: successMessage,
      })
    } catch (actionError: unknown) {
      setFeedback({
        type: 'error',
        message:
          actionError instanceof Error
            ? actionError.message
            : 'A operação não pôde ser concluída.',
      })
    } finally {
      setOperation(null)
    }
  }

  const publishDraft = () => {
    const draft = workspace.draft

    if (
      !draft ||
      !validation?.valid ||
      draftDirty ||
      busy
    ) {
      return
    }

    void executeAction({
      operationName: 'publish',
      endpoint:
        '/api/admin/commercial-config/publish',
      method: 'POST',
      body: {
        config_version_id:
          draft.version.id,
      },
      confirmation:
        `Publicar a versão V${draft.version.version_number}? ` +
        'Depois da publicação, esta versão ficará imutável.',
      successMessage:
        `A versão V${draft.version.version_number} foi publicada com sucesso.`,
    })
  }

  const deleteDraft = () => {
    const draft = workspace.draft

    if (!draft || draftDirty || busy) {
      return
    }

    void executeAction({
      operationName: 'delete',
      endpoint:
        '/api/admin/commercial-config/draft',
      method: 'DELETE',
      body: {
        config_version_id:
          draft.version.id,
      },
      confirmation:
        `Excluir definitivamente o rascunho V${draft.version.version_number}? ` +
        'Esta ação não poderá ser desfeita.',
      successMessage:
        `O rascunho V${draft.version.version_number} foi excluído.`,
    })
  }

  const clonePublished = () => {
    const published = workspace.published

    if (
      !published ||
      workspace.draft ||
      draftDirty ||
      busy
    ) {
      return
    }

    void executeAction({
      operationName: 'clone',
      endpoint:
        '/api/admin/commercial-config/clone',
      method: 'POST',
      body: {
        source_config_version_id:
          published.version.id,
      },
      successMessage:
        `A versão V${published.version.version_number} foi clonada para um novo rascunho.`,
    })
  }

  return (
    <div
      style={{
        background: DS.cardBg,
        border: `1px solid ${DS.border}`,
        borderRadius: DS.radiusContainer,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          alignItems: 'flex-start',
          background:
            'linear-gradient(135deg, rgba(37,99,235,0.1), rgba(20,23,34,0.98))',
          borderBottom: `1px solid ${DS.border}`,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
          justifyContent: 'space-between',
          padding: '15px 17px',
        }}
      >
        <div>
          <div
            style={{
              color: DS.textPrimary,
              fontSize: 14,
              fontWeight: 900,
            }}
          >
            Controle da versão
          </div>

          <div
            style={{
              color: DS.textSecondary,
              fontSize: 10,
              lineHeight: 1.5,
              marginTop: 5,
            }}
          >
            Valide, publique, clone ou exclua a
            configuração comercial.
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          {workspace.draft && (
            <>
              <ActionButton
                tone="primary"
                disabled={
                  busy ||
                  draftDirty ||
                  !validation?.valid
                }
                onClick={publishDraft}
              >
                {operation === 'publish'
                  ? 'Publicando...'
                  : `Publicar V${workspace.draft.version.version_number}`}
              </ActionButton>

              <ActionButton
                tone="danger"
                disabled={busy || draftDirty}
                onClick={deleteDraft}
              >
                {operation === 'delete'
                  ? 'Excluindo...'
                  : 'Excluir rascunho'}
              </ActionButton>
            </>
          )}

          {workspace.published && (
            <ActionButton
              tone="secondary"
              disabled={
                busy ||
                draftDirty ||
                Boolean(workspace.draft)
              }
              onClick={clonePublished}
            >
              {operation === 'clone'
                ? 'Clonando...'
                : `Criar nova versão a partir da V${workspace.published.version.version_number}`}
            </ActionButton>
          )}
        </div>
      </div>

      {draftDirty && (
        <div
          style={{
            background:
              'rgba(245,158,11,0.07)',
            borderBottom:
              '1px solid rgba(252,211,77,0.16)',
            color: DS.yellowSoft,
            fontSize: 10,
            fontWeight: 750,
            lineHeight: 1.5,
            padding: '10px 17px',
          }}
        >
          Existem alterações ainda não salvas.
          Salve o rascunho antes de publicar,
          excluir ou clonar.
        </div>
      )}

      {feedback && (
        <div
          style={{
            background:
              feedback.type === 'success'
                ? 'rgba(34,197,94,0.07)'
                : 'rgba(239,68,68,0.07)',
            borderBottom: `1px solid ${
              feedback.type === 'success'
                ? 'rgba(134,239,172,0.16)'
                : 'rgba(252,165,165,0.16)'
            }`,
            color:
              feedback.type === 'success'
                ? DS.greenSoft
                : DS.redSoft,
            fontSize: 10,
            fontWeight: 750,
            lineHeight: 1.5,
            padding: '10px 17px',
          }}
        >
          {feedback.message}
        </div>
      )}

      <div
        style={{
          padding: '14px 17px',
        }}
      >
        {workspace.draft && validation ? (
          validation.valid ? (
            <div
              style={{
                background:
                  'rgba(34,197,94,0.06)',
                border:
                  '1px solid rgba(134,239,172,0.15)',
                borderRadius: DS.radius,
                color: DS.greenSoft,
                fontSize: 10,
                fontWeight: 750,
                lineHeight: 1.6,
                padding: '10px 12px',
              }}
            >
              O rascunho atende aos requisitos
              estruturais e está pronto para publicação.
            </div>
          ) : (
            <div>
              <div
                style={{
                  background:
                    'rgba(245,158,11,0.06)',
                  border:
                    '1px solid rgba(252,211,77,0.15)',
                  borderRadius: DS.radius,
                  color: DS.yellowSoft,
                  fontSize: 10,
                  fontWeight: 750,
                  lineHeight: 1.6,
                  padding: '10px 12px',
                }}
              >
                A publicação está bloqueada por{' '}
                {validation.issues.length}{' '}
                pendência(s).
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 9,
                  marginTop: 11,
                }}
              >
                {groupedIssues.map((group) => (
                  <div
                    key={group.section}
                    style={{
                      background: DS.surfaceBg,
                      border: `1px solid ${DS.border}`,
                      borderRadius: DS.radius,
                      padding: '10px 11px',
                    }}
                  >
                    <div
                      style={{
                        color: DS.textPrimary,
                        fontSize: 10,
                        fontWeight: 850,
                      }}
                    >
                      {SECTION_LABELS[group.section]}
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 5,
                        marginTop: 7,
                      }}
                    >
                      {group.issues.map(
                        (issue, index) => (
                          <div
                            key={`${issue.field}-${index}`}
                            style={{
                              color:
                                DS.textSecondary,
                              fontSize: 10,
                              lineHeight: 1.5,
                            }}
                          >
                            • {issue.message}
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        ) : workspace.published ? (
          <div
            style={{
              color: DS.textSecondary,
              fontSize: 10,
              lineHeight: 1.6,
            }}
          >
            A versão publicada é imutável. Use
            <strong
              style={{
                color: DS.textPrimary,
                margin: '0 4px',
              }}
            >
              Criar nova versão
            </strong>
            para continuar editando.
          </div>
        ) : (
          <div
            style={{
              color: DS.textMuted,
              fontSize: 10,
              lineHeight: 1.6,
            }}
          >
            Crie e salve o primeiro rascunho para
            liberar as operações de versão.
          </div>
        )}
      </div>
    </div>
  )
}