'use client'

import * as React from 'react'

import type {
  CommercialConfigDraftInput,
  CommercialObjectionGuideDraft,
} from '@/app/types/commercial-config'

type ObjectionGuidesSectionValue = Pick<
  CommercialConfigDraftInput,
  'objection_guides'
>

type NewGuideState = {
  objection: string
  signals: string
  discovery_questions: string
  recommended_approach: string
  response_limits: string
  is_active: boolean
}

interface Props {
  value: ObjectionGuidesSectionValue
  onChange: (
    value: ObjectionGuidesSectionValue,
  ) => void
}

const DS = {
  surfaceBg: '#111318',
  surfaceRaised: '#171a25',

  border: '#1a1d2e',
  borderStrong: '#252a3d',

  textPrimary: '#edf2f7',
  textSecondary: '#8fa3bc',
  textMuted: '#546070',
  textLabel: '#4a5569',

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
  fontSize: 12,
  lineHeight: 1.55,
  outline: 'none',
  padding: '10px 11px',
  width: '100%',
}

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: 'vertical',
}

function createEmptyNewGuide(): NewGuideState {
  return {
    objection: '',
    signals: '',
    discovery_questions: '',
    recommended_approach: '',
    response_limits: '',
    is_active: true,
  }
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

function normalizeGuides(
  guides: CommercialObjectionGuideDraft[],
): CommercialObjectionGuideDraft[] {
  return guides.map((guide, index) => ({
    ...guide,
    sort_order: index + 1,
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

function isGuideComplete(
  guide: Pick<
    CommercialObjectionGuideDraft,
    'objection' | 'recommended_approach'
  >,
): boolean {
  return Boolean(
    guide.objection.trim() &&
      guide.recommended_approach.trim(),
  )
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
        fontSize: 9,
        fontWeight: 850,
        letterSpacing: '0.07em',
        marginBottom: 6,
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
        fontSize: 9,
        lineHeight: 1.5,
        marginTop: 6,
      }}
    >
      {children}
    </div>
  )
}

function ActiveBadge({
  active,
}: {
  active: boolean
}) {
  return (
    <span
      style={{
        background: active
          ? 'rgba(34,197,94,0.08)'
          : 'rgba(143,163,188,0.07)',
        border: `1px solid ${
          active
            ? 'rgba(134,239,172,0.18)'
            : 'rgba(143,163,188,0.16)'
        }`,
        borderRadius: 999,
        color: active
          ? DS.greenSoft
          : DS.textSecondary,
        fontSize: 9,
        fontWeight: 850,
        letterSpacing: '0.05em',
        padding: '5px 8px',
        textTransform: 'uppercase',
      }}
    >
      {active ? 'Ativo' : 'Inativo'}
    </span>
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
          : DS.surfaceRaised,
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
        cursor: disabled
          ? 'not-allowed'
          : 'pointer',
        fontSize: 10,
        fontWeight: 800,
        padding: '7px 9px',
      }}
    >
      {children}
    </button>
  )
}

