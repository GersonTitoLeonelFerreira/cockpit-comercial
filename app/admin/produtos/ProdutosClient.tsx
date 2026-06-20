'use client'

import * as React from 'react'
import type { Product } from '@/app/types/product'
import {
  createProduct,
  listProducts,
  toggleProductActive,
  updateProduct,
} from '@/app/lib/services/products'

// ==============================================================================
// Design system
// ==============================================================================

const DS = {
  contentBg: '#090b0f',
  cardBg: '#141722',
  surfaceBg: '#111318',
  border: '#1a1d2e',
  borderSubtle: '#13162a',

  textPrimary: '#edf2f7',
  textSecondary: '#8fa3bc',
  textMuted: '#546070',
  textLabel: '#4a5569',

  blueLight: '#60a5fa',
  blueSoft: '#93c5fd',

  green: '#22c55e',
  greenSoft: '#86efac',

  yellowSoft: '#fef3c7',
  redSoft: '#fca5a5',

  radius: 7,
  radiusContainer: 9,
  shadowCard: '0 1px 4px rgba(0,0,0,0.4)',
} as const

// ==============================================================================
// Helpers
// ==============================================================================

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function parseBRL(value: string): number {
  const normalized = value
    .replace(/[^\d,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.')

  const parsed = Number.parseFloat(normalized || '0')

  return Number.isFinite(parsed) ? parsed : 0
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return fallback
}

function cardStyle(): React.CSSProperties {
  return {
    background: DS.cardBg,
    border: `1px solid ${DS.border}`,
    borderRadius: DS.radiusContainer,
    boxShadow: DS.shadowCard,
  }
}

const fieldLabelStyle: React.CSSProperties = {
  color: DS.textLabel,
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
}

const inputStyle: React.CSSProperties = {
  background: DS.surfaceBg,
  border: `1px solid ${DS.border}`,
  borderRadius: DS.radius,
  color: DS.textPrimary,
  fontSize: 13,
  height: 38,
  outline: 'none',
  padding: '0 11px',
  width: '100%',
}

const rowGrid = {
  gridTemplateColumns:
    'minmax(240px, 1.8fr) minmax(160px, 1fr) minmax(140px, .85fr) 110px 200px',
} as const

// ==============================================================================
// Types
// ==============================================================================

interface Props {
  companyId: string
}

type Filter = 'all' | 'active' | 'inactive'

// ==============================================================================
// Components
// ==============================================================================

function SectionLabel({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        color: DS.blueSoft,
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: '0.08em',
        marginBottom: 12,
        textTransform: 'uppercase',
      }}
    >
      {children}
    </div>
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
        flex: '1 1 190px',
        flexDirection: 'column',
        minHeight: 118,
        padding: '17px 18px',
      }}
    >
      <div
        style={{
          color: DS.textLabel,
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>

      <div
        style={{
          color: accent,
          fontSize: 24,
          fontWeight: 900,
          letterSpacing: '-0.025em',
          lineHeight: 1,
          marginTop: 12,
        }}
      >
        {value}
      </div>

      <div
        style={{
          color: DS.textSecondary,
          fontSize: 11,
          lineHeight: 1.45,
          marginTop: 'auto',
          paddingTop: 10,
        }}
      >
        {description}
      </div>
    </div>
  )
}

function StatusBadge({
  active,
}: {
  active: boolean
}) {
  const color = active ? DS.greenSoft : DS.redSoft

  return (
    <span
      style={{
        background: active
          ? 'rgba(34,197,94,0.09)'
          : 'rgba(239,68,68,0.09)',
        border: `1px solid ${active ? 'rgba(134,239,172,0.18)' : 'rgba(252,165,165,0.18)'}`,
        borderRadius: 999,
        color,
        display: 'inline-flex',
        fontSize: 10,
        fontWeight: 850,
        letterSpacing: '0.04em',
        padding: '5px 9px',
        textTransform: 'uppercase',
      }}
    >
      {active ? 'Ativo' : 'Inativo'}
    </span>
  )
}

