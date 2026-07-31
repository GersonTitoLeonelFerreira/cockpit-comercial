'use client'

import * as React from 'react'

import type {
  CommercialConfigDraftInput,
  CommercialFactDraft,
} from '@/app/types/commercial-config'

type FactsSectionValue = Pick<
  CommercialConfigDraftInput,
  'facts'
>

type NewFactState = {
  category: string
  fact_key: string
  fact_value: string
  source_note: string
  is_active: boolean
}

interface Props {
  value: FactsSectionValue
  onChange: (value: FactsSectionValue) => void
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

const CATEGORY_SUGGESTIONS = [
  'empresa',
  'produto',
  'preço',
  'contrato',
  'pagamento',
  'operação',
  'atendimento',
  'suporte',
  'integração',
  'segurança',
  'implantação',
  'geral',
] as const

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

function createEmptyNewFact(): NewFactState {
  return {
    category: 'geral',
    fact_key: '',
    fact_value: '',
    source_note: '',
    is_active: true,
  }
}

function normalizeText(value: string): string {
  return value.trim()
}

function buildFactIdentity(
  category: string,
  factKey: string,
): string {
  return [
    normalizeText(category).toLocaleLowerCase('pt-BR'),
    normalizeText(factKey).toLocaleLowerCase('pt-BR'),
  ].join('::')
}

function isFactComplete(
  fact: Pick<
    CommercialFactDraft,
    'category' | 'fact_key' | 'fact_value'
  >,
): boolean {
  return Boolean(
    normalizeText(fact.category) &&
      normalizeText(fact.fact_key) &&
      normalizeText(fact.fact_value),
  )
}

function countDuplicateFacts(
  facts: CommercialFactDraft[],
): number {
  const counts = new Map<string, number>()

  facts.forEach((fact) => {
    const identity = buildFactIdentity(
      fact.category,
      fact.fact_key,
    )

    counts.set(
      identity,
      (counts.get(identity) ?? 0) + 1,
    )
  })

  return Array.from(counts.values()).filter(
    (count) => count > 1,
  ).length
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

export default function CommercialFactsEditor({
  value,
  onChange,
}: Props) {
  const [newFact, setNewFact] =
    React.useState<NewFactState>(
      createEmptyNewFact,
    )

  const [addError, setAddError] =
    React.useState<string | null>(null)

  const activeFacts = value.facts.filter(
    (fact) => fact.is_active,
  ).length

  const incompleteFacts = value.facts.filter(
    (fact) => !isFactComplete(fact),
  ).length

  const duplicateFacts = countDuplicateFacts(
    value.facts,
  )

  const canAddFact = isFactComplete(newFact)

  const updateFacts = (
    facts: CommercialFactDraft[],
  ) => {
    onChange({
      facts,
    })
  }

  const updateFact = (
    index: number,
    patch: Partial<CommercialFactDraft>,
  ) => {
    updateFacts(
      value.facts.map((fact, factIndex) =>
        factIndex === index
          ? {
              ...fact,
              ...patch,
            }
          : fact,
      ),
    )
  }

  const removeFact = (index: number) => {
    updateFacts(
      value.facts.filter(
        (_, factIndex) => factIndex !== index,
      ),
    )
  }

  const addFact = () => {
    if (!canAddFact) {
      setAddError(
        'Preencha categoria, chave e valor antes de adicionar.',
      )
      return
    }

    const category = normalizeText(
      newFact.category,
    )

    const factKey = normalizeText(
      newFact.fact_key,
    )

    const identity = buildFactIdentity(
      category,
      factKey,
    )

    const alreadyExists = value.facts.some(
      (fact) =>
        buildFactIdentity(
          fact.category,
          fact.fact_key,
        ) === identity,
    )

    if (alreadyExists) {
      setAddError(
        'Já existe um fato com esta categoria e esta chave.',
      )
      return
    }

    updateFacts([
      ...value.facts,
      {
        category,
        fact_key: factKey,
        fact_value: normalizeText(
          newFact.fact_value,
        ),
        source_note:
          normalizeText(newFact.source_note) ||
          null,
        is_active: newFact.is_active,
      },
    ])

    setNewFact(createEmptyNewFact())
    setAddError(null)
  }

  return (
    <section>
      <datalist id="commercial-fact-categories">
        {CATEGORY_SUGGESTIONS.map((category) => (
          <option
            key={category}
            value={category}
          />
        ))}
      </datalist>

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
            Seção 5
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
            Fatos oficiais da empresa
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
            Registre informações que o Companion pode
            tratar como verdade oficial, sem precisar
            inferir ou inventar dados.
          </div>
        </div>

        <div
          style={{
            background:
              incompleteFacts === 0 &&
              duplicateFacts === 0
                ? 'rgba(34,197,94,0.07)'
                : 'rgba(245,158,11,0.07)',
            border: `1px solid ${
              incompleteFacts === 0 &&
              duplicateFacts === 0
                ? 'rgba(134,239,172,0.18)'
                : 'rgba(252,211,77,0.18)'
            }`,
            borderRadius: DS.radius,
            color:
              incompleteFacts === 0 &&
              duplicateFacts === 0
                ? DS.greenSoft
                : DS.yellowSoft,
            fontSize: 10,
            fontWeight: 800,
            lineHeight: 1.5,
            padding: '9px 11px',
          }}
        >
          {activeFacts} ativo(s) de{' '}
          {value.facts.length} fato(s)
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
            Adicionar fato oficial
          </div>

          <div
            style={{
              color: DS.textMuted,
              fontSize: 10,
              lineHeight: 1.5,
              marginTop: 4,
            }}
          >
            Categoria, chave e valor são obrigatórios.
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gap: 14,
            gridTemplateColumns:
              'repeat(auto-fit, minmax(220px, 1fr))',
            padding: 15,
          }}
        >
          <div>
            <FieldLabel required>
              Categoria
            </FieldLabel>

            <input
              type="text"
              list="commercial-fact-categories"
              value={newFact.category}
              onChange={(event) => {
                setNewFact((current) => ({
                  ...current,
                  category: event.target.value,
                }))
                setAddError(null)
              }}
              placeholder="Exemplo: produto"
              style={inputStyle}
            />
          </div>

          <div>
            <FieldLabel required>
              Chave interna
            </FieldLabel>

            <input
              type="text"
              value={newFact.fact_key}
              onChange={(event) => {
                setNewFact((current) => ({
                  ...current,
                  fact_key: event.target.value,
                }))
                setAddError(null)
              }}
              placeholder="Exemplo: controle_pipeline"
              style={inputStyle}
            />

            <div
              style={{
                color: DS.textMuted,
                fontSize: 9,
                lineHeight: 1.5,
                marginTop: 6,
              }}
            >
              Use uma identificação curta e estável.
            </div>
          </div>

          <div
            style={{
              gridColumn: '1 / -1',
            }}
          >
            <FieldLabel required>
              Valor oficial
            </FieldLabel>

            <textarea
              value={newFact.fact_value}
              onChange={(event) => {
                setNewFact((current) => ({
                  ...current,
                  fact_value:
                    event.target.value,
                }))
                setAddError(null)
              }}
              rows={4}
              placeholder="Descreva a informação oficial que poderá ser usada pelo Companion."
              style={textareaStyle}
            />
          </div>

          <div
            style={{
              gridColumn: '1 / -1',
            }}
          >
            <FieldLabel>
              Fonte ou observação
            </FieldLabel>

            <textarea
              value={newFact.source_note}
              onChange={(event) => {
                setNewFact((current) => ({
                  ...current,
                  source_note:
                    event.target.value,
                }))
              }}
              rows={2}
              placeholder="Exemplo: política comercial aprovada pela diretoria em julho de 2026."
              style={textareaStyle}
            />
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
              setNewFact((current) => ({
                ...current,
                is_active:
                  !current.is_active,
              }))
            }}
            style={{
              background: newFact.is_active
                ? 'rgba(34,197,94,0.08)'
                : 'rgba(143,163,188,0.07)',
              border: `1px solid ${
                newFact.is_active
                  ? 'rgba(134,239,172,0.18)'
                  : 'rgba(143,163,188,0.16)'
              }`,
              borderRadius: 999,
              color: newFact.is_active
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
            {newFact.is_active
              ? 'Adicionar como ativo'
              : 'Adicionar como inativo'}
          </button>

          <button
            type="button"
            disabled={!canAddFact}
            onClick={addFact}
            style={{
              background: canAddFact
                ? 'rgba(37,99,235,0.14)'
                : DS.surfaceBg,
              border: `1px solid ${
                canAddFact
                  ? 'rgba(96,165,250,0.28)'
                  : DS.borderStrong
              }`,
              borderRadius: DS.radius,
              color: canAddFact
                ? DS.blueSoft
                : DS.textMuted,
              cursor: canAddFact
                ? 'pointer'
                : 'not-allowed',
              fontSize: 10,
              fontWeight: 850,
              padding: '9px 12px',
            }}
          >
            Adicionar fato
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

      {value.facts.length === 0 ? (
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
          Nenhum fato oficial cadastrado.
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
          {value.facts.map((fact, index) => {
            const complete =
              isFactComplete(fact)

            return (
              <div
                key={
                  fact.id ??
                  `commercial-fact-${index}`
                }
                style={{
                  background: DS.surfaceRaised,
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
                    background: DS.surfaceBg,
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
                        color:
                          DS.textPrimary,
                        fontSize: 12,
                        fontWeight: 850,
                      }}
                    >
                      {fact.fact_key.trim() ||
                        `Fato ${index + 1}`}
                    </span>

                    <span
                      style={{
                        background:
                          'rgba(59,130,246,0.1)',
                        border:
                          '1px solid rgba(96,165,250,0.2)',
                        borderRadius: 999,
                        color: DS.blueSoft,
                        fontSize: 9,
                        fontWeight: 850,
                        padding: '5px 8px',
                      }}
                    >
                      {fact.category.trim() ||
                        'Sem categoria'}
                    </span>

                    <ActiveBadge
                      active={fact.is_active}
                    />
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 7,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        updateFact(index, {
                          is_active:
                            !fact.is_active,
                        })
                      }}
                      style={{
                        background:
                          DS.surfaceRaised,
                        border: `1px solid ${DS.borderStrong}`,
                        borderRadius: 7,
                        color:
                          DS.textSecondary,
                        cursor: 'pointer',
                        fontSize: 10,
                        fontWeight: 800,
                        padding: '7px 9px',
                      }}
                    >
                      {fact.is_active
                        ? 'Desativar'
                        : 'Ativar'}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        removeFact(index)
                      }}
                      style={{
                        background:
                          'rgba(239,68,68,0.07)',
                        border:
                          '1px solid rgba(252,165,165,0.18)',
                        borderRadius: 7,
                        color: DS.redSoft,
                        cursor: 'pointer',
                        fontSize: 10,
                        fontWeight: 800,
                        padding: '7px 9px',
                      }}
                    >
                      Excluir
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gap: 14,
                    gridTemplateColumns:
                      'repeat(auto-fit, minmax(220px, 1fr))',
                    padding: 15,
                  }}
                >
                  <div>
                    <FieldLabel required>
                      Categoria
                    </FieldLabel>

                    <input
                      type="text"
                      list="commercial-fact-categories"
                      value={fact.category}
                      onChange={(event) => {
                        updateFact(index, {
                          category:
                            event.target.value,
                        })
                      }}
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <FieldLabel required>
                      Chave interna
                    </FieldLabel>

                    <input
                      type="text"
                      value={fact.fact_key}
                      onChange={(event) => {
                        updateFact(index, {
                          fact_key:
                            event.target.value,
                        })
                      }}
                      style={inputStyle}
                    />
                  </div>

                  <div
                    style={{
                      gridColumn: '1 / -1',
                    }}
                  >
                    <FieldLabel required>
                      Valor oficial
                    </FieldLabel>

                    <textarea
                      value={fact.fact_value}
                      onChange={(event) => {
                        updateFact(index, {
                          fact_value:
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
                      Fonte ou observação
                    </FieldLabel>

                    <textarea
                      value={
                        fact.source_note ?? ''
                      }
                      onChange={(event) => {
                        updateFact(index, {
                          source_note:
                            event.target
                              .value || null,
                        })
                      }}
                      rows={2}
                      style={textareaStyle}
                    />
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
                    Preencha categoria, chave e valor
                    antes de salvar o rascunho.
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div
        style={{
          background:
            incompleteFacts === 0 &&
            duplicateFacts === 0
              ? 'rgba(34,197,94,0.06)'
              : 'rgba(245,158,11,0.06)',
          border: `1px solid ${
            incompleteFacts === 0 &&
            duplicateFacts === 0
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
        {incompleteFacts > 0 ? (
          <>
            Existem {incompleteFacts} fato(s) com
            campos obrigatórios incompletos.
          </>
        ) : duplicateFacts > 0 ? (
          <>
            Existem {duplicateFacts} combinação(ões)
            duplicada(s) de categoria e chave.
          </>
        ) : value.facts.length === 0 ? (
          <>
            Os fatos são opcionais, mas ajudam o
            Companion a responder com maior segurança.
          </>
        ) : (
          <>
            Os fatos cadastrados possuem estrutura
            válida. Mantenha apenas informações
            verificadas e atualizadas.
          </>
        )}
      </div>
    </section>
  )
}