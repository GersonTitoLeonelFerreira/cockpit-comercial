'use client'

import * as React from 'react'

import type {
  CommercialConfigDraftInput,
  CommercialMethodStepDraft,
} from '@/app/types/commercial-config'

type MethodSectionValue = Pick<
  CommercialConfigDraftInput,
  | 'commercial_method_name'
  | 'commercial_method_description'
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

  greenSoft: '#86efac',
  yellowSoft: '#fcd34d',
  redSoft: '#fca5a5',

  radius: 8,
  radiusContainer: 10,
} as const

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

function normalizeSteps(
  steps: CommercialMethodStepDraft[],
): CommercialMethodStepDraft[] {
  return steps.map((step, index) => ({
    ...step,
    step_order: index + 1,
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

export default function CommercialMethodStepsEditor({
  value,
  onChange,
}: Props) {
  const [criteriaTexts, setCriteriaTexts] =
    React.useState<string[]>(() =>
      value.method_steps.map((step) =>
        itemsToLines(step.completion_criteria),
      ),
    )

  const [questionTexts, setQuestionTexts] =
    React.useState<string[]>(() =>
      value.method_steps.map((step) =>
        itemsToLines(step.recommended_questions),
      ),
    )

  const updateMethodRoot = (
    field:
      | 'commercial_method_name'
      | 'commercial_method_description',
    nextValue: string,
  ) => {
    onChange({
      ...value,
      [field]: nextValue,
    })
  }

  const updateSteps = (
    steps: CommercialMethodStepDraft[],
  ) => {
    onChange({
      ...value,
      method_steps: normalizeSteps(steps),
    })
  }

  const updateStep = (
    index: number,
    patch: Partial<CommercialMethodStepDraft>,
  ) => {
    const nextSteps = value.method_steps.map(
      (step, stepIndex) =>
        stepIndex === index
          ? {
              ...step,
              ...patch,
            }
          : step,
    )

    updateSteps(nextSteps)
  }

  const addStep = () => {
    const nextStep: CommercialMethodStepDraft = {
      step_order: value.method_steps.length + 1,
      name: '',
      objective: '',
      completion_criteria: [],
      recommended_questions: [],
      is_required: true,
    }

    setCriteriaTexts((current) => [...current, ''])
    setQuestionTexts((current) => [...current, ''])

    updateSteps([...value.method_steps, nextStep])
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
      value.method_steps.filter(
        (_, stepIndex) => stepIndex !== index,
      ),
    )
  }

  const moveStep = (
    index: number,
    direction: -1 | 1,
  ) => {
    const destination = index + direction

    if (
      destination < 0 ||
      destination >= value.method_steps.length
    ) {
      return
    }

    setCriteriaTexts((current) =>
      moveItem(current, index, destination),
    )

    setQuestionTexts((current) =>
      moveItem(current, index, destination),
    )

    updateSteps(
      moveItem(
        value.method_steps,
        index,
        destination,
      ),
    )
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
          Defina a sequência que o vendedor deve seguir e quais
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
          <FieldLabel required>
            Nome do método
          </FieldLabel>

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
            style={{
              ...inputStyle,
              height: 42,
            }}
          />

          <FieldHelp>
            Use um nome curto e reconhecível pela equipe.
          </FieldHelp>
        </div>

        <div
          style={{
            gridColumn: '1 / -1',
          }}
        >
          <FieldLabel required>
            Descrição do método
          </FieldLabel>

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
            style={{
              ...inputStyle,
              resize: 'vertical',
            }}
          />
        </div>
      </div>

      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          justifyContent: 'space-between',
          marginTop: 24,
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
            Etapas do método
          </div>

          <div
            style={{
              color: DS.textMuted,
              fontSize: 10,
              lineHeight: 1.5,
              marginTop: 4,
            }}
          >
            A ordem definida aqui será a ordem considerada pelo
            Companion.
          </div>
        </div>

        <button
          type="button"
          onClick={addStep}
          style={{
            background: 'rgba(37,99,235,0.14)',
            border:
              '1px solid rgba(96,165,250,0.28)',
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

      {value.method_steps.length === 0 ? (
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
          {value.method_steps.map((step, index) => (
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
                      background:
                        'rgba(59,130,246,0.11)',
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
                    disabled={
                      index ===
                      value.method_steps.length - 1
                    }
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

                <div
                  style={{
                    gridColumn: '1 / -1',
                  }}
                >
                  <FieldLabel required>
                    Objetivo
                  </FieldLabel>

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

                  <textarea
                    value={criteriaTexts[index] ?? ''}
                    onChange={(event) => {
                      const text = event.target.value

                      setCriteriaTexts((current) =>
                        current.map(
                          (item, itemIndex) =>
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
                    style={{
                      ...inputStyle,
                      resize: 'vertical',
                    }}
                  />

                  <FieldHelp>
                    Coloque uma evidência objetiva por linha.
                  </FieldHelp>
                </div>

                <div>
                  <FieldLabel>
                    Perguntas recomendadas
                  </FieldLabel>

                  <textarea
                    value={questionTexts[index] ?? ''}
                    onChange={(event) => {
                      const text = event.target.value

                      setQuestionTexts((current) =>
                        current.map(
                          (item, itemIndex) =>
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
                    style={{
                      ...inputStyle,
                      resize: 'vertical',
                    }}
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
          border:
            '1px solid rgba(252,211,77,0.15)',
          borderRadius: DS.radius,
          color: DS.textSecondary,
          fontSize: 10,
          lineHeight: 1.6,
          marginTop: 16,
          padding: '11px 13px',
        }}
      >
        O rascunho aceita etapas incompletas. Na publicação, cada
        etapa deverá possuir nome, objetivo e pelo menos um
        critério de conclusão.
      </div>
    </section>
  )
}