'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type AssignmentMode =
  | 'same_seller'
  | 'pool'
  | 'auto_balance'
  | 'specific_seller'

type OpportunityType =
  | 'reativacao'
  | 'renovacao'
  | 'recompra'
  | 'upgrade'
  | 'novo_produto'

type SellerOption = {
  id: string
  label: string
}

type GroupOption = {
  id: string
  name: string
}

type SuccessorOptions = {
  can_change_destination: boolean
  recommended_owner_id: string | null
  recommended_owner_label: string | null
  sellers: SellerOption[]
  groups: GroupOption[]
}

type CreateResponse = {
  ok?: boolean
  error?: string
  cycle_id?: string
  active_cycle_id?: string
}

const OPPORTUNITY_OPTIONS: Array<{
  value: OpportunityType
  label: string
}> = [
  { value: 'reativacao', label: 'Reativação' },
  { value: 'renovacao', label: 'Renovação' },
  { value: 'recompra', label: 'Recompra' },
  { value: 'upgrade', label: 'Upgrade' },
  { value: 'novo_produto', label: 'Novo produto' },
]

const FIELD_STYLE = {
  background: '#0d0f14',
  border: '1px solid #1a1d2e',
  borderRadius: 8,
  color: '#edf2f7',
  padding: '9px 10px',
  fontSize: 12,
  fontFamily: 'inherit',
}

