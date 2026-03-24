'use client'

import { useEffect, useState } from 'react'
import type { Product } from '@/app/types/product'
import {
  listProducts,
  createProduct,
  updateProduct,
  toggleProductActive,
} from '@/app/lib/services/products'

// ------------------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------------------

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

function parseBRL(text: string): number {
  const cleaned = text
    .replace(/[^\d,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
  const n = parseFloat(cleaned || '0')
  return Number.isFinite(n) ? n : 0
}

// ------------------------------------------------------------------------------
// Component
// ------------------------------------------------------------------------------

interface Props {
  companyId: string
}

type Filter = 'all' | 'active' | 'inactive'

export default function ProdutosClient({ companyId }: Props) {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Create form state
  const [formName, setFormName] = useState('')
  const [formCategory, setFormCategory] = useState('')
  const [formPrice, setFormPrice] = useState('')
  const [saving, setSaving] = useState(false)

  // Edit form state (keyed by product id)
  const [editName, setEditName] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editPrice, setEditPrice] = useState('')

  // ------------------------------------------------------------------------------
  // Data loading
  // ------------------------------------------------------------------------------

  async function loadProducts() {
    setLoading(true)
    setError(null)
    try {
      const data = await listProducts(companyId)
      setProducts(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar produtos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProducts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId])

  // ------------------------------------------------------------------------------
  // Filtered list
  // ------------------------------------------------------------------------------

  const filtered = products.filter((p) => {
    if (filter === 'active' && !p.active) return false
    if (filter === 'inactive' && p.active) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
    }
    return true
  })

  // ------------------------------------------------------------------------------
  // Create
  // ------------------------------------------------------------------------------

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!formName.trim()) return

    setSaving(true)
    setError(null)
    try {
      await createProduct({
        company_id: companyId,
        name: formName,
        category: formCategory,
        base_price: parseBRL(formPrice),
      })
      setFormName('')
      setFormCategory('')
      setFormPrice('')
      setShowForm(false)
      await loadProducts()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao criar produto')
    } finally {
      setSaving(false)
    }
  }

  // ------------------------------------------------------------------------------
  // Edit
  // ------------------------------------------------------------------------------

  function startEdit(product: Product) {
    setEditingId(product.id)
    setEditName(product.name)
    setEditCategory(product.category)
    setEditPrice(
      new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
        product.base_price,
      ),
    )
  }

  function cancelEdit() {
    setEditingId(null)
  }

  async function handleSaveEdit(productId: string) {
    setSaving(true)
    setError(null)
    try {
      await updateProduct(productId, {
        name: editName,
        category: editCategory,
        base_price: parseBRL(editPrice),
      })
      setEditingId(null)
      await loadProducts()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao atualizar produto')
    } finally {
      setSaving(false)
    }
  }

  // ------------------------------------------------------------------------------
  // Toggle active
  // ------------------------------------------------------------------------------

  async function handleToggle(product: Product) {
    setError(null)
    try {
      await toggleProductActive(product.id, !product.active)
      await loadProducts()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao atualizar produto')
    }
  }

  // ------------------------------------------------------------------------------
  // Styles
  // ------------------------------------------------------------------------------

  const cardStyle: React.CSSProperties = {
    background: '#0f0f0f',
    border: '1px solid #2a2a2a',
    borderRadius: 12,
    padding: '20px 24px',
    marginBottom: 16,
  }

  const inputStyle: React.CSSProperties = {
    background: '#111',
    border: '1px solid #333',
    borderRadius: 8,
    color: '#fff',
    padding: '8px 12px',
    fontSize: 14,
    outline: 'none',
    width: '100%',
  }

  const btnPrimary: React.CSSProperties = {
    background: '#1a6f43',
    border: '1px solid #1f5f3a',
    borderRadius: 8,
    color: '#fff',
    padding: '8px 16px',
    fontSize: 14,
    cursor: 'pointer',
    fontWeight: 600,
  }

  const btnSecondary: React.CSSProperties = {
    background: '#1a1a1a',
    border: '1px solid #333',
    borderRadius: 8,
    color: '#aaa',
    padding: '8px 16px',
    fontSize: 14,
    cursor: 'pointer',
  }

  const btnDanger: React.CSSProperties = {
    background: '#1a0a0a',
    border: '1px solid #5f1f1f',
    borderRadius: 8,
    color: '#f87171',
    padding: '6px 12px',
    fontSize: 13,
    cursor: 'pointer',
  }

  const btnActivate: React.CSSProperties = {
    ...btnSecondary,
    color: '#4ade80',
    borderColor: '#1f5f3a',
    padding: '6px 12px',
    fontSize: 13,
  }

  const headerTextStyle: React.CSSProperties = {
    color: '#666',
    fontSize: 12,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  }

  // ------------------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------------------

  return (
    <div>
      {/* Error banner */}
      {error && (
        <div
          style={{
            background: '#1a0a0a',
            border: '1px solid #5f1f1f',
            borderRadius: 8,
            color: '#f87171',
            padding: '12px 16px',
            marginBottom: 16,
            fontSize: 14,
          }}
        >
          {error}
        </div>
      )}

      {/* Top bar: filters + new button */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 4 }}>
          {(['all', 'active', 'inactive'] as Filter[]).map((f) => {
            const labels: Record<Filter, string> = {
              all: 'Todos',
              active: 'Ativos',
              inactive: 'Inativos',
            }
            const isActive = filter === f
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  background: isActive ? '#1a3a2a' : '#1a1a1a',
                  border: `1px solid ${isActive ? '#1f5f3a' : '#333'}`,
                  borderRadius: 8,
                  color: isActive ? '#4ade80' : '#aaa',
                  padding: '6px 14px',
                  fontSize: 13,
                  cursor: 'pointer',
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                {labels[f]}
              </button>
            )
          })}
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Buscar por nome ou categoria…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...inputStyle, width: 260, flex: '0 0 260px' }}
        />

        <div style={{ flex: 1 }} />

        {/* New product button */}
        <button
          onClick={() => {
            setShowForm((v) => !v)
            setError(null)
          }}
          style={btnPrimary}
        >
          {showForm ? '✕ Cancelar' : '+ Novo Produto'}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div style={cardStyle}>
          <p style={{ color: '#fff', fontWeight: 600, marginBottom: 14, fontSize: 15 }}>
            Novo Produto
          </p>
          <form onSubmit={handleCreate}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 160px auto',
                gap: 12,
                alignItems: 'end',
              }}
            >
              <div>
                <label style={{ color: '#888', fontSize: 12, display: 'block', marginBottom: 4 }}>
                  Nome *
                </label>
                <input
                  type="text"
                  placeholder="Nome do produto"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  required
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ color: '#888', fontSize: 12, display: 'block', marginBottom: 4 }}>
                  Categoria
                </label>
                <input
                  type="text"
                  placeholder="Ex: Software, Serviço…"
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ color: '#888', fontSize: 12, display: 'block', marginBottom: 4 }}>
                  Preço Base (R$)
                </label>
                <input
                  type="text"
                  placeholder="0,00"
                  value={formPrice}
                  onChange={(e) => setFormPrice(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <button type="submit" disabled={saving} style={{ ...btnPrimary, whiteSpace: 'nowrap' }}>
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Products table */}
      <div
        style={{
          background: '#0f0f0f',
          border: '1px solid #2a2a2a',
          borderRadius: 14,
          overflow: 'hidden',
        }}
      >
        {/* Table header */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 180px 160px 100px 180px',
            padding: '12px 20px',
            borderBottom: '1px solid #2a2a2a',
            background: '#111',
          }}
        >
          {['Nome', 'Categoria', 'Preço Base', 'Status', 'Ações'].map((h) => (
            <span key={h} style={headerTextStyle}>
              {h}
            </span>
          ))}
        </div>

        {/* Loading state */}
        {loading && (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#555', fontSize: 14 }}>
            Carregando produtos…
          </div>
        )}

        {/* Empty state */}
        {!loading && filtered.length === 0 && (
          <div style={{ padding: '48px 20px', textAlign: 'center', color: '#555' }}>
            <p style={{ fontSize: 16, marginBottom: 8 }}>
              {products.length === 0 ? 'Nenhum produto cadastrado' : 'Nenhum produto encontrado'}
            </p>
            {products.length === 0 && (
              <p style={{ fontSize: 13, color: '#444' }}>
                Clique em <strong style={{ color: '#4ade80' }}>+ Novo Produto</strong> para começar.
              </p>
            )}
          </div>
        )}

        {/* Rows */}
        {!loading &&
          filtered.map((product, idx) => {
            const isEditing = editingId === product.id
            const rowBg = idx % 2 === 0 ? '#0f0f0f' : '#0c0c0c'

            return (
              <div
                key={product.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 180px 160px 100px 180px',
                  padding: '14px 20px',
                  borderBottom: '1px solid #1e1e1e',
                  background: rowBg,
                  alignItems: 'center',
                  transition: 'background 0.15s',
                }}
              >
                {/* Name */}
                <div>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      style={{ ...inputStyle, fontSize: 13 }}
                    />
                  ) : (
                    <span style={{ color: '#fff', fontSize: 14, fontWeight: 500 }}>{product.name}</span>
                  )}
                </div>

                {/* Category */}
                <div>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value)}
                      style={{ ...inputStyle, fontSize: 13 }}
                    />
                  ) : (
                    <span style={{ color: '#888', fontSize: 13 }}>
                      {product.category || <span style={{ color: '#444' }}>—</span>}
                    </span>
                  )}
                </div>

                {/* Price */}
                <div>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editPrice}
                      onChange={(e) => setEditPrice(e.target.value)}
                      style={{ ...inputStyle, fontSize: 13 }}
                    />
                  ) : (
                    <span style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 500 }}>
                      {formatBRL(product.base_price)}
                    </span>
                  )}
                </div>

                {/* Status badge */}
                <div>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '3px 10px',
                      borderRadius: 20,
                      fontSize: 12,
                      fontWeight: 600,
                      background: product.active ? '#07140c' : '#140707',
                      border: `1px solid ${product.active ? '#1f5f3a' : '#5f1f1f'}`,
                      color: product.active ? '#4ade80' : '#f87171',
                    }}
                  >
                    {product.active ? 'Ativo' : 'Inativo'}
                  </span>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {isEditing ? (
                    <>
                      <button
                        onClick={() => handleSaveEdit(product.id)}
                        disabled={saving}
                        style={{ ...btnPrimary, padding: '6px 12px', fontSize: 13 }}
                      >
                        {saving ? '…' : 'Salvar'}
                      </button>
                      <button onClick={cancelEdit} style={{ ...btnSecondary, padding: '6px 12px', fontSize: 13 }}>
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => startEdit(product)}
                        style={{ ...btnSecondary, padding: '6px 12px', fontSize: 13 }}
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleToggle(product)}
                        style={product.active ? btnDanger : btnActivate}
                      >
                        {product.active ? 'Desativar' : 'Ativar'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
      </div>

      {/* Count */}
      {!loading && products.length > 0 && (
        <p style={{ color: '#555', fontSize: 12, marginTop: 12, textAlign: 'right' }}>
          {filtered.length} de {products.length} produto{products.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  )
}
