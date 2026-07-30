import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const corpusUrl = new URL(
  '../../../docs/companion-v2/corpus/cases.json',
  import.meta.url,
)

const corpus = JSON.parse(
  await readFile(corpusUrl, 'utf8'),
)

const allowedStatuses = new Set([
  'novo',
  'contato',
  'respondeu',
  'negociacao',
  'pausado',
  'cancelado',
  'ganho',
  'perdido',
])

const allowedDirections = new Set([
  'incoming',
  'outgoing',
])

const allowedStates = new Set([
  'active',
  'superseded',
  'deleted',
])

const allowedContentTypes = new Set([
  'text',
  'audio',
])

const allowedAnalysisScopes = new Set([
  'current',
  'historical_context',
])

const allowedAnalysisStatuses =
  new Set([
    'complete',
    'limited',
    'blocked',
  ])

const allowedRelevance = new Set([
  'commercial',
  'non_commercial',
  'uncertain',
])

const allowedConfidence = new Set([
  'high',
  'medium',
  'low',
])

const allowedFit = new Set([
  'fit',
  'partial_fit',
  'misfit',
  'unknown',
])

const factKeys = [
  'lead_responded',
  'no_response',
  'commercial_objection_active',
  'follow_up_requested',
  'follow_up_has_date_or_period',
  'visit_or_test_drive_scheduled',
  'explicit_win',
  'explicit_loss',
]

const preservedCaseIds = [
  'won-explicit-payment',
  'lost-explicit-competitor',
  'appointment-client-confirmed',
  'negotiation-price-objection',
  'no-response-after-read',
  'edited-win-becomes-negotiation',
  'deleted-win-falls-back-to-negotiation',
  'audio-transcribed-appointment',
  'audio-without-transcription-blocks-apply',
  'false-positive-personal-time',
  'false-positive-seller-only-invite',
  'negotiation-overridden-by-final-appointment',
  'negotiation-then-explicit-loss',
  'personal-conversation-with-date',
]

function getLatestMessages(messages) {
  const latestById = new Map()

  for (const message of messages) {
    const current =
      latestById.get(message.id)

    if (
      !current ||
      message.version >
        current.version
    ) {
      latestById.set(
        message.id,
        message,
      )
    }
  }

  return Array.from(
    latestById.values(),
  )
}

function getCurrentMessages(messages) {
  return getLatestMessages(
    messages,
  ).filter(
    (message) =>
      message.state === 'active',
  )
}

function collectText(caseItem) {
  return [
    caseItem.title,
    ...caseItem.messages.flatMap(
      (message) => [
        message.text,
        message.audio_transcription,
      ],
    ),
    JSON.stringify(caseItem.oracle),
  ]
    .filter(Boolean)
    .join(' ')
}

function collectEvidenceArrays(
  value,
  key = '',
  output = [],
) {
  if (Array.isArray(value)) {
    if (
      key === 'evidence_message_ids'
    ) {
      output.push(value)
    } else {
      for (const item of value) {
        collectEvidenceArrays(
          item,
          '',
          output,
        )
      }
    }

    return output
  }

  if (
    value &&
    typeof value === 'object'
  ) {
    for (
      const [childKey, childValue] of
      Object.entries(value)
    ) {
      collectEvidenceArrays(
        childValue,
        childKey,
        output,
      )
    }
  }

  return output
}

test('corpus formaliza a versão aprovada da Fase 1', () => {
  assert.equal(
    corpus.corpus_version,
    2,
  )
  assert.equal(
    corpus.contract_version,
    'phase-1-v1',
  )
  assert.equal(
    corpus.language,
    'pt-BR',
  )
  assert.equal(
    corpus.data_origin,
    'synthetic_anonymized',
  )
  assert.equal(
    corpus.approved_on,
    '2026-07-30',
  )
  assert.equal(
    corpus.cases.length,
    30,
  )
})

test('os 14 casos originais foram preservados', () => {
  const ids = new Set(
    corpus.cases.map(
      (caseItem) => caseItem.id,
    ),
  )

  for (const id of preservedCaseIds) {
    assert.ok(
      ids.has(id),
      `Caso original ausente: ${id}`,
    )
  }
})

