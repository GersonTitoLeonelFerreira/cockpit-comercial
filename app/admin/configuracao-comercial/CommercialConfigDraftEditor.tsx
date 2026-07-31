'use client'

import * as React from 'react'

import CommercialFactsEditor from './CommercialFactsEditor'
import CommercialMethodStepsEditor from './CommercialMethodStepsEditor'
import CommercialObjectionGuidesEditor from './CommercialObjectionGuidesEditor'
import CommercialProductProfilesEditor from './CommercialProductProfilesEditor'
import {
  createEmptyCommercialConfigDraft,
} from '@/app/types/commercial-config'
import type {
  CommercialConfigBundle,
  CommercialConfigDraftInput,
  CommercialConfigMutationResult,
  CommercialConfigWorkspace,
} from '@/app/types/commercial-config'

const DS = {
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

  green: '#22c55e',
  greenSoft: '#86efac',

  yellowSoft: '#fcd34d',

  red: '#ef4444',
  redSoft: '#fca5a5',

  radius: 8,
  radiusContainer: 10,

  shadowCard: '0 2px 8px rgba(0,0,0,0.32)',
} as const

type EditableTextField =
  | 'business_description'
  | 'target_audience'
  | 'value_proposition'
  | 'communication_tone'

type SaveResponse =
  | {
      ok: true
      result: CommercialConfigMutationResult
    }
  | {
      ok: false
      error: string
    }

type Feedback =
  | {
      type: 'success' | 'error'
      message: string
    }
  | null

interface Props {
  workspace: CommercialConfigWorkspace
  onSaved: () => Promise<void> | void
}

function cardStyle(): React.CSSProperties {
  return {
    background: DS.cardBg,
    border: `1px solid ${DS.border}`,
    borderRadius: DS.radiusContainer,
    boxShadow: DS.shadowCard,
  }
}

const inputStyle: React.CSSProperties = {
  background: DS.surfaceBg,
  border: `1px solid ${DS.borderStrong}`,
  borderRadius: DS.radius,
  color: DS.textPrimary,
  fontFamily: 'inherit',
  fontSize: 13,
  lineHeight: 1.55,
  outline: 'none',
  padding: '11px 12px',
  resize: 'vertical',
  width: '100%',
}

function bundleToDraftInput(
  bundle: CommercialConfigBundle,
): CommercialConfigDraftInput {
  const { version } = bundle

  return {
    config_version_id: version.id,

    business_description: version.business_description,
    target_audience: version.target_audience,
    value_proposition: version.value_proposition,

    commercial_method_name:
      version.commercial_method_name,

    commercial_method_description:
      version.commercial_method_description,

    communication_tone: version.communication_tone,

    required_behaviors: [...version.required_behaviors],
    prohibited_behaviors: [...version.prohibited_behaviors],

    method_steps: bundle.method_steps.map((step) => ({
      id: step.id,
      step_order: step.step_order,
      name: step.name,
      objective: step.objective,
      completion_criteria: [...step.completion_criteria],
      recommended_questions: [
        ...step.recommended_questions,
      ],
      is_required: step.is_required,
    })),

    product_profiles: bundle.product_profiles.map(
      (profile) => ({
        id: profile.id,
        product_id: profile.product_id,
        indicated_audiences: [
          ...profile.indicated_audiences,
        ],
        needs_addressed: [...profile.needs_addressed],
        benefits: [...profile.benefits],
        verified_differentiators: [
          ...profile.verified_differentiators,
        ],
        limitations: [...profile.limitations],
        contract_conditions: [
          ...profile.contract_conditions,
        ],
        payment_conditions: [
          ...profile.payment_conditions,
        ],
        allowed_claims: [...profile.allowed_claims],
        forbidden_claims: [...profile.forbidden_claims],
      }),
    ),

    facts: bundle.facts.map((fact) => ({
      id: fact.id,
      category: fact.category,
      fact_key: fact.fact_key,
      fact_value: fact.fact_value,
      source_note: fact.source_note,
      is_active: fact.is_active,
    })),

    objection_guides: bundle.objection_guides.map(
      (guide) => ({
        id: guide.id,
        sort_order: guide.sort_order,
        objection: guide.objection,
        signals: [...guide.signals],
        discovery_questions: [
          ...guide.discovery_questions,
        ],
        recommended_approach:
          guide.recommended_approach,
        response_limits: [...guide.response_limits],
        is_active: guide.is_active,
      }),
    ),
  }
}

