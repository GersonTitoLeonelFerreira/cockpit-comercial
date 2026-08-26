'use client'

import * as React from 'react'

import {
  appendConstructionStage,
  auditCommercialMethodConstruction,
  buildMethodConstructionSynthesis,
  buildStageAssistiveSuggestions,
  getGenericCommercialMethodGuidance,
  moveConstructionStage,
  removeConstructionStage,
  slugifyCommercialMethodKey,
} from '@/app/lib/commercial-config/assisted-method-construction'
import type {
  CommercialMethodBuilderData,
} from '@/app/types/commercial-method-builder'
import type {
  CommercialMethodConstructionDimensionDraft,
  CommercialMethodConstructionDraft,
  CommercialMethodConstructionRecord,
  CommercialMethodConstructionStageDraft,
  CommercialMethodConstructionStatus,
} from '@/app/types/commercial-method-construction'

const DS = {
  cardBg: '#141722',
  surfaceBg: '#111318',
  surfaceRaised: '#171a25',
  border: '#1a1d2e',
  borderStrong: '#252a3d',
  textPrimary: '#edf2f7',
  textSecondary: '#8fa3bc',
  textMuted: '#546070',
  blue: '#3b82f6',
  blueSoft: '#93c5fd',
  greenSoft: '#86efac',
  yellowSoft: '#fcd34d',
  redSoft: '#fca5a5',
  radius: 8,
  radiusContainer: 10,
} as const

type MethodResponse =
  | { ok: true; construction: CommercialMethodConstructionRecord | null }
  | { ok: false; error: string; issues?: Array<{ path: string; message: string }> }

interface Props {
  onBack: () => void
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
  fontSize: 12,
  lineHeight: 1.55,
  outline: 'none',
  padding: '10px 11px',
  width: '100%',
}

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
      <strong style={{ color: DS.textPrimary, display: 'block', fontSize: 12, marginBottom: 6 }}>
        {label}
      </strong>
      {help && (
        <span style={{ color: DS.textSecondary, display: 'block', fontSize: 11, lineHeight: 1.5, marginBottom: 6 }}>
          {help}
        </span>
      )}
      {example && (
        <span style={{ color: DS.textMuted, display: 'block', fontSize: 10, lineHeight: 1.45, marginBottom: 7 }}>
          Exemplo pedagógico: {example}
        </span>
      )}
      {children}
    </label>
  )
}

function ListEditor({
  label,
  value,
  onChange,
  help,
  example,
}: {
  label: string
  value: string[]
  onChange: (value: string[]) => void
  help?: string
  example?: string
}) {
  const generic = value.find((item) => getGenericCommercialMethodGuidance(item))

  return (
    <Field label={label} help={help} example={example}>
      <textarea
        rows={4}
        value={value.join('\n')}
        onChange={(event) => onChange(cleanLines(event.target.value))}
        placeholder="Um item por linha"
        style={{ ...inputStyle, resize: 'vertical' }}
      />
      {generic && (
        <div style={{ color: DS.yellowSoft, fontSize: 10, lineHeight: 1.45, marginTop: 6 }}>
          Isso pode ficar mais específico: “{generic}”. Prefira uma evidência observável.
        </div>
      )}
    </Field>
  )
}