test('todas as coberturas obrigatórias estão presentes', () => {
  const covered = new Set(
    corpus.cases.flatMap(
      (caseItem) =>
        caseItem.coverage,
    ),
  )

  for (
    const required of
    corpus.required_coverages
  ) {
    assert.ok(
      covered.has(required),
      `Cobertura ausente: ${required}`,
    )
  }
})

test('casos, mensagens, versões e sequências são únicos', () => {
  const caseIds = new Set()

  for (const caseItem of corpus.cases) {
    assert.ok(caseItem.id)
    assert.equal(
      caseIds.has(caseItem.id),
      false,
      `Caso duplicado: ${caseItem.id}`,
    )
    caseIds.add(caseItem.id)

    assert.ok(
      allowedStatuses.has(
        caseItem.initial_status,
      ),
      `Status inicial inválido em ${caseItem.id}`,
    )
    assert.ok(
      Number.isFinite(
        Date.parse(
          caseItem.reference_time,
        ),
      ),
      `Horário inválido em ${caseItem.id}`,
    )

    const identities = new Set()
    const sequences = new Set()
    const versionsByMessage =
      new Map()

    for (
      const message of
      caseItem.messages
    ) {
      const identity =
        `${message.id}:${message.version}`

      assert.ok(message.id)
      assert.equal(
        identities.has(identity),
        false,
        `Identidade duplicada em ${caseItem.id}: ${identity}`,
      )
      identities.add(identity)

      assert.ok(
        Number.isInteger(
          message.sequence,
        ) &&
          message.sequence >= 1,
        `Sequência inválida em ${caseItem.id}/${identity}`,
      )
      assert.equal(
        sequences.has(
          message.sequence,
        ),
        false,
        `Sequência duplicada em ${caseItem.id}: ${message.sequence}`,
      )
      sequences.add(message.sequence)

      assert.ok(
        Number.isInteger(
          message.version,
        ) &&
          message.version >= 1,
        `Versão inválida em ${caseItem.id}/${identity}`,
      )
      assert.ok(
        allowedDirections.has(
          message.direction,
        ),
        `Direção inválida em ${caseItem.id}/${identity}`,
      )
      assert.ok(
        allowedStates.has(
          message.state,
        ),
        `Estado inválido em ${caseItem.id}/${identity}`,
      )
      assert.ok(
        allowedContentTypes.has(
          message.content_type,
        ),
        `Tipo inválido em ${caseItem.id}/${identity}`,
      )
      assert.ok(
        allowedAnalysisScopes.has(
          message.analysis_scope,
        ),
        `Escopo inválido em ${caseItem.id}/${identity}`,
      )
      assert.ok(
        Number.isFinite(
          Date.parse(
            message.captured_at,
          ),
        ),
        `Horário inválido em ${caseItem.id}/${identity}`,
      )

      const versions =
        versionsByMessage.get(
          message.id,
        ) ?? []
      versions.push(message.version)
      versionsByMessage.set(
        message.id,
        versions,
      )
    }

    for (
      const [messageId, versions] of
      versionsByMessage
    ) {
      const ordered =
        versions.toSorted(
          (left, right) =>
            left - right,
        )

      assert.deepEqual(
        ordered,
        Array.from(
          {
            length:
              ordered.at(-1),
          },
          (_, index) => index + 1,
        ),
        `Versões descontínuas em ${caseItem.id}/${messageId}`,
      )
    }
  }
})

test('a fotografia atual coincide com as mensagens ativas mais recentes', () => {
  for (const caseItem of corpus.cases) {
    const currentIds =
      getCurrentMessages(
        caseItem.messages,
      )
        .map((message) => message.id)
        .toSorted()

    assert.deepEqual(
      caseItem.oracle
        .current_message_ids
        .toSorted(),
      currentIds,
      `Fotografia divergente em ${caseItem.id}`,
    )
  }
})

test('contexto comercial diferencia método configurado e ausência de método', () => {
  for (const caseItem of corpus.cases) {
    const context =
      caseItem.commercial_context

    assert.ok(context)
    assert.ok(
      Array.isArray(
        context.products,
      ),
    )

    const methodConfigured =
      context.method !== null

    assert.equal(
      caseItem.oracle.sales_method
        .configured,
      methodConfigured,
      `Configuração de método divergente em ${caseItem.id}`,
    )

    if (methodConfigured) {
      assert.ok(context.method.id)
      assert.ok(context.method.name)
      assert.ok(
        Array.isArray(
          context.method.steps,
        ),
      )
    }
  }
})

