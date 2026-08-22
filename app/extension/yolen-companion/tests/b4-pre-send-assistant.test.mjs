import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const contentScript =
  readFileSync(
    new URL(
      '../src/content-script.js',
      import.meta.url,
    ),
    'utf8',
  )

const styles =
  readFileSync(
    new URL(
      '../src/styles.css',
      import.meta.url,
    ),
    'utf8',
  )

function loadEvaluator() {
  const startMarker =
    '// B4_PRE_SEND_EVALUATOR_START'

  const endMarker =
    '// B4_PRE_SEND_EVALUATOR_END'

  const start =
    contentScript.indexOf(
      startMarker,
    )

  const end =
    contentScript.indexOf(
      endMarker,
      start,
    )

  assert.notEqual(
    start,
    -1,
  )

  assert.notEqual(
    end,
    -1,
  )

  const block =
    contentScript.slice(
      start +
        startMarker.length,
      end,
    )

  return new Function(
    '"use strict";\n' +
    block +
    '\nreturn evaluatePreSendAssessment;',
  )()
}

const evaluate =
  loadEvaluator()

function makeReading({
  decision = 'respond',
  reason = 'Responder com clareza.',
  analysisStatus = 'complete',
  commercialRole = 'buyer',
  commercialRelevance = 'commercial',
  openQuestions = [],
  objections = [],
  customerObjections = [],
  methodConfigured = false,
  methodStages = [],
  recommendedMessage = null,
  agendaShouldChange = false,
  agendaDate = null,
} = {}) {
  return {
    analysis_status:
      analysisStatus,

    commercial_role:
      commercialRole,

    commercial_relevance:
      commercialRelevance,

    conversation_summary: {
      initial_context: null,
      evolution: null,
      important_events: [],
      current_state: {
        summary:
          'Conversa comercial ativa.',
        evidence_message_ids: [],
        memory_ids: [],
      },
      last_customer_request_or_decision:
        null,
    },

    customer: {
      needs: [],
      interests: [],
      decision_criteria: [],
      preferences: [],
      open_questions:
        openQuestions,
      objections,
      uncertainties: [],
    },

    commercial_evolution: [],

    method: {
      configured:
        methodConfigured,
      name:
        methodConfigured
          ? 'Método teste'
          : null,
      stages:
        methodConfigured
          ? methodStages
          : [],
    },

    seller_strengths: [],
    improvement_points: [],

    risks: {
      customer_objections:
        customerObjections,
      service_risks: [],
    },

    best_approach: {
      decision,
      reason,
      channel: 'text',
      evidence_message_ids: [],
      memory_ids: [],
    },

    communication: {
      intervention_needed:
        Boolean(
          recommendedMessage,
        ),
      recommended_question:
        null,
      recommended_message:
        recommendedMessage,
    },

    operations: {
      crm: {
        should_change_crm_stage:
          false,
        recommended_status:
          null,
        rationale: null,
        requires_human_confirmation:
          true,
      },

      agenda: {
        should_change_agenda:
          agendaShouldChange,
        expected_next_action_at:
          agendaDate,
        rationale:
          agendaShouldChange
            ? 'Próxima ação definida.'
            : null,
        requires_human_confirmation:
          true,
      },
    },
  }
}

function assess({
  draft,
  reading = makeReading(),
  engineSource = 'stateful',
  analysisLoading = false,
  analysisOutdated = false,
  suggestedMessage = null,
  todayDateKey = '2026-08-21',
} = {}) {
  return evaluate({
    draft,
    engineSource,
    commercialReading:
      reading,
    analysisLoading,
    analysisOutdated,
    suggestedMessage,
    todayDateKey,
  })
}

test(
  'WAIT + pressão explícita gera alerta',
  () => {
    const result =
      assess({
        draft:
          'Então vamos fechar hoje? Preciso da sua resposta hoje.',
        reading:
          makeReading({
            decision: 'wait',
            reason:
              'O cliente pediu tempo para conversar com o sócio.',
          }),
      })

    assert.equal(
      result?.kind,
      'wait_pressure',
    )

    assert.match(
      result.reason,
      /aguardar/i,
    )
  },
)

test(
  'WAIT + resposta neutra permanece em silêncio',
  () => {
    const result =
      assess({
        draft:
          'Tudo bem, sem problema. Fico à disposição.',
        reading:
          makeReading({
            decision:
              'give_space',
            reason:
              'O cliente pediu espaço.',
          }),
      })

    assert.equal(
      result,
      null,
    )
  },
)

