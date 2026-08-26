'use client'

import * as React from 'react'

import type {
  CommercialConfigDraftInput,
  CommercialMethodStepDraft,
} from '@/app/types/commercial-config'

import {
  COMMERCIAL_METHOD_CONTRACT_VERSION,
  COMMERCIAL_METHOD_STAGE_REQUIREMENTS,
} from '@/app/lib/companion/commercial-method-contract'
import type {
  CommercialMethodDefinition,
  CommercialMethodDimension,
  CommercialMethodStageDefinition,
  CommercialMethodStageRequirement,
} from '@/app/lib/companion/commercial-method-contract'

type MethodSectionValue = Pick<
  CommercialConfigDraftInput,
  | 'commercial_method_name'
  | 'commercial_method_description'
  | 'commercial_method_definition'
  | 'method_steps'
>

interface Props {
  value: MethodSectionValue
  onChange: (value: MethodSectionValue) => void
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
  textLabel: '#4a5569',

  blue: '#3b82f6',
  blueSoft: '#93c5fd',

  purpleSoft: '#c4b5fd',

  greenSoft: '#86efac',
  yellowSoft: '#fcd34d',
  redSoft: '#fca5a5',

  radius: 8,
  radiusContainer: 10,
} as const

const REQUIREMENT_LABELS: Record<
  CommercialMethodStageRequirement,
  string
> = {
  required: 'Obrigatória',
  conditional: 'Condicional',
  optional: 'Opcional',
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
  width: '100%',
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

function slugify(value: string, fallback: string): string {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return normalized || fallback
}

function uniqueKey(
  candidate: string,
  taken: Set<string>,
): string {
  if (!taken.has(candidate)) {
    return candidate
  }

  let suffix = 2
  let next = `${candidate}_${suffix}`

  while (taken.has(next)) {
    suffix += 1
    next = `${candidate}_${suffix}`
  }

  return next
}

function normalizeSteps(
  steps: CommercialMethodStepDraft[],
): CommercialMethodStepDraft[] {
  return steps.map((step, index) => ({
    ...step,
    step_order: index + 1,
  }))
}

function normalizeStageOrders(
  stages: CommercialMethodStageDefinition[],
): CommercialMethodStageDefinition[] {
  return stages.map((stage, index) => ({
    ...stage,
    display_order: index + 1,
  }))
}

function moveItem<T>(
  items: T[],
  fromIndex: number,
  toIndex: number,
): T[] {
  if (
    toIndex < 0 ||
    toIndex >= items.length ||
    fromIndex === toIndex
  ) {
    return items
  }

  const nextItems = [...items]
  const [movedItem] = nextItems.splice(fromIndex, 1)

  nextItems.splice(toIndex, 0, movedItem)

  return nextItems
}

function createEmptyStage(
  order: number,
): CommercialMethodStageDefinition {
  return {
    key: `etapa_${order}`,
    display_order: order,
    name: '',
    objective: '',
    requirement: 'required',
    completion_criteria: [],
    partial_completion_criteria: [],
    skip_conditions: [],
    recommended_questions: [],
    common_mistakes: [],
    deepen_when: [],
    sufficient_when: [],
    advance_when: [],
    wait_when: [],
    stop_asking_when: [],
    dimensions: [],
  }
}

function createEmptyDimension(
  order: number,
): CommercialMethodDimension {
  return {
    key: `dimensao_${order}`,
    name: '',
    objective: '',
    evidence_criteria: [],
  }
}

/**
 * Ativar o modo estruturado nunca deve inventar semântica comercial.
 * Apenas os nomes/objetivos/critérios já digitados pela própria empresa
 * (nas etapas legadas) são transportados; todo campo exclusivo do V2
 * começa vazio para que a empresa o defina.
 */
function buildDefinitionFromLegacySteps(
  name: string,
  description: string,
  steps: CommercialMethodStepDraft[],
): CommercialMethodDefinition {
  const usedKeys = new Set<string>()

  const stages =
    steps.length > 0
      ? steps.map((step, index) => {
          const key = uniqueKey(
            slugify(step.name, `etapa_${index + 1}`),
            usedKeys,
          )

          usedKeys.add(key)

          return {
            ...createEmptyStage(index + 1),
            key,
            name: step.name,
            objective: step.objective,
            requirement: (step.is_required
              ? 'required'
              : 'optional') as CommercialMethodStageRequirement,
            completion_criteria: [
              ...step.completion_criteria,
            ],
            recommended_questions: [
              ...step.recommended_questions,
            ],
          }
        })
      : [createEmptyStage(1)]

  return {
    contract_version: COMMERCIAL_METHOD_CONTRACT_VERSION,
    name,
    description,
    principles: [],
    stages,
  }
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

function SmallButton({
  children,
  onClick,
  disabled = false,
  danger = false,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        background: danger
          ? 'rgba(239,68,68,0.07)'
          : DS.surfaceBg,
        border: `1px solid ${
          danger
            ? 'rgba(252,165,165,0.18)'
            : DS.borderStrong
        }`,
        borderRadius: 7,
        color: disabled
          ? DS.textMuted
          : danger
            ? DS.redSoft
            : DS.textSecondary,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 10,
        fontWeight: 750,
        padding: '7px 9px',
      }}
    >
      {children}
    </button>
  )
}