test('todo oráculo contém os 16 blocos funcionais aprovados', () => {
  const requiredKeys = [
    'analysis_status',
    'analysis_limitations',
    'commercial_relevance',
    'confidence',
    'facts',
    'customer_intent',
    'needs',
    'missing_information',
    'unanswered_questions',
    'active_objections',
    'seller_assessment',
    'sales_method',
    'solution_fit',
    'guidance',
    'crm_suggestion',
    'evidence_message_ids',
  ]

  for (const caseItem of corpus.cases) {
    for (const key of requiredKeys) {
      assert.ok(
        Object.hasOwn(
          caseItem.oracle,
          key,
        ),
        `Bloco ${key} ausente em ${caseItem.id}`,
      )
    }

    assert.ok(
      caseItem.oracle.rationale,
      `Justificativa ausente em ${caseItem.id}`,
    )
  }
})

test('enumerações e fatos possuem valores válidos', () => {
  for (const caseItem of corpus.cases) {
    const current =
      caseItem.oracle

    assert.ok(
      allowedAnalysisStatuses.has(
        current.analysis_status,
      ),
      `analysis_status inválido em ${caseItem.id}`,
    )
    assert.ok(
      allowedRelevance.has(
        current
          .commercial_relevance,
      ),
      `commercial_relevance inválida em ${caseItem.id}`,
    )
    assert.ok(
      allowedConfidence.has(
        current.confidence,
      ),
      `confidence inválida em ${caseItem.id}`,
    )
    assert.ok(
      allowedFit.has(
        current.solution_fit
          .status,
      ),
      `solution_fit inválido em ${caseItem.id}`,
    )

    for (const key of factKeys) {
      assert.equal(
        typeof current.facts[key],
        'boolean',
        `Fato ${key} inválido em ${caseItem.id}`,
      )
    }

    assert.ok(
      current.facts.final_intent ===
        null ||
        typeof current.facts
          .final_intent ===
          'string',
      `Intenção final inválida em ${caseItem.id}`,
    )
  }
})

test('evidências apontam somente para mensagens ativas na versão atual', () => {
  for (const caseItem of corpus.cases) {
    const activeIds = new Set(
      getCurrentMessages(
        caseItem.messages,
      ).map(
        (message) => message.id,
      ),
    )

    const evidenceArrays =
      collectEvidenceArrays(
        caseItem.oracle,
      )

    for (
      const evidenceIds of
      evidenceArrays
    ) {
      for (
        const messageId of
        evidenceIds
      ) {
        assert.ok(
          activeIds.has(messageId),
          `Evidência inválida em ${caseItem.id}: ${messageId}`,
        )
      }
    }
  }
})

test('mensagens apagadas ou superadas não sustentam diagnóstico', () => {
  for (const caseItem of corpus.cases) {
    const inactiveIds = new Set(
      getLatestMessages(
        caseItem.messages,
      )
        .filter(
          (message) =>
            message.state !==
            'active',
        )
        .map(
          (message) => message.id,
        ),
    )

    const evidenceIds = new Set(
      collectEvidenceArrays(
        caseItem.oracle,
      ).flat(),
    )

    for (const id of inactiveIds) {
      assert.equal(
        evidenceIds.has(id),
        false,
        `Mensagem inativa usada em ${caseItem.id}: ${id}`,
      )
    }
  }
})

test('o contrato não contém comando de aplicação automática', () => {
  const serialized =
    JSON.stringify(corpus)

  assert.equal(
    serialized.includes(
      'apply_crm_change',
    ),
    false,
  )
  assert.equal(
    serialized.includes(
      'application_blocked',
    ),
    false,
  )

  for (const caseItem of corpus.cases) {
    assert.equal(
      caseItem.oracle
        .crm_suggestion
        .requires_human_confirmation,
      true,
      `Confirmação humana ausente em ${caseItem.id}`,
    )
  }
})