test(
  'objeção ativa + fechamento prematuro gera alerta',
  () => {
    const result =
      assess({
        draft:
          'Vamos fechar hoje então?',
        reading:
          makeReading({
            decision:
              'handle_objection',
            objections: [
              {
                summary:
                  'Cliente considera o valor alto.',
                evidence_message_ids:
                  [],
                memory_ids: [],
              },
            ],
          }),
      })

    assert.equal(
      result?.kind,
      'pending_issue',
    )

    assert.match(
      result.reason,
      /valor alto/i,
    )
  },
)

test(
  'objeção ativa + resposta à objeção permanece em silêncio',
  () => {
    const result =
      assess({
        draft:
          'Entendo sua preocupação com o valor. Posso explicar o que está incluído no plano.',
        reading:
          makeReading({
            decision:
              'handle_objection',
            objections: [
              {
                summary:
                  'Cliente considera o valor alto.',
                evidence_message_ids:
                  [],
                memory_ids: [],
              },
            ],
          }),
      })

    assert.equal(
      result,
      null,
    )
  },
)

test(
  'método incompleto + fechamento prematuro gera alerta somente com suporte da leitura',
  () => {
    const result =
      assess({
        draft:
          'Podemos fechar agora?',
        reading:
          makeReading({
            decision:
              'deepen_discovery',
            methodConfigured:
              true,
            methodStages: [
              {
                step_order: 1,
                stage_key:
                  'discovery',
                name:
                  'Diagnóstico',
                status:
                  'partial',
                explanation:
                  'Ainda faltam critérios.',
                evidence_message_ids:
                  [],
                memory_ids: [],
              },
            ],
          }),
      })

    assert.equal(
      result?.kind,
      'method_premature_close',
    )

    assert.match(
      result.reason,
      /Diagnóstico/i,
    )
  },
)

test(
  'ausência de método não inventa conflito de método',
  () => {
    const result =
      assess({
        draft:
          'Podemos fechar agora?',
        reading:
          makeReading({
            decision:
              'deepen_discovery',
            methodConfigured:
              false,
          }),
      })

    assert.equal(
      result,
      null,
    )
  },
)

test(
  'promessa ou condição sensível sem comprovação gera alerta prudente',
  () => {
    const result =
      assess({
        draft:
          'Eu garanto que essa condição vai ser aprovada.',
      })

    assert.equal(
      result?.kind,
      'sensitive_condition',
    )

    assert.equal(
      result?.reason,
      'A leitura atual não contém comprovação suficiente para validar essa condição. Confirme a informação antes de enviar.',
    )
  },
)

test(
  'ausência de fato oficial não inventa contradição',
  () => {
    const result =
      assess({
        draft:
          'O plano inclui estacionamento gratuito.',
      })

    assert.equal(
      result,
      null,
    )
  },
)

test(
  'próxima ação incompatível só alerta com conflito de data determinístico',
  () => {
    const result =
      assess({
        draft:
          'Te retorno amanhã.',
        reading:
          makeReading({
            agendaShouldChange:
              true,
            agendaDate:
              '2026-08-24T15:00:00-03:00',
          }),
        todayDateKey:
          '2026-08-21',
      })

    assert.equal(
      result?.kind,
      'agenda_conflict',
    )

    assert.match(
      result.reason,
      /24\/08\/2026/,
    )
  },
)

test(
  'próxima ação compatível permanece em silêncio',
  () => {
    const result =
      assess({
        draft:
          'Te retorno amanhã.',
        reading:
          makeReading({
            agendaShouldChange:
              true,
            agendaDate:
              '2026-08-22T15:00:00-03:00',
          }),
        todayDateKey:
          '2026-08-21',
      })

    assert.equal(
      result,
      null,
    )
  },
)

test(
  'saudação, agradecimento, emoji e draft vazio permanecem em silêncio',
  () => {
    for (
      const draft of [
        'Oi',
        'Boa tarde',
        'Obrigado',
        'Valeu',
        '👍',
        '🙂',
        '',
        '   ',
      ]
    ) {
      assert.equal(
        assess({
          draft,
        }),
        null,
        'deveria ficar em silêncio para: ' +
          JSON.stringify(
            draft,
          ),
      )
    }
  },
)

