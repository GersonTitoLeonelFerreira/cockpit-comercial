'use client'

import * as React from 'react'

import BuyerDecisionArchitecture from '@/app/admin/configuracao-comercial/BuyerDecisionArchitecture'
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
import {
  applyBuyerDecisionArchitecture,
  auditBuyerDecisionConstruction,
  buildBuyerDecisionStageAssist,
  createBuyerDecisionDraft,
  getSellerActivityOnlyGuidance,
  mergeStageAssistiveSuggestions,
} from '@/app/lib/commercial-config/buyer-decision-architecture'
import GuidedBuyerDecisionJourney from './guided-journey/GuidedBuyerDecisionJourney'
import GuidedStageJourney from './guided-journey/GuidedStageJourney'
import MethodPublicationPanel from './MethodPublicationPanel'
import {
  buildMethodRecompileCandidate,
  diffMethodRecompileCandidate,
  isMethodSynthesisStale,
} from '@/app/lib/commercial-config/method-recompile'
import type {
  MethodRecompileDiff,
} from '@/app/lib/commercial-config/method-recompile'
import type { PublishedMethodInfo } from './MethodPublicationPanel'
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
  activityEvidence = false,
}: {
  label: string
  value: string[]
  onChange: (value: string[]) => void
  help?: string
  example?: string
  activityEvidence?: boolean
}) {
  const generic = value.find((item) => getGenericCommercialMethodGuidance(item))
  const activityOnly = activityEvidence
    ? value.find((item) => getSellerActivityOnlyGuidance(item))
    : undefined

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
      {activityOnly && (
        <div style={{ color: DS.yellowSoft, fontSize: 10, lineHeight: 1.45, marginTop: 6 }}>
          {getSellerActivityOnlyGuidance(activityOnly)}
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

function requirementLabel(
  value: CommercialMethodConstructionStageDraft['requirement'] | undefined,
): string {
  if (!value) return 'não existia'
  return {
    required: 'Obrigatória',
    conditional: 'Condicional',
    optional: 'Opcional',
  }[value]
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

  // Método atualmente publicado (fonte de verdade do banco — seção 14).
  // Carregado uma vez e recarregado após cada publicação bem-sucedida, para
  // decidir os rótulos "ainda não está em uso" / "alterações não
  // publicadas" / "publicado" em vez de confiar apenas no estado local.
  const [publishedInfo, setPublishedInfo] = React.useState<PublishedMethodInfo | null>(null)
  const [publishedInfoLoading, setPublishedInfoLoading] = React.useState(true)

  const loadPublishedInfo = React.useCallback(async () => {
    setPublishedInfoLoading(true)
    try {
      const response = await fetch('/api/admin/commercial-config', { cache: 'no-store' })
      const json = await response.json() as
        | { ok: true; workspace: { published: { version: Record<string, unknown> } | null } }
        | { ok: false; error: string }
      if (!response.ok || !json.ok) throw new Error('Erro ao carregar o método publicado atualmente.')
      const version = json.workspace.published?.version ?? null
      setPublishedInfo(
        version
          ? {
              method_name: version.commercial_method_name as string,
              version_number: version.version_number as number,
              published_at: version.published_at as string | null,
              contract_version: version.commercial_method_contract_version as string,
              definition: version.commercial_method_definition as PublishedMethodInfo['definition'],
            }
          : null,
      )
    } catch {
      // Uma falha ao carregar o status de publicação não deve travar a
      // construção do método; o painel de publicação mostra "Verificando..."
      // enquanto isso e o usuário pode tentar novamente ao reabrir a tela.
    } finally {
      setPublishedInfoLoading(false)
    }
  }, [])

  React.useEffect(() => { void loadPublishedInfo() }, [loadPublishedInfo])

  // Guarda de revisão (seção 3.2 / 23): "latest local edit wins". Cada
  // `updateDraft` incrementa a revisão local; um save cuja resposta chega
  // depois de novas edições locais é descartado em vez de sobrescrever o
  // estado mais novo. Ver app/lib/commercial-config/guided-journey/revision-guard.ts.
  const revisionRef = React.useRef(0)

  // Capítulo 4/5 da Jornada Guiada (seção 15/18): o caminho guiado é o
  // padrão; "Ver todos os campos" preserva o editor completo existente
  // como alternativa avançada, sem removê-lo.
  const [buyerDecisionMode, setBuyerDecisionMode] = React.useState<'guided' | 'advanced'>('guided')
  const [stageMode, setStageMode] = React.useState<'guided' | 'advanced'>('guided')

  // Recompilação segura (ONDA 8 / HOTFIX): a proposta recompilada NUNCA
  // entra em `draft`/`updateDraft` — isso disparia o autosave e aplicaria a
  // atualização sem clique explícito. Ela vive num estado separado, só
  // usado para pré-visualização e diff, até "Aplicar atualização" chamar
  // `save` diretamente (o mesmo caminho de sempre, com a mesma validação).
  const [recompileCandidate, setRecompileCandidate] =
    React.useState<CommercialMethodConstructionDraft | null>(null)
  const [recompiling, setRecompiling] = React.useState(false)

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
    const sentRevision = revisionRef.current
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

      if (revisionRef.current === sentRevision) {
        // Nenhuma edição local aconteceu enquanto o save estava em voo —
        // seguro reconciliar com o snapshot do servidor.
        setWorkspace(json.construction)
        setDraft(json.construction?.construction ?? nextDraft)
        setStatus(json.construction?.status ?? nextStatus)
        setDirty(false)
      }
      // Caso contrário, o usuário continuou editando durante o request: o
      // estado local (mais novo) é preservado e `dirty` permanece true, o
      // que agenda automaticamente um novo save com os dados atuais.
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
    revisionRef.current += 1
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
      if (!response.ok || !json.ok || !json.construction?.construction) throw new Error(json.ok ? 'Não foi possível iniciar a construção assistida.' : json.error)
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
          <h2 style={{ color: DS.textPrimary, fontSize: 23, marginBottom: 8 }}>Vamos transformar o diagnóstico em um método proporcional à sua venda</h2>
          <p style={{ color: DS.textSecondary, fontSize: 12, lineHeight: 1.65 }}>Antes de mostrar etapas, a Yolen vai fazer apenas as perguntas adicionais necessárias para entender como seus clientes decidem. Operações simples recebem uma camada curta; vendas complexas recebem maior profundidade.</p>
          <div style={{ background: DS.surfaceBg, border: `1px solid ${DS.border}`, borderRadius: DS.radius, marginTop: 16, padding: 14 }}>
            <strong style={{ color: DS.textPrimary, fontSize: 12 }}>Com base no que você informou:</strong>
            <ul style={{ color: DS.textSecondary, fontSize: 11, lineHeight: 1.65, marginBottom: 0 }}>{synthesis.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
          {error && <div style={{ color: DS.redSoft, fontSize: 11, marginTop: 12 }}>{error}</div>}
          <button type="button" onClick={() => void start()} disabled={saving} style={{ background: DS.blue, border: 0, borderRadius: DS.radius, color: '#fff', cursor: saving ? 'wait' : 'pointer', fontSize: 12, fontWeight: 850, marginTop: 16, padding: '11px 16px' }}>
            {saving ? 'Preparando...' : 'Continuar para como seus clientes decidem'}
          </button>
        </div>
      </div>
    )
  }

  const buyerDecision = draft.buyer_decision ?? createBuyerDecisionDraft(diagnosis)

  if (!buyerDecision.confirmed) {
    return (
      <div style={{ display: 'grid', gap: 14 }}>
        <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' }}>
          <button type="button" onClick={onBack} style={{ ...inputStyle, cursor: 'pointer', width: 'auto' }}>← Voltar às opções</button>
          <div style={{ color: DS.textMuted, fontSize: 10 }}>{saving ? 'Salvando...' : dirty ? 'Alterações serão salvas automaticamente' : 'Rascunho salvo'}</div>
        </div>
        {error && <div style={{ ...cardStyle(), borderColor: 'rgba(239,68,68,0.3)', color: DS.redSoft, fontSize: 11, padding: 14 }}>{error}</div>}
        <button
          type="button"
          onClick={() => setBuyerDecisionMode((mode) => (mode === 'guided' ? 'advanced' : 'guided'))}
          style={{ background: 'transparent', border: 0, color: DS.blueSoft, cursor: 'pointer', fontSize: 11, justifySelf: 'start' }}
        >
          {buyerDecisionMode === 'guided' ? 'Já sei como quero estruturar — ver todos os campos' : '← Voltar para uma pergunta por vez'}
        </button>
        {buyerDecisionMode === 'guided' ? (
          <GuidedBuyerDecisionJourney
            diagnosis={diagnosis}
            value={buyerDecision}
            onChange={(next) => updateDraft((current) => ({ ...current, buyer_decision: next }))}
            onConfirm={(next) => updateDraft((current) => applyBuyerDecisionArchitecture(current, diagnosis, next))}
          />
        ) : (
          <BuyerDecisionArchitecture
            diagnosis={diagnosis}
            value={buyerDecision}
            onChange={(next) => updateDraft((current) => ({ ...current, buyer_decision: next }))}
            onConfirm={(next) => updateDraft((current) => applyBuyerDecisionArchitecture(current, diagnosis, next))}
          />
        )}
      </div>
    )
  }

  const quality = [
    ...auditCommercialMethodConstruction(draft, diagnosis),
    ...auditBuyerDecisionConstruction(draft, diagnosis),
  ]
  const activeStage = draft.stages.find((stage) => stage.id === draft.active_stage_id) ?? draft.stages[0] ?? null
  const baseAssist = activeStage ? buildStageAssistiveSuggestions(activeStage, diagnosis) : null
  const decisionAssist = activeStage ? buildBuyerDecisionStageAssist(activeStage, diagnosis, buyerDecision) : null
  const assist = baseAssist && decisionAssist
    ? mergeStageAssistiveSuggestions(baseAssist, decisionAssist)
    : baseAssist ?? decisionAssist

  function setStage(next: CommercialMethodConstructionStageDraft) {
    updateDraft((current) => ({ ...current, stages: current.stages.map((stage) => stage.id === next.id ? next : stage), active_stage_id: next.id }))
  }

  function addUnique(list: string[], item: string): string[] {
    return list.includes(item) ? list : [...list, item]
  }

  const hasUnpublishedChangesWhileEditing =
    status === 'editing' && !publishedInfoLoading && publishedInfo !== null

  const canOfferRecompile =
    Boolean(buyerDecision.confirmed) &&
    isMethodSynthesisStale(draft) &&
    (status === 'editing' || status === 'review_ready')

  const recompileDiff: MethodRecompileDiff | null = recompileCandidate
    ? diffMethodRecompileCandidate(draft, recompileCandidate)
    : null

  function startRecompilePreview() {
    if (!diagnosis || !draft) return
    const candidate = buildMethodRecompileCandidate(diagnosis, draft)
    setRecompileCandidate(candidate)
  }

  function keepCurrentMethod() {
    setRecompileCandidate(null)
  }

  async function applyRecompileCandidate() {
    if (!recompileCandidate) return
    setRecompiling(true)
    try {
      const ok = await save(
        recompileCandidate,
        'editing',
      )
      if (ok) setRecompileCandidate(null)
    } finally {
      setRecompiling(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' }}>
        <button type="button" onClick={onBack} style={{ ...inputStyle, cursor: 'pointer', width: 'auto' }}>← Voltar às opções</button>
        <div style={{ color: DS.textMuted, fontSize: 10 }}>{saving ? 'Salvando...' : dirty ? 'Alterações serão salvas automaticamente' : 'Rascunho salvo'}</div>
      </div>
      {hasUnpublishedChangesWhileEditing && (
        <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(252,211,77,0.25)', borderRadius: DS.radiusContainer, padding: 13 }}>
          <strong style={{ color: DS.yellowSoft, fontSize: 11 }}>Alterações não publicadas</strong>
          <div style={{ color: DS.textSecondary, fontSize: 10, lineHeight: 1.5, marginTop: 4 }}>
            Existe uma versão publicada (“{publishedInfo?.method_name}”), mas você possui alterações ainda não publicadas. Ela continua ativa até você concluir a revisão e publicar novamente.
          </div>
        </div>
      )}
      {canOfferRecompile && !recompileCandidate && (
        <div style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: DS.radiusContainer, padding: 13 }}>
          <strong style={{ color: DS.blueSoft, fontSize: 11 }}>Há uma atualização disponível para a estrutura do seu método</strong>
          <div style={{ color: DS.textSecondary, fontSize: 10, lineHeight: 1.5, marginTop: 4 }}>
            A Yolen evoluiu como transforma suas respostas em etapas. Suas respostas continuam as mesmas — você pode gerar uma proposta atualizada e decidir se aplica. Nada muda até você aplicar.
          </div>
          <button type="button" onClick={startRecompilePreview} style={{ background: DS.blue, border: 0, borderRadius: DS.radius, color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 850, marginTop: 10, padding: '9px 13px' }}>
            Atualizar método com a versão mais recente da Yolen
          </button>
        </div>
      )}
      {recompileCandidate && recompileDiff && (
        <div style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: DS.radiusContainer, padding: 13 }}>
          <strong style={{ color: DS.blueSoft, fontSize: 11 }}>Atualizações encontradas</strong>
          {!recompileDiff.has_changes && (
            <div style={{ color: DS.textSecondary, fontSize: 10, lineHeight: 1.5, marginTop: 6 }}>
              A estrutura atual já reflete a síntese mais recente. Nenhuma mudança estrutural encontrada.
            </div>
          )}
          {recompileDiff.has_changes && (
            <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
              {recompileDiff.stages.filter((entry) => entry.change !== 'unchanged').map((entry) => (
                <div key={entry.key} style={{ color: DS.textSecondary, fontSize: 10, lineHeight: 1.5 }}>
                  <strong style={{ color: DS.textPrimary }}>{entry.name}</strong>{' — '}
                  {entry.change === 'added' && 'nova etapa sugerida'}
                  {entry.change === 'removed' && 'não aparece mais na síntese atual'}
                  {entry.change === 'changed' && entry.previous_requirement !== entry.next_requirement
                    ? `${requirementLabel(entry.previous_requirement)} → ${requirementLabel(entry.next_requirement)}`
                    : entry.change === 'changed' ? 'conteúdo sugerido mudou' : null}
                </div>
              ))}
              {recompileDiff.principles_changed && (
                <div style={{ color: DS.textSecondary, fontSize: 10, lineHeight: 1.5 }}>
                  <strong style={{ color: DS.textPrimary }}>Princípios</strong>{' — atualizados a partir da mesma arquitetura de decisão.'}
                </div>
              )}
            </div>
          )}
          <div style={{ color: DS.textMuted, fontSize: 10, lineHeight: 1.5, marginTop: 8 }}>
            Suas respostas do diagnóstico não mudam. Etapas que você adicionou manualmente são preservadas. Nada é publicado — isso só atualiza o rascunho em revisão.
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            <button type="button" onClick={keepCurrentMethod} disabled={recompiling} style={{ ...inputStyle, cursor: recompiling ? 'wait' : 'pointer', width: 'auto' }}>Manter método atual</button>
            <button type="button" onClick={() => void applyRecompileCandidate()} disabled={recompiling || !recompileDiff.has_changes} style={{ background: DS.blue, border: 0, borderRadius: DS.radius, color: '#fff', cursor: recompiling ? 'wait' : 'pointer', fontSize: 11, fontWeight: 850, padding: '9px 13px' }}>
              {recompiling ? 'Aplicando...' : 'Aplicar atualização'}
            </button>
          </div>
        </div>
      )}
      <StepBar step={draft.construction_step} />
      {error && <div style={{ ...cardStyle(), borderColor: 'rgba(239,68,68,0.3)', color: DS.redSoft, fontSize: 11, padding: 14 }}>{error}</div>}
      {serverIssues.length > 0 && <div style={{ ...cardStyle(), borderColor: 'rgba(245,158,11,0.3)', padding: 14 }}><strong style={{ color: DS.yellowSoft, fontSize: 11 }}>Ainda falta ajustar:</strong><ul style={{ color: DS.textSecondary, fontSize: 10, lineHeight: 1.55 }}>{serverIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}

      {draft.construction_step === 'structure' && (
        <div style={{ ...cardStyle(), padding: 18 }}>
          <div style={{ color: DS.blueSoft, fontSize: 10, fontWeight: 850, textTransform: 'uppercase' }}>Sugestão da Yolen</div>
          <h3 style={{ color: DS.textPrimary, fontSize: 18, margin: '7px 0' }}>Estrutura calibrada pela forma como seus clientes decidem</h3>
          <p style={{ color: DS.textSecondary, fontSize: 11, lineHeight: 1.6 }}>Aceite, renomeie, remova, adicione ou reordene. A Yolen usa as respostas para definir profundidade, mas o gestor confirma a estrutura final.</p>
          <button
            type="button"
            onClick={() => updateDraft((current) => ({
              ...current,
              buyer_decision: {
                ...(current.buyer_decision ?? createBuyerDecisionDraft(diagnosis)),
                confirmed: false,
              },
            }))}
            style={{ ...inputStyle, color: DS.blueSoft, cursor: 'pointer', marginTop: 4, width: 'auto' }}
          >
            Rever como os clientes decidem
          </button>
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
          {activeStage && stageMode === 'guided' ? (
            <div style={{ display: 'grid', gap: 12 }}>
              <button
                type="button"
                onClick={() => setStageMode('advanced')}
                style={{ background: 'transparent', border: 0, color: DS.blueSoft, cursor: 'pointer', fontSize: 11, justifySelf: 'start' }}
              >
                Já sei como quero estruturar — ver todos os campos
              </button>
              <GuidedStageJourney
                stage={activeStage}
                onChange={(next) => setStage(next)}
                assist={assist}
                onDone={() => {
                  const index = draft.stages.findIndex((item) => item.id === activeStage.id)
                  const nextStage = draft.stages[index + 1]
                  if (nextStage) {
                    updateDraft((current) => ({ ...current, active_stage_id: nextStage.id }))
                  } else {
                    updateDraft((current) => ({ ...current, construction_step: 'principles' }))
                  }
                }}
              />
            </div>
          ) : activeStage ? (
            <div style={{ ...cardStyle(), display: 'grid', gap: 18, padding: 18 }}>
              <button
                type="button"
                onClick={() => setStageMode('guided')}
                style={{ background: 'transparent', border: 0, color: DS.blueSoft, cursor: 'pointer', fontSize: 11, justifySelf: 'start' }}
              >
                ← Voltar para uma pergunta por vez
              </button>
              <div><div style={{ color: DS.blueSoft, fontSize: 10, fontWeight: 850, textTransform: 'uppercase' }}>Construção da etapa</div><h3 style={{ color: DS.textPrimary, margin: '6px 0 0' }}>{activeStage.name || 'Etapa sem nome'}</h3></div>
              <Field label="Como sua equipe chama esse momento da venda?"><input value={activeStage.name} onChange={(event) => setStage({ ...activeStage, name: event.target.value, key: slugifyCommercialMethodKey(event.target.value) })} style={inputStyle} /></Field>
              <Field label="Essa etapa é obrigatória, condicional ou opcional?"><select value={activeStage.requirement} onChange={(event) => setStage({ ...activeStage, requirement: event.target.value as CommercialMethodConstructionStageDraft['requirement'] })} style={inputStyle}><option value="required">Obrigatória</option><option value="conditional">Condicional</option><option value="optional">Opcional</option></select><RequirementHelp value={activeStage.requirement} /></Field>
              {activeStage.requirement === 'conditional' && <ListEditor label="Quando essa etapa pode ser pulada?" help="Explique a condição objetiva que torna essa etapa desnecessária naquela oportunidade." value={activeStage.skip_conditions} onChange={(value) => setStage({ ...activeStage, skip_conditions: value })} />}
              <Field label="O que o vendedor precisa conseguir ou compreender antes de sair desta etapa?" help="Esse é o objetivo. Evite descrever apenas uma atividade; descreva o resultado comercial ou entendimento necessário." example="Fraco: Entender o cliente. Melhor: Entender o motivo principal do contato e o que o cliente espera resolver."><textarea rows={3} value={activeStage.objective} onChange={(event) => setStage({ ...activeStage, objective: event.target.value })} style={{ ...inputStyle, resize: 'vertical' }} />{getGenericCommercialMethodGuidance(activeStage.objective) && <div style={{ color: DS.yellowSoft, fontSize: 10, lineHeight: 1.45, marginTop: 6 }}>{getGenericCommercialMethodGuidance(activeStage.objective)}</div>}</Field>
              <ListEditor label="Que evidências mostram que esta etapa realmente foi concluída?" help="Prefira algo que o comprador confirmou, validou, aceitou ou combinou. 'Fiz demo' e 'enviei proposta' não bastam." value={activeStage.completion_criteria} onChange={(value) => setStage({ ...activeStage, completion_criteria: value })} example="o cliente confirmou que o requisito necessário foi atendido" activityEvidence />
              <ListEditor label="O que mostra progresso, mas ainda não é suficiente para avançar?" value={activeStage.partial_completion_criteria} onChange={(value) => setStage({ ...activeStage, partial_completion_criteria: value })} />
              <ListEditor label="Em quais situações o vendedor precisa continuar investigando?" value={activeStage.deepen_when} onChange={(value) => setStage({ ...activeStage, deepen_when: value })} />
              <ListEditor label="Quando o vendedor já sabe o bastante?" help="Isso ajuda a impedir interrogatórios e perguntas sem utilidade." value={activeStage.sufficient_when} onChange={(value) => setStage({ ...activeStage, sufficient_when: value })} />
              <ListEditor label="O que precisa ser verdadeiro para seguir para a próxima etapa?" help="Atividade do vendedor não prova avanço. Use evidência do comprador sempre que a etapa depender de uma decisão dele." value={activeStage.advance_when} onChange={(value) => setStage({ ...activeStage, advance_when: value })} activityEvidence />
              <ListEditor label="Existe alguma situação em que o vendedor deve esperar, sem avançar nem insistir?" value={activeStage.wait_when} onChange={(value) => setStage({ ...activeStage, wait_when: value })} />
              <ListEditor label="Quando novas perguntas deixariam de acrescentar valor?" help="Aprofundar é investigar quando falta algo relevante. Continuar perguntando sem necessidade é repetir ou buscar detalhe que não muda a decisão." value={activeStage.stop_asking_when} onChange={(value) => setStage({ ...activeStage, stop_asking_when: value })} />
              <ListEditor label="Perguntas recomendadas" help="São referências, nunca um script obrigatório. Você pode editar qualquer sugestão depois de adicioná-la." value={activeStage.recommended_questions} onChange={(value) => setStage({ ...activeStage, recommended_questions: value })} />
              <ListEditor label="O que sua equipe não deve fazer nesta etapa?" value={activeStage.common_mistakes} onChange={(value) => setStage({ ...activeStage, common_mistakes: value })} />
              {assist && (assist.context_notes.length > 0 || assist.completion_criteria.length > 0 || assist.recommended_questions.length > 0 || assist.common_mistakes.length > 0) && <div style={{ background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(96,165,250,0.18)', borderRadius: DS.radius, padding: 13 }}><strong style={{ color: DS.blueSoft, fontSize: 11 }}>Ajuda da Yolen baseada no seu diagnóstico</strong><p style={{ color: DS.textMuted, fontSize: 10, lineHeight: 1.5 }}>Nada abaixo é verdade automática. Clique apenas no que representa a sua operação.</p>{assist.context_notes.map((note) => <div key={note} style={{ color: DS.textSecondary, fontSize: 10, lineHeight: 1.5, marginTop: 5 }}>{note}</div>)}<div style={{ display: 'grid', gap: 6, marginTop: 9 }}>{assist.completion_criteria.map((item) => <SuggestionButton key={item} text={`Critério: ${item}`} onAdd={() => setStage({ ...activeStage, completion_criteria: addUnique(activeStage.completion_criteria, item) })} />)}{assist.recommended_questions.map((item) => <SuggestionButton key={item} text={`Pergunta: ${item}`} onAdd={() => setStage({ ...activeStage, recommended_questions: addUnique(activeStage.recommended_questions, item) })} />)}{assist.common_mistakes.map((item) => <SuggestionButton key={item} text={`Erro comum: ${item}`} onAdd={() => setStage({ ...activeStage, common_mistakes: addUnique(activeStage.common_mistakes, item) })} />)}</div></div>}
              <DimensionEditor dimensions={activeStage.dimensions} onChange={(value) => setStage({ ...activeStage, dimensions: value })} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}><button type="button" onClick={() => updateDraft((current) => ({ ...current, construction_step: 'structure' }))} style={{ ...inputStyle, cursor: 'pointer', width: 'auto' }}>Revisar estrutura</button><button type="button" onClick={() => updateDraft((current) => ({ ...current, construction_step: 'principles' }))} style={{ background: DS.blue, border: 0, borderRadius: DS.radius, color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 850, padding: '10px 14px' }}>Continuar para princípios</button></div>
            </div>
          ) : <div style={{ ...cardStyle(), color: DS.textSecondary, padding: 18 }}>Adicione ao menos uma etapa para continuar.</div>}
        </div>
      )}

      {draft.construction_step === 'principles' && <div style={{ ...cardStyle(), display: 'grid', gap: 16, padding: 18 }}><div><h3 style={{ color: DS.textPrimary, margin: 0 }}>Princípios globais do método</h3><p style={{ color: DS.textSecondary, fontSize: 11, lineHeight: 1.6 }}>A Yolen sugeriu princípios a partir da complexidade da decisão. Revise, remova ou reescreva. Eles não são nomes de metodologias e só devem permanecer se fizerem sentido para sua operação.</p></div><Field label="Como você quer chamar este método?" help="Pode ser um nome interno simples. Você pode mudar depois."><input value={draft.method_name} onChange={(event) => updateDraft((current) => ({ ...current, method_name: event.target.value }))} style={inputStyle} /></Field><Field label="Como você explicaria este método em uma frase?"><textarea rows={3} value={draft.method_description} onChange={(event) => updateDraft((current) => ({ ...current, method_description: event.target.value }))} style={{ ...inputStyle, resize: 'vertical' }} /></Field><ListEditor label="Princípios do método" help="Princípios orientam o raciocínio de todas as etapas. Não copie regras de preço, contrato ou desconto para cá." example="Avanço real exige evidência do comprador, não apenas uma atividade concluída pelo vendedor." value={draft.principles} onChange={(value) => updateDraft((current) => ({ ...current, principles: value }))} />{(diagnosis.commercial_rules.restrictions.forbidden_promises.length > 0 || diagnosis.commercial_rules.discounts.policy) && <div style={{ background: DS.surfaceBg, border: `1px solid ${DS.border}`, borderRadius: DS.radius, color: DS.textMuted, fontSize: 10, lineHeight: 1.55, padding: 12 }}>Sua Base Comercial possui restrições e/ou regras de desconto. Elas continuam na Base Comercial. Se alguma delas representa um comportamento transversal da equipe, você pode expressar esse comportamento como princípio sem copiar condições e valores para dentro do método.</div>}<div style={{ display: 'flex', gap: 8 }}><button type="button" onClick={() => updateDraft((current) => ({ ...current, construction_step: 'stages' }))} style={{ ...inputStyle, cursor: 'pointer', width: 'auto' }}>Voltar às etapas</button><button type="button" onClick={() => updateDraft((current) => ({ ...current, construction_step: 'review' }))} style={{ background: DS.blue, border: 0, borderRadius: DS.radius, color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 850, padding: '10px 14px' }}>Revisar método</button></div></div>}

      {draft.construction_step === 'review' && <div style={{ display: 'grid', gap: 12 }}>{status === 'review_ready' && workspace?.method_definition && <MethodPublicationPanel methodName={draft.method_name} methodDefinition={workspace.method_definition} published={publishedInfo} publishedLoading={publishedInfoLoading} onPublished={() => void loadPublishedInfo()} />}<div style={{ ...cardStyle(), padding: 18 }}><h3 style={{ color: DS.textPrimary, marginTop: 0 }}>Diagnóstico de qualidade</h3><div style={{ display: 'grid', gap: 7 }}>{quality.map((item, index) => <div key={`${item.message}-${index}`} style={{ color: item.level === 'pass' ? DS.greenSoft : DS.yellowSoft, fontSize: 11, lineHeight: 1.5 }}>{item.level === 'pass' ? '✓' : '⚠'} {item.message}</div>)}</div></div><div style={{ ...cardStyle(), padding: 18 }}><div style={{ color: DS.blueSoft, fontSize: 10, fontWeight: 850, textTransform: 'uppercase' }}>Seu método</div><h2 style={{ color: DS.textPrimary, fontSize: 20, marginBottom: 5 }}>{draft.method_name || 'Método ainda sem nome'}</h2><p style={{ color: DS.textSecondary, fontSize: 11, lineHeight: 1.6 }}>{draft.method_description || 'Descrição ainda não preenchida.'}</p><div style={{ display: 'grid', gap: 10, marginTop: 14 }}>{draft.stages.map((stage, index) => <div key={stage.id} style={{ background: DS.surfaceBg, border: `1px solid ${DS.border}`, borderRadius: DS.radius, padding: 13 }}><div style={{ alignItems: 'center', display: 'flex', justifyContent: 'space-between', gap: 10 }}><strong style={{ color: DS.textPrimary, fontSize: 12 }}>Etapa {index + 1} — {stage.name || 'Sem nome'}</strong><button type="button" onClick={() => updateDraft((current) => ({ ...current, construction_step: 'stages', active_stage_id: stage.id }))} style={{ background: 'transparent', border: 0, color: DS.blueSoft, cursor: 'pointer', fontSize: 10 }}>Editar</button></div><div style={{ color: DS.textSecondary, fontSize: 10, lineHeight: 1.55, marginTop: 7 }}><b>Objetivo:</b> {stage.objective || 'Não informado'}</div><div style={{ color: DS.textSecondary, fontSize: 10, lineHeight: 1.55, marginTop: 4 }}><b>Critérios:</b> {stage.completion_criteria.join(' · ') || 'Não informados'}</div><div style={{ color: DS.textSecondary, fontSize: 10, lineHeight: 1.55, marginTop: 4 }}><b>Quando avançar:</b> {stage.advance_when.join(' · ') || 'Não informado'}</div></div>)}</div></div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}><button type="button" onClick={() => updateDraft((current) => ({ ...current, construction_step: 'principles' }))} style={{ ...inputStyle, cursor: 'pointer', width: 'auto' }}>Editar princípios</button><button type="button" disabled={saving} onClick={() => void save(draft, 'review_ready')} style={{ background: DS.blue, border: 0, borderRadius: DS.radius, color: '#fff', cursor: saving ? 'wait' : 'pointer', fontSize: 11, fontWeight: 850, padding: '10px 14px' }}>{saving ? 'Validando...' : 'Preparar para revisão final'}</button></div></div>}
    </div>
  )
}
