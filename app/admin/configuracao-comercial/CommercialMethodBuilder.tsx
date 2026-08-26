'use client'

import * as React from 'react'

import {
  advanceCommercialMethodBuilder,
  buildCommercialMethodBuilderReview,
  getCommercialMethodBuilderVisibility,
  goToPreviousBuilderStep,
  validateCommercialMethodBuilderStep,
} from '@/app/lib/commercial-config/commercial-method-builder'
import {
  createEmptyCommercialMethodBuilderDraft,
} from '@/app/types/commercial-method-builder'
import type {
  CommercialBuilderOfferItem,
  CommercialMethodBuilderData,
  CommercialMethodBuilderDraftInput,
  CommercialMethodBuilderDraftRecord,
  CommercialMethodBuilderStep,
} from '@/app/types/commercial-method-builder'

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

const CHANNELS = [
  'WhatsApp',
  'Telefone',
  'Presencial',
  'Site',
  'Inbound',
  'Outbound',
  'Indicação',
]

const SALES_EVENTS = [
  'Demonstração',
  'Tour',
  'Teste',
  'Reunião',
  'Diagnóstico',
  'Proposta formal',
  'Orçamento',
]

const PRESENTATION_TOUCHPOINTS = [
  'Demonstração',
  'Tour',
  'Proposta',
  'Orçamento',
  'Apresentação',
  'Teste',
]

const CLOSING_ACTIONS = [
  'Contrato',
  'Pagamento',
  'Assinatura',
  'Matrícula',
  'Aceite',
  'Cadastro',
]

type BuilderResponse =
  | { ok: true; draft: CommercialMethodBuilderDraftRecord | null }
  | { ok: false; error: string }

type SaveResponse =
  | { ok: true; draft: CommercialMethodBuilderDraftRecord }
  | { ok: false; error: string }

interface Props {
  onBack: () => void
}

function linesToArray(value: string): string[] {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
}

function arrayToLines(value: string[]): string {
  return value.join('\n')
}

function cardStyle(): React.CSSProperties {
  return {
    background: DS.cardBg,
    border: `1px solid ${DS.border}`,
    borderRadius: DS.radiusContainer,
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
  padding: '10px 11px',
  width: '100%',
}

function Field({
  label,
  help,
  example,
  children,
}: {
  label: string
  help?: string
  example?: string
  children: React.ReactNode
}) {
  return (
    <label style={{ display: 'block' }}>
      <span
        style={{
          color: DS.textPrimary,
          display: 'block',
          fontSize: 12,
          fontWeight: 800,
          marginBottom: 7,
        }}
      >
        {label}
      </span>
      {help && (
        <span
          style={{
            color: DS.textSecondary,
            display: 'block',
            fontSize: 11,
            lineHeight: 1.5,
            marginBottom: 7,
          }}
        >
          {help}
        </span>
      )}
      {example && (
        <span
          style={{
            color: DS.textMuted,
            display: 'block',
            fontSize: 10,
            lineHeight: 1.45,
            marginBottom: 8,
          }}
        >
          Exemplo: {example}
        </span>
      )}
      {children}
    </label>
  )
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div style={{ ...cardStyle(), padding: 18 }}>
      <div
        style={{
          color: DS.textPrimary,
          fontSize: 14,
          fontWeight: 900,
        }}
      >
        {title}
      </div>
      {description && (
        <div
          style={{
            color: DS.textSecondary,
            fontSize: 11,
            lineHeight: 1.55,
            marginTop: 6,
          }}
        >
          {description}
        </div>
      )}
      <div
        style={{
          display: 'grid',
          gap: 16,
          marginTop: 18,
        }}
      >
        {children}
      </div>
    </div>
  )
}

function YesNo({
  value,
  onChange,
}: {
  value: boolean | null
  onChange: (value: boolean) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {[{ label: 'Sim', value: true }, { label: 'Não', value: false }].map(
        (option) => (
          <button
            key={option.label}
            type="button"
            onClick={() => onChange(option.value)}
            style={{
              background:
                value === option.value
                  ? 'rgba(59,130,246,0.16)'
                  : DS.surfaceBg,
              border: `1px solid ${
                value === option.value
                  ? 'rgba(96,165,250,0.45)'
                  : DS.borderStrong
              }`,
              borderRadius: DS.radius,
              color:
                value === option.value
                  ? DS.blueSoft
                  : DS.textSecondary,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 750,
              padding: '9px 14px',
            }}
          >
            {option.label}
          </button>
        ),
      )}
    </div>
  )
}