function ListTextarea({
  text,
  onTextChange,
  rows = 4,
  placeholder,
}: {
  text: string
  onTextChange: (text: string) => void
  rows?: number
  placeholder?: string
}) {
  return (
    <textarea
      value={text}
      onChange={(event) => {
        onTextChange(event.target.value)
      }}
      rows={rows}
      placeholder={placeholder}
      style={{
        ...inputStyle,
        resize: 'vertical',
      }}
    />
  )
}

// ============================================================================
// Seção legada (V1): lista simples de etapas.
// ============================================================================

function LegacyStepsSection({
  steps,
  onChange,
}: {
  steps: CommercialMethodStepDraft[]
  onChange: (steps: CommercialMethodStepDraft[]) => void
}) {
  const [criteriaTexts, setCriteriaTexts] =
    React.useState<string[]>(() =>
      steps.map((step) =>
        itemsToLines(step.completion_criteria),
      ),
    )

  const [questionTexts, setQuestionTexts] =
    React.useState<string[]>(() =>
      steps.map((step) =>
        itemsToLines(step.recommended_questions),
      ),
    )

  const updateSteps = (
    nextSteps: CommercialMethodStepDraft[],
  ) => {
    onChange(normalizeSteps(nextSteps))
  }

  const updateStep = (
    index: number,
    patch: Partial<CommercialMethodStepDraft>,
  ) => {
    updateSteps(
      steps.map((step, stepIndex) =>
        stepIndex === index
          ? { ...step, ...patch }
          : step,
      ),
    )
  }

  const addStep = () => {
    const nextStep: CommercialMethodStepDraft = {
      step_order: steps.length + 1,
      name: '',
      objective: '',
      completion_criteria: [],
      recommended_questions: [],
      is_required: true,
    }

    setCriteriaTexts((current) => [...current, ''])
    setQuestionTexts((current) => [...current, ''])

    updateSteps([...steps, nextStep])
  }

  const removeStep = (index: number) => {
    setCriteriaTexts((current) =>
      current.filter(
        (_, itemIndex) => itemIndex !== index,
      ),
    )

    setQuestionTexts((current) =>
      current.filter(
        (_, itemIndex) => itemIndex !== index,
      ),
    )

    updateSteps(
      steps.filter(
        (_, stepIndex) => stepIndex !== index,
      ),
    )
  }

  const moveStep = (index: number, direction: -1 | 1) => {
    const destination = index + direction

    if (destination < 0 || destination >= steps.length) {
      return
    }

    setCriteriaTexts((current) =>
      moveItem(current, index, destination),
    )

    setQuestionTexts((current) =>
      moveItem(current, index, destination),
    )

    updateSteps(moveItem(steps, index, destination))
  }

  return (
    <div>
      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div
            style={{
              color: DS.textPrimary,
              fontSize: 13,
              fontWeight: 850,
            }}
          >
            Etapas legadas (V1)
          </div>

          <div
            style={{
              color: DS.textMuted,
              fontSize: 10,
              lineHeight: 1.5,
              marginTop: 4,
              maxWidth: 620,
            }}
          >
            Lista simples de nome, objetivo e critério de
            conclusão. Quando existir uma definição
            estruturada (V2) ativa, o Companion prioriza a
            V2 e usa esta lista apenas como registro de
            apoio.
          </div>
        </div>

        <button
          type="button"
          onClick={addStep}
          style={{
            background: 'rgba(37,99,235,0.14)',
            border: '1px solid rgba(96,165,250,0.28)',
            borderRadius: DS.radius,
            color: DS.blueSoft,
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 850,
            padding: '9px 12px',
          }}
        >
          Adicionar etapa
        </button>
      </div>

      {steps.length === 0 ? (
        <div
          style={{
            background: DS.surfaceBg,
            border: `1px dashed ${DS.borderStrong}`,
            borderRadius: DS.radiusContainer,
            color: DS.textMuted,
            fontSize: 11,
            lineHeight: 1.6,
            marginTop: 14,
            padding: '22px 18px',
            textAlign: 'center',
          }}
        >
          Nenhuma etapa cadastrada. Adicione a primeira etapa
          para estruturar o método comercial.
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            marginTop: 14,
          }}
        >
          {steps.map((step, index) => (
            <div
              key={step.id ?? `method-step-${index}`}
              style={{
                background: DS.surfaceRaised,
                border: `1px solid ${DS.border}`,
                borderRadius: DS.radiusContainer,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  alignItems: 'center',
                  background: DS.surfaceBg,
                  borderBottom: `1px solid ${DS.border}`,
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 10,
                  justifyContent: 'space-between',
                  padding: '12px 14px',
                }}
              >
                <div
                  style={{
                    alignItems: 'center',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 9,
                  }}
                >
                  <span
                    style={{
                      alignItems: 'center',
                      background: 'rgba(59,130,246,0.11)',
                      border:
                        '1px solid rgba(96,165,250,0.2)',
                      borderRadius: 999,
                      color: DS.blueSoft,
                      display: 'inline-flex',
                      fontSize: 10,
                      fontWeight: 900,
                      height: 25,
                      justifyContent: 'center',
                      minWidth: 25,
                      padding: '0 8px',
                    }}
                  >
                    {index + 1}
                  </span>

                  <span
                    style={{
                      color: DS.textPrimary,
                      fontSize: 12,
                      fontWeight: 850,
                    }}
                  >
                    {step.name.trim() ||
                      `Etapa ${index + 1}`}
                  </span>

                  <button
                    type="button"
                    onClick={() => {
                      updateStep(index, {
                        is_required: !step.is_required,
                      })
                    }}
                    style={{
                      background: step.is_required
                        ? 'rgba(34,197,94,0.08)'
                        : 'rgba(143,163,188,0.07)',
                      border: `1px solid ${
                        step.is_required
                          ? 'rgba(134,239,172,0.18)'
                          : 'rgba(143,163,188,0.16)'
                      }`,
                      borderRadius: 999,
                      color: step.is_required
                        ? DS.greenSoft
                        : DS.textSecondary,
                      cursor: 'pointer',
                      fontSize: 9,
                      fontWeight: 850,
                      letterSpacing: '0.05em',
                      padding: '5px 8px',
                      textTransform: 'uppercase',
                    }}
                  >
                    {step.is_required
                      ? 'Obrigatória'
                      : 'Opcional'}
                  </button>
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 6,
                  }}
                >
                  <SmallButton
                    disabled={index === 0}
                    onClick={() => {
                      moveStep(index, -1)
                    }}
                  >
                    Subir
                  </SmallButton>

                  <SmallButton
                    disabled={index === steps.length - 1}
                    onClick={() => {
                      moveStep(index, 1)
                    }}
                  >
                    Descer
                  </SmallButton>

                  <SmallButton
                    danger
                    onClick={() => {
                      removeStep(index)
                    }}
                  >
                    Excluir
                  </SmallButton>
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gap: 15,
                  gridTemplateColumns:
                    'repeat(auto-fit, minmax(260px, 1fr))',
                  padding: 15,
                }}
              >
                <div>
                  <FieldLabel required>
                    Nome da etapa
                  </FieldLabel>

                  <input
                    type="text"
                    value={step.name}
                    onChange={(event) => {
                      updateStep(index, {
                        name: event.target.value,
                      })
                    }}
                    placeholder="Exemplo: Diagnóstico da necessidade"
                    style={{
                      ...inputStyle,
                      height: 42,
                    }}
                  />
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <FieldLabel required>Objetivo</FieldLabel>

                  <textarea
                    value={step.objective}
                    onChange={(event) => {
                      updateStep(index, {
                        objective: event.target.value,
                      })
                    }}
                    rows={3}
                    placeholder="Explique o que o vendedor precisa compreender ou realizar nesta etapa."
                    style={{
                      ...inputStyle,
                      resize: 'vertical',
                    }}
                  />
                </div>

                <div>
                  <FieldLabel required>
                    Critérios de conclusão
                  </FieldLabel>

                  <ListTextarea
                    text={criteriaTexts[index] ?? ''}
                    onTextChange={(text) => {
                      setCriteriaTexts((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? text
                            : item,
                        ),
                      )

                      updateStep(index, {
                        completion_criteria:
                          linesToItems(text),
                      })
                    }}
                    rows={6}
                    placeholder={
                      'Um critério por linha\n' +
                      'Necessidade principal identificada\n' +
                      'Impacto do problema compreendido'
                    }
                  />

                  <FieldHelp>
                    Coloque uma evidência objetiva por linha.
                  </FieldHelp>
                </div>

                <div>
                  <FieldLabel>
                    Perguntas recomendadas
                  </FieldLabel>

                  <ListTextarea
                    text={questionTexts[index] ?? ''}
                    onTextChange={(text) => {
                      setQuestionTexts((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? text
                            : item,
                        ),
                      )

                      updateStep(index, {
                        recommended_questions:
                          linesToItems(text),
                      })
                    }}
                    rows={6}
                    placeholder={
                      'Uma pergunta por linha\n' +
                      'Como vocês controlam os leads hoje?\n' +
                      'Onde a operação mais perde oportunidades?'
                    }
                  />

                  <FieldHelp>
                    São referências, não um roteiro rígido.
                  </FieldHelp>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          background: 'rgba(245,158,11,0.06)',
          border: '1px solid rgba(252,211,77,0.15)',
          borderRadius: DS.radius,
          color: DS.textSecondary,
          fontSize: 10,
          lineHeight: 1.6,
          marginTop: 16,
          padding: '11px 13px',
        }}
      >
        O rascunho aceita etapas incompletas. Na publicação,
        cada etapa deverá possuir nome, objetivo e pelo menos
        um critério de conclusão.
      </div>
    </div>
  )
}