function createDraftFromWorkspace(
  workspace: CommercialConfigWorkspace,
): CommercialConfigDraftInput {
  if (workspace.draft) {
    return bundleToDraftInput(workspace.draft)
  }

  return createEmptyCommercialConfigDraft()
}

function itemsToLines(items: string[]): string {
  return items.join('\n')
}

function linesToItems(value: string): string[] {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
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

function FieldLabel({
  children,
  required = false,
}: {
  children: React.ReactNode
  required?: boolean
}) {
  return (
    <div
      style={{
        color: DS.textLabel,
        fontSize: 10,
        fontWeight: 850,
        letterSpacing: '0.07em',
        marginBottom: 7,
        textTransform: 'uppercase',
      }}
    >
      {children}

      {required && (
        <span
          style={{
            color: DS.redSoft,
            marginLeft: 4,
          }}
        >
          *
        </span>
      )}
    </div>
  )
}

function FieldHelp({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        color: DS.textMuted,
        fontSize: 10,
        lineHeight: 1.5,
        marginTop: 6,
      }}
    >
      {children}
    </div>
  )
}

function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string
  title: string
  description: string
}) {
  return (
    <div>
      <div
        style={{
          color: DS.blueSoft,
          fontSize: 9,
          fontWeight: 850,
          letterSpacing: '0.09em',
          textTransform: 'uppercase',
        }}
      >
        {eyebrow}
      </div>

      <div
        style={{
          color: DS.textPrimary,
          fontSize: 16,
          fontWeight: 900,
          letterSpacing: '-0.02em',
          marginTop: 6,
        }}
      >
        {title}
      </div>

      <div
        style={{
          color: DS.textSecondary,
          fontSize: 11,
          lineHeight: 1.6,
          marginTop: 6,
          maxWidth: 720,
        }}
      >
        {description}
      </div>
    </div>
  )
}