function Checklist({
  options,
  value,
  onChange,
}: {
  options: string[]
  value: string[]
  onChange: (value: string[]) => void
}) {
  return (
    <div
      style={{
        display: 'grid',
        gap: 8,
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
      }}
    >
      {options.map((option) => {
        const checked = value.includes(option)
        return (
          <button
            key={option}
            type="button"
            onClick={() =>
              onChange(
                checked
                  ? value.filter((item) => item !== option)
                  : [...value, option],
              )
            }
            style={{
              background: checked
                ? 'rgba(59,130,246,0.12)'
                : DS.surfaceBg,
              border: `1px solid ${
                checked ? 'rgba(96,165,250,0.35)' : DS.borderStrong
              }`,
              borderRadius: DS.radius,
              color: checked ? DS.blueSoft : DS.textSecondary,
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 700,
              padding: '9px 10px',
              textAlign: 'left',
            }}
          >
            {checked ? '✓ ' : ''}{option}
          </button>
        )
      })}
    </div>
  )
}

function ListField({
  label,
  value,
  onChange,
  help,
  example,
  rows = 3,
}: {
  label: string
  value: string[]
  onChange: (value: string[]) => void
  help?: string
  example?: string
  rows?: number
}) {
  return (
    <Field label={label} help={help} example={example}>
      <textarea
        rows={rows}
        value={arrayToLines(value)}
        onChange={(event) => onChange(linesToArray(event.target.value))}
        style={{ ...inputStyle, resize: 'vertical' }}
        placeholder="Uma resposta por linha"
      />
    </Field>
  )
}