// ============================================================================
// Seção estruturada (V2): princípios + etapas semânticas.
// ============================================================================

type StageListField = Extract<
  keyof CommercialMethodStageDefinition,
  | 'completion_criteria'
  | 'partial_completion_criteria'
  | 'skip_conditions'
  | 'recommended_questions'
  | 'common_mistakes'
  | 'deepen_when'
  | 'sufficient_when'
  | 'advance_when'
  | 'wait_when'
  | 'stop_asking_when'
>

function DimensionCard({
  dimension,
  onChange,
  onRemove,
}: {
  dimension: CommercialMethodDimension
  onChange: (patch: Partial<CommercialMethodDimension>) => void
  onRemove: () => void
}) {
  const [evidenceText, setEvidenceText] = React.useState(
    () => itemsToLines(dimension.evidence_criteria),
  )

  return (
    <div
      style={{
        background: DS.surfaceBg,
        border: `1px solid ${DS.border}`,
        borderRadius: DS.radius,
        padding: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: 10,
          justifyContent: 'space-between',
        }}
      >
        <input
          type="text"
          value={dimension.name}
          onChange={(event) => {
            onChange({ name: event.target.value })
          }}
          placeholder="Nome da dimensão (ex: Contexto)"
          style={{ ...inputStyle, height: 38 }}
        />

        <SmallButton danger onClick={onRemove}>
          Remover
        </SmallButton>
      </div>

      <div style={{ marginTop: 10 }}>
        <input
          type="text"
          value={dimension.objective}
          onChange={(event) => {
            onChange({ objective: event.target.value })
          }}
          placeholder="Objetivo desta dimensão dentro da etapa"
          style={{ ...inputStyle, height: 38 }}
        />
      </div>

      <div style={{ marginTop: 10 }}>
        <FieldLabel required>
          Critérios de evidência
        </FieldLabel>

        <ListTextarea
          text={evidenceText}
          onTextChange={(text) => {
            setEvidenceText(text)
            onChange({
              evidence_criteria: linesToItems(text),
            })
          }}
          rows={3}
          placeholder="Uma evidência por linha"
        />
      </div>
    </div>
  )
}