function StepBar({ step }: { step: CommercialMethodConstructionDraft['construction_step'] }) {
  const steps = [
    ['structure', 'Estrutura'],
    ['stages', 'Etapas'],
    ['principles', 'Princípios'],
    ['review', 'Revisão'],
  ] as const
  const current = steps.findIndex(([key]) => key === step)

  return (
    <div style={{ ...cardStyle(), padding: 16 }}>
      <div style={{ color: DS.blueSoft, fontSize: 10, fontWeight: 850, textTransform: 'uppercase' }}>
        Construção do método · Passo {current + 1} de 4
      </div>
      <div style={{ display: 'grid', gap: 6, gridTemplateColumns: 'repeat(4, 1fr)', marginTop: 12 }}>
        {steps.map(([key, label], index) => (
          <div key={key}>
            <div style={{ background: index <= current ? DS.blue : DS.surfaceBg, borderRadius: 999, height: 5 }} />
            <div style={{ color: index <= current ? DS.textSecondary : DS.textMuted, fontSize: 9, marginTop: 5 }}>
              {label}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function RequirementHelp({ value }: { value: CommercialMethodConstructionStageDraft['requirement'] }) {
  const text = {
    required: 'Obrigatória: toda oportunidade passa por esta etapa.',
    conditional: 'Condicional: só acontece em determinadas situações. Você precisa explicar quando ela pode ser pulada.',
    optional: 'Opcional: pode ajudar, mas não é necessária para avançar.',
  }[value]

  return <div style={{ color: DS.textMuted, fontSize: 10, lineHeight: 1.45, marginTop: 6 }}>{text}</div>
}

function SuggestionButton({ text, onAdd }: { text: string; onAdd: () => void }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      style={{
        background: DS.surfaceBg,
        border: `1px solid ${DS.borderStrong}`,
        borderRadius: DS.radius,
        color: DS.blueSoft,
        cursor: 'pointer',
        fontSize: 10,
        lineHeight: 1.4,
        padding: '8px 9px',
        textAlign: 'left',
      }}
    >
      + {text}
    </button>
  )
}

function DimensionEditor({ dimensions, onChange }: {
  dimensions: CommercialMethodConstructionDimensionDraft[]
  onChange: (value: CommercialMethodConstructionDimensionDraft[]) => void
}) {
  function addDimension() {
    const id = `dimension-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    onChange([...dimensions, { id, key: '', name: '', objective: '', evidence_criteria: [] }])
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ color: DS.textSecondary, fontSize: 11, lineHeight: 1.5 }}>
        Dimensões são opcionais. Use apenas quando uma etapa precisa observar frentes diferentes sem virar uma sequência rígida.
      </div>
      {dimensions.map((dimension, index) => (
        <div key={dimension.id} style={{ background: DS.surfaceBg, border: `1px solid ${DS.border}`, borderRadius: DS.radius, display: 'grid', gap: 10, padding: 12 }}>
          <Field label="Nome da dimensão">
            <input
              value={dimension.name}
              onChange={(event) => {
                const next = [...dimensions]
                next[index] = { ...dimension, name: event.target.value, key: dimension.key || slugifyCommercialMethodKey(event.target.value) }
                onChange(next)
              }}
              style={inputStyle}
            />
          </Field>
          <Field label="Objetivo da dimensão">
            <textarea
              rows={2}
              value={dimension.objective}
              onChange={(event) => {
                const next = [...dimensions]
                next[index] = { ...dimension, objective: event.target.value }
                onChange(next)
              }}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </Field>
          <ListEditor
            label="Evidências da dimensão"
            value={dimension.evidence_criteria}
            onChange={(value) => {
              const next = [...dimensions]
              next[index] = { ...dimension, evidence_criteria: value }
              onChange(next)
            }}
          />
          <button type="button" onClick={() => onChange(dimensions.filter((item) => item.id !== dimension.id))} style={{ background: 'transparent', border: 0, color: DS.redSoft, cursor: 'pointer', fontSize: 10, justifySelf: 'start' }}>
            Remover dimensão
          </button>
        </div>
      ))}
      <button type="button" onClick={addDimension} style={{ ...inputStyle, color: DS.blueSoft, cursor: 'pointer', width: 'auto', justifySelf: 'start' }}>
        + Adicionar dimensão
      </button>
    </div>
  )
}

export default function AssistedMethodConstruction({ onBack }: Props) {
  const [workspace, setWorkspace] = React.useState<CommercialMethodConstructionRecord | null>(null)
  const [draft, setDraft] = React.useState<CommercialMethodConstructionDraft | null>(null)
  const [status, setStatus] = React.useState<CommercialMethodConstructionStatus>('not_started')
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [dirty, setDirty] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [serverIssues, setServerIssues] = React.useState<string[]>([])

  const diagnosis: CommercialMethodBuilderData | null = workspace?.diagnosis ?? null

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/commercial-method-builder/method', { cache: 'no-store' })
      const json = (await response.json()) as MethodResponse
      if (!response.ok || !json.ok) throw new Error(json.ok ? 'Erro ao carregar a construção.' : json.error)
      setWorkspace(json.construction)
      setDraft(json.construction?.construction ?? null)
      setStatus(json.construction?.status ?? 'not_started')
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar a construção.')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { void load() }, [load])

  const save = React.useCallback(async (
    nextDraft: CommercialMethodConstructionDraft,
    nextStatus: 'editing' | 'review_ready' = 'editing',
  ) => {
    setSaving(true)
    setError(null)
    setServerIssues([])
    try {
      const response = await fetch('/api/admin/commercial-method-builder/method', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: nextStatus, construction: nextDraft }),
      })
      const json = (await response.json()) as MethodResponse
      if (!response.ok || !json.ok) {
        if (!json.ok && json.issues) setServerIssues(json.issues.map((issue) => `${issue.path}: ${issue.message}`))
        throw new Error(json.ok ? 'Erro ao salvar o método.' : json.error)
      }
      setWorkspace(json.construction)
      setDraft(json.construction?.construction ?? nextDraft)
      setStatus(json.construction?.status ?? nextStatus)
      setDirty(false)
      return true
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : 'Erro ao salvar o método.')
      return false
    } finally {
      setSaving(false)
    }
  }, [])

  React.useEffect(() => {
    if (!draft || !dirty || saving || status === 'review_ready') return
    const timer = window.setTimeout(() => { void save(draft, 'editing') }, 900)
    return () => window.clearTimeout(timer)
  }, [dirty, draft, save, saving, status])

  function updateDraft(updater: (current: CommercialMethodConstructionDraft) => CommercialMethodConstructionDraft) {
    setDraft((current) => current ? updater(current) : current)
    setStatus('editing')
    setDirty(true)
    setServerIssues([])
  }

  async function start() {
    setSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/commercial-method-builder/method', { method: 'POST' })
      const json = (await response.json()) as MethodResponse
      if (!response.ok || !json.ok || !json.construction?.construction) throw new Error(json.ok ? 'Não foi possível gerar a sugestão inicial.' : json.error)
      setWorkspace(json.construction)
      setDraft(json.construction.construction)
      setStatus(json.construction.status)
      setDirty(false)
    } catch (startError: unknown) {
      setError(startError instanceof Error ? startError.message : 'Erro ao iniciar a construção.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={{ ...cardStyle(), color: DS.textSecondary, padding: 24 }}>Carregando construção assistida...</div>

  if (!workspace?.ready_for_method || !diagnosis) {
    return (
      <div style={{ ...cardStyle(), padding: 22 }}>
        <strong style={{ color: DS.yellowSoft }}>O diagnóstico ainda não está pronto.</strong>
        <p style={{ color: DS.textSecondary, fontSize: 11, lineHeight: 1.6 }}>Conclua primeiro o mapeamento da operação. A Yolen não cria método sem essa matéria-prima.</p>
        <button type="button" onClick={onBack} style={{ ...inputStyle, cursor: 'pointer', width: 'auto' }}>Voltar</button>
      </div>
    )
  }

  if (!draft) {
    const synthesis = buildMethodConstructionSynthesis(diagnosis)
    return (
      <div style={{ display: 'grid', gap: 14 }}>
        <button type="button" onClick={onBack} style={{ ...inputStyle, cursor: 'pointer', width: 'auto', justifySelf: 'start' }}>← Voltar</button>
        <div style={{ ...cardStyle(), padding: 22 }}>
          <div style={{ color: DS.blueSoft, fontSize: 10, fontWeight: 850, textTransform: 'uppercase' }}>Construção assistida</div>
          <h2 style={{ color: DS.textPrimary, fontSize: 23, marginBottom: 8 }}>Agora vamos transformar o diagnóstico em etapas claras</h2>
          <p style={{ color: DS.textSecondary, fontSize: 12, lineHeight: 1.65 }}>A Yolen vai propor uma estrutura inicial baseada somente no que você informou. Não é um “método ideal” e nada será publicado automaticamente.</p>
          <div style={{ background: DS.surfaceBg, border: `1px solid ${DS.border}`, borderRadius: DS.radius, marginTop: 16, padding: 14 }}>
            <strong style={{ color: DS.textPrimary, fontSize: 12 }}>Com base no que você informou:</strong>
            <ul style={{ color: DS.textSecondary, fontSize: 11, lineHeight: 1.65, marginBottom: 0 }}>{synthesis.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
          {error && <div style={{ color: DS.redSoft, fontSize: 11, marginTop: 12 }}>{error}</div>}
          <button type="button" onClick={() => void start()} disabled={saving} style={{ background: DS.blue, border: 0, borderRadius: DS.radius, color: '#fff', cursor: saving ? 'wait' : 'pointer', fontSize: 12, fontWeight: 850, marginTop: 16, padding: '11px 16px' }}>
            {saving ? 'Preparando...' : 'Ver sugestão inicial da Yolen'}
          </button>
        </div>
      </div>
    )
  }

  const quality = auditCommercialMethodConstruction(draft, diagnosis)
  const activeStage = draft.stages.find((stage) => stage.id === draft.active_stage_id) ?? draft.stages[0] ?? null
  const assist = activeStage ? buildStageAssistiveSuggestions(activeStage, diagnosis) : null

  function setStage(next: CommercialMethodConstructionStageDraft) {
    updateDraft((current) => ({ ...current, stages: current.stages.map((stage) => stage.id === next.id ? next : stage), active_stage_id: next.id }))
  }

  function addUnique(list: string[], item: string): string[] {
    return list.includes(item) ? list : [...list, item]
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' }}>
        <button type="button" onClick={onBack} style={{ ...inputStyle, cursor: 'pointer', width: 'auto' }}>← Voltar às opções</button>
        <div style={{ color: DS.textMuted, fontSize: 10 }}>{saving ? 'Salvando...' : dirty ? 'Alterações serão salvas automaticamente' : 'Rascunho salvo'}</div>
      </div>
      <StepBar step={draft.construction_step} />
      {error && <div style={{ ...cardStyle(), borderColor: 'rgba(239,68,68,0.3)', color: DS.redSoft, fontSize: 11, padding: 14 }}>{error}</div>}
      {serverIssues.length > 0 && <div style={{ ...cardStyle(), borderColor: 'rgba(245,158,11,0.3)', padding: 14 }}><strong style={{ color: DS.yellowSoft, fontSize: 11 }}>Ainda falta ajustar:</strong><ul style={{ color: DS.textSecondary, fontSize: 10, lineHeight: 1.55 }}>{serverIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}

      {draft.construction_step === 'structure' && (
        <div style={{ ...cardStyle(), padding: 18 }}>
          <div style={{ color: DS.blueSoft, fontSize: 10, fontWeight: 850, textTransform: 'uppercase' }}>Sugestão da Yolen</div>
          <h3 style={{ color: DS.textPrimary, fontSize: 18, margin: '7px 0' }}>Uma estrutura curta baseada no diagnóstico</h3>
          <p style={{ color: DS.textSecondary, fontSize: 11, lineHeight: 1.6 }}>Aceite, renomeie, remova, adicione ou reordene. Nenhuma etapa abaixo vira verdade até você confirmar o conteúdo.</p>
          <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
            {draft.stages.map((stage, index) => (
              <div key={stage.id} style={{ background: DS.surfaceBg, border: `1px solid ${DS.border}`, borderRadius: DS.radius, padding: 13 }}>
                <div style={{ alignItems: 'center', display: 'flex', gap: 8 }}>
                  <span style={{ color: DS.textMuted, fontSize: 10 }}>{index + 1}</span>
                  <input value={stage.name} onChange={(event) => setStage({ ...stage, name: event.target.value, key: slugifyCommercialMethodKey(event.target.value) })} style={{ ...inputStyle, flex: 1 }} />
                  <button type="button" onClick={() => updateDraft((current) => moveConstructionStage(current, stage.id, -1))} style={{ ...inputStyle, cursor: 'pointer', width: 'auto' }}>↑</button>
                  <button type="button" onClick={() => updateDraft((current) => moveConstructionStage(current, stage.id, 1))} style={{ ...inputStyle, cursor: 'pointer', width: 'auto' }}>↓</button>
                  <button type="button" onClick={() => updateDraft((current) => removeConstructionStage(current, stage.id))} style={{ ...inputStyle, color: DS.redSoft, cursor: 'pointer', width: 'auto' }}>Remover</button>
                </div>
                {stage.source === 'yolen_suggestion' && stage.suggestion_basis.length > 0 && <ul style={{ color: DS.textMuted, fontSize: 10, lineHeight: 1.5, marginBottom: 0 }}>{stage.suggestion_basis.map((basis) => <li key={basis}>{basis}</li>)}</ul>}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
            <button type="button" onClick={() => updateDraft((current) => appendConstructionStage(current))} style={{ ...inputStyle, color: DS.blueSoft, cursor: 'pointer', width: 'auto' }}>+ Adicionar etapa</button>
            <button type="button" disabled={draft.stages.length === 0} onClick={() => updateDraft((current) => ({ ...current, construction_step: 'stages', active_stage_id: current.stages[0]?.id ?? null }))} style={{ background: DS.blue, border: 0, borderRadius: DS.radius, color: '#fff', cursor: draft.stages.length ? 'pointer' : 'not-allowed', fontSize: 11, fontWeight: 850, padding: '10px 14px' }}>Usar esta estrutura e detalhar etapas</button>
          </div>
        </div>
      )}

      {draft.construction_step === 'stages' && (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(190px, 260px) minmax(0, 1fr)' }}>
          <aside style={{ ...cardStyle(), alignSelf: 'start', display: 'grid', gap: 7, padding: 12 }}>
            {draft.stages.map((stage, index) => <button key={stage.id} type="button" onClick={() => updateDraft((current) => ({ ...current, active_stage_id: stage.id }))} style={{ background: activeStage?.id === stage.id ? 'rgba(59,130,246,0.13)' : DS.surfaceBg, border: `1px solid ${activeStage?.id === stage.id ? 'rgba(96,165,250,0.32)' : DS.border}`, borderRadius: DS.radius, color: activeStage?.id === stage.id ? DS.blueSoft : DS.textSecondary, cursor: 'pointer', fontSize: 11, padding: 10, textAlign: 'left' }}>{index + 1}. {stage.name || 'Etapa sem nome'}</button>)}
            <button type="button" onClick={() => updateDraft((current) => appendConstructionStage(current))} style={{ ...inputStyle, color: DS.blueSoft, cursor: 'pointer' }}>+ Etapa</button>
          </aside>
          {activeStage ? (
            <div style={{ ...cardStyle(), display: 'grid', gap: 18, padding: 18 }}>
              <div><div style={{ color: DS.blueSoft, fontSize: 10, fontWeight: 850, textTransform: 'uppercase' }}>Construção da etapa</div><h3 style={{ color: DS.textPrimary, margin: '6px 0 0' }}>{activeStage.name || 'Etapa sem nome'}</h3></div>
              <Field label="Como sua equipe chama esse momento da venda?"><input value={activeStage.name} onChange={(event) => setStage({ ...activeStage, name: event.target.value, key: slugifyCommercialMethodKey(event.target.value) })} style={inputStyle} /></Field>
              <Field label="Essa etapa é obrigatória, condicional ou opcional?"><select value={activeStage.requirement} onChange={(event) => setStage({ ...activeStage, requirement: event.target.value as CommercialMethodConstructionStageDraft['requirement'] })} style={inputStyle}><option value="required">Obrigatória</option><option value="conditional">Condicional</option><option value="optional">Opcional</option></select><RequirementHelp value={activeStage.requirement} /></Field>
              {activeStage.requirement === 'conditional' && <ListEditor label="Quando essa etapa pode ser pulada?" help="Explique a condição objetiva que torna essa etapa desnecessária naquela oportunidade." value={activeStage.skip_conditions} onChange={(value) => setStage({ ...activeStage, skip_conditions: value })} />}
              <Field label="O que o vendedor precisa conseguir ou compreender antes de sair desta etapa?" help="Esse é o objetivo. Evite descrever apenas uma atividade; descreva o resultado comercial ou entendimento necessário." example="Fraco: Entender o cliente. Melhor: Entender o motivo principal do contato e o que o cliente espera resolver."><textarea rows={3} value={activeStage.objective} onChange={(event) => setStage({ ...activeStage, objective: event.target.value })} style={{ ...inputStyle, resize: 'vertical' }} />{getGenericCommercialMethodGuidance(activeStage.objective) && <div style={{ color: DS.yellowSoft, fontSize: 10, lineHeight: 1.45, marginTop: 6 }}>{getGenericCommercialMethodGuidance(activeStage.objective)}</div>}</Field>
              <ListEditor label="Que evidências mostram que esta etapa realmente foi concluída?" value={activeStage.completion_criteria} onChange={(value) => setStage({ ...activeStage, completion_criteria: value })} example="motivo do contato identificado" />
              <ListEditor label="O que mostra progresso, mas ainda não é suficiente para avançar?" value={activeStage.partial_completion_criteria} onChange={(value) => setStage({ ...activeStage, partial_completion_criteria: value })} />
              <ListEditor label="Em quais situações o vendedor precisa continuar investigando?" value={activeStage.deepen_when} onChange={(value) => setStage({ ...activeStage, deepen_when: value })} />
              <ListEditor label="Quando o vendedor já sabe o bastante?" help="Isso ajuda a impedir interrogatórios e perguntas sem utilidade." value={activeStage.sufficient_when} onChange={(value) => setStage({ ...activeStage, sufficient_when: value })} />
              <ListEditor label="O que precisa ser verdadeiro para seguir para a próxima etapa?" value={activeStage.advance_when} onChange={(value) => setStage({ ...activeStage, advance_when: value })} />
              <ListEditor label="Existe alguma situação em que o vendedor deve esperar, sem avançar nem insistir?" value={activeStage.wait_when} onChange={(value) => setStage({ ...activeStage, wait_when: value })} />
              <ListEditor label="Quando novas perguntas deixariam de acrescentar valor?" help="Aprofundar é investigar quando falta algo relevante. Continuar perguntando sem necessidade é repetir ou buscar detalhe que não muda a decisão." value={activeStage.stop_asking_when} onChange={(value) => setStage({ ...activeStage, stop_asking_when: value })} />
              <ListEditor label="Perguntas recomendadas" help="São referências, nunca um script obrigatório. Você pode editar qualquer sugestão depois de adicioná-la." value={activeStage.recommended_questions} onChange={(value) => setStage({ ...activeStage, recommended_questions: value })} />
              <ListEditor label="O que sua equipe não deve fazer nesta etapa?" value={activeStage.common_mistakes} onChange={(value) => setStage({ ...activeStage, common_mistakes: value })} />
              {assist && (assist.context_notes.length > 0 || assist.completion_criteria.length > 0 || assist.recommended_questions.length > 0 || assist.common_mistakes.length > 0) && <div style={{ background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(96,165,250,0.18)', borderRadius: DS.radius, padding: 13 }}><strong style={{ color: DS.blueSoft, fontSize: 11 }}>Ajuda da Yolen baseada no seu diagnóstico</strong><p style={{ color: DS.textMuted, fontSize: 10, lineHeight: 1.5 }}>Nada abaixo é inserido automaticamente. Clique apenas no que representa a verdade da sua empresa.</p>{assist.context_notes.map((note) => <div key={note} style={{ color: DS.textSecondary, fontSize: 10, lineHeight: 1.5, marginTop: 5 }}>{note}</div>)}<div style={{ display: 'grid', gap: 6, marginTop: 9 }}>{assist.completion_criteria.map((item) => <SuggestionButton key={item} text={`Critério: ${item}`} onAdd={() => setStage({ ...activeStage, completion_criteria: addUnique(activeStage.completion_criteria, item) })} />)}{assist.recommended_questions.map((item) => <SuggestionButton key={item} text={`Pergunta: ${item}`} onAdd={() => setStage({ ...activeStage, recommended_questions: addUnique(activeStage.recommended_questions, item) })} />)}{assist.common_mistakes.map((item) => <SuggestionButton key={item} text={`Erro comum: ${item}`} onAdd={() => setStage({ ...activeStage, common_mistakes: addUnique(activeStage.common_mistakes, item) })} />)}</div></div>}
              <DimensionEditor dimensions={activeStage.dimensions} onChange={(value) => setStage({ ...activeStage, dimensions: value })} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}><button type="button" onClick={() => updateDraft((current) => ({ ...current, construction_step: 'structure' }))} style={{ ...inputStyle, cursor: 'pointer', width: 'auto' }}>Revisar estrutura</button><button type="button" onClick={() => updateDraft((current) => ({ ...current, construction_step: 'principles' }))} style={{ background: DS.blue, border: 0, borderRadius: DS.radius, color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 850, padding: '10px 14px' }}>Continuar para princípios</button></div>
            </div>
          ) : <div style={{ ...cardStyle(), color: DS.textSecondary, padding: 18 }}>Adicione ao menos uma etapa para continuar.</div>}
        </div>
      )}

      {draft.construction_step === 'principles' && <div style={{ ...cardStyle(), display: 'grid', gap: 16, padding: 18 }}><div><h3 style={{ color: DS.textPrimary, margin: 0 }}>Princípios globais do método</h3><p style={{ color: DS.textSecondary, fontSize: 11, lineHeight: 1.6 }}>Princípios orientam todas as etapas. Não copie a Base Comercial inteira: transforme em princípio apenas o que realmente orienta comportamento comercial de forma transversal.</p></div><Field label="Como você quer chamar este método?" help="Pode ser um nome interno simples. Você pode mudar depois."><input value={draft.method_name} onChange={(event) => updateDraft((current) => ({ ...current, method_name: event.target.value }))} style={inputStyle} /></Field><Field label="Como você explicaria este método em uma frase?"><textarea rows={3} value={draft.method_description} onChange={(event) => updateDraft((current) => ({ ...current, method_description: event.target.value }))} style={{ ...inputStyle, resize: 'vertical' }} /></Field><ListEditor label="Princípios do método" help="Escreva regras de raciocínio ou comportamento que valem para qualquer etapa. A Yolen não preenche automaticamente." example="Não repetir perguntas que o cliente já respondeu." value={draft.principles} onChange={(value) => updateDraft((current) => ({ ...current, principles: value }))} />{(diagnosis.commercial_rules.restrictions.forbidden_promises.length > 0 || diagnosis.commercial_rules.discounts.policy) && <div style={{ background: DS.surfaceBg, border: `1px solid ${DS.border}`, borderRadius: DS.radius, color: DS.textMuted, fontSize: 10, lineHeight: 1.55, padding: 12 }}>Sua Base Comercial possui restrições e/ou regras de desconto. Elas continuam na Base Comercial. Se alguma delas representa um comportamento transversal da equipe, você pode expressar esse comportamento como princípio sem copiar condições e valores para dentro do método.</div>}<div style={{ display: 'flex', gap: 8 }}><button type="button" onClick={() => updateDraft((current) => ({ ...current, construction_step: 'stages' }))} style={{ ...inputStyle, cursor: 'pointer', width: 'auto' }}>Voltar às etapas</button><button type="button" onClick={() => updateDraft((current) => ({ ...current, construction_step: 'review' }))} style={{ background: DS.blue, border: 0, borderRadius: DS.radius, color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 850, padding: '10px 14px' }}>Revisar método</button></div></div>}

      {draft.construction_step === 'review' && <div style={{ display: 'grid', gap: 12 }}>{status === 'review_ready' && <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(134,239,172,0.2)', borderRadius: DS.radius, padding: 15 }}><strong style={{ color: DS.greenSoft, fontSize: 12 }}>Método preparado para revisão final</strong><div style={{ color: DS.textSecondary, fontSize: 10, lineHeight: 1.5, marginTop: 5 }}>O contrato commercial-method-v2 foi materializado como rascunho validado. Nenhuma publicação ocorreu.</div></div>}<div style={{ ...cardStyle(), padding: 18 }}><h3 style={{ color: DS.textPrimary, marginTop: 0 }}>Diagnóstico de qualidade</h3><div style={{ display: 'grid', gap: 7 }}>{quality.map((item, index) => <div key={`${item.message}-${index}`} style={{ color: item.level === 'pass' ? DS.greenSoft : DS.yellowSoft, fontSize: 11, lineHeight: 1.5 }}>{item.level === 'pass' ? '✓' : '⚠'} {item.message}</div>)}</div></div><div style={{ ...cardStyle(), padding: 18 }}><div style={{ color: DS.blueSoft, fontSize: 10, fontWeight: 850, textTransform: 'uppercase' }}>Seu método</div><h2 style={{ color: DS.textPrimary, fontSize: 20, marginBottom: 5 }}>{draft.method_name || 'Método ainda sem nome'}</h2><p style={{ color: DS.textSecondary, fontSize: 11, lineHeight: 1.6 }}>{draft.method_description || 'Descrição ainda não preenchida.'}</p><div style={{ display: 'grid', gap: 10, marginTop: 14 }}>{draft.stages.map((stage, index) => <div key={stage.id} style={{ background: DS.surfaceBg, border: `1px solid ${DS.border}`, borderRadius: DS.radius, padding: 13 }}><div style={{ alignItems: 'center', display: 'flex', justifyContent: 'space-between', gap: 10 }}><strong style={{ color: DS.textPrimary, fontSize: 12 }}>Etapa {index + 1} — {stage.name || 'Sem nome'}</strong><button type="button" onClick={() => updateDraft((current) => ({ ...current, construction_step: 'stages', active_stage_id: stage.id }))} style={{ background: 'transparent', border: 0, color: DS.blueSoft, cursor: 'pointer', fontSize: 10 }}>Editar</button></div><div style={{ color: DS.textSecondary, fontSize: 10, lineHeight: 1.55, marginTop: 7 }}><b>Objetivo:</b> {stage.objective || 'Não informado'}</div><div style={{ color: DS.textSecondary, fontSize: 10, lineHeight: 1.55, marginTop: 4 }}><b>Critérios:</b> {stage.completion_criteria.join(' · ') || 'Não informados'}</div><div style={{ color: DS.textSecondary, fontSize: 10, lineHeight: 1.55, marginTop: 4 }}><b>Quando avançar:</b> {stage.advance_when.join(' · ') || 'Não informado'}</div></div>)}</div></div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}><button type="button" onClick={() => updateDraft((current) => ({ ...current, construction_step: 'principles' }))} style={{ ...inputStyle, cursor: 'pointer', width: 'auto' }}>Editar princípios</button><button type="button" disabled={saving} onClick={() => void save(draft, 'review_ready')} style={{ background: DS.blue, border: 0, borderRadius: DS.radius, color: '#fff', cursor: saving ? 'wait' : 'pointer', fontSize: 11, fontWeight: 850, padding: '10px 14px' }}>{saving ? 'Validando...' : 'Preparar para revisão final'}</button></div></div>}
    </div>
  )
}