export default function CommercialConfigDraftEditor({
  workspace,
  onSaved,
}: Props) {
  const [draft, setDraft] =
    React.useState<CommercialConfigDraftInput>(() =>
      createDraftFromWorkspace(workspace),
    )

  const [requiredBehaviorsText, setRequiredBehaviorsText] =
    React.useState(() =>
      itemsToLines(draft.required_behaviors),
    )

  const [
    prohibitedBehaviorsText,
    setProhibitedBehaviorsText,
  ] = React.useState(() =>
    itemsToLines(draft.prohibited_behaviors),
  )

  const [dirty, setDirty] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [feedback, setFeedback] =
    React.useState<Feedback>(null)

  React.useEffect(() => {
    const nextDraft = createDraftFromWorkspace(workspace)

    setDraft(nextDraft)
    setRequiredBehaviorsText(
      itemsToLines(nextDraft.required_behaviors),
    )
    setProhibitedBehaviorsText(
      itemsToLines(nextDraft.prohibited_behaviors),
    )
    setDirty(false)
  }, [workspace])

  const updateTextField = (
    field: EditableTextField,
    value: string,
  ) => {
    setDraft((current) => ({
      ...current,
      [field]: value,
    }))

    setDirty(true)
    setFeedback(null)
  }

  const updateMethodSection = (
    nextValue: Pick<
      CommercialConfigDraftInput,
      | 'commercial_method_name'
      | 'commercial_method_description'
      | 'method_steps'
    >,
  ) => {
    setDraft((current) => ({
      ...current,
      ...nextValue,
    }))

    setDirty(true)
    setFeedback(null)
  }

  const updateProductProfilesSection = (
    nextValue: Pick<
      CommercialConfigDraftInput,
      'product_profiles'
    >,
  ) => {
    setDraft((current) => ({
      ...current,
      ...nextValue,
    }))

    setDirty(true)
    setFeedback(null)
  }

  const updateFactsSection = (
    nextValue: Pick<
      CommercialConfigDraftInput,
      'facts'
    >,
  ) => {
    setDraft((current) => ({
      ...current,
      ...nextValue,
    }))

    setDirty(true)
    setFeedback(null)
  }

  const updateObjectionGuidesSection = (
    nextValue: Pick<
      CommercialConfigDraftInput,
      'objection_guides'
    >,
  ) => {
    setDraft((current) => ({
      ...current,
      ...nextValue,
    }))

    setDirty(true)
    setFeedback(null)
  }

  const saveDraft = async () => {
    if (!dirty || saving) {
      return
    }

    setSaving(true)
    setFeedback(null)

    const payload: CommercialConfigDraftInput = {
      ...draft,
      required_behaviors: linesToItems(
        requiredBehaviorsText,
      ),
      prohibited_behaviors: linesToItems(
        prohibitedBehaviorsText,
      ),
    }

    try {
      const response = await fetch(
        '/api/admin/commercial-config',
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      )

      const json = (await response.json()) as SaveResponse

      if (!response.ok || !json.ok) {
        throw new Error(
          getErrorMessage(
            json,
            'Erro ao salvar o rascunho comercial.',
          ),
        )
      }

      setDraft({
        ...payload,
        config_version_id: json.result.config_version_id,
      })

      setDirty(false)

      await onSaved()

      setFeedback({
        type: 'success',
        message:
          `Rascunho V${json.result.version_number} salvo com sucesso.`,
      })
    } catch (saveError: unknown) {
      setFeedback({
        type: 'error',
        message:
          saveError instanceof Error
            ? saveError.message
            : 'Erro ao salvar o rascunho comercial.',
      })
    } finally {
      setSaving(false)
    }
  }

  const hasExistingDraft = Boolean(
    workspace.draft?.version.id,
  )

  return (
    <div
      style={{
        ...cardStyle(),
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          alignItems: 'flex-start',
          background:
            'linear-gradient(135deg, rgba(37,99,235,0.12), rgba(20,23,34,0.96))',
          borderBottom: `1px solid ${DS.border}`,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 18,
          justifyContent: 'space-between',
          padding: '19px 20px',
        }}
      >
        <div>
          <div
            style={{
              alignItems: 'center',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 9,
            }}
          >
            <div
              style={{
                color: DS.textPrimary,
                fontSize: 17,
                fontWeight: 900,
              }}
            >
              {hasExistingDraft
                ? `Editar rascunho V${workspace.draft?.version.version_number}`
                : 'Criar configuração comercial'}
            </div>

            <span
              style={{
                background: 'rgba(245,158,11,0.08)',
                border:
                  '1px solid rgba(252,211,77,0.18)',
                borderRadius: 999,
                color: DS.yellowSoft,
                fontSize: 9,
                fontWeight: 850,
                letterSpacing: '0.06em',
                padding: '5px 8px',
                textTransform: 'uppercase',
              }}
            >
              Rascunho
            </span>
          </div>

          <div
            style={{
              color: DS.textSecondary,
              fontSize: 11,
              lineHeight: 1.55,
              marginTop: 7,
              maxWidth: 680,
            }}
          >
            O rascunho pode ser salvo parcialmente. A publicação
            continuará bloqueada até todas as seções obrigatórias
            estarem completas.
          </div>
        </div>

        <button
          type="button"
          disabled={!dirty || saving}
          onClick={() => {
            void saveDraft()
          }}
          style={{
            background:
              dirty && !saving
                ? '#166534'
                : DS.surfaceBg,
            border:
              dirty && !saving
                ? '1px solid rgba(134,239,172,0.25)'
                : `1px solid ${DS.borderStrong}`,
            borderRadius: DS.radius,
            color:
              dirty && !saving
                ? '#f0fdf4'
                : DS.textMuted,
            cursor:
              dirty && !saving
                ? 'pointer'
                : saving
                  ? 'wait'
                  : 'not-allowed',
            fontSize: 12,
            fontWeight: 850,
            minWidth: 148,
            padding: '10px 15px',
          }}
        >
          {saving
            ? 'Salvando...'
            : hasExistingDraft
              ? 'Salvar alterações'
              : 'Criar rascunho'}
        </button>
      </div>

      {feedback && (
        <div
          style={{
            background:
              feedback.type === 'success'
                ? 'rgba(34,197,94,0.07)'
                : 'rgba(239,68,68,0.07)',
            borderBottom: `1px solid ${
              feedback.type === 'success'
                ? 'rgba(134,239,172,0.18)'
                : 'rgba(252,165,165,0.18)'
            }`,
            color:
              feedback.type === 'success'
                ? DS.greenSoft
                : DS.redSoft,
            fontSize: 11,
            fontWeight: 750,
            lineHeight: 1.5,
            padding: '11px 20px',
          }}
        >
          {feedback.message}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 26,
          padding: 20,
        }}
      >
        <section>
          <SectionHeader
            eyebrow="Seção 1"
            title="Contexto da empresa"
            description="Estas informações ajudam o Companion a entender quem a empresa atende, o que ela oferece e qual valor deve ser comunicado."
          />

          <div
            style={{
              display: 'grid',
              gap: 16,
              gridTemplateColumns:
                'repeat(auto-fit, minmax(280px, 1fr))',
              marginTop: 18,
            }}
          >
            <div
              style={{
                gridColumn: '1 / -1',
              }}
            >
              <FieldLabel required>
                Descrição da empresa
              </FieldLabel>

              <textarea
                value={draft.business_description}
                onChange={(event) => {
                  updateTextField(
                    'business_description',
                    event.target.value,
                  )
                }}
                rows={5}
                placeholder="Explique o que a empresa faz, como funciona sua operação e qual problema comercial ela resolve."
                style={inputStyle}
              />

              <FieldHelp>
                Escreva de forma objetiva. Este texto será usado
                como contexto oficial pelo Companion.
              </FieldHelp>
            </div>

            <div>
              <FieldLabel required>
                Público-alvo
              </FieldLabel>

              <textarea
                value={draft.target_audience}
                onChange={(event) => {
                  updateTextField(
                    'target_audience',
                    event.target.value,
                  )
                }}
                rows={4}
                placeholder="Exemplo: empresas com equipes comerciais que precisam organizar a prospecção e acompanhar a execução."
                style={inputStyle}
              />
            </div>

            <div>
              <FieldLabel required>
                Proposta de valor
              </FieldLabel>

              <textarea
                value={draft.value_proposition}
                onChange={(event) => {
                  updateTextField(
                    'value_proposition',
                    event.target.value,
                  )
                }}
                rows={4}
                placeholder="Explique qual transformação ou benefício principal a empresa entrega."
                style={inputStyle}
              />
            </div>
          </div>
        </section>

        <div
          style={{
            background: DS.border,
            height: 1,
            width: '100%',
          }}
        />

        <section>
          <SectionHeader
            eyebrow="Seção 2"
            title="Diretrizes do vendedor"
            description="Defina como o vendedor deve se comunicar e quais comportamentos o Companion deve incentivar ou bloquear."
          />

          <div
            style={{
              display: 'grid',
              gap: 16,
              gridTemplateColumns:
                'repeat(auto-fit, minmax(280px, 1fr))',
              marginTop: 18,
            }}
          >
            <div
              style={{
                gridColumn: '1 / -1',
              }}
            >
              <FieldLabel required>
                Tom de comunicação
              </FieldLabel>

              <textarea
                value={draft.communication_tone}
                onChange={(event) => {
                  updateTextField(
                    'communication_tone',
                    event.target.value,
                  )
                }}
                rows={3}
                placeholder="Exemplo: direto, consultivo, profissional, claro e sem pressão indevida."
                style={inputStyle}
              />

              <FieldHelp>
                Descreva o tom geral que deve aparecer nas
                orientações e mensagens sugeridas.
              </FieldHelp>
            </div>

            <div>
              <FieldLabel required>
                Comportamentos obrigatórios
              </FieldLabel>

              <textarea
                value={requiredBehaviorsText}
                onChange={(event) => {
                  setRequiredBehaviorsText(event.target.value)
                  setDirty(true)
                  setFeedback(null)
                }}
                rows={8}
                placeholder={
                  'Um comportamento por linha\n' +
                  'Responder claramente às perguntas do cliente\n' +
                  'Investigar a necessidade antes de oferecer'
                }
                style={inputStyle}
              />

              <FieldHelp>
                Coloque um comportamento por linha.
              </FieldHelp>
            </div>

            <div>
              <FieldLabel required>
                Comportamentos proibidos
              </FieldLabel>

              <textarea
                value={prohibitedBehaviorsText}
                onChange={(event) => {
                  setProhibitedBehaviorsText(
                    event.target.value,
                  )
                  setDirty(true)
                  setFeedback(null)
                }}
                rows={8}
                placeholder={
                  'Um comportamento por linha\n' +
                  'Inventar condições comerciais\n' +
                  'Prometer resultados que não podem ser garantidos'
                }
                style={inputStyle}
              />

              <FieldHelp>
                Coloque uma restrição por linha.
              </FieldHelp>
            </div>
          </div>
        </section>

        <div
          style={{
            background: DS.border,
            height: 1,
            width: '100%',
          }}
        />

<CommercialMethodStepsEditor
          key={`${draft.config_version_id ?? 'new'}:${
            workspace.draft?.version.updated_at ?? 'local'
          }`}
          value={{
            commercial_method_name:
              draft.commercial_method_name,
            commercial_method_description:
              draft.commercial_method_description,
            method_steps: draft.method_steps,
          }}
          onChange={updateMethodSection}
        />

        <div
          style={{
            background: DS.border,
            height: 1,
            width: '100%',
          }}
        />

        <CommercialProductProfilesEditor
          key={`${draft.config_version_id ?? 'new'}:${
            workspace.draft?.version.updated_at ?? 'local'
          }:products`}
          products={workspace.products}
          value={{
            product_profiles:
              draft.product_profiles,
          }}
          onChange={updateProductProfilesSection}
        />

        <div
          style={{
            background: DS.border,
            height: 1,
            width: '100%',
          }}
        />

        <CommercialFactsEditor
          key={`${draft.config_version_id ?? 'new'}:${
            workspace.draft?.version.updated_at ?? 'local'
          }:facts`}
          value={{
            facts: draft.facts,
          }}
          onChange={updateFactsSection}
        />

        <div
          style={{
            background: DS.border,
            height: 1,
            width: '100%',
          }}
        />

        <CommercialObjectionGuidesEditor
          key={`${draft.config_version_id ?? 'new'}:${
            workspace.draft?.version.updated_at ?? 'local'
          }:objections`}
          value={{
            objection_guides:
              draft.objection_guides,
          }}
          onChange={
            updateObjectionGuidesSection
          }
        />

        <div
          style={{
            background: 'rgba(34,197,94,0.06)',
            border:
              '1px solid rgba(134,239,172,0.15)',
            borderRadius: DS.radius,
            color: DS.textSecondary,
            fontSize: 11,
            lineHeight: 1.6,
            padding: '13px 15px',
          }}
        >
          <strong
            style={{
              color: DS.greenSoft,
            }}
          >
            Estrutura completa:
          </strong>{' '}
          contexto, diretrizes, método, produtos, fatos oficiais
          e tratamento de objeções já podem ser configurados no
          mesmo rascunho. O próximo bloco fará a validação final
          e conectará publicação, clonagem e exclusão.
        </div>
      </div>
    </div>
  )
}