function StageCard({
  stage,
  index,
  isFirst,
  isLast,
  onChange,
  onRemove,
  onMove,
}: {
  stage: CommercialMethodStageDefinition
  index: number
  isFirst: boolean
  isLast: boolean
  onChange: (
    patch: Partial<CommercialMethodStageDefinition>,
  ) => void
  onRemove: () => void
  onMove: (direction: -1 | 1) => void
}) {
  const [fieldTexts, setFieldTexts] = React.useState<
    Partial<Record<StageListField, string>>
  >({})

  const listFieldText = (field: StageListField): string =>
    fieldTexts[field] ?? itemsToLines(stage[field])

  const setListField = (
    field: StageListField,
    text: string,
  ) => {
    setFieldTexts((current) => ({
      ...current,
      [field]: text,
    }))

    onChange({ [field]: linesToItems(text) } as Partial<
      CommercialMethodStageDefinition
    >)
  }

  const updateDimension = (
    dimensionIndex: number,
    patch: Partial<CommercialMethodDimension>,
  ) => {
    onChange({
      dimensions: stage.dimensions.map(
        (dimension, itemIndex) =>
          itemIndex === dimensionIndex
            ? { ...dimension, ...patch }
            : dimension,
      ),
    })
  }

  const addDimension = () => {
    onChange({
      dimensions: [
        ...stage.dimensions,
        createEmptyDimension(
          stage.dimensions.length + 1,
        ),
      ],
    })
  }

  const removeDimension = (dimensionIndex: number) => {
    onChange({
      dimensions: stage.dimensions.filter(
        (_, itemIndex) => itemIndex !== dimensionIndex,
      ),
    })
  }

  return (
    <div
      style={{
        background: DS.surfaceRaised,
        border: `1px solid ${DS.border}`,
        borderRadius: DS.radiusContainer,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          alignItems: 'center',
          background: DS.surfaceBg,
          borderBottom: `1px solid ${DS.border}`,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          justifyContent: 'space-between',
          padding: '12px 14px',
        }}
      >
        <div
          style={{
            alignItems: 'center',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 9,
          }}
        >
          <span
            style={{
              alignItems: 'center',
              background: 'rgba(167,139,250,0.13)',
              border: '1px solid rgba(196,181,253,0.25)',
              borderRadius: 999,
              color: DS.purpleSoft,
              display: 'inline-flex',
              fontSize: 10,
              fontWeight: 900,
              height: 25,
              justifyContent: 'center',
              minWidth: 25,
              padding: '0 8px',
            }}
          >
            {index + 1}
          </span>

          <span
            style={{
              color: DS.textPrimary,
              fontSize: 12,
              fontWeight: 850,
            }}
          >
            {stage.name.trim() || `Etapa ${index + 1}`}
          </span>

          <select
            value={stage.requirement}
            onChange={(event) => {
              const requirement = event.target
                .value as CommercialMethodStageRequirement

              onChange({
                requirement,
                skip_conditions:
                  requirement === 'required'
                    ? []
                    : stage.skip_conditions,
              })
            }}
            style={{
              background: DS.surfaceBg,
              border: `1px solid ${DS.borderStrong}`,
              borderRadius: 999,
              color: DS.textSecondary,
              fontSize: 9,
              fontWeight: 850,
              letterSpacing: '0.05em',
              padding: '5px 8px',
              textTransform: 'uppercase',
            }}
          >
            {COMMERCIAL_METHOD_STAGE_REQUIREMENTS.map(
              (requirement) => (
                <option key={requirement} value={requirement}>
                  {REQUIREMENT_LABELS[requirement]}
                </option>
              ),
            )}
          </select>
        </div>

        <div
          style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}
        >
          <SmallButton
            disabled={isFirst}
            onClick={() => {
              onMove(-1)
            }}
          >
            Subir
          </SmallButton>

          <SmallButton
            disabled={isLast}
            onClick={() => {
              onMove(1)
            }}
          >
            Descer
          </SmallButton>

          <SmallButton danger onClick={onRemove}>
            Excluir
          </SmallButton>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gap: 15,
          gridTemplateColumns:
            'repeat(auto-fit, minmax(260px, 1fr))',
          padding: 15,
        }}
      >
        <div>
          <FieldLabel required>Nome da etapa</FieldLabel>

          <input
            type="text"
            value={stage.name}
            onChange={(event) => {
              onChange({ name: event.target.value })
            }}
            placeholder="Exemplo: Acolher"
            style={{ ...inputStyle, height: 42 }}
          />
        </div>

        <div>
          <FieldLabel required>
            Chave interna
          </FieldLabel>

          <input
            type="text"
            value={stage.key}
            onChange={(event) => {
              onChange({
                key: event.target.value
                  .toLocaleLowerCase('pt-BR')
                  .replace(/[^a-z0-9_]+/g, '_'),
              })
            }}
            placeholder="acolher"
            style={{ ...inputStyle, height: 42 }}
          />

          <FieldHelp>
            Letras minúsculas, números e underscore. Usada
            internamente pelo Companion para identificar a
            etapa.
          </FieldHelp>
        </div>

        <div style={{ gridColumn: '1 / -1' }}>
          <FieldLabel required>Objetivo</FieldLabel>

          <textarea
            value={stage.objective}
            onChange={(event) => {
              onChange({ objective: event.target.value })
            }}
            rows={3}
            placeholder="O que esta etapa precisa alcançar comercialmente."
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>

        <div>
          <FieldLabel required>
            Critérios de conclusão
          </FieldLabel>

          <ListTextarea
            text={listFieldText('completion_criteria')}
            onTextChange={(text) => {
              setListField('completion_criteria', text)
            }}
            placeholder="Uma evidência de conclusão por linha"
          />

          <FieldHelp>
            Evidências que já podem existir na conversa, sem
            precisar de uma pergunta específica do vendedor.
          </FieldHelp>
        </div>

        <div>
          <FieldLabel>
            Critérios de conclusão parcial
          </FieldLabel>

          <ListTextarea
            text={listFieldText(
              'partial_completion_criteria',
            )}
            onTextChange={(text) => {
              setListField(
                'partial_completion_criteria',
                text,
              )
            }}
            placeholder="Evidências de progresso real, ainda não suficiente"
          />
        </div>

        <div>
          <FieldLabel required>
            Quando já é suficiente
          </FieldLabel>

          <ListTextarea
            text={listFieldText('sufficient_when')}
            onTextChange={(text) => {
              setListField('sufficient_when', text)
            }}
            placeholder="Condição que impede investigação infinita"
          />
        </div>

        <div>
          <FieldLabel required>
            Quando parar de perguntar
          </FieldLabel>

          <ListTextarea
            text={listFieldText('stop_asking_when')}
            onTextChange={(text) => {
              setListField('stop_asking_when', text)
            }}
            placeholder="Situação em que uma nova pergunta deixa de agregar"
          />
        </div>

        <div>
          <FieldLabel>Quando aprofundar</FieldLabel>

          <ListTextarea
            text={listFieldText('deepen_when')}
            onTextChange={(text) => {
              setListField('deepen_when', text)
            }}
            placeholder="Situação que justifica continuar investigando"
          />
        </div>

        <div>
          <FieldLabel>Quando avançar</FieldLabel>

          <ListTextarea
            text={listFieldText('advance_when')}
            onTextChange={(text) => {
              setListField('advance_when', text)
            }}
            placeholder="Condição comercial que autoriza avançar"
          />
        </div>

        <div>
          <FieldLabel>Quando esperar</FieldLabel>

          <ListTextarea
            text={listFieldText('wait_when')}
            onTextChange={(text) => {
              setListField('wait_when', text)
            }}
            placeholder="Situação em que esperar é a decisão comercial correta"
          />
        </div>

        {stage.requirement !== 'required' && (
          <div>
            <FieldLabel
              required={stage.requirement === 'conditional'}
            >
              Condições para pular a etapa
            </FieldLabel>

            <ListTextarea
              text={listFieldText('skip_conditions')}
              onTextChange={(text) => {
                setListField('skip_conditions', text)
              }}
              placeholder="Condição comercial na qual esta etapa pode ser pulada"
            />

            {stage.requirement === 'conditional' && (
              <FieldHelp>
                Etapas condicionais precisam declarar quando
                podem ser puladas.
              </FieldHelp>
            )}
          </div>
        )}

        <div>
          <FieldLabel>Perguntas recomendadas</FieldLabel>

          <ListTextarea
            text={listFieldText('recommended_questions')}
            onTextChange={(text) => {
              setListField('recommended_questions', text)
            }}
            placeholder="Referências de investigação, não um roteiro obrigatório"
          />
        </div>

        <div>
          <FieldLabel>Erros comuns</FieldLabel>

          <ListTextarea
            text={listFieldText('common_mistakes')}
            onTextChange={(text) => {
              setListField('common_mistakes', text)
            }}
            placeholder="Erro que descaracteriza esta etapa"
          />
        </div>
      </div>

      <div
        style={{
          borderTop: `1px solid ${DS.border}`,
          padding: 15,
        }}
      >
        <div
          style={{
            alignItems: 'center',
            display: 'flex',
            gap: 10,
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div
              style={{
                color: DS.textSecondary,
                fontSize: 11,
                fontWeight: 850,
              }}
            >
              Dimensões internas (opcional/avançado)
            </div>

            <FieldHelp>
              Lentes internas de leitura desta etapa, não
              subetapas obrigatórias.
            </FieldHelp>
          </div>

          <SmallButton onClick={addDimension}>
            Adicionar dimensão
          </SmallButton>
        </div>

        {stage.dimensions.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              marginTop: 12,
            }}
          >
            {stage.dimensions.map((dimension, dimensionIndex) => (
              <DimensionCard
                key={dimensionIndex}
                dimension={dimension}
                onChange={(patch) => {
                  updateDimension(dimensionIndex, patch)
                }}
                onRemove={() => {
                  removeDimension(dimensionIndex)
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StructuredMethodSection({
  definition,
  onChange,
}: {
  definition: CommercialMethodDefinition
  onChange: (definition: CommercialMethodDefinition) => void
}) {
  const [principlesText, setPrinciplesText] = React.useState(
    () => itemsToLines(definition.principles),
  )

  const updateStages = (
    stages: CommercialMethodStageDefinition[],
  ) => {
    onChange({
      ...definition,
      stages: normalizeStageOrders(stages),
    })
  }

  const addStage = () => {
    updateStages([
      ...definition.stages,
      createEmptyStage(definition.stages.length + 1),
    ])
  }

  return (
    <div>
      <div>
        <FieldLabel required>Princípios do método</FieldLabel>

        <ListTextarea
          text={principlesText}
          onTextChange={(text) => {
            setPrinciplesText(text)
            onChange({
              ...definition,
              principles: linesToItems(text),
            })
          }}
          rows={4}
          placeholder={
            'Um princípio de raciocínio comercial por linha\n' +
            'Responder ao que o cliente realmente precisa antes de tentar avançar'
          }
        />

        <FieldHelp>
          Regras vinculantes que valem para todas as etapas,
          independentemente da ordem em que forem aplicadas.
        </FieldHelp>
      </div>

      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          justifyContent: 'space-between',
          marginTop: 22,
        }}
      >
        <div>
          <div
            style={{
              color: DS.textPrimary,
              fontSize: 13,
              fontWeight: 850,
            }}
          >
            Etapas estruturadas (V2)
          </div>

          <div
            style={{
              color: DS.textMuted,
              fontSize: 10,
              lineHeight: 1.5,
              marginTop: 4,
              maxWidth: 620,
            }}
          >
            A ordem é referência de leitura, não uma sequência
            mecânica obrigatória.
          </div>
        </div>

        <button
          type="button"
          onClick={addStage}
          style={{
            background: 'rgba(167,139,250,0.14)',
            border: '1px solid rgba(196,181,253,0.3)',
            borderRadius: DS.radius,
            color: DS.purpleSoft,
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 850,
            padding: '9px 12px',
          }}
        >
          Adicionar etapa
        </button>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          marginTop: 14,
        }}
      >
        {definition.stages.map((stage, index) => (
          <StageCard
            key={index}
            stage={stage}
            index={index}
            isFirst={index === 0}
            isLast={index === definition.stages.length - 1}
            onChange={(patch) => {
              updateStages(
                definition.stages.map(
                  (item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, ...patch }
                      : item,
                ),
              )
            }}
            onRemove={() => {
              updateStages(
                definition.stages.filter(
                  (_, itemIndex) => itemIndex !== index,
                ),
              )
            }}
            onMove={(direction) => {
              updateStages(
                moveItem(
                  definition.stages,
                  index,
                  index + direction,
                ),
              )
            }}
          />
        ))}
      </div>

      <div
        style={{
          background: 'rgba(167,139,250,0.07)',
          border: '1px solid rgba(196,181,253,0.18)',
          borderRadius: DS.radius,
          color: DS.textSecondary,
          fontSize: 10,
          lineHeight: 1.6,
          marginTop: 16,
          padding: '11px 13px',
        }}
      >
        A empresa é responsável por definir o significado
        comercial de cada etapa (objetivo, critérios,
        aprofundamento e avanço). O Companion nunca completa
        esses campos por conta própria — enquanto ficarem
        vazios, a orientação permanece ancorada apenas nos
        fatos do resumo do lead.
      </div>
    </div>
  )
}

export default function CommercialMethodStepsEditor({
  value,
  onChange,
}: Props) {
  const definition = value.commercial_method_definition

  const updateMethodRoot = (
    field:
      | 'commercial_method_name'
      | 'commercial_method_description',
    nextValue: string,
  ) => {
    onChange({
      ...value,
      [field]: nextValue,
      commercial_method_definition: definition
        ? {
            ...definition,
            name:
              field === 'commercial_method_name'
                ? nextValue
                : definition.name,
            description:
              field === 'commercial_method_description'
                ? nextValue
                : definition.description,
          }
        : definition,
    })
  }

  const enableStructuredMode = () => {
    if (definition) {
      return
    }

    onChange({
      ...value,
      commercial_method_definition:
        buildDefinitionFromLegacySteps(
          value.commercial_method_name,
          value.commercial_method_description,
          value.method_steps,
        ),
    })
  }

  const disableStructuredMode = () => {
    if (!definition) {
      return
    }

    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        'Voltar para o modo simples remove a definição ' +
          'estruturada (V2) deste rascunho. As etapas legadas ' +
          'abaixo continuam preservadas. Deseja continuar?',
      )
    ) {
      return
    }

    onChange({
      ...value,
      commercial_method_definition: null,
    })
  }

  return (
    <section>
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
          Seção 3
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
          Método comercial
        </div>

        <div
          style={{
            color: DS.textSecondary,
            fontSize: 11,
            lineHeight: 1.6,
            marginTop: 6,
            maxWidth: 760,
          }}
        >
          Defina a lógica que o vendedor deve seguir e quais
          evidências comprovam que cada etapa realmente foi
          concluída.
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gap: 16,
          gridTemplateColumns:
            'repeat(auto-fit, minmax(280px, 1fr))',
          marginTop: 18,
        }}
      >
        <div>
          <FieldLabel required>Nome do método</FieldLabel>

          <input
            type="text"
            value={value.commercial_method_name}
            onChange={(event) => {
              updateMethodRoot(
                'commercial_method_name',
                event.target.value,
              )
            }}
            placeholder="Exemplo: Diagnóstico Consultivo Yolen"
            style={{ ...inputStyle, height: 42 }}
          />

          <FieldHelp>
            Use um nome curto e reconhecível pela equipe.
          </FieldHelp>
        </div>

        <div style={{ gridColumn: '1 / -1' }}>
          <FieldLabel required>Descrição do método</FieldLabel>

          <textarea
            value={value.commercial_method_description}
            onChange={(event) => {
              updateMethodRoot(
                'commercial_method_description',
                event.target.value,
              )
            }}
            rows={4}
            placeholder="Explique a lógica do método, como ele deve conduzir a negociação e qual comportamento se espera do vendedor."
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>
      </div>

      <div
        style={{
          alignItems: 'center',
          background: definition
            ? 'rgba(167,139,250,0.08)'
            : DS.surfaceBg,
          border: `1px solid ${
            definition
              ? 'rgba(196,181,253,0.22)'
              : DS.borderStrong
          }`,
          borderRadius: DS.radiusContainer,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          justifyContent: 'space-between',
          marginTop: 22,
          padding: '13px 15px',
        }}
      >
        <div>
          <div
            style={{
              color: definition
                ? DS.purpleSoft
                : DS.textPrimary,
              fontSize: 12,
              fontWeight: 850,
            }}
          >
            {definition
              ? 'Definição estruturada (V2) ativa'
              : 'Modo simples (V1)'}
          </div>

          <div
            style={{
              color: DS.textMuted,
              fontSize: 10,
              lineHeight: 1.5,
              marginTop: 4,
              maxWidth: 560,
            }}
          >
            {definition
              ? 'O Companion usa princípios e etapas semânticas abaixo para orientar o vendedor.'
              : 'Ative o modo estruturado para descrever objetivo, critérios de conclusão, quando aprofundar, avançar ou esperar em cada etapa.'}
          </div>
        </div>

        <button
          type="button"
          onClick={
            definition
              ? disableStructuredMode
              : enableStructuredMode
          }
          style={{
            background: definition
              ? 'rgba(239,68,68,0.07)'
              : 'rgba(167,139,250,0.14)',
            border: `1px solid ${
              definition
                ? 'rgba(252,165,165,0.18)'
                : 'rgba(196,181,253,0.3)'
            }`,
            borderRadius: DS.radius,
            color: definition ? DS.redSoft : DS.purpleSoft,
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 850,
            padding: '9px 12px',
          }}
        >
          {definition
            ? 'Voltar para modo simples'
            : 'Ativar definição estruturada (V2)'}
        </button>
      </div>

      {definition && (
        <div style={{ marginTop: 20 }}>
          <StructuredMethodSection
            definition={definition}
            onChange={(nextDefinition) => {
              onChange({
                ...value,
                commercial_method_definition:
                  nextDefinition,
              })
            }}
          />
        </div>
      )}

      <div
        style={{
          background: DS.border,
          height: 1,
          margin: '24px 0',
          width: '100%',
        }}
      />

      <LegacyStepsSection
        steps={value.method_steps}
        onChange={(steps) => {
          onChange({ ...value, method_steps: steps })
        }}
      />
    </section>
  )
}