function StepHeader({
  step,
}: {
  step: CommercialMethodBuilderStep
}) {
  const titles = [
    'Conheça sua operação',
    'Base comercial da empresa',
    'Como a venda acontece hoje',
    'Revisão das informações',
  ]

  return (
    <div style={{ ...cardStyle(), padding: 18 }}>
      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          gap: 12,
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div
            style={{
              color: DS.blueSoft,
              fontSize: 10,
              fontWeight: 850,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            Passo {step} de 4
          </div>
          <div
            style={{
              color: DS.textPrimary,
              fontSize: 20,
              fontWeight: 900,
              marginTop: 7,
            }}
          >
            {titles[step - 1]}
          </div>
        </div>
        <div
          style={{
            color: DS.textMuted,
            fontSize: 11,
          }}
        >
          {Math.round((step / 4) * 100)}%
        </div>
      </div>
      <div
        style={{
          background: DS.surfaceBg,
          borderRadius: 999,
          height: 5,
          marginTop: 15,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            background: DS.blue,
            borderRadius: 999,
            height: '100%',
            width: `${(step / 4) * 100}%`,
          }}
        />
      </div>
    </div>
  )
}

function createOffer(): CommercialBuilderOfferItem {
  return {
    id: `offer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: '',
    kind: 'service',
    description: '',
    benefits: [],
    differentiators: [],
    limitations: [],
  }
}

export default function CommercialMethodBuilder({ onBack }: Props) {
  const [draft, setDraft] = React.useState<CommercialMethodBuilderDraftInput>(
    createEmptyCommercialMethodBuilderDraft(),
  )
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [dirty, setDirty] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [issues, setIssues] = React.useState<string[]>([])
  const [savedAt, setSavedAt] = React.useState<string | null>(null)

  const updateData = React.useCallback(
    (updater: (data: CommercialMethodBuilderData) => CommercialMethodBuilderData) => {
      setDraft((current) => ({
        ...current,
        ready_for_method: false,
        data: updater(current.data),
      }))
      setDirty(true)
      setIssues([])
    },
    [],
  )

  const saveDraft = React.useCallback(
    async (nextDraft?: CommercialMethodBuilderDraftInput) => {
      const payload = nextDraft ?? draft
      setSaving(true)
      setError(null)

      try {
        const response = await fetch('/api/admin/commercial-method-builder', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const json = (await response.json()) as SaveResponse

        if (!response.ok || !json.ok) {
          throw new Error(
            json.ok ? 'Erro ao salvar o rascunho.' : json.error,
          )
        }

        setDraft({
          current_step: json.draft.current_step,
          completed_steps: json.draft.completed_steps,
          ready_for_method: json.draft.ready_for_method,
          data: json.draft.data,
        })
        setDirty(false)
        setSavedAt(json.draft.updated_at)
        return true
      } catch (saveError: unknown) {
        setError(
          saveError instanceof Error
            ? saveError.message
            : 'Erro ao salvar o rascunho.',
        )
        return false
      } finally {
        setSaving(false)
      }
    },
    [draft],
  )

  React.useEffect(() => {
    let active = true

    async function load() {
      try {
        const response = await fetch('/api/admin/commercial-method-builder', {
          method: 'GET',
          cache: 'no-store',
        })
        const json = (await response.json()) as BuilderResponse

        if (!response.ok || !json.ok) {
          throw new Error(
            json.ok ? 'Erro ao carregar o construtor.' : json.error,
          )
        }

        if (!active) return

        if (json.draft) {
          setDraft({
            current_step: json.draft.current_step,
            completed_steps: json.draft.completed_steps,
            ready_for_method: json.draft.ready_for_method,
            data: json.draft.data,
          })
          setSavedAt(json.draft.updated_at)
        }
      } catch (loadError: unknown) {
        if (!active) return
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Erro ao carregar o construtor.',
        )
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [])

  React.useEffect(() => {
    if (loading || !dirty || saving) return

    const timer = window.setTimeout(() => {
      void saveDraft()
    }, 900)

    return () => window.clearTimeout(timer)
  }, [dirty, draft, loading, saveDraft, saving])

  async function goNext() {
    const validationIssues = validateCommercialMethodBuilderStep(
      draft.current_step,
      draft.data,
    )

    if (validationIssues.length > 0) {
      setIssues(validationIssues)
      return
    }

    const progress = advanceCommercialMethodBuilder(
      draft.current_step,
      draft.completed_steps,
    )
    const nextDraft = {
      ...draft,
      ...progress,
      ready_for_method: false,
    }

    setDraft(nextDraft)
    setDirty(true)
    setIssues([])
    await saveDraft(nextDraft)
  }

  async function goBackStep() {
    const nextDraft = {
      ...draft,
      current_step: goToPreviousBuilderStep(draft.current_step),
      ready_for_method: false,
    }
    setDraft(nextDraft)
    setDirty(true)
    setIssues([])
    await saveDraft(nextDraft)
  }

  async function markReady() {
    const nextDraft: CommercialMethodBuilderDraftInput = {
      ...draft,
      current_step: 4,
      completed_steps: Array.from(
        new Set([...draft.completed_steps, 1, 2, 3, 4]),
      ).sort() as CommercialMethodBuilderStep[],
      ready_for_method: true,
    }
    setDraft(nextDraft)
    setDirty(true)
    await saveDraft(nextDraft)
  }

  if (loading) {
    return (
      <div style={{ ...cardStyle(), padding: 24, color: DS.textSecondary }}>
        Carregando seu rascunho assistido...
      </div>
    )
  }

  const visibility = getCommercialMethodBuilderVisibility(draft.data)
  const profile = draft.data.company_profile
  const rules = draft.data.commercial_rules
  const process = draft.data.current_sales_process

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          justifyContent: 'space-between',
        }}
      >
        <button
          type="button"
          onClick={onBack}
          style={{
            ...inputStyle,
            cursor: 'pointer',
            width: 'auto',
          }}
        >
          ← Voltar às opções
        </button>
        <div style={{ color: DS.textMuted, fontSize: 10 }}>
          {saving
            ? 'Salvando...'
            : savedAt
              ? `Rascunho salvo ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(savedAt))}`
              : 'Rascunho ainda não salvo'}
        </div>
      </div>

      <StepHeader step={draft.current_step} />

      {error && (
        <div
          style={{
            ...cardStyle(),
            borderColor: 'rgba(239,68,68,0.3)',
            color: DS.redSoft,
            fontSize: 11,
            padding: 14,
          }}
        >
          {error}
        </div>
      )}

      {issues.length > 0 && (
        <div
          style={{
            ...cardStyle(),
            borderColor: 'rgba(245,158,11,0.28)',
            padding: 14,
          }}
        >
          <div style={{ color: DS.yellowSoft, fontSize: 12, fontWeight: 800 }}>
            Complete estes pontos antes de continuar:
          </div>
          <ul style={{ color: DS.textSecondary, fontSize: 11, lineHeight: 1.6 }}>
            {issues.map((issue) => <li key={issue}>{issue}</li>)}
          </ul>
        </div>
      )}

      {draft.current_step === 1 && (
        <>
          <SectionCard
            title="Oferta"
            description="Conte o que a empresa comercializa. Não é necessário conhecer nenhum termo técnico."
          >
            <Field label="O que sua empresa vende?">
              <select
                value={profile.offer.type}
                onChange={(event) =>
                  updateData((data) => ({
                    ...data,
                    company_profile: {
                      ...data.company_profile,
                      offer: {
                        ...data.company_profile.offer,
                        type: event.target.value as typeof profile.offer.type,
                      },
                    },
                  }))
                }
                style={inputStyle}
              >
                <option value="">Selecione</option>
                <option value="product">Produtos</option>
                <option value="service">Serviços</option>
                <option value="both">Produtos e serviços</option>
              </select>
            </Field>
            <ListField
              label="Quais são os principais produtos ou serviços?"
              value={profile.offer.main_offerings}
              onChange={(value) =>
                updateData((data) => ({
                  ...data,
                  company_profile: {
                    ...data.company_profile,
                    offer: { ...data.company_profile.offer, main_offerings: value },
                  },
                }))
              }
              example="Plano mensal"
            />
            <Field label="Existe assinatura ou recorrência?">
              <YesNo
                value={profile.offer.has_recurring_revenue}
                onChange={(value) =>
                  updateData((data) => ({
                    ...data,
                    company_profile: {
                      ...data.company_profile,
                      offer: { ...data.company_profile.offer, has_recurring_revenue: value },
                    },
                  }))
                }
              />
            </Field>
            <Field label="Existem planos, pacotes ou combinações de oferta?">
              <YesNo
                value={profile.offer.has_plans_or_packages}
                onChange={(value) =>
                  updateData((data) => ({
                    ...data,
                    company_profile: {
                      ...data.company_profile,
                      offer: { ...data.company_profile.offer, has_plans_or_packages: value },
                    },
                  }))
                }
              />
            </Field>
          </SectionCard>

          <SectionCard title="Cliente">
            <Field label="Quem normalmente compra?">
              <select
                value={profile.customer.buyer_type}
                onChange={(event) =>
                  updateData((data) => ({
                    ...data,
                    company_profile: {
                      ...data.company_profile,
                      customer: {
                        ...data.company_profile.customer,
                        buyer_type: event.target.value as typeof profile.customer.buyer_type,
                      },
                    },
                  }))
                }
                style={inputStyle}
              >
                <option value="">Selecione</option>
                <option value="person">Pessoa física</option>
                <option value="company">Empresa</option>
                <option value="both">Ambos</option>
              </select>
            </Field>
            <ListField
              label="Existe algum tipo de cliente prioritário?"
              value={profile.customer.priority_segments}
              onChange={(value) =>
                updateData((data) => ({
                  ...data,
                  company_profile: {
                    ...data.company_profile,
                    customer: { ...data.company_profile.customer, priority_segments: value },
                  },
                }))
              }
              help="Use suas palavras. Pode ser um segmento, perfil ou situação recorrente."
            />
            {visibility.showB2BDecisionMakers && (
              <>
                <ListField
                  label="Quem normalmente participa ou aprova a decisão na empresa cliente?"
                  value={profile.customer.decision_makers}
                  onChange={(value) =>
                    updateData((data) => ({
                      ...data,
                      company_profile: {
                        ...data.company_profile,
                        customer: { ...data.company_profile.customer, decision_makers: value },
                      },
                    }))
                  }
                  example="Sócio, diretor financeiro"
                />
                <Field label="Normalmente existem várias pessoas envolvidas na decisão?">
                  <YesNo
                    value={profile.complexity.multiple_decision_makers}
                    onChange={(value) =>
                      updateData((data) => ({
                        ...data,
                        company_profile: {
                          ...data.company_profile,
                          complexity: { ...data.company_profile.complexity, multiple_decision_makers: value },
                        },
                      }))
                    }
                  />
                </Field>
              </>
            )}
          </SectionCard>

          <SectionCard title="Complexidade da venda e canais">
            <Field label="Quanto tempo a venda normalmente leva?">
              <select
                value={profile.complexity.typical_timing}
                onChange={(event) =>
                  updateData((data) => ({
                    ...data,
                    company_profile: {
                      ...data.company_profile,
                      complexity: {
                        ...data.company_profile.complexity,
                        typical_timing: event.target.value as typeof profile.complexity.typical_timing,
                      },
                    },
                  }))
                }
                style={inputStyle}
              >
                <option value="">Selecione</option>
                <option value="first_contact">Normalmente no primeiro atendimento</option>
                <option value="days">Alguns dias</option>
                <option value="weeks">Algumas semanas</option>
                <option value="months">Meses</option>
                <option value="varies">Varia bastante</option>
              </select>
            </Field>
            <Field
              label="O que pode acontecer antes da decisão?"
              help="Marque apenas o que realmente faz parte da operação."
            >
              <Checklist
                options={SALES_EVENTS}
                value={profile.complexity.sales_events}
                onChange={(value) =>
                  updateData((data) => ({
                    ...data,
                    company_profile: {
                      ...data.company_profile,
                      complexity: { ...data.company_profile.complexity, sales_events: value },
                    },
                  }))
                }
              />
            </Field>
            <Field label="Por quais canais sua equipe vende ou atende?">
              <Checklist
                options={CHANNELS}
                value={profile.channels}
                onChange={(value) =>
                  updateData((data) => ({
                    ...data,
                    company_profile: { ...data.company_profile, channels: value },
                  }))
                }
              />
            </Field>
            <ListField
              label="Outros canais"
              value={profile.other_channels}
              onChange={(value) =>
                updateData((data) => ({
                  ...data,
                  company_profile: { ...data.company_profile, other_channels: value },
                }))
              }
            />
          </SectionCard>
        </>
      )}

      {draft.current_step === 2 && (
        <>
          <SectionCard
            title="Produtos e serviços"
            description="Aqui entram fatos comerciais da empresa. Isso ainda não é o método de venda."
          >
            {rules.offers.map((offer, index) => (
              <div
                key={offer.id}
                style={{
                  background: DS.surfaceBg,
                  border: `1px solid ${DS.border}`,
                  borderRadius: DS.radius,
                  display: 'grid',
                  gap: 12,
                  padding: 14,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <strong style={{ color: DS.textPrimary, fontSize: 12 }}>
                    Oferta {index + 1}
                  </strong>
                  {rules.offers.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        updateData((data) => ({
                          ...data,
                          commercial_rules: {
                            ...data.commercial_rules,
                            offers: data.commercial_rules.offers.filter((item) => item.id !== offer.id),
                          },
                        }))
                      }
                      style={{ background: 'transparent', border: 0, color: DS.redSoft, cursor: 'pointer' }}
                    >
                      Remover
                    </button>
                  )}
                </div>
                <input
                  value={offer.name}
                  onChange={(event) =>
                    updateData((data) => ({
                      ...data,
                      commercial_rules: {
                        ...data.commercial_rules,
                        offers: data.commercial_rules.offers.map((item) =>
                          item.id === offer.id ? { ...item, name: event.target.value } : item,
                        ),
                      },
                    }))
                  }
                  placeholder="Nome do produto ou serviço"
                  style={inputStyle}
                />
                <select
                  value={offer.kind}
                  onChange={(event) =>
                    updateData((data) => ({
                      ...data,
                      commercial_rules: {
                        ...data.commercial_rules,
                        offers: data.commercial_rules.offers.map((item) =>
                          item.id === offer.id
                            ? { ...item, kind: event.target.value as CommercialBuilderOfferItem['kind'] }
                            : item,
                        ),
                      },
                    }))
                  }
                  style={inputStyle}
                >
                  <option value="product">Produto</option>
                  <option value="service">Serviço</option>
                  <option value="both">Combinação</option>
                </select>
                <textarea
                  rows={2}
                  value={offer.description}
                  onChange={(event) =>
                    updateData((data) => ({
                      ...data,
                      commercial_rules: {
                        ...data.commercial_rules,
                        offers: data.commercial_rules.offers.map((item) =>
                          item.id === offer.id ? { ...item, description: event.target.value } : item,
                        ),
                      },
                    }))
                  }
                  placeholder="Descrição comercial"
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
                {([
                  ['benefits', 'Principais benefícios'],
                  ['differentiators', 'Diferenciais verificados'],
                  ['limitations', 'Limitações importantes'],
                ] as const).map(([key, label]) => (
                  <ListField
                    key={key}
                    label={label}
                    value={offer[key]}
                    onChange={(value) =>
                      updateData((data) => ({
                        ...data,
                        commercial_rules: {
                          ...data.commercial_rules,
                          offers: data.commercial_rules.offers.map((item) =>
                            item.id === offer.id ? { ...item, [key]: value } : item,
                          ),
                        },
                      }))
                    }
                    rows={2}
                  />
                ))}
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                updateData((data) => ({
                  ...data,
                  commercial_rules: {
                    ...data.commercial_rules,
                    offers: [...data.commercial_rules.offers, createOffer()],
                  },
                }))
              }
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              + Adicionar produto ou serviço
            </button>
          </SectionCard>

          <SectionCard title="Preço, pagamento e descontos">
            <Field label="Como o preço é definido?">
              <select
                value={rules.pricing.model}
                onChange={(event) =>
                  updateData((data) => ({
                    ...data,
                    commercial_rules: {
                      ...data.commercial_rules,
                      pricing: { ...data.commercial_rules.pricing, model: event.target.value as typeof rules.pricing.model },
                    },
                  }))
                }
                style={inputStyle}
              >
                <option value="">Selecione</option>
                <option value="fixed">Preço fixo</option>
                <option value="variable">Preço varia conforme o caso</option>
                <option value="mixed">Parte fixa e parte variável</option>
                <option value="not_defined">Não existe regra única</option>
              </select>
            </Field>
            <Field label="Existe tabela de preços?">
              <YesNo
                value={rules.pricing.has_price_table}
                onChange={(value) => updateData((data) => ({ ...data, commercial_rules: { ...data.commercial_rules, pricing: { ...data.commercial_rules.pricing, has_price_table: value } } }))}
              />
            </Field>
            <Field label="O vendedor pode negociar condições comerciais?">
              <YesNo
                value={rules.pricing.seller_can_negotiate}
                onChange={(value) => updateData((data) => ({ ...data, commercial_rules: { ...data.commercial_rules, pricing: { ...data.commercial_rules.pricing, seller_can_negotiate: value } } }))}
              />
            </Field>
            {rules.pricing.seller_can_negotiate !== null && (
              <Field label="Quais limites ou regras existem para negociação?">
                <textarea
                  rows={3}
                  value={rules.pricing.negotiation_notes}
                  onChange={(event) => updateData((data) => ({ ...data, commercial_rules: { ...data.commercial_rules, pricing: { ...data.commercial_rules.pricing, negotiation_notes: event.target.value } } }))}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </Field>
            )}
            <ListField
              label="Formas de pagamento aceitas"
              value={rules.payment.methods}
              onChange={(value) => updateData((data) => ({ ...data, commercial_rules: { ...data.commercial_rules, payment: { ...data.commercial_rules.payment, methods: value } } }))}
              example="PIX"
            />
            <Field label="Permite parcelamento?">
              <YesNo value={rules.payment.allows_installments} onChange={(value) => updateData((data) => ({ ...data, commercial_rules: { ...data.commercial_rules, payment: { ...data.commercial_rules.payment, allows_installments: value } } }))} />
            </Field>
            <Field label="Existe cobrança recorrente?">
              <YesNo value={rules.payment.has_recurring_payment} onChange={(value) => updateData((data) => ({ ...data, commercial_rules: { ...data.commercial_rules, payment: { ...data.commercial_rules.payment, has_recurring_payment: value } } }))} />
            </Field>
            <Field label="Existe entrada obrigatória?">
              <YesNo value={rules.payment.requires_entry_payment} onChange={(value) => updateData((data) => ({ ...data, commercial_rules: { ...data.commercial_rules, payment: { ...data.commercial_rules.payment, requires_entry_payment: value } } }))} />
            </Field>
            <Field label="Como funciona a política de descontos?">
              <select
                value={rules.discounts.policy}
                onChange={(event) => updateData((data) => ({ ...data, commercial_rules: { ...data.commercial_rules, discounts: { ...data.commercial_rules.discounts, policy: event.target.value as typeof rules.discounts.policy } } }))}
                style={inputStyle}
              >
                <option value="">Selecione</option>
                <option value="none">Não concedemos desconto</option>
                <option value="seller_with_limit">Vendedor pode conceder até um limite</option>
                <option value="manager_only">Somente gestor pode aprovar</option>
                <option value="case_by_case">Analisado caso a caso</option>
              </select>
            </Field>
            {visibility.showDiscountLimit && (
              <Field label="Qual é o limite sem autorização?">
                <input value={rules.discounts.limit_without_approval} onChange={(event) => updateData((data) => ({ ...data, commercial_rules: { ...data.commercial_rules, discounts: { ...data.commercial_rules.discounts, limit_without_approval: event.target.value } } }))} style={inputStyle} />
              </Field>
            )}
            {visibility.showDiscountApprovalRule && (
              <Field label="Quando precisa falar com o gestor?">
                <textarea rows={2} value={rules.discounts.approval_rule} onChange={(event) => updateData((data) => ({ ...data, commercial_rules: { ...data.commercial_rules, discounts: { ...data.commercial_rules.discounts, approval_rule: event.target.value } } }))} style={{ ...inputStyle, resize: 'vertical' }} />
              </Field>
            )}
          </SectionCard>

          <SectionCard title="Contratos, documentos e restrições">
            <Field label="Sua empresa utiliza contrato?">
              <YesNo value={rules.contracts.uses_contract} onChange={(value) => updateData((data) => ({ ...data, commercial_rules: { ...data.commercial_rules, contracts: { ...data.commercial_rules.contracts, uses_contract: value } } }))} />
            </Field>
            {visibility.showContractDetails && (
              <>
                {([
                  ['formalization', 'Como o contrato é formalizado?'],
                  ['duration', 'Qual é a duração?'],
                  ['renewal', 'Como funciona a renovação?'],
                  ['cancellation', 'Como funciona o cancelamento?'],
                ] as const).map(([key, label]) => (
                  <Field key={key} label={label}>
                    <textarea rows={2} value={rules.contracts[key]} onChange={(event) => updateData((data) => ({ ...data, commercial_rules: { ...data.commercial_rules, contracts: { ...data.commercial_rules.contracts, [key]: event.target.value } } }))} style={{ ...inputStyle, resize: 'vertical' }} />
                  </Field>
                ))}
              </>
            )}
            <ListField label="Documentos obrigatórios" value={rules.documentation.required_documents} onChange={(value) => updateData((data) => ({ ...data, commercial_rules: { ...data.commercial_rules, documentation: { ...data.commercial_rules.documentation, required_documents: value } } }))} />
            <ListField label="Dados necessários antes da contratação" value={rules.documentation.required_data} onChange={(value) => updateData((data) => ({ ...data, commercial_rules: { ...data.commercial_rules, documentation: { ...data.commercial_rules.documentation, required_data: value } } }))} />
            <ListField label="Requisitos antes da contratação" value={rules.documentation.prerequisites} onChange={(value) => updateData((data) => ({ ...data, commercial_rules: { ...data.commercial_rules, documentation: { ...data.commercial_rules.documentation, prerequisites: value } } }))} />
            <ListField label="O que o vendedor não pode prometer" value={rules.restrictions.forbidden_promises} onChange={(value) => updateData((data) => ({ ...data, commercial_rules: { ...data.commercial_rules, restrictions: { ...data.commercial_rules.restrictions, forbidden_promises: value } } }))} />
            <ListField label="Condições que exigem aprovação" value={rules.restrictions.approval_required} onChange={(value) => updateData((data) => ({ ...data, commercial_rules: { ...data.commercial_rules, restrictions: { ...data.commercial_rules.restrictions, approval_required: value } } }))} />
            <ListField label="Produtos ou condições que não podem ser combinados" value={rules.restrictions.incompatible_offers} onChange={(value) => updateData((data) => ({ ...data, commercial_rules: { ...data.commercial_rules, restrictions: { ...data.commercial_rules.restrictions, incompatible_offers: value } } }))} />
          </SectionCard>

          <SectionCard title="Políticas da empresa" description="Preencha somente o que realmente existir na sua operação.">
            {([
              ['cancellation', 'Política de cancelamento'],
              ['refund', 'Reembolso'],
              ['exchange', 'Troca'],
              ['deadline', 'Prazos importantes'],
              ['warranty', 'Garantia'],
              ['sla', 'Prazo de atendimento ou SLA, quando aplicável'],
            ] as const).map(([key, label]) => (
              <Field key={key} label={label}>
                <textarea rows={2} value={rules.policies[key]} onChange={(event) => updateData((data) => ({ ...data, commercial_rules: { ...data.commercial_rules, policies: { ...data.commercial_rules.policies, [key]: event.target.value } } }))} style={{ ...inputStyle, resize: 'vertical' }} />
              </Field>
            ))}
          </SectionCard>
        </>
      )}

      {draft.current_step === 3 && (
        <>
          <SectionCard title="Entrada e descoberta">
            <ListField label="De onde os leads normalmente chegam?" value={process.lead_entry.sources} onChange={(value) => updateData((data) => ({ ...data, current_sales_process: { ...data.current_sales_process, lead_entry: { ...data.current_sales_process.lead_entry, sources: value } } }))} />
            <Field label="O cliente normalmente já chega sabendo o que quer?">
              <YesNo value={process.lead_entry.arrives_knowing_need} onChange={(value) => updateData((data) => ({ ...data, current_sales_process: { ...data.current_sales_process, lead_entry: { ...data.current_sales_process.lead_entry, arrives_knowing_need: value } } }))} />
            </Field>
            <Field label="O vendedor precisa descobrir a necessidade antes de apresentar a solução?">
              <YesNo value={process.lead_entry.seller_discovery_needed} onChange={(value) => updateData((data) => ({ ...data, current_sales_process: { ...data.current_sales_process, lead_entry: { ...data.current_sales_process.lead_entry, seller_discovery_needed: value } } }))} />
            </Field>
            <Field label="O vendedor costuma fazer perguntas antes de apresentar?">
              <YesNo value={process.discovery.asks_before_presenting} onChange={(value) => updateData((data) => ({ ...data, current_sales_process: { ...data.current_sales_process, discovery: { ...data.current_sales_process.discovery, asks_before_presenting: value } } }))} />
            </Field>
            <ListField label="O que normalmente precisa descobrir?" value={process.discovery.needs_to_discover} onChange={(value) => updateData((data) => ({ ...data, current_sales_process: { ...data.current_sales_process, discovery: { ...data.current_sales_process.discovery, needs_to_discover: value } } }))} />
            <ListField label="Existe alguma informação indispensável?" value={process.discovery.indispensable_information} onChange={(value) => updateData((data) => ({ ...data, current_sales_process: { ...data.current_sales_process, discovery: { ...data.current_sales_process.discovery, indispensable_information: value } } }))} />
          </SectionCard>

          <SectionCard title="Apresentação e negociação">
            <Field label="O que costuma fazer parte da apresentação?">
              <Checklist options={PRESENTATION_TOUCHPOINTS} value={process.presentation.touchpoints} onChange={(value) => updateData((data) => ({ ...data, current_sales_process: { ...data.current_sales_process, presentation: { ...data.current_sales_process.presentation, touchpoints: value } } }))} />
            </Field>
            <Field
              label="Quando o preço costuma ser apresentado?"
              help="Isso ajuda a Yolen a entender se sua operação exige descoberta antes da apresentação comercial."
              example="Depois de entender o objetivo do cliente."
            >
              <textarea rows={3} value={process.commercial.price_timing} onChange={(event) => updateData((data) => ({ ...data, current_sales_process: { ...data.current_sales_process, commercial: { ...data.current_sales_process.commercial, price_timing: event.target.value } } }))} style={{ ...inputStyle, resize: 'vertical' }} />
            </Field>
            <Field label="Normalmente existe negociação?">
              <YesNo value={process.commercial.has_negotiation} onChange={(value) => updateData((data) => ({ ...data, current_sales_process: { ...data.current_sales_process, commercial: { ...data.current_sales_process.commercial, has_negotiation: value } } }))} />
            </Field>
            <ListField label="Quais dúvidas aparecem com frequência?" value={process.commercial.common_questions} onChange={(value) => updateData((data) => ({ ...data, current_sales_process: { ...data.current_sales_process, commercial: { ...data.current_sales_process.commercial, common_questions: value } } }))} />
            <ListField label="Quais objeções aparecem com frequência?" value={process.commercial.common_objections} onChange={(value) => updateData((data) => ({ ...data, current_sales_process: { ...data.current_sales_process, commercial: { ...data.current_sales_process.commercial, common_objections: value } } }))} />
          </SectionCard>

          <SectionCard title="Fechamento, follow-up e perdas">
            <Field label="O que precisa acontecer para a venda ser concluída?">
              <Checklist options={CLOSING_ACTIONS} value={process.closing.completion_actions} onChange={(value) => updateData((data) => ({ ...data, current_sales_process: { ...data.current_sales_process, closing: { ...data.current_sales_process.closing, completion_actions: value } } }))} />
            </Field>
            <Field label="Existem vendas que não fecham no primeiro contato e exigem retorno?">
              <YesNo value={process.follow_up.happens} onChange={(value) => updateData((data) => ({ ...data, current_sales_process: { ...data.current_sales_process, follow_up: { ...data.current_sales_process.follow_up, happens: value } } }))} />
            </Field>
            {process.follow_up.happens === true && (
              <>
                <ListField label="Por quais motivos o vendedor precisa retornar?" value={process.follow_up.reasons} onChange={(value) => updateData((data) => ({ ...data, current_sales_process: { ...data.current_sales_process, follow_up: { ...data.current_sales_process.follow_up, reasons: value } } }))} />
                <Field label="Existe algum ritmo ou prazo usual para o retorno?">
                  <textarea rows={2} value={process.follow_up.cadence} onChange={(event) => updateData((data) => ({ ...data, current_sales_process: { ...data.current_sales_process, follow_up: { ...data.current_sales_process.follow_up, cadence: event.target.value } } }))} style={{ ...inputStyle, resize: 'vertical' }} />
                </Field>
              </>
            )}
            <ListField label="Por que as oportunidades normalmente são perdidas?" value={process.losses} onChange={(value) => updateData((data) => ({ ...data, current_sales_process: { ...data.current_sales_process, losses: value } }))} />
          </SectionCard>
        </>
      )}

      {draft.current_step === 4 && (
        <SectionCard
          title={draft.ready_for_method ? 'Sua operação foi mapeada' : 'Revise antes de concluir'}
          description="Confira se a Yolen entendeu corretamente a operação. Cada bloco pode ser revisado antes da próxima fase."
        >
          {buildCommercialMethodBuilderReview(draft.data).map((block) => (
            <div
              key={block.key}
              style={{
                background: DS.surfaceBg,
                border: `1px solid ${DS.border}`,
                borderRadius: DS.radius,
                padding: 14,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <strong style={{ color: DS.textPrimary, fontSize: 12 }}>{block.title}</strong>
                <button
                  type="button"
                  onClick={() => {
                    setDraft((current) => ({ ...current, current_step: block.step, ready_for_method: false }))
                    setDirty(true)
                  }}
                  style={{ background: 'transparent', border: 0, color: DS.blueSoft, cursor: 'pointer', fontSize: 11 }}
                >
                  Editar
                </button>
              </div>
              <ul style={{ color: DS.textSecondary, fontSize: 11, lineHeight: 1.65, marginBottom: 0 }}>
                {block.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          ))}

          {draft.ready_for_method ? (
            <div
              style={{
                background: 'rgba(34,197,94,0.08)',
                border: '1px solid rgba(134,239,172,0.2)',
                borderRadius: DS.radius,
                padding: 16,
              }}
            >
              <div style={{ color: DS.greenSoft, fontSize: 13, fontWeight: 850 }}>
                Pronto para construir o método
              </div>
              <p style={{ color: DS.textSecondary, fontSize: 11, lineHeight: 1.6, marginBottom: 12 }}>
                A Yolen já possui contexto suficiente para ajudar a transformar essas informações em um método comercial. A construção das etapas será feita na Fase 2.
              </p>
              <button
                type="button"
                disabled
                style={{ ...inputStyle, color: DS.textMuted, cursor: 'not-allowed', width: 'auto' }}
              >
                Construir meu método — disponível na Fase 2
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void markReady()}
              disabled={saving}
              style={{
                background: DS.blue,
                border: 0,
                borderRadius: DS.radius,
                color: '#fff',
                cursor: saving ? 'wait' : 'pointer',
                fontSize: 12,
                fontWeight: 850,
                padding: '11px 16px',
              }}
            >
              Concluir mapeamento da operação
            </button>
          )}
        </SectionCard>
      )}

      <div
        style={{
          ...cardStyle(),
          alignItems: 'center',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          justifyContent: 'space-between',
          padding: 14,
        }}
      >
        <div style={{ display: 'flex', gap: 8 }}>
          {draft.current_step > 1 && (
            <button type="button" onClick={() => void goBackStep()} disabled={saving} style={{ ...inputStyle, cursor: 'pointer', width: 'auto' }}>
              Voltar
            </button>
          )}
          <button type="button" onClick={() => void saveDraft()} disabled={saving || !dirty} style={{ ...inputStyle, cursor: saving ? 'wait' : 'pointer', width: 'auto' }}>
            {saving ? 'Salvando...' : 'Salvar rascunho'}
          </button>
        </div>
        {draft.current_step < 4 && (
          <button
            type="button"
            onClick={() => void goNext()}
            disabled={saving}
            style={{
              background: DS.blue,
              border: 0,
              borderRadius: DS.radius,
              color: '#fff',
              cursor: saving ? 'wait' : 'pointer',
              fontSize: 12,
              fontWeight: 850,
              padding: '10px 16px',
            }}
          >
            Continuar
          </button>
        )}
      </div>
    </div>
  )
}
