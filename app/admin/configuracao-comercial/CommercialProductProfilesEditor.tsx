'use client'

import * as React from 'react'

import type {
  CommercialConfigDraftInput,
  CommercialConfigProductOption,
  CommercialProductProfileDraft,
} from '@/app/types/commercial-config'

type ProductProfilesSectionValue = Pick<
  CommercialConfigDraftInput,
  'product_profiles'
>

type ProfileArrayField =
  | 'indicated_audiences'
  | 'needs_addressed'
  | 'benefits'
  | 'verified_differentiators'
  | 'limitations'
  | 'contract_conditions'
  | 'payment_conditions'
  | 'allowed_claims'
  | 'forbidden_claims'

type ProfileTextValues = Record<
  ProfileArrayField,
  string
>

type ProfileTextState = Record<
  string,
  ProfileTextValues
>

type ProfileFieldConfig = {
  field: ProfileArrayField
  label: string
  help: string
  placeholder: string
  required?: boolean
  rows: number
}

interface Props {
  products: CommercialConfigProductOption[]
  value: ProductProfilesSectionValue
  onChange: (
    value: ProductProfilesSectionValue,
  ) => void
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

  blueSoft: '#93c5fd',
  greenSoft: '#86efac',
  yellowSoft: '#fcd34d',
  redSoft: '#fca5a5',

  radius: 8,
  radiusContainer: 10,
} as const

const PROFILE_FIELDS: ProfileFieldConfig[] = [
  {
    field: 'indicated_audiences',
    label: 'Públicos indicados',
    help:
      'Perfis de clientes para os quais este produto costuma ser adequado.',
    placeholder:
      'Um público por linha\n' +
      'Empresas com equipe comercial\n' +
      'Operações que ainda utilizam planilhas',
    rows: 5,
  },
  {
    field: 'needs_addressed',
    label: 'Necessidades atendidas',
    help:
      'Problemas ou necessidades que o produto realmente ajuda a resolver.',
    placeholder:
      'Uma necessidade por linha\n' +
      'Organizar o acompanhamento dos leads\n' +
      'Reduzir perdas por falta de retorno',
    required: true,
    rows: 6,
  },
  {
    field: 'benefits',
    label: 'Benefícios',
    help:
      'Resultados e ganhos que podem ser apresentados com segurança.',
    placeholder:
      'Um benefício por linha\n' +
      'Maior controle das negociações\n' +
      'Visibilidade da execução comercial',
    required: true,
    rows: 6,
  },
  {
    field: 'verified_differentiators',
    label: 'Diferenciais comprovados',
    help:
      'Características verificadas que diferenciam este produto.',
    placeholder:
      'Um diferencial por linha\n' +
      'Acompanhamento da execução do vendedor\n' +
      'Método comercial configurável',
    rows: 5,
  },
  {
    field: 'limitations',
    label: 'Limitações',
    help:
      'O que o produto não faz ou situações nas quais ele não é indicado.',
    placeholder:
      'Uma limitação por linha\n' +
      'Não substitui a gestão da equipe\n' +
      'Depende do registro correto das atividades',
    rows: 5,
  },
  {
    field: 'contract_conditions',
    label: 'Condições contratuais',
    help:
      'Regras oficiais relacionadas ao contrato, permanência ou cancelamento.',
    placeholder:
      'Uma condição por linha\n' +
      'Prazo contratual\n' +
      'Regra de cancelamento',
    rows: 5,
  },
  {
    field: 'payment_conditions',
    label: 'Condições de pagamento',
    help:
      'Formas, prazos e regras de pagamento que podem ser informados.',
    placeholder:
      'Uma condição por linha\n' +
      'Pagamento mensal\n' +
      'Vencimento conforme contrato',
    rows: 5,
  },
  {
    field: 'allowed_claims',
    label: 'Afirmações permitidas',
    help:
      'Informações que o vendedor pode afirmar como fatos oficiais.',
    placeholder:
      'Uma afirmação por linha\n' +
      'Centraliza o acompanhamento dos leads\n' +
      'Permite acompanhar próximas ações',
    rows: 5,
  },
  {
    field: 'forbidden_claims',
    label: 'Afirmações proibidas',
    help:
      'Promessas ou declarações que não podem ser feitas ao cliente.',
    placeholder:
      'Uma afirmação por linha\n' +
      'Garantir aumento de vendas\n' +
      'Prometer resultado financeiro específico',
    rows: 5,
  },
]