export default function SuccessorOpportunityAction({
  sourceCycleId,
  leadId,
}: {
  sourceCycleId: string
  leadId: string
}) {
  const router = useRouter()

  const [isOpen, setIsOpen] = useState(false)
  const [isLoadingOptions, setIsLoadingOptions] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [options, setOptions] = useState<SuccessorOptions | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeCycleId, setActiveCycleId] = useState<string | null>(null)

  const [opportunityType, setOpportunityType] =
    useState<OpportunityType>('reativacao')

  const [assignmentMode, setAssignmentMode] =
    useState<AssignmentMode>('same_seller')

  const [specificOwnerId, setSpecificOwnerId] = useState('')
  const [groupId, setGroupId] = useState('')
  const [note, setNote] = useState('')

  const openModal = async () => {
    setIsOpen(true)
    setError(null)
    setActiveCycleId(null)
    setIsLoadingOptions(true)

    try {
      const response = await fetch(
        `/api/sales-cycles/successor?source_cycle_id=${encodeURIComponent(sourceCycleId)}`,
        {
          method: 'GET',
          cache: 'no-store',
        },
      )

      const data = (await response.json().catch(() => ({}))) as
        | ({ ok?: boolean; error?: string } & Partial<SuccessorOptions>)
        | undefined

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error ?? 'Não foi possível carregar as opções.')
      }

      const loadedOptions = data as SuccessorOptions

      setOptions(loadedOptions)
      setAssignmentMode(
        loadedOptions.recommended_owner_id
          ? 'same_seller'
          : 'pool',
      )
      setSpecificOwnerId('')
      setGroupId('')
      setNote('')
    } catch (loadError: unknown) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Não foi possível carregar as opções.',
      )
    } finally {
      setIsLoadingOptions(false)
    }
  }

  const closeModal = () => {
    if (isSaving) return

    setIsOpen(false)
    setError(null)
    setActiveCycleId(null)
  }

  const createSuccessor = async () => {
    if (!options) return

    if (
      assignmentMode === 'specific_seller' &&
      !specificOwnerId
    ) {
      setError('Selecione o vendedor que receberá a oportunidade.')
      return
    }

    setIsSaving(true)
    setError(null)
    setActiveCycleId(null)

    try {
      const response = await fetch('/api/sales-cycles/successor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({
          source_cycle_id: sourceCycleId,
          opportunity_type: opportunityType,
          assignment_mode: assignmentMode,
          owner_user_id:
            assignmentMode === 'specific_seller'
              ? specificOwnerId
              : null,
          group_id: groupId || null,
          note: note || null,
        }),
      })

      const result = (await response.json().catch(() => ({}))) as CreateResponse

      if (!response.ok || !result.ok) {
        if (
          result.error === 'active_cycle_exists' &&
          result.active_cycle_id
        ) {
          setActiveCycleId(result.active_cycle_id)
        }

        throw new Error(
          result.error === 'active_cycle_exists'
            ? 'Este lead já possui uma oportunidade ativa.'
            : result.error ?? 'Não foi possível criar a oportunidade.',
        )
      }

      if (!result.cycle_id) {
        throw new Error(
          'A oportunidade foi criada, mas o sistema não retornou o ciclo.',
        )
      }

      router.push(`/leads/${leadId}?opportunity=${result.cycle_id}`)
      router.refresh()
    } catch (createError: unknown) {
      setError(
        createError instanceof Error
          ? createError.message
          : 'Não foi possível criar a oportunidade.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  const sameSellerLabel = options?.recommended_owner_label
    ? `Manter com ${options.recommended_owner_label}`
    : 'Enviar ao Pool'

  return (
    <>
      <section
        style={{
          background: '#0d0f14',
          border: '1px solid #1a1d2e',
          borderRadius: 12,
          padding: '14px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          gap: 14,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div
            style={{
              color: '#edf2f7',
              fontSize: 13,
              fontWeight: 800,
            }}
          >
            Trabalhar este lead novamente
          </div>

          <div
            style={{
              color: '#8fa3bc',
              fontSize: 12,
              marginTop: 3,
            }}
          >
            O ciclo anterior permanece no histórico e uma nova oportunidade nasce em Novo.
          </div>
        </div>

        <button
          type="button"
          onClick={() => void openModal()}
          style={{
            border: '1px solid rgba(59,130,246,0.35)',
            borderRadius: 8,
            background: 'rgba(59,130,246,0.12)',
            color: '#93c5fd',
            padding: '8px 11px',
            fontSize: 12,
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          + Nova oportunidade
        </button>
      </section>

      {isOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 12000,
            background: 'rgba(0,0,0,0.62)',
            display: 'grid',
            placeItems: 'center',
            padding: 16,
          }}
          onMouseDown={closeModal}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Criar nova oportunidade"
            style={{
              width: 'min(540px, 100%)',
              maxHeight: 'calc(100vh - 32px)',
              overflowY: 'auto',
              background: '#111318',
              border: '1px solid #1a1d2e',
              borderRadius: 14,
              padding: 18,
              boxShadow: '0 18px 55px rgba(0,0,0,0.58)',
            }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                alignItems: 'flex-start',
                marginBottom: 16,
              }}
            >
              <div>
                <div
                  style={{
                    color: '#edf2f7',
                    fontSize: 15,
                    fontWeight: 850,
                  }}
                >
                  Nova oportunidade
                </div>

                <div
                  style={{
                    color: '#8fa3bc',
                    fontSize: 12,
                    marginTop: 4,
                    lineHeight: 1.45,
                  }}
                >
                  A oportunidade anterior não será reaberta nem alterada.
                </div>
              </div>

              <button
                type="button"
                onClick={closeModal}
                disabled={isSaving}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#8fa3bc',
                  fontSize: 20,
                  lineHeight: 1,
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                }}
              >
                ×
              </button>
            </div>

            {isLoadingOptions && (
              <div
                style={{
                  color: '#8fa3bc',
                  fontSize: 13,
                  padding: '18px 0',
                }}
              >
                Carregando opções…
              </div>
            )}

            {!isLoadingOptions && options && (
              <div style={{ display: 'grid', gap: 14 }}>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: '#8fa3bc', fontSize: 11, fontWeight: 800 }}>
                    TIPO DA OPORTUNIDADE
                  </span>

                  <select
                    value={opportunityType}
                    onChange={(event) =>
                      setOpportunityType(event.target.value as OpportunityType)
                    }
                    disabled={isSaving}
                    style={FIELD_STYLE}
                  >
                    {OPPORTUNITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                {options.can_change_destination ? (
                  <>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={{ color: '#8fa3bc', fontSize: 11, fontWeight: 800 }}>
                        DESTINO
                      </span>

                      <select
                        value={assignmentMode}
                        onChange={(event) =>
                          setAssignmentMode(event.target.value as AssignmentMode)
                        }
                        disabled={isSaving}
                        style={FIELD_STYLE}
                      >
                        <option value="same_seller">{sameSellerLabel}</option>
                        <option value="pool">Enviar ao Pool</option>
                        <option value="auto_balance">
                          Distribuir pela menor carteira
                        </option>
                        <option value="specific_seller">
                          Escolher outro vendedor
                        </option>
                      </select>
                    </label>

                    {assignmentMode === 'specific_seller' && (
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span style={{ color: '#8fa3bc', fontSize: 11, fontWeight: 800 }}>
                          VENDEDOR
                        </span>

                        <select
                          value={specificOwnerId}
                          onChange={(event) => setSpecificOwnerId(event.target.value)}
                          disabled={isSaving}
                          style={FIELD_STYLE}
                        >
                          <option value="">Selecione o vendedor</option>

                          {options.sellers.map((seller) => (
                            <option key={seller.id} value={seller.id}>
                              {seller.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </>
                ) : (
                  <div
                    style={{
                      padding: '10px 11px',
                      borderRadius: 8,
                      border: '1px solid rgba(59,130,246,0.20)',
                      background: 'rgba(59,130,246,0.06)',
                      color: '#8fa3bc',
                      fontSize: 12,
                    }}
                  >
                    Destino:{' '}
                    <strong style={{ color: '#edf2f7' }}>
                      {options.recommended_owner_label ?? 'Pool'}
                    </strong>
                  </div>
                )}

                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: '#8fa3bc', fontSize: 11, fontWeight: 800 }}>
                    GRUPO
                  </span>

                  <select
                    value={groupId}
                    onChange={(event) => setGroupId(event.target.value)}
                    disabled={isSaving}
                    style={FIELD_STYLE}
                  >
                    <option value="">Sem grupo</option>

                    {options.groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: '#8fa3bc', fontSize: 11, fontWeight: 800 }}>
                    OBSERVAÇÃO
                  </span>

                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    disabled={isSaving}
                    maxLength={2000}
                    rows={3}
                    placeholder="Ex.: aluno pediu para conversar novamente sobre renovação."
                    style={{
                      ...FIELD_STYLE,
                      resize: 'vertical',
                    }}
                  />
                </label>

                {error && (
                  <div
                    style={{
                      padding: '10px 11px',
                      borderRadius: 8,
                      border: '1px solid rgba(248,113,113,0.32)',
                      background: 'rgba(248,113,113,0.08)',
                      color: '#f87171',
                      fontSize: 12,
                      lineHeight: 1.45,
                    }}
                  >
                    {error}

                    {activeCycleId && (
                      <button
                        type="button"
                        onClick={() =>
                          router.push(
                            `/leads/${leadId}?opportunity=${activeCycleId}`,
                          )
                        }
                        style={{
                          display: 'block',
                          marginTop: 8,
                          border: 'none',
                          background: 'transparent',
                          color: '#93c5fd',
                          fontSize: 12,
                          fontWeight: 800,
                          padding: 0,
                          cursor: 'pointer',
                        }}
                      >
                        Abrir oportunidade ativa
                      </button>
                    )}
                  </div>
                )}

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: 8,
                  }}
                >
                  <button
                    type="button"
                    onClick={closeModal}
                    disabled={isSaving}
                    style={{
                      border: '1px solid #1a1d2e',
                      borderRadius: 8,
                      background: 'transparent',
                      color: '#8fa3bc',
                      padding: '8px 11px',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: isSaving ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Cancelar
                  </button>

                  <button
                    type="button"
                    onClick={() => void createSuccessor()}
                    disabled={isSaving}
                    style={{
                      border: 'none',
                      borderRadius: 8,
                      background: '#3b82f6',
                      color: '#ffffff',
                      padding: '8px 12px',
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: isSaving ? 'not-allowed' : 'pointer',
                      opacity: isSaving ? 0.65 : 1,
                    }}
                  >
                    {isSaving ? 'Criando…' : 'Criar oportunidade'}
                  </button>
                </div>
              </div>
            )}

            {!isLoadingOptions && !options && error && (
              <div
                style={{
                  padding: '10px 11px',
                  borderRadius: 8,
                  border: '1px solid rgba(248,113,113,0.32)',
                  background: 'rgba(248,113,113,0.08)',
                  color: '#f87171',
                  fontSize: 12,
                }}
              >
                {error}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  )
}