test(
  'V1/fallback, análise loading, outdated e limited são fail-open',
  () => {
    assert.equal(
      assess({
        draft:
          'Vamos fechar hoje?',
        engineSource: 'v1',
        reading:
          makeReading({
            decision: 'wait',
          }),
      }),
      null,
    )

    assert.equal(
      assess({
        draft:
          'Vamos fechar hoje?',
        analysisLoading:
          true,
        reading:
          makeReading({
            decision: 'wait',
          }),
      }),
      null,
    )

    assert.equal(
      assess({
        draft:
          'Vamos fechar hoje?',
        analysisOutdated:
          true,
        reading:
          makeReading({
            decision: 'wait',
          }),
      }),
      null,
    )

    assert.equal(
      assess({
        draft:
          'Vamos fechar hoje?',
        reading:
          makeReading({
            decision: 'wait',
            analysisStatus:
              'limited',
          }),
      }),
      null,
    )
  },
)

test(
  'papel comercial desconhecido ou contexto insuficiente permanece em silêncio',
  () => {
    assert.equal(
      assess({
        draft:
          'Vamos fechar hoje?',
        reading:
          makeReading({
            decision: 'wait',
            commercialRole:
              'unknown',
          }),
      }),
      null,
    )

    const broken =
      makeReading({
        decision: 'wait',
      })

    delete broken.customer

    assert.equal(
      assess({
        draft:
          'Vamos fechar hoje?',
        reading: broken,
      }),
      null,
    )
  },
)

test(
  'sessão non-commercial não reaproveita memória histórica para alertar no pré-envio',
  () => {
    const result = assess({
      draft:
        'Vamos fechar hoje? Preciso da sua resposta agora.',
      reading: makeReading({
        decision: 'wait',
        reason: 'O cliente pediu espaço.',
        commercialRelevance: 'non_commercial',
        objections: [
          {
            summary: 'Objeção comercial histórica.',
            evidence_message_ids: [],
            memory_ids: ['memory-1'],
          },
        ],
      }),
    })

    assert.equal(result, null)
  },
)

test(
  'mensagem equivalente à sugestão Yolen permanece em silêncio',
  () => {
    const suggestion =
      'Podemos aguardar e retomar amanhã com calma.'

    const result =
      assess({
        draft:
          'Podemos aguardar e retomar amanhã com calma!',
        reading:
          makeReading({
            decision: 'wait',
            recommendedMessage:
              suggestion,
          }),
        suggestedMessage:
          suggestion,
      })

    assert.equal(
      result,
      null,
    )
  },
)

test(
  'runtime B4.2 é observacional, isolado por conversa e tolera composer substituído',
  () => {
    const observerStart =
      contentScript.indexOf(
        'function observeComposerDraftForPreSend()',
      )

    const observerEnd =
      contentScript.indexOf(
        'function normalizeOperationalText',
        observerStart,
      )

    assert.ok(
      observerStart >= 0,
    )

    assert.ok(
      observerEnd >
        observerStart,
    )

    const block =
      contentScript.slice(
        observerStart,
        observerEnd,
      )

    assert.match(
      block,
      /document\.addEventListener\(\s*'input'/,
    )

    assert.match(
      block,
      /isComposerEnterTarget\(\s*event\.target/,
    )

    for (
      const forbidden of [
        'preventDefault(',
        'stopPropagation(',
        'stopImmediatePropagation(',
        'fetch(',
        'analyzeConversation(',
        'registerActionEvent(',
      ]
    ) {
      assert.equal(
        block.includes(
          forbidden,
        ),
        false,
        'B4.2 observacional não pode conter ' +
          forbidden,
      )
    }

    assert.match(
      contentScript,
      /preSendAssessmentConversationKey[\s\S]*state\.conversationKey/,
    )

    assert.match(
      contentScript,
      /preSendAssessmentFingerprint[\s\S]*analyzedConversationFingerprint/,
    )

    assert.match(
      contentScript,
      /getPreSendAssessmentCardHtml\(\)[\s\S]*getComposerText\(\)/,
    )

    assert.match(
      contentScript,
      /getPreSendAssessmentCardHtml\(\),[\s\S]*getSellerInformationArchitectureHtml\(\),/,
    )

    assert.match(
      contentScript,
      /observeWhatsAppChanges\(\)[\s\S]*observeComposerDraftForPreSend\(\)[\s\S]*observeManualWhatsAppSend\(\)/,
    )

    assert.match(
      styles,
      /\.yolen-pre-send-card/,
    )
  },
)
