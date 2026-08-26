'use client'

import * as React from 'react'

import {
  getBuyerDecisionProfile,
  getBuyerDecisionVisibility,
  validateBuyerDecisionDraft,
} from '@/app/lib/commercial-config/buyer-decision-architecture'
import type {
  CommercialMethodBuilderData,
} from '@/app/types/commercial-method-builder'
import type {
  CommercialBuyerDecisionDraft,
} from '@/app/types/commercial-method-buyer-decision'

const DS = {
  cardBg: '#141722',
  surfaceBg: '#111318',
  border: '#1a1d2e',
  borderStrong: '#252a3d',
  textPrimary: '#edf2f7',
  textSecondary: '#8fa3bc',
  textMuted: '#546070',
  blue: '#3b82f6',
  blueSoft: '#93c5fd',
  yellowSoft: '#fcd34d',
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

const PARTICIPANT_ROLES = [
  'Gestor',
  'Diretor',
  'Financeiro',
  'TI',
  'Jurídico',
  'Compras',
  'Sócio/proprietário',
]

const DECISION_CRITERIA = [
  'Preço',
  'Resultado esperado',
  'Prazo',
  'Confiança',
  'Localização',
  'Integração',
  'Segurança',
  'Facilidade de uso',
  'Suporte',
  'Condições comerciais',
]

const FORMAL_PROCESS_STEPS = [
  'Compras',
  'Financeiro',
  'Jurídico',
  'TI',
  'Segurança',
  'Cadastro de fornecedor',
  'Aprovação de diretoria',
]

const URGENCY_DRIVERS = [
  'Renovação',
  'Início de operação',
  'Fim de contrato atual',
  'Abertura de unidade',
  'Evento',
  'Prazo regulatório',
  'Meta interna',
]

function cleanLines(value: string): string[] {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
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
      <strong
        style={{
          color: DS.textPrimary,
          display: 'block',
          fontSize: 12,
          marginBottom: 6,
        }}
      >
        {label}
      </strong>
      {help && (
        <span
          style={{
            color: DS.textSecondary,
            display: 'block',
            fontSize: 11,
            lineHeight: 1.5,
            marginBottom: 6,
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
            marginBottom: 7,
          }}
        >
          Exemplo: {example}
        </span>
      )}
      {children}
    </label>
  )
}

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section
      style={{
        background: DS.cardBg,
        border: `1px solid ${DS.border}`,
        borderRadius: DS.radiusContainer,
        display: 'grid',
        gap: 15,
        padding: 18,
      }}
    >
      <div>
        <strong style={{ color: DS.textPrimary, fontSize: 14 }}>{title}</strong>
        {description && (
          <div
            style={{
              color: DS.textSecondary,
              fontSize: 11,
              lineHeight: 1.55,
              marginTop: 5,
            }}
          >
            {description}
          </div>
        )}
      </div>
      {children}
    </section>
  )
}

function ThreeWay({
  value,
  onChange,
}: {
  value: CommercialBuyerDecisionDraft['approval_or_blocker']
  onChange: (value: CommercialBuyerDecisionDraft['approval_or_blocker']) => void
}) {
  const options = [
    { value: 'no', label: 'Não' },
    { value: 'sometimes', label: 'Às vezes' },
    { value: 'yes', label: 'Sim' },
  ] as const

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          style={{
            background:
              value === option.value
                ? 'rgba(59,130,246,0.14)'
                : DS.surfaceBg,
            border: `1px solid ${
              value === option.value
                ? 'rgba(96,165,250,0.38)'
                : DS.borderStrong
            }`,
            borderRadius: DS.radius,
            color: value === option.value ? DS.blueSoft : DS.textSecondary,
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 750,
            padding: '9px 13px',
          }}
        >
          {option.label}
        </button>
      ))}
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
        gap: 7,
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
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
              background: checked ? 'rgba(59,130,246,0.11)' : DS.surfaceBg,
              border: `1px solid ${
                checked ? 'rgba(96,165,250,0.32)' : DS.borderStrong
              }`,
              borderRadius: DS.radius,
              color: checked ? DS.blueSoft : DS.textSecondary,
              cursor: 'pointer',
              fontSize: 10,
              fontWeight: 700,
              padding: '8px 9px',
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