test('sugestão de CRM respeita regras de null e confirmação', () => {
  for (const caseItem of corpus.cases) {
    const crm =
      caseItem.oracle
        .crm_suggestion

    assert.equal(
      typeof crm
        .should_change_crm_stage,
      'boolean',
      `should_change_crm_stage inválido em ${caseItem.id}`,
    )

    if (
      crm.should_change_crm_stage
    ) {
      assert.ok(
        allowedStatuses.has(
          crm.recommended_status,
        ),
        `Etapa recomendada inválida em ${caseItem.id}`,
      )
    }

    if (
      crm.recommended_status !== null
    ) {
      assert.ok(
        allowedStatuses.has(
          crm.recommended_status,
        ),
        `Etapa inválida em ${caseItem.id}`,
      )
    }

    assert.ok(
      Array.isArray(
        crm.prohibited_statuses,
      ),
      `Proibições ausentes em ${caseItem.id}`,
    )
  }
})

test('ganho e perda exigem declaração explícita do cliente', () => {
  for (const caseItem of corpus.cases) {
    const {
      facts,
      crm_suggestion: crm,
    } = caseItem.oracle

    if (
      crm.recommended_status ===
      'ganho'
    ) {
      assert.equal(
        facts.explicit_win,
        true,
        `Ganho sem evidência em ${caseItem.id}`,
      )
      assert.equal(
        facts.explicit_loss,
        false,
        `Ganho contraditório em ${caseItem.id}`,
      )
    }

    if (
      crm.recommended_status ===
      'perdido'
    ) {
      assert.equal(
        facts.explicit_loss,
        true,
        `Perda sem evidência em ${caseItem.id}`,
      )
      assert.equal(
        facts.explicit_win,
        false,
        `Perda contraditória em ${caseItem.id}`,
      )
    }
  }
})

test('agenda exige aceite do cliente, data futura e confirmação humana', () => {
  for (const caseItem of corpus.cases) {
    const {
      facts,
      crm_suggestion: crm,
    } = caseItem.oracle

    if (
      crm.recommended_status !==
        'respondeu' ||
      !crm.next_action_required
    ) {
      continue
    }

    assert.equal(
      facts.lead_responded,
      true,
      `Agenda sem resposta em ${caseItem.id}`,
    )
    assert.equal(
      facts.follow_up_requested ||
        facts
          .visit_or_test_drive_scheduled,
      true,
      `Agenda sem compromisso em ${caseItem.id}`,
    )
    assert.equal(
      facts
        .follow_up_has_date_or_period,
      true,
      `Agenda sem data em ${caseItem.id}`,
    )
    assert.ok(
      Number.isFinite(
        Date.parse(
          crm.expected_next_action_at,
        ),
      ),
      `Agenda sem horário resolvido em ${caseItem.id}`,
    )
    assert.ok(
      Date.parse(
        crm.expected_next_action_at,
      ) >
        Date.parse(
          caseItem.reference_time,
        ),
      `Agenda vencida em ${caseItem.id}`,
    )
  }
})

test('conversa não comercial não gera intervenção nem CRM', () => {
  const nonCommercial =
    corpus.cases.filter(
      (caseItem) =>
        caseItem.oracle
          .commercial_relevance ===
        'non_commercial',
    )

  assert.ok(
    nonCommercial.length >= 2,
  )

  for (
    const caseItem of
    nonCommercial
  ) {
    const {
      guidance,
      crm_suggestion: crm,
    } = caseItem.oracle

    assert.equal(
      guidance
        .intervention_required,
      false,
      `Intervenção pessoal em ${caseItem.id}`,
    )
    assert.equal(
      guidance
        .recommended_question,
      null,
      `Pergunta pessoal em ${caseItem.id}`,
    )
    assert.equal(
      guidance.suggested_message,
      null,
      `Mensagem pessoal em ${caseItem.id}`,
    )
    assert.equal(
      crm.should_change_crm_stage,
      false,
      `CRM alterado em conversa pessoal: ${caseItem.id}`,
    )
    assert.equal(
      crm.recommended_status,
      null,
      `Etapa sugerida em conversa pessoal: ${caseItem.id}`,
    )
  }
})