export default function CommercialObjectionGuidesEditor({
  value,
  onChange,
}: Props) {
  const [newGuide, setNewGuide] =
    React.useState<NewGuideState>(
      createEmptyNewGuide,
    )

  const [addError, setAddError] =
    React.useState<string | null>(null)

  const [signalsTexts, setSignalsTexts] =
    React.useState<string[]>(() =>
      value.objection_guides.map((guide) =>
        itemsToLines(guide.signals),
      ),
    )

  const [questionTexts, setQuestionTexts] =
    React.useState<string[]>(() =>
      value.objection_guides.map((guide) =>
        itemsToLines(
          guide.discovery_questions,
        ),
      ),
    )

  const [limitTexts, setLimitTexts] =
    React.useState<string[]>(() =>
      value.objection_guides.map((guide) =>
        itemsToLines(guide.response_limits),
      ),
    )

  const activeGuides =
    value.objection_guides.filter(
      (guide) => guide.is_active,
    ).length

  const incompleteGuides =
    value.objection_guides.filter(
      (guide) => !isGuideComplete(guide),
    ).length

  const canAddGuide = Boolean(
    newGuide.objection.trim() &&
      newGuide.recommended_approach.trim(),
  )

  const updateGuides = (
    guides: CommercialObjectionGuideDraft[],
  ) => {
    onChange({
      objection_guides:
        normalizeGuides(guides),
    })
  }

  const updateGuide = (
    index: number,
    patch: Partial<CommercialObjectionGuideDraft>,
  ) => {
    updateGuides(
      value.objection_guides.map(
        (guide, guideIndex) =>
          guideIndex === index
            ? {
                ...guide,
                ...patch,
              }
            : guide,
      ),
    )
  }

  const addGuide = () => {
    if (!canAddGuide) {
      setAddError(
        'Preencha a objeção e a abordagem recomendada.',
      )
      return
    }

    const nextGuide: CommercialObjectionGuideDraft = {
      sort_order:
        value.objection_guides.length + 1,

      objection: newGuide.objection.trim(),

      signals: linesToItems(
        newGuide.signals,
      ),

      discovery_questions: linesToItems(
        newGuide.discovery_questions,
      ),

      recommended_approach:
        newGuide.recommended_approach.trim(),

      response_limits: linesToItems(
        newGuide.response_limits,
      ),

      is_active: newGuide.is_active,
    }

    setSignalsTexts((current) => [
      ...current,
      newGuide.signals,
    ])

    setQuestionTexts((current) => [
      ...current,
      newGuide.discovery_questions,
    ])

    setLimitTexts((current) => [
      ...current,
      newGuide.response_limits,
    ])

    updateGuides([
      ...value.objection_guides,
      nextGuide,
    ])

    setNewGuide(createEmptyNewGuide())
    setAddError(null)
  }

  const removeGuide = (index: number) => {
    setSignalsTexts((current) =>
      current.filter(
        (_, itemIndex) => itemIndex !== index,
      ),
    )

    setQuestionTexts((current) =>
      current.filter(
        (_, itemIndex) => itemIndex !== index,
      ),
    )

    setLimitTexts((current) =>
      current.filter(
        (_, itemIndex) => itemIndex !== index,
      ),
    )

    updateGuides(
      value.objection_guides.filter(
        (_, guideIndex) =>
          guideIndex !== index,
      ),
    )
  }

  const moveGuide = (
    index: number,
    direction: -1 | 1,
  ) => {
    const destination = index + direction

    if (
      destination < 0 ||
      destination >=
        value.objection_guides.length
    ) {
      return
    }

    setSignalsTexts((current) =>
      moveItem(current, index, destination),
    )

    setQuestionTexts((current) =>
      moveItem(current, index, destination),
    )

    setLimitTexts((current) =>
      moveItem(current, index, destination),
    )

    updateGuides(
      moveItem(
        value.objection_guides,
        index,
        destination,
      ),
    )
  }

  return (
    <section>
      <div
        style={{
          alignItems: 'flex-start',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
          justifyContent: 'space-between',
        }}
      >
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
            Seção 6
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
            Tratamento de objeções
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
            Defina como o vendedor deve identificar,
            investigar e responder às objeções sem
            inventar informações ou pressionar o
            cliente.
          </div>
        </div>

        <div
          style={{
            background:
              incompleteGuides === 0
                ? 'rgba(34,197,94,0.07)'
                : 'rgba(245,158,11,0.07)',
            border: `1px solid ${
              incompleteGuides === 0
                ? 'rgba(134,239,172,0.18)'
                : 'rgba(252,211,77,0.18)'
            }`,
            borderRadius: DS.radius,
            color:
              incompleteGuides === 0
                ? DS.greenSoft
                : DS.yellowSoft,
            fontSize: 10,
            fontWeight: 800,
            lineHeight: 1.5,
            padding: '9px 11px',
          }}
        >
          {activeGuides} ativo(s) de{' '}
          {value.objection_guides.length} guia(s)
        </div>
      </div>

      <div
        style={{
          background: DS.surfaceRaised,
          border: `1px solid ${DS.border}`,
          borderRadius: DS.radiusContainer,
          marginTop: 18,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            background: DS.surfaceBg,
            borderBottom: `1px solid ${DS.border}`,
            padding: '13px 14px',
          }}
        >
          <div
            style={{
              color: DS.textPrimary,
              fontSize: 12,
              fontWeight: 850,
            }}
          >
            Adicionar guia de objeção
          </div>

          <div
            style={{
              color: DS.textMuted,
              fontSize: 10,
              lineHeight: 1.5,
              marginTop: 4,
            }}
          >
            A objeção e a abordagem recomendada são
            obrigatórias.
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gap: 14,
            gridTemplateColumns:
              'repeat(auto-fit, minmax(260px, 1fr))',
            padding: 15,
          }}
        >
          <div
            style={{
              gridColumn: '1 / -1',
            }}
          >
            <FieldLabel required>
              Objeção do cliente
            </FieldLabel>

            <textarea
              value={newGuide.objection}
              onChange={(event) => {
                setNewGuide((current) => ({
                  ...current,
                  objection: event.target.value,
                }))
                setAddError(null)
              }}
              rows={3}
              placeholder="Exemplo: Está caro para o nosso momento."
              style={textareaStyle}
            />
          </div>

          <div>
            <FieldLabel>
              Sinais da objeção
            </FieldLabel>

            <textarea
              value={newGuide.signals}
              onChange={(event) => {
                setNewGuide((current) => ({
                  ...current,
                  signals: event.target.value,
                }))
              }}
              rows={5}
              placeholder={
                'Um sinal por linha\n' +
                'Cliente compara somente o preço\n' +
                'Cliente pede desconto antes de entender a solução'
              }
              style={textareaStyle}
            />

            <FieldHelp>
              Coloque um sinal por linha.
            </FieldHelp>
          </div>

          <div>
            <FieldLabel>
              Perguntas de diagnóstico
            </FieldLabel>

            <textarea
              value={
                newGuide.discovery_questions
              }
              onChange={(event) => {
                setNewGuide((current) => ({
                  ...current,
                  discovery_questions:
                    event.target.value,
                }))
              }}
              rows={5}
              placeholder={
                'Uma pergunta por linha\n' +
                'O valor está acima do orçamento disponível?\n' +
                'Qual parte da proposta ainda não justificou o investimento?'
              }
              style={textareaStyle}
            />

            <FieldHelp>
              Use perguntas para entender a causa real.
            </FieldHelp>
          </div>

          <div
            style={{
              gridColumn: '1 / -1',
            }}
          >
            <FieldLabel required>
              Abordagem recomendada
            </FieldLabel>

            <textarea
              value={
                newGuide.recommended_approach
              }
              onChange={(event) => {
                setNewGuide((current) => ({
                  ...current,
                  recommended_approach:
                    event.target.value,
                }))
                setAddError(null)
              }}
              rows={4}
              placeholder="Explique como o vendedor deve acolher a objeção, investigar a causa e relacionar a resposta ao contexto do cliente."
              style={textareaStyle}
            />
          </div>

          <div
            style={{
              gridColumn: '1 / -1',
            }}
          >
            <FieldLabel>
              Limites da resposta
            </FieldLabel>

            <textarea
              value={newGuide.response_limits}
              onChange={(event) => {
                setNewGuide((current) => ({
                  ...current,
                  response_limits:
                    event.target.value,
                }))
              }}
              rows={4}
              placeholder={
                'Um limite por linha\n' +
                'Não oferecer desconto sem autorização\n' +
                'Não prometer retorno financeiro específico'
              }
              style={textareaStyle}
            />

            <FieldHelp>
              Defina o que não pode ser afirmado,
              prometido ou concedido.
            </FieldHelp>
          </div>
        </div>

        <div
          style={{
            alignItems: 'center',
            borderTop: `1px solid ${DS.border}`,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            justifyContent: 'space-between',
            padding: '12px 15px',
          }}
        >
          <button
            type="button"
            onClick={() => {
              setNewGuide((current) => ({
                ...current,
                is_active:
                  !current.is_active,
              }))
            }}
            style={{
              background: newGuide.is_active
                ? 'rgba(34,197,94,0.08)'
                : 'rgba(143,163,188,0.07)',
              border: `1px solid ${
                newGuide.is_active
                  ? 'rgba(134,239,172,0.18)'
                  : 'rgba(143,163,188,0.16)'
              }`,
              borderRadius: 999,
              color: newGuide.is_active
                ? DS.greenSoft
                : DS.textSecondary,
              cursor: 'pointer',
              fontSize: 9,
              fontWeight: 850,
              letterSpacing: '0.05em',
              padding: '6px 9px',
              textTransform: 'uppercase',
            }}
          >
            {newGuide.is_active
              ? 'Adicionar como ativo'
              : 'Adicionar como inativo'}
          </button>

          <button
            type="button"
            disabled={!canAddGuide}
            onClick={addGuide}
            style={{
              background: canAddGuide
                ? 'rgba(37,99,235,0.14)'
                : DS.surfaceBg,
              border: `1px solid ${
                canAddGuide
                  ? 'rgba(96,165,250,0.28)'
                  : DS.borderStrong
              }`,
              borderRadius: DS.radius,
              color: canAddGuide
                ? DS.blueSoft
                : DS.textMuted,
              cursor: canAddGuide
                ? 'pointer'
                : 'not-allowed',
              fontSize: 10,
              fontWeight: 850,
              padding: '9px 12px',
            }}
          >
            Adicionar guia
          </button>
        </div>

        {addError && (
          <div
            style={{
              background:
                'rgba(239,68,68,0.06)',
              borderTop:
                '1px solid rgba(252,165,165,0.15)',
              color: DS.redSoft,
              fontSize: 10,
              lineHeight: 1.5,
              padding: '9px 15px',
            }}
          >
            {addError}
          </div>
        )}
      </div>

      {value.objection_guides.length === 0 ? (
        <div
          style={{
            background: DS.surfaceBg,
            border: `1px dashed ${DS.borderStrong}`,
            borderRadius: DS.radiusContainer,
            color: DS.textMuted,
            fontSize: 11,
            lineHeight: 1.6,
            marginTop: 15,
            padding: '22px 18px',
            textAlign: 'center',
          }}
        >
          Nenhum guia de objeção cadastrado.
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 13,
            marginTop: 15,
          }}
        >
          {value.objection_guides.map(
            (guide, index) => {
              const complete =
                isGuideComplete(guide)

              return (
                <div
                  key={
                    guide.id ??
                    `objection-guide-${index}`
                  }
                  style={{
                    background:
                      DS.surfaceRaised,
                    border: `1px solid ${
                      complete
                        ? DS.border
                        : 'rgba(252,165,165,0.25)'
                    }`,
                    borderRadius:
                      DS.radiusContainer,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      alignItems: 'center',
                      background:
                        DS.surfaceBg,
                      borderBottom: `1px solid ${DS.border}`,
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 10,
                      justifyContent:
                        'space-between',
                      padding: '12px 14px',
                    }}
                  >
                    <div
                      style={{
                        alignItems: 'center',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 8,
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
                          color:
                            DS.textPrimary,
                          fontSize: 12,
                          fontWeight: 850,
                        }}
                      >
                        {guide.objection.trim() ||
                          `Objeção ${index + 1}`}
                      </span>

                      <ActiveBadge
                        active={guide.is_active}
                      />
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
                          moveGuide(index, -1)
                        }}
                      >
                        Subir
                      </SmallButton>

                      <SmallButton
                        disabled={
                          index ===
                          value.objection_guides
                            .length -
                            1
                        }
                        onClick={() => {
                          moveGuide(index, 1)
                        }}
                      >
                        Descer
                      </SmallButton>

                      <SmallButton
                        onClick={() => {
                          updateGuide(index, {
                            is_active:
                              !guide.is_active,
                          })
                        }}
                      >
                        {guide.is_active
                          ? 'Desativar'
                          : 'Ativar'}
                      </SmallButton>

                      <SmallButton
                        danger
                        onClick={() => {
                          removeGuide(index)
                        }}
                      >
                        Excluir
                      </SmallButton>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gap: 14,
                      gridTemplateColumns:
                        'repeat(auto-fit, minmax(260px, 1fr))',
                      padding: 15,
                    }}
                  >
                    <div
                      style={{
                        gridColumn: '1 / -1',
                      }}
                    >
                      <FieldLabel required>
                        Objeção do cliente
                      </FieldLabel>

                      <textarea
                        value={guide.objection}
                        onChange={(event) => {
                          updateGuide(index, {
                            objection:
                              event.target.value,
                          })
                        }}
                        rows={3}
                        style={textareaStyle}
                      />
                    </div>

                    <div>
                      <FieldLabel>
                        Sinais da objeção
                      </FieldLabel>

                      <textarea
                        value={
                          signalsTexts[index] ??
                          itemsToLines(
                            guide.signals,
                          )
                        }
                        onChange={(event) => {
                          const text =
                            event.target.value

                          setSignalsTexts(
                            (current) =>
                              current.map(
                                (
                                  item,
                                  itemIndex,
                                ) =>
                                  itemIndex ===
                                  index
                                    ? text
                                    : item,
                              ),
                          )

                          updateGuide(index, {
                            signals:
                              linesToItems(text),
                          })
                        }}
                        rows={5}
                        style={textareaStyle}
                      />

                      <FieldHelp>
                        Coloque um sinal por linha.
                      </FieldHelp>
                    </div>

                    <div>
                      <FieldLabel>
                        Perguntas de diagnóstico
                      </FieldLabel>

                      <textarea
                        value={
                          questionTexts[index] ??
                          itemsToLines(
                            guide.discovery_questions,
                          )
                        }
                        onChange={(event) => {
                          const text =
                            event.target.value

                          setQuestionTexts(
                            (current) =>
                              current.map(
                                (
                                  item,
                                  itemIndex,
                                ) =>
                                  itemIndex ===
                                  index
                                    ? text
                                    : item,
                              ),
                          )

                          updateGuide(index, {
                            discovery_questions:
                              linesToItems(text),
                          })
                        }}
                        rows={5}
                        style={textareaStyle}
                      />

                      <FieldHelp>
                        Coloque uma pergunta por linha.
                      </FieldHelp>
                    </div>

                    <div
                      style={{
                        gridColumn: '1 / -1',
                      }}
                    >
                      <FieldLabel required>
                        Abordagem recomendada
                      </FieldLabel>

                      <textarea
                        value={
                          guide.recommended_approach
                        }
                        onChange={(event) => {
                          updateGuide(index, {
                            recommended_approach:
                              event.target.value,
                          })
                        }}
                        rows={4}
                        style={textareaStyle}
                      />
                    </div>

                    <div
                      style={{
                        gridColumn: '1 / -1',
                      }}
                    >
                      <FieldLabel>
                        Limites da resposta
                      </FieldLabel>

                      <textarea
                        value={
                          limitTexts[index] ??
                          itemsToLines(
                            guide.response_limits,
                          )
                        }
                        onChange={(event) => {
                          const text =
                            event.target.value

                          setLimitTexts(
                            (current) =>
                              current.map(
                                (
                                  item,
                                  itemIndex,
                                ) =>
                                  itemIndex ===
                                  index
                                    ? text
                                    : item,
                              ),
                          )

                          updateGuide(index, {
                            response_limits:
                              linesToItems(text),
                          })
                        }}
                        rows={4}
                        style={textareaStyle}
                      />

                      <FieldHelp>
                        Coloque um limite por linha.
                      </FieldHelp>
                    </div>
                  </div>

                  {!complete && (
                    <div
                      style={{
                        background:
                          'rgba(239,68,68,0.05)',
                        borderTop:
                          '1px solid rgba(252,165,165,0.13)',
                        color: DS.redSoft,
                        fontSize: 10,
                        lineHeight: 1.5,
                        padding: '9px 14px',
                      }}
                    >
                      Preencha a objeção e a abordagem
                      recomendada antes de salvar.
                    </div>
                  )}
                </div>
              )
            },
          )}
        </div>
      )}

      <div
        style={{
          background:
            incompleteGuides === 0
              ? 'rgba(34,197,94,0.06)'
              : 'rgba(245,158,11,0.06)',
          border: `1px solid ${
            incompleteGuides === 0
              ? 'rgba(134,239,172,0.15)'
              : 'rgba(252,211,77,0.15)'
          }`,
          borderRadius: DS.radius,
          color: DS.textSecondary,
          fontSize: 10,
          lineHeight: 1.6,
          marginTop: 16,
          padding: '11px 13px',
        }}
      >
        {incompleteGuides > 0 ? (
          <>
            Existem {incompleteGuides} guia(s) com
            campos obrigatórios incompletos.
          </>
        ) : value.objection_guides.length === 0 ? (
          <>
            Os guias são opcionais, mas ajudam o
            Companion a conduzir objeções com maior
            consistência.
          </>
        ) : (
          <>
            Os guias cadastrados possuem estrutura
            válida e serão considerados na ordem
            definida acima.
          </>
        )}
      </div>
    </section>
  )
}