function ListInput({
  value,
  onChange,
  placeholder = 'Uma resposta por linha',
  rows = 3,
}: {
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  rows?: number
}) {
  return (
    <textarea
      rows={rows}
      value={value.join('\n')}
      onChange={(event) => onChange(cleanLines(event.target.value))}
      placeholder={placeholder}
      style={{ ...inputStyle, resize: 'vertical' }}
    />
  )
}

interface Props {
  diagnosis: CommercialMethodBuilderData
  value: CommercialBuyerDecisionDraft
  onChange: (value: CommercialBuyerDecisionDraft) => void
  onConfirm: (value: CommercialBuyerDecisionDraft) => void
}

export default function BuyerDecisionArchitecture({
  diagnosis,
  value,
  onChange,
  onConfirm,
}: Props) {
  const [showIssues, setShowIssues] = React.useState(false)
  const visibility = getBuyerDecisionVisibility(diagnosis)
  const issues = validateBuyerDecisionDraft(diagnosis, value)
  const profile = getBuyerDecisionProfile(diagnosis, value)
  const priorClosingActions = diagnosis.current_sales_process.closing.completion_actions

  function confirm() {
    setShowIssues(true)
    if (issues.length > 0) return
    onConfirm({ ...value, confirmed: true })
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div
        style={{
          background: DS.cardBg,
          border: `1px solid ${DS.border}`,
          borderRadius: DS.radiusContainer,
          padding: 20,
        }}
      >
        <div
          style={{
            color: DS.blueSoft,
            fontSize: 10,
            fontWeight: 850,
            textTransform: 'uppercase',
          }}
        >
          Antes de sugerir as etapas
        </div>
        <h2 style={{ color: DS.textPrimary, fontSize: 21, marginBottom: 7 }}>
          Como seus clientes decidem
        </h2>
        <p style={{ color: DS.textSecondary, fontSize: 11, lineHeight: 1.65, marginBottom: 0 }}>
          A Yolen usa somente as perguntas compatíveis com sua operação. O objetivo é ajustar a profundidade do método sem transformar uma venda simples em um processo pesado.
        </p>
      </div>

      {visibility.show_approval_and_blockers && (
        <Section
          title="Quem participa da aprovação"
          description="Não precisamos de termos técnicos. Queremos apenas saber se a pessoa que conversa com o vendedor consegue decidir sozinha."
        >
          <Field label="Além da pessoa que conversa com o vendedor, existe alguém que precisa aprovar ou que pode impedir a contratação?">
            <ThreeWay
              value={value.approval_or_blocker}
              onChange={(next) => onChange({ ...value, approval_or_blocker: next })}
            />
          </Field>
          {['yes', 'sometimes'].includes(value.approval_or_blocker) && (
            <>
              <Field label="Quem costuma participar?">
                <Checklist
                  options={PARTICIPANT_ROLES}
                  value={value.participant_roles}
                  onChange={(next) => onChange({ ...value, participant_roles: next })}
                />
              </Field>
              <Field label="Outras pessoas ou áreas">
                <ListInput
                  value={value.other_participant_roles}
                  onChange={(next) => onChange({ ...value, other_participant_roles: next })}
                />
              </Field>
            </>
          )}
        </Section>
      )}

      {visibility.show_decision_criteria && (
        <Section title="O que pesa na escolha">
          <Field
            label="Quando o cliente compara opções, o que normalmente pesa mais na decisão?"
            help="Marque o que realmente aparece nas suas vendas. Não existe resposta 'mais profissional'."
          >
            <Checklist
              options={DECISION_CRITERIA}
              value={value.decision_criteria}
              onChange={(next) => onChange({ ...value, decision_criteria: next })}
            />
          </Field>
          <Field label="Outros fatores que pesam na escolha">
            <ListInput
              value={value.other_decision_criteria}
              onChange={(next) => onChange({ ...value, other_decision_criteria: next })}
            />
          </Field>
        </Section>
      )}

      {visibility.show_formal_process && (
        <Section title="Processo interno do cliente">
          <Field label="Antes da contratação, o cliente costuma precisar passar por alguma área ou processo interno?">
            <ThreeWay
              value={value.formal_process}
              onChange={(next) => onChange({ ...value, formal_process: next })}
            />
          </Field>
          {['yes', 'sometimes'].includes(value.formal_process) && (
            <>
              <Field label="Quais áreas ou processos costumam participar?">
                <Checklist
                  options={FORMAL_PROCESS_STEPS}
                  value={value.formal_process_steps}
                  onChange={(next) => onChange({ ...value, formal_process_steps: next })}
                />
              </Field>
              <Field label="Outras áreas ou processos">
                <ListInput
                  value={value.other_formal_process_steps}
                  onChange={(next) => onChange({ ...value, other_formal_process_steps: next })}
                />
              </Field>
            </>
          )}
        </Section>
      )}

      {visibility.show_investment_justification && (
        <Section title="Justificativa do investimento">
          <Field label="O cliente normalmente precisa justificar internamente por que esse investimento vale a pena?">
            <ThreeWay
              value={value.investment_justification}
              onChange={(next) => onChange({ ...value, investment_justification: next })}
            />
          </Field>
          {['yes', 'sometimes'].includes(value.investment_justification) && (
            <Field
              label="O que normalmente precisa ficar claro nessa justificativa?"
              help="Use suas palavras. A Yolen não inventará retorno financeiro ou impacto que você não informou."
            >
              <textarea
                rows={3}
                value={value.investment_justification_notes}
                onChange={(event) => onChange({ ...value, investment_justification_notes: event.target.value })}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </Field>
          )}
        </Section>
      )}

      {visibility.show_real_urgency && (
        <Section title="Urgência real">
          <Field
            label="Normalmente existe alguma data, evento ou consequência real que faz o cliente precisar decidir?"
            help="Isso é diferente de o vendedor querer fechar rápido. A Yolen nunca deve inventar urgência."
          >
            <ThreeWay
              value={value.real_urgency}
              onChange={(next) => onChange({ ...value, real_urgency: next })}
            />
          </Field>
          {['yes', 'sometimes'].includes(value.real_urgency) && (
            <>
              <Field label="O que costuma criar essa necessidade de decidir?">
                <Checklist
                  options={URGENCY_DRIVERS}
                  value={value.urgency_drivers}
                  onChange={(next) => onChange({ ...value, urgency_drivers: next })}
                />
              </Field>
              <Field label="Outros motivos reais">
                <ListInput
                  value={value.other_urgency_drivers}
                  onChange={(next) => onChange({ ...value, other_urgency_drivers: next })}
                />
              </Field>
            </>
          )}
        </Section>
      )}

      {visibility.show_event_purpose && (
        <Section
          title="O que cada momento precisa provar"
          description="Fazer uma demonstração, tour, teste ou reunião não significa que a oportunidade avançou. Defina qual resultado do comprador torna esse momento útil."
        >
          {value.event_success_criteria.map((item, index) => (
            <Field
              key={`${item.event}-${index}`}
              label={`O que precisa acontecer em “${item.event}” para a venda poder avançar?`}
              example="O cliente validar que a integração atende ao requisito necessário."
            >
              <ListInput
                value={item.criteria}
                onChange={(next) => {
                  const events = [...value.event_success_criteria]
                  events[index] = { ...item, criteria: next }
                  onChange({ ...value, event_success_criteria: events })
                }}
              />
            </Field>
          ))}
        </Section>
      )}

      {visibility.show_customization && (
        <Section title="Quanto a solução muda">
          <Field label="Sua solução costuma ser praticamente igual para todos ou muda bastante conforme cada cliente?">
            <select
              value={value.solution_customization}
              onChange={(event) => onChange({
                ...value,
                solution_customization: event.target.value as CommercialBuyerDecisionDraft['solution_customization'],
              })}
              style={inputStyle}
            >
              <option value="">Selecione</option>
              <option value="standard">Praticamente igual</option>
              <option value="some_adjustments">Alguns ajustes</option>
              <option value="highly_customized">Bastante personalizada</option>
            </select>
          </Field>
        </Section>
      )}

      {visibility.show_operation_intensity && (
        <Section title="Ritmo da operação">
          <Field label="Sua equipe costuma lidar com muitas vendas curtas por dia ou com poucas oportunidades que exigem mais acompanhamento?">
            <select
              value={value.operation_intensity}
              onChange={(event) => onChange({
                ...value,
                operation_intensity: event.target.value as CommercialBuyerDecisionDraft['operation_intensity'],
              })}
              style={inputStyle}
            >
              <option value="">Selecione</option>
              <option value="high_volume_short">Muitas vendas curtas</option>
              <option value="balanced">Equilibrado</option>
              <option value="few_complex">Poucas oportunidades mais complexas</option>
            </select>
          </Field>
        </Section>
      )}

      {visibility.show_decision_vs_formalization && (
        <Section
          title="Decisão de compra não é formalização"
          description="Primeiro identifique o fato que prova que o cliente decidiu. Depois registre o que ainda acontece para formalizar."
        >
          <Field
            label="Qual fato mostra que o cliente realmente decidiu comprar?"
            example="O cliente confirmou que quer contratar nas condições combinadas."
          >
            <ListInput
              value={value.buyer_commitment_signals}
              onChange={(next) => onChange({ ...value, buyer_commitment_signals: next })}
            />
          </Field>
          <Field
            label="Depois da decisão, o que ainda precisa acontecer para formalizar?"
            help={
              priorClosingActions.length > 0
                ? `Na Fase 1 você informou: ${priorClosingActions.join(', ')}. Confirme aqui apenas o que realmente acontece depois da decisão.`
                : 'Exemplos possíveis: contrato, pagamento, assinatura, cadastro ou documentação. Só informe o que existir de verdade.'
            }
          >
            <ListInput
              value={value.formalization_steps}
              onChange={(next) => onChange({ ...value, formalization_steps: next })}
            />
          </Field>
        </Section>
      )}

      <div
        style={{
          background: DS.cardBg,
          border: `1px solid ${DS.border}`,
          borderRadius: DS.radiusContainer,
          padding: 16,
        }}
      >
        <div style={{ color: DS.textMuted, fontSize: 10, lineHeight: 1.55 }}>
          Leitura atual da Yolen: profundidade <b>{profile.depth === 'deep' ? 'maior' : profile.depth === 'moderate' ? 'intermediária' : 'leve'}</b>. Essa leitura apenas calibra a sugestão; o gestor continua podendo remover, renomear, adicionar ou reordenar etapas.
        </div>
      </div>

      {showIssues && issues.length > 0 && (
        <div
          style={{
            background: 'rgba(245,158,11,0.06)',
            border: '1px solid rgba(245,158,11,0.25)',
            borderRadius: DS.radiusContainer,
            padding: 14,
          }}
        >
          <strong style={{ color: DS.yellowSoft, fontSize: 11 }}>
            Complete estes pontos antes de gerar a estrutura:
          </strong>
          <ul style={{ color: DS.textSecondary, fontSize: 10, lineHeight: 1.6, marginBottom: 0 }}>
            {issues.map((issue) => <li key={issue}>{issue}</li>)}
          </ul>
        </div>
      )}

      <button
        type="button"
        onClick={confirm}
        style={{
          background: DS.blue,
          border: 0,
          borderRadius: DS.radius,
          color: '#fff',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 850,
          justifySelf: 'start',
          padding: '11px 16px',
        }}
      >
        Usar estas respostas para sugerir a estrutura
      </button>
    </div>
  )
}