test('análise completa não esconde limitação e análise limitada a declara', () => {
  for (const caseItem of corpus.cases) {
    const {
      analysis_status:
        analysisStatus,
      analysis_limitations:
        limitations,
    } = caseItem.oracle

    assert.ok(
      Array.isArray(limitations),
    )

    if (
      analysisStatus === 'complete'
    ) {
      assert.equal(
        limitations.length,
        0,
        `Limitação oculta em ${caseItem.id}`,
      )
    } else {
      assert.ok(
        limitations.length > 0,
        `Limitação não declarada em ${caseItem.id}`,
      )
    }
  }
})

test('análise bloqueada não inventa intenção, orientação ou etapa', () => {
  const blocked =
    corpus.cases.filter(
      (caseItem) =>
        caseItem.oracle
          .analysis_status ===
        'blocked',
    )

  assert.ok(blocked.length > 0)

  for (const caseItem of blocked) {
    const {
      customer_intent:
        customerIntent,
      guidance,
      crm_suggestion: crm,
    } = caseItem.oracle

    assert.equal(
      customerIntent,
      null,
      `Intenção inventada em ${caseItem.id}`,
    )
    assert.equal(
      guidance
        .intervention_required,
      false,
      `Intervenção inventada em ${caseItem.id}`,
    )
    assert.equal(
      crm.recommended_status,
      null,
      `CRM inventado em ${caseItem.id}`,
    )
    assert.equal(
      crm.should_change_crm_stage,
      false,
      `Mudança inventada em ${caseItem.id}`,
    )
  }
})

test('objeções ativas coincidem com os fatos atuais', () => {
  for (const caseItem of corpus.cases) {
    const {
      facts,
      active_objections:
        activeObjections,
    } = caseItem.oracle

    if (
      facts
        .commercial_objection_active
    ) {
      assert.ok(
        activeObjections.length > 0,
        `Objeção sem descrição em ${caseItem.id}`,
      )
    } else {
      assert.equal(
        activeObjections.length,
        0,
        `Objeção encerrada mantida em ${caseItem.id}`,
      )
    }
  }
})

test('perguntas ignoradas e repetidas permanecem separadas', () => {
  const ignored = corpus.cases.find(
    (caseItem) =>
      caseItem.id ===
      'seller-ignores-customer-question',
  )
  const repeated = corpus.cases.find(
    (caseItem) =>
      caseItem.id ===
      'seller-repeats-answered-question',
  )

  assert.equal(
    ignored.oracle
      .unanswered_questions.length,
    1,
  )
  assert.ok(
    ignored.oracle
      .seller_assessment.risks.some(
        (item) =>
          item.type ===
          'ignored_question',
      ),
  )
  assert.equal(
    repeated.oracle
      .unanswered_questions.length,
    0,
  )
  assert.ok(
    repeated.oracle
      .seller_assessment.risks.some(
        (item) =>
          item.type ===
          'repeated_answered_question',
      ),
  )
})

test('bom diagnóstico reconhece acertos sem criar crítica', () => {
  const caseItem =
    corpus.cases.find(
      (item) =>
        item.id ===
        'seller-good-discovery-and-answer',
    )

  assert.ok(
    caseItem.oracle
      .seller_assessment.strengths
      .length >= 2,
  )
  assert.equal(
    caseItem.oracle
      .seller_assessment.risks
      .length,
    0,
  )
  assert.equal(
    caseItem.oracle.guidance
      .intervention_required,
    false,
  )
  assert.equal(
    caseItem.oracle.solution_fit
      .status,
    'fit',
  )
})

test('apresentação prematura registra etapa pulada do método', () => {
  const prematureCases =
    corpus.cases.filter(
      (caseItem) =>
        caseItem.coverage.includes(
          'premature_presentation',
        ),
    )

  assert.ok(
    prematureCases.length >= 2,
  )

  for (
    const caseItem of
    prematureCases
  ) {
    assert.ok(
      caseItem.oracle
        .sales_method.skipped_steps
        .includes('diagnosticar'),
      `Diagnóstico não marcado como pulado em ${caseItem.id}`,
    )
    assert.ok(
      caseItem.oracle
        .seller_assessment.risks
        .some(
          (item) =>
            item.type ===
            'premature_presentation',
        ),
      `Risco ausente em ${caseItem.id}`,
    )
  }
})