function ActionButton({
  children,
  onClick,
  disabled = false,
  variant = 'secondary',
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  variant?: 'primary' | 'secondary' | 'danger' | 'success'
}) {
  const styles: Record<
    'primary' | 'secondary' | 'danger' | 'success',
    React.CSSProperties
  > = {
    primary: {
      background: '#166534',
      border: '1px solid rgba(134,239,172,0.22)',
      color: '#f0fdf4',
    },
    secondary: {
      background: DS.surfaceBg,
      border: `1px solid ${DS.border}`,
      color: DS.textSecondary,
    },
    danger: {
      background: 'rgba(239,68,68,0.08)',
      border: '1px solid rgba(252,165,165,0.18)',
      color: DS.redSoft,
    },
    success: {
      background: 'rgba(34,197,94,0.08)',
      border: '1px solid rgba(134,239,172,0.18)',
      color: DS.greenSoft,
    },
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        ...styles[variant],
        borderRadius: DS.radius,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 12,
        fontWeight: 800,
        minHeight: 32,
        opacity: disabled ? 0.55 : 1,
        padding: '0 11px',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}

// ==============================================================================
// Main component
// ==============================================================================

export default function ProdutosClient({
  companyId,
}: Props) {
  const [products, setProducts] = React.useState<Product[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const [filter, setFilter] = React.useState<Filter>('all')
  const [search, setSearch] = React.useState('')

  const [showForm, setShowForm] = React.useState(false)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  const [formName, setFormName] = React.useState('')
  const [formCategory, setFormCategory] = React.useState('')
  const [formPrice, setFormPrice] = React.useState('')

  const [editName, setEditName] = React.useState('')
  const [editCategory, setEditCategory] = React.useState('')
  const [editPrice, setEditPrice] = React.useState('')

  async function loadProducts() {
    setLoading(true)
    setError(null)

    try {
      const data = await listProducts(companyId)
      setProducts(data)
    } catch (cause: unknown) {
      setError(getErrorMessage(cause, 'Erro ao carregar produtos.'))
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => {
    void loadProducts()
  }, [companyId])

  const filteredProducts = React.useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()

    return products.filter((product) => {
      if (filter === 'active' && !product.active) {
        return false
      }

      if (filter === 'inactive' && product.active) {
        return false
      }

      if (!normalizedSearch) {
        return true
      }

      return (
        product.name.toLowerCase().includes(normalizedSearch) ||
        product.category.toLowerCase().includes(normalizedSearch)
      )
    })
  }, [filter, products, search])

  const totals = React.useMemo(() => {
    const active = products.filter((product) => product.active).length
    const inactive = products.length - active

    const categories = new Set(
      products
        .map((product) => product.category.trim())
        .filter(Boolean),
    ).size

    return {
      total: products.length,
      active,
      inactive,
      categories,
    }
  }, [products])

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!formName.trim()) {
      return
    }

    setSaving(true)
    setError(null)

    try {
      await createProduct({
        company_id: companyId,
        name: formName.trim(),
        category: formCategory.trim(),
        base_price: parseBRL(formPrice),
      })

      setFormName('')
      setFormCategory('')
      setFormPrice('')
      setShowForm(false)

      await loadProducts()
    } catch (cause: unknown) {
      setError(getErrorMessage(cause, 'Erro ao criar produto.'))
    } finally {
      setSaving(false)
    }
  }

  function startEdit(product: Product) {
    setEditingId(product.id)
    setEditName(product.name)
    setEditCategory(product.category)
    setEditPrice(
      new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(product.base_price),
    )
  }

  function cancelEdit() {
    setEditingId(null)
    setEditName('')
    setEditCategory('')
    setEditPrice('')
  }

  async function handleSaveEdit(productId: string) {
    if (!editName.trim()) {
      setError('O nome do produto é obrigatório.')
      return
    }

    setSaving(true)
    setError(null)

    try {
      await updateProduct(productId, {
        name: editName.trim(),
        category: editCategory.trim(),
        base_price: parseBRL(editPrice),
      })

      cancelEdit()
      await loadProducts()
    } catch (cause: unknown) {
      setError(getErrorMessage(cause, 'Erro ao atualizar produto.'))
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(product: Product) {
    setError(null)

    try {
      await toggleProductActive(product.id, !product.active)
      await loadProducts()
    } catch (cause: unknown) {
      setError(getErrorMessage(cause, 'Erro ao atualizar produto.'))
    }
  }

  return (
    <div
      style={{
        background: DS.contentBg,
        color: DS.textPrimary,
        minHeight: '100%',
        padding: '32px 24px 80px',
      }}
    >
      <div
        style={{
          margin: '0 auto',
          maxWidth: 1200,
        }}
      >
        <a
          href="/admin/vendedores"
          style={{
            color: DS.textSecondary,
            display: 'inline-flex',
            fontSize: 13,
            marginBottom: 28,
            textDecoration: 'none',
          }}
        >
          ← Voltar para Administração
        </a>

        <header
          style={{
            alignItems: 'flex-start',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 18,
            justifyContent: 'space-between',
            marginBottom: 28,
          }}
        >
          <div>
            <div
              style={{
                alignItems: 'center',
                display: 'flex',
                gap: 10,
                marginBottom: 7,
              }}
            >
              <span
                style={{
                  color: DS.blueLight,
                  fontSize: 19,
                  lineHeight: 1,
                }}
              >
                ◫
              </span>

              <h1
                style={{
                  fontSize: 23,
                  fontWeight: 850,
                  letterSpacing: '-0.015em',
                  margin: 0,
                }}
              >
                Catálogo de Produtos
              </h1>
            </div>

            <p
              style={{
                color: DS.textSecondary,
                fontSize: 13,
                lineHeight: 1.5,
                margin: 0,
                maxWidth: 700,
              }}
            >
              Gerencie os produtos disponíveis para venda, categorias e preços
              de referência da empresa ativa.
            </p>
          </div>

          <ActionButton
            variant="primary"
            onClick={() => {
              setShowForm((current) => !current)
              setError(null)
              cancelEdit()
            }}
          >
            {showForm ? 'Cancelar cadastro' : '+ Novo Produto'}
          </ActionButton>
        </header>

        <section
          style={{
            marginBottom: 28,
          }}
        >
          <SectionLabel>Panorama do Catálogo</SectionLabel>

          <div
            style={{
              display: 'grid',
              gap: 12,
              gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
            }}
          >
            <MetricCard
              label="Produtos Cadastrados"
              value={String(totals.total)}
              description="Itens disponíveis no catálogo da empresa."
            />

            <MetricCard
              label="Produtos Ativos"
              value={String(totals.active)}
              description="Produtos liberados para uso em novos fechamentos."
              accent={DS.greenSoft}
            />

            <MetricCard
              label="Produtos Inativos"
              value={String(totals.inactive)}
              description="Itens preservados no histórico, mas fora de uso."
              accent={totals.inactive > 0 ? DS.yellowSoft : DS.textSecondary}
            />

            <MetricCard
              label="Categorias"
              value={String(totals.categories)}
              description="Classificações diferentes cadastradas no catálogo."
            />
          </div>
        </section>

        {error ? (
          <div
            style={{
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.22)',
              borderRadius: DS.radius,
              color: DS.redSoft,
              fontSize: 13,
              lineHeight: 1.5,
              marginBottom: 20,
              padding: '12px 14px',
            }}
          >
            {error}
          </div>
        ) : null}

        {showForm ? (
          <section
            style={{
              ...cardStyle(),
              marginBottom: 20,
              padding: '20px',
            }}
          >
            <div
              style={{
                alignItems: 'flex-start',
                display: 'flex',
                flexWrap: 'wrap',
                gap: 12,
                justifyContent: 'space-between',
                marginBottom: 18,
              }}
            >
              <div>
                <h2
                  style={{
                    color: DS.textPrimary,
                    fontSize: 16,
                    fontWeight: 850,
                    margin: 0,
                  }}
                >
                  Novo Produto
                </h2>

                <p
                  style={{
                    color: DS.textSecondary,
                    fontSize: 12,
                    lineHeight: 1.5,
                    margin: '5px 0 0',
                  }}
                >
                  O produto ficará ativo e disponível para seleção nos novos
                  fechamentos.
                </p>
              </div>

              <span
                style={{
                  background: 'rgba(34,197,94,0.08)',
                  border: '1px solid rgba(134,239,172,0.18)',
                  borderRadius: 6,
                  color: DS.greenSoft,
                  fontSize: 10,
                  fontWeight: 800,
                  padding: '6px 8px',
                }}
              >
                CADASTRO ATIVO
              </span>
            </div>

            <form onSubmit={handleCreate}>
              <div
                style={{
                  alignItems: 'end',
                  display: 'grid',
                  gap: 12,
                  gridTemplateColumns:
                    'minmax(220px, 1.4fr) minmax(190px, 1fr) minmax(150px, .7fr) auto',
                }}
              >
                <label
                  style={{
                    display: 'grid',
                    gap: 5,
                  }}
                >
                  <span style={fieldLabelStyle}>Nome do Produto *</span>

                  <input
                    type="text"
                    placeholder="Ex.: Plano Anual Premium"
                    value={formName}
                    onChange={(event) => setFormName(event.target.value)}
                    required
                    style={inputStyle}
                  />
                </label>

                <label
                  style={{
                    display: 'grid',
                    gap: 5,
                  }}
                >
                  <span style={fieldLabelStyle}>Categoria</span>

                  <input
                    type="text"
                    placeholder="Ex.: Plano, Serviço, Upgrade"
                    value={formCategory}
                    onChange={(event) => setFormCategory(event.target.value)}
                    style={inputStyle}
                  />
                </label>

                <label
                  style={{
                    display: 'grid',
                    gap: 5,
                  }}
                >
                  <span style={fieldLabelStyle}>Preço Base</span>

                  <input
                    type="text"
                    placeholder="0,00"
                    value={formPrice}
                    onChange={(event) => setFormPrice(event.target.value)}
                    style={inputStyle}
                  />
                </label>

                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    background: '#166534',
                    border: '1px solid rgba(134,239,172,0.22)',
                    borderRadius: DS.radius,
                    color: '#f0fdf4',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    fontSize: 12,
                    fontWeight: 850,
                    height: 38,
                    opacity: saving ? 0.6 : 1,
                    padding: '0 15px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {saving ? 'Salvando...' : 'Salvar Produto'}
                </button>
              </div>
            </form>
          </section>
        ) : null}

        <section
          style={{
            ...cardStyle(),
            alignItems: 'center',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 20,
            padding: '15px 18px',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
            }}
          >
            {(['all', 'active', 'inactive'] as Filter[]).map((item) => {
              const active = filter === item

              const labels: Record<Filter, string> = {
                all: 'Todos',
                active: 'Ativos',
                inactive: 'Inativos',
              }

              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => setFilter(item)}
                  style={{
                    background: active
                      ? 'rgba(59,130,246,0.13)'
                      : DS.surfaceBg,
                    border: `1px solid ${
                      active
                        ? 'rgba(147,197,253,0.28)'
                        : DS.border
                    }`,
                    borderRadius: DS.radius,
                    color: active ? DS.blueSoft : DS.textSecondary,
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: active ? 850 : 650,
                    height: 36,
                    padding: '0 13px',
                  }}
                >
                  {labels[item]}
                </button>
              )
            })}
          </div>

          <div
            style={{
              flex: '1 1 240px',
              maxWidth: 340,
              minWidth: 220,
            }}
          >
            <input
              type="text"
              placeholder="Buscar por nome ou categoria..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              style={inputStyle}
            />
          </div>

          <div
            style={{
              color: DS.textMuted,
              fontSize: 12,
              fontWeight: 700,
              marginLeft: 'auto',
            }}
          >
            {loading
              ? 'Atualizando catálogo...'
              : `${filteredProducts.length} de ${products.length} produto(s)`}
          </div>
        </section>

        <section
          style={{
            ...cardStyle(),
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              alignItems: 'flex-start',
              borderBottom: `1px solid ${DS.border}`,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 16,
              justifyContent: 'space-between',
              padding: '18px 20px',
            }}
          >
            <div>
              <h2
                style={{
                  color: DS.textPrimary,
                  fontSize: 16,
                  fontWeight: 850,
                  margin: 0,
                }}
              >
                Produtos Cadastrados
              </h2>

              <p
                style={{
                  color: DS.textSecondary,
                  fontSize: 12,
                  lineHeight: 1.5,
                  margin: '6px 0 0',
                }}
              >
                Produtos ativos ficam disponíveis para novos fechamentos. Os
                inativos permanecem preservados no histórico comercial.
              </p>
            </div>

            <div
              style={{
                background: 'rgba(59,130,246,0.09)',
                border: '1px solid rgba(147,197,253,0.18)',
                borderRadius: 6,
                color: DS.blueSoft,
                fontSize: 11,
                fontWeight: 800,
                padding: '6px 9px',
              }}
            >
              EMPRESA ATIVA
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 940 }}>
              <div
                style={{
                  ...rowGrid,
                  background: '#0f1118',
                  borderBottom: `1px solid ${DS.border}`,
                  color: DS.textMuted,
                  display: 'grid',
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: '0.07em',
                  padding: '12px 18px',
                  textTransform: 'uppercase',
                }}
              >
                <span>Produto</span>
                <span>Categoria</span>
                <span style={{ textAlign: 'right' }}>Preço Base</span>
                <span style={{ textAlign: 'center' }}>Status</span>
                <span style={{ textAlign: 'right' }}>Ações</span>
              </div>

              {loading ? (
                <div
                  style={{
                    color: DS.textSecondary,
                    fontSize: 13,
                    padding: '42px 20px',
                    textAlign: 'center',
                  }}
                >
                  Carregando catálogo de produtos...
                </div>
              ) : null}

              {!loading && filteredProducts.length === 0 ? (
                <div
                  style={{
                    color: DS.textSecondary,
                    padding: '48px 20px',
                    textAlign: 'center',
                  }}
                >
                  <div
                    style={{
                      color: DS.textPrimary,
                      fontSize: 15,
                      fontWeight: 800,
                    }}
                  >
                    {products.length === 0
                      ? 'Nenhum produto cadastrado'
                      : 'Nenhum produto encontrado'}
                  </div>

                  <div
                    style={{
                      color: DS.textMuted,
                      fontSize: 12,
                      marginTop: 8,
                    }}
                  >
                    {products.length === 0
                      ? 'Cadastre o primeiro produto para utilizá-lo nos novos fechamentos.'
                      : 'Ajuste os filtros ou o campo de busca para localizar o produto.'}
                  </div>
                </div>
              ) : null}

              {!loading &&
                filteredProducts.map((product, index) => {
                  const isEditing = editingId === product.id

                  return (
                    <div
                      key={product.id}
                      style={{
                        ...rowGrid,
                        background:
                          index % 2 === 0
                            ? 'transparent'
                            : 'rgba(17,19,24,0.36)',
                        borderBottom: `1px solid ${DS.borderSubtle}`,
                        display: 'grid',
                        padding: '14px 18px',
                      }}
                    >
                      <div
                        style={{
                          alignItems: 'center',
                          display: 'flex',
                          minWidth: 0,
                          paddingRight: 12,
                        }}
                      >
                        {isEditing ? (
                          <input
                            type="text"
                            value={editName}
                            onChange={(event) =>
                              setEditName(event.target.value)
                            }
                            style={inputStyle}
                          />
                        ) : (
                          <div
                            style={{
                              color: DS.textPrimary,
                              fontSize: 13,
                              fontWeight: 800,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            title={product.name}
                          >
                            {product.name}
                          </div>
                        )}
                      </div>

                      <div
                        style={{
                          alignItems: 'center',
                          display: 'flex',
                          minWidth: 0,
                          paddingRight: 12,
                        }}
                      >
                        {isEditing ? (
                          <input
                            type="text"
                            value={editCategory}
                            onChange={(event) =>
                              setEditCategory(event.target.value)
                            }
                            style={inputStyle}
                          />
                        ) : (
                          <div
                            style={{
                              color: product.category
                                ? DS.textSecondary
                                : DS.textMuted,
                              fontSize: 13,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            title={product.category || 'Sem categoria'}
                          >
                            {product.category || 'Sem categoria'}
                          </div>
                        )}
                      </div>

                      <div
                        style={{
                          alignItems: 'center',
                          display: 'flex',
                          justifyContent: 'flex-end',
                          paddingRight: 12,
                        }}
                      >
                        {isEditing ? (
                          <input
                            type="text"
                            value={editPrice}
                            onChange={(event) =>
                              setEditPrice(event.target.value)
                            }
                            style={{
                              ...inputStyle,
                              textAlign: 'right',
                            }}
                          />
                        ) : (
                          <span
                            style={{
                              color: DS.greenSoft,
                              fontSize: 13,
                              fontWeight: 800,
                            }}
                          >
                            {formatBRL(product.base_price)}
                          </span>
                        )}
                      </div>

                      <div
                        style={{
                          alignItems: 'center',
                          display: 'flex',
                          justifyContent: 'center',
                          paddingRight: 12,
                        }}
                      >
                        <StatusBadge active={product.active} />
                      </div>

                      <div
                        style={{
                          alignItems: 'center',
                          display: 'flex',
                          gap: 7,
                          justifyContent: 'flex-end',
                        }}
                      >
                        {isEditing ? (
                          <>
                            <ActionButton
                              variant="primary"
                              disabled={saving}
                              onClick={() => {
                                void handleSaveEdit(product.id)
                              }}
                            >
                              {saving ? 'Salvando...' : 'Salvar'}
                            </ActionButton>

                            <ActionButton
                              variant="secondary"
                              disabled={saving}
                              onClick={cancelEdit}
                            >
                              Cancelar
                            </ActionButton>
                          </>
                        ) : (
                          <>
                            <ActionButton
                              variant="secondary"
                              onClick={() => startEdit(product)}
                            >
                              Editar
                            </ActionButton>

                            <ActionButton
                              variant={
                                product.active ? 'danger' : 'success'
                              }
                              onClick={() => {
                                void handleToggle(product)
                              }}
                            >
                              {product.active ? 'Desativar' : 'Ativar'}
                            </ActionButton>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        </section>

        <section
          style={{
            background: DS.surfaceBg,
            border: `1px solid ${DS.border}`,
            borderRadius: DS.radiusContainer,
            marginTop: 20,
            padding: '16px 18px',
          }}
        >
          <div
            style={{
              color: DS.blueSoft,
              fontSize: 12,
              fontWeight: 850,
              marginBottom: 7,
            }}
          >
            Critério de gestão
          </div>

          <div
            style={{
              color: DS.textSecondary,
              fontSize: 12,
              lineHeight: 1.65,
            }}
          >
            Produtos ativos podem ser selecionados nos novos fechamentos.
            Desativar um produto impede o uso futuro, mas mantém os vínculos e
            os resultados históricos já registrados no sistema.
          </div>
        </section>
      </div>
    </div>
  )
}