const textareaStyle: React.CSSProperties = {
  background: DS.surfaceBg,
  border: `1px solid ${DS.borderStrong}`,
  borderRadius: DS.radius,
  color: DS.textPrimary,
  fontFamily: 'inherit',
  fontSize: 12,
  lineHeight: 1.55,
  outline: 'none',
  padding: '10px 11px',
  resize: 'vertical',
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

function formatBRL(value: number): string {
  const numericValue = Number(value ?? 0)

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(
    Number.isFinite(numericValue)
      ? numericValue
      : 0,
  )
}

function createEmptyProfileText(): ProfileTextValues {
  return {
    indicated_audiences: '',
    needs_addressed: '',
    benefits: '',
    verified_differentiators: '',
    limitations: '',
    contract_conditions: '',
    payment_conditions: '',
    allowed_claims: '',
    forbidden_claims: '',
  }
}

function profileToText(
  profile: CommercialProductProfileDraft,
): ProfileTextValues {
  return {
    indicated_audiences: itemsToLines(
      profile.indicated_audiences,
    ),
    needs_addressed: itemsToLines(
      profile.needs_addressed,
    ),
    benefits: itemsToLines(profile.benefits),
    verified_differentiators: itemsToLines(
      profile.verified_differentiators,
    ),
    limitations: itemsToLines(profile.limitations),
    contract_conditions: itemsToLines(
      profile.contract_conditions,
    ),
    payment_conditions: itemsToLines(
      profile.payment_conditions,
    ),
    allowed_claims: itemsToLines(
      profile.allowed_claims,
    ),
    forbidden_claims: itemsToLines(
      profile.forbidden_claims,
    ),
  }
}

function buildProfileTextState(
  profiles: CommercialProductProfileDraft[],
): ProfileTextState {
  const state: ProfileTextState = {}

  profiles.forEach((profile) => {
    state[profile.product_id] =
      profileToText(profile)
  })

  return state
}

function createEmptyProductProfile(
  productId: string,
): CommercialProductProfileDraft {
  return {
    product_id: productId,

    indicated_audiences: [],
    needs_addressed: [],
    benefits: [],
    verified_differentiators: [],
    limitations: [],
    contract_conditions: [],
    payment_conditions: [],
    allowed_claims: [],
    forbidden_claims: [],
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

function StatusBadge({
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

export default function CommercialProductProfilesEditor({
  products,
  value,
  onChange,
}: Props) {
  const [textState, setTextState] =
    React.useState<ProfileTextState>(() =>
      buildProfileTextState(
        value.product_profiles,
      ),
    )

  const [expandedProductIds, setExpandedProductIds] =
    React.useState<Set<string>>(() => {
      const firstConfiguredProduct =
        products.find((product) =>
          value.product_profiles.some(
            (profile) =>
              profile.product_id === product.id,
          ),
        )

      return new Set(
        firstConfiguredProduct
          ? [firstConfiguredProduct.id]
          : [],
      )
    })

  const profileByProductId = React.useMemo(
    () =>
      new Map(
        value.product_profiles.map(
          (profile) =>
            [profile.product_id, profile] as const,
        ),
      ),
    [value.product_profiles],
  )

  const activeProducts = products.filter(
    (product) => product.active,
  )

  const configuredActiveProducts =
    activeProducts.filter((product) =>
      profileByProductId.has(product.id),
    ).length

  const missingActiveProducts =
    activeProducts.length -
    configuredActiveProducts

  const updateProfiles = (
    profiles: CommercialProductProfileDraft[],
  ) => {
    onChange({
      product_profiles: profiles,
    })
  }

  const toggleExpanded = (
    productId: string,
  ) => {
    setExpandedProductIds((current) => {
      const next = new Set(current)

      if (next.has(productId)) {
        next.delete(productId)
      } else {
        next.add(productId)
      }

      return next
    })
  }

  const addProfile = (productId: string) => {
    if (profileByProductId.has(productId)) {
      return
    }

    setTextState((current) => ({
      ...current,
      [productId]: createEmptyProfileText(),
    }))

    setExpandedProductIds((current) => {
      const next = new Set(current)
      next.add(productId)
      return next
    })

    updateProfiles([
      ...value.product_profiles,
      createEmptyProductProfile(productId),
    ])
  }

  const removeProfile = (
    productId: string,
  ) => {
    setTextState((current) => {
      const next = { ...current }
      delete next[productId]
      return next
    })

    setExpandedProductIds((current) => {
      const next = new Set(current)
      next.delete(productId)
      return next
    })

    updateProfiles(
      value.product_profiles.filter(
        (profile) =>
          profile.product_id !== productId,
      ),
    )
  }

  const updateProfileField = (
    productId: string,
    field: ProfileArrayField,
    text: string,
  ) => {
    setTextState((current) => ({
      ...current,
      [productId]: {
        ...(current[productId] ??
          createEmptyProfileText()),
        [field]: text,
      },
    }))

    updateProfiles(
      value.product_profiles.map((profile) =>
        profile.product_id === productId
          ? {
              ...profile,
              [field]: linesToItems(text),
            }
          : profile,
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
            Seção 4
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
            Perfis comerciais dos produtos
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
            Defina como cada produto pode ser
            posicionado, quais necessidades atende e
            quais informações o vendedor pode ou não
            comunicar.
          </div>
        </div>

        <div
          style={{
            background:
              missingActiveProducts === 0
                ? 'rgba(34,197,94,0.07)'
                : 'rgba(245,158,11,0.07)',
            border: `1px solid ${
              missingActiveProducts === 0
                ? 'rgba(134,239,172,0.18)'
                : 'rgba(252,211,77,0.18)'
            }`,
            borderRadius: DS.radius,
            color:
              missingActiveProducts === 0
                ? DS.greenSoft
                : DS.yellowSoft,
            fontSize: 10,
            fontWeight: 800,
            lineHeight: 1.5,
            padding: '9px 11px',
          }}
        >
          {configuredActiveProducts} de{' '}
          {activeProducts.length} produto(s) ativo(s)
          configurado(s)
        </div>
      </div>

      {products.length === 0 ? (
        <div
          style={{
            background: DS.surfaceBg,
            border: `1px dashed ${DS.borderStrong}`,
            borderRadius: DS.radiusContainer,
            color: DS.textMuted,
            fontSize: 11,
            lineHeight: 1.6,
            marginTop: 16,
            padding: '22px 18px',
            textAlign: 'center',
          }}
        >
          Nenhum produto cadastrado. Cadastre os
          produtos antes de criar os perfis comerciais.
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 13,
            marginTop: 18,
          }}
        >
          {products.map((product) => {
            const profile =
              profileByProductId.get(product.id)

            const configured = Boolean(profile)

            const expanded =
              configured &&
              expandedProductIds.has(product.id)

            return (
              <div
                key={product.id}
                style={{
                  background: DS.surfaceRaised,
                  border: `1px solid ${
                    configured
                      ? 'rgba(96,165,250,0.22)'
                      : DS.border
                  }`,
                  borderRadius: DS.radiusContainer,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    alignItems: 'center',
                    background: DS.surfaceBg,
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 12,
                    justifyContent: 'space-between',
                    padding: '13px 14px',
                  }}
                >
                  <div
                    style={{
                      minWidth: 0,
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
                          color: DS.textPrimary,
                          fontSize: 13,
                          fontWeight: 850,
                        }}
                      >
                        {product.name}
                      </span>

                      <StatusBadge
                        active={product.active}
                      />

                      {configured && (
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
                            letterSpacing: '0.05em',
                            padding: '5px 8px',
                            textTransform: 'uppercase',
                          }}
                        >
                          Perfil configurado
                        </span>
                      )}
                    </div>

                    <div
                      style={{
                        color: DS.textMuted,
                        fontSize: 10,
                        lineHeight: 1.5,
                        marginTop: 5,
                      }}
                    >
                      {product.category ||
                        'Sem categoria'}{' '}
                      · {formatBRL(product.base_price)}
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 7,
                    }}
                  >
                    {configured ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            toggleExpanded(product.id)
                          }}
                          style={{
                            background:
                              'rgba(37,99,235,0.12)',
                            border:
                              '1px solid rgba(96,165,250,0.24)',
                            borderRadius: 7,
                            color: DS.blueSoft,
                            cursor: 'pointer',
                            fontSize: 10,
                            fontWeight: 800,
                            padding: '8px 10px',
                          }}
                        >
                          {expanded
                            ? 'Recolher'
                            : 'Editar perfil'}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            removeProfile(product.id)
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
                            padding: '8px 10px',
                          }}
                        >
                          Remover
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          addProfile(product.id)
                        }}
                        style={{
                          background:
                            'rgba(37,99,235,0.14)',
                          border:
                            '1px solid rgba(96,165,250,0.28)',
                          borderRadius: 7,
                          color: DS.blueSoft,
                          cursor: 'pointer',
                          fontSize: 10,
                          fontWeight: 850,
                          padding: '8px 11px',
                        }}
                      >
                        Configurar produto
                      </button>
                    )}
                  </div>
                </div>

                {!configured &&
                  product.active && (
                    <div
                      style={{
                        background:
                          'rgba(245,158,11,0.05)',
                        borderTop:
                          '1px solid rgba(252,211,77,0.12)',
                        color: DS.yellowSoft,
                        fontSize: 10,
                        lineHeight: 1.5,
                        padding: '9px 14px',
                      }}
                    >
                      Este produto está ativo e precisará
                      de um perfil antes da publicação.
                    </div>
                  )}

                {profile && expanded && (
                  <div
                    style={{
                      borderTop: `1px solid ${DS.border}`,
                      display: 'grid',
                      gap: 15,
                      gridTemplateColumns:
                        'repeat(auto-fit, minmax(270px, 1fr))',
                      padding: 15,
                    }}
                  >
                    {PROFILE_FIELDS.map(
                      (fieldConfig) => (
                        <div
                          key={fieldConfig.field}
                        >
                          <FieldLabel
                            required={
                              fieldConfig.required
                            }
                          >
                            {fieldConfig.label}
                          </FieldLabel>

                          <textarea
                            value={
                              textState[product.id]?.[
                                fieldConfig.field
                              ] ??
                              itemsToLines(
                                profile[
                                  fieldConfig.field
                                ],
                              )
                            }
                            onChange={(event) => {
                              updateProfileField(
                                product.id,
                                fieldConfig.field,
                                event.target.value,
                              )
                            }}
                            rows={fieldConfig.rows}
                            placeholder={
                              fieldConfig.placeholder
                            }
                            style={textareaStyle}
                          />

                          <div
                            style={{
                              color: DS.textMuted,
                              fontSize: 9,
                              lineHeight: 1.5,
                              marginTop: 6,
                            }}
                          >
                            {fieldConfig.help} Coloque um
                            item por linha.
                          </div>
                        </div>
                      ),
                    )}
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
            missingActiveProducts === 0
              ? 'rgba(34,197,94,0.06)'
              : 'rgba(245,158,11,0.06)',
          border: `1px solid ${
            missingActiveProducts === 0
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
        {missingActiveProducts === 0 ? (
          <>
            Todos os produtos ativos possuem perfil.
            Para publicar, cada perfil também deverá ter
            pelo menos uma necessidade atendida e um
            benefício.
          </>
        ) : (
          <>
            Ainda faltam {missingActiveProducts}{' '}
            produto(s) ativo(s). O rascunho pode ser
            salvo, mas a publicação permanecerá
            bloqueada.
          </>
        )}
      </div>
    </section>
  )
}