test('orientação pode concluir que nenhuma intervenção é necessária', () => {
  const noIntervention =
    corpus.cases.filter(
      (caseItem) =>
        caseItem.oracle.guidance
          .intervention_required ===
        false,
    )

  assert.ok(
    noIntervention.length >= 8,
  )

  for (
    const caseItem of
    noIntervention
  ) {
    assert.equal(
      caseItem.oracle.guidance
        .recommended_question,
      null,
      `Pergunta indevida em ${caseItem.id}`,
    )
    assert.equal(
      caseItem.oracle.guidance
        .suggested_message,
      null,
      `Mensagem indevida em ${caseItem.id}`,
    )
  }
})

test('vou pensar, eu retorno e proposta enviada não viram agenda', () => {
  const ids = [
    'customer-will-think',
    'customer-will-return-without-date',
    'proposal-sent-awaiting-response',
  ]

  for (const id of ids) {
    const caseItem =
      corpus.cases.find(
        (item) => item.id === id,
      )
    const crm =
      caseItem.oracle
        .crm_suggestion

    assert.notEqual(
      crm.recommended_status,
      'respondeu',
      `Falso agendamento em ${id}`,
    )
    assert.ok(
      crm.prohibited_statuses.includes(
        'respondeu',
      ),
      `Agenda não proibida em ${id}`,
    )
  }
})

test('histórico antigo é contexto e o desfecho recente sustenta a decisão', () => {
  const caseItem =
    corpus.cases.find(
      (item) =>
        item.id ===
        'historical-scroll-does-not-override-current-outcome',
    )

  const historicalIds =
    new Set(
      caseItem.messages
        .filter(
          (message) =>
            message.analysis_scope ===
            'historical_context',
        )
        .map(
          (message) => message.id,
        ),
    )

  assert.ok(
    historicalIds.size > 0,
  )
  assert.equal(
    caseItem.oracle
      .crm_suggestion
      .recommended_status,
    'negociacao',
  )

  for (
    const id of
    caseItem.oracle
      .evidence_message_ids
  ) {
    assert.equal(
      historicalIds.has(id),
      false,
      `Histórico antigo sustentou desfecho: ${id}`,
    )
  }
})

test('mensagens no mesmo minuto usam sequência estável', () => {
  const caseItem =
    corpus.cases.find(
      (item) =>
        item.id ===
        'same-minute-messages-respect-sequence',
    )

  const timestamps =
    new Set(
      caseItem.messages.map(
        (message) =>
          message.captured_at,
      ),
    )

  assert.equal(timestamps.size, 1)
  assert.deepEqual(
    caseItem.messages.map(
      (message) =>
        message.sequence,
    ),
    [1, 2, 3],
  )
  assert.equal(
    caseItem.oracle.facts
      .commercial_objection_active,
    true,
  )
  assert.equal(
    caseItem.oracle
      .crm_suggestion
      .recommended_status,
    'negociacao',
  )
})

test('contexto insuficiente reduz confiança e não autoriza CRM', () => {
  const caseItem =
    corpus.cases.find(
      (item) =>
        item.id ===
        'commercial-conversation-insufficient-context',
    )

  assert.equal(
    caseItem.oracle
      .analysis_status,
    'limited',
  )
  assert.equal(
    caseItem.oracle.confidence,
    'low',
  )
  assert.equal(
    caseItem.oracle.sales_method
      .configured,
    false,
  )
  assert.equal(
    caseItem.oracle
      .crm_suggestion
      .recommended_status,
    null,
  )
  assert.equal(
    caseItem.oracle
      .crm_suggestion
      .should_change_crm_stage,
    false,
  )
})

test('corpus não contém formatos reconhecíveis de dados pessoais', () => {
  const forbiddenPatterns = [
    {
      label: 'e-mail',
      pattern:
        /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
    },
    {
      label: 'CPF',
      pattern:
        /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/,
    },
    {
      label: 'CNPJ',
      pattern:
        /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/,
    },
    {
      label: 'telefone',
      pattern:
        /(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-\s]?\d{4}/,
    },
  ]

  for (const caseItem of corpus.cases) {
    const text = collectText(
      caseItem,
    )

    for (
      const {
        label,
        pattern,
      } of forbiddenPatterns
    ) {
      assert.equal(
        pattern.test(text),
        false,
        `${label} encontrado em ${caseItem.id}`,
      )
    }
  }
})
