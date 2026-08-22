import assert from 'node:assert/strict'
import test from 'node:test'

import {
  normalizeCommercialReadingModelOutput,
} from './commercial-reading-contract.ts'

const configuredSalesMethod = {
  configured: true,
  contract_version:
    'commercial-method-v2',
  name:
    'Método Consultivo',
  description:
    'Descobrir, apresentar e confirmar sem roteiro mecânico.',
  principles: [
    'Usar evidência já fornecida espontaneamente.',
  ],
  definition: {
    contract_version:
      'commercial-method-v2',
    name:
      'Método Consultivo',
    description:
      'Descobrir, apresentar e confirmar.',
    principles: [
      'Não transformar descoberta em interrogatório.',
    ],
    stages: [
      {
        key:
          'discovery',
        display_order:
          1,
        name:
          'Descoberta',
        objective:
          'Compreender problema, impacto e prioridade.',
        requirement:
          'required',
      },
      {
        key:
          'presentation',
        display_order:
          2,
        name:
          'Apresentação',
        objective:
          'Conectar solução à necessidade comprovada.',
        requirement:
          'required',
      },
      {
        key:
          'decision',
        display_order:
          3,
        name:
          'Decisão',
        objective:
          'Confirmar decisão e consequência combinada.',
        requirement:
          'required',
      },
    ],
  },
  steps: [],
}

const unconfiguredSalesMethod = {
  configured: false,
  contract_version:
    null,
  name:
    null,
  description:
    null,
  principles: [],
  definition:
    null,
  steps: [],
}

function messages(...entries) {
  return entries.map(
    ([direction, text], index) => ({
      id:
        `m${index + 1}`,
      direction,
      text,
    }),
  )
}

function refs(
  messageIds = ['m2'],
) {
  return {
    evidence_message_ids:
      messageIds,
    memory_ids: [],
  }
}

function strength(
  kind,
  summary,
  whyItMatters,
  messageId = 'm2',
) {
  return {
    kind,
    summary,
    why_it_matters:
      whyItMatters,
    ...refs([messageId]),
  }
}

function improvement(
  kind,
  summary,
  howToImprove,
  messageId = 'm2',
) {
  return {
    kind,
    summary,
    why_it_matters:
      'A condução precisa preservar compreensão e confiança antes de avançar.',
    impact:
      'Pode aumentar resistência, reduzir confiança ou produzir uma decisão frágil.',
    how_to_improve:
      howToImprove,
    ...refs([messageId]),
  }
}

function methodAssessment({
  statuses = [
    'completed',
    'active',
    'not_started',
  ],
  adherence =
    'on_method',
  summary =
    'A conversa permanece dentro do método configurado.',
  missingInformation = [],
  deviationStageOrder = null,
  whatHappened = null,
  whyItMatters = null,
  recovery = null,
} = {}) {
  return {
    stages:
      statuses.map(
        (status, index) => ({
          step_order:
            index + 1,
          status,
          explanation:
            status === 'not_started'
              ? 'Ainda não existe evidência para iniciar esta etapa.'
              : 'O status está sustentado pela conversa multissegmento.',
          ...refs(
            [
              'not_started',
              'not_applicable',
            ].includes(status)
              ? []
              : [index === 0 ? 'm1' : 'm2'],
          ),
        }),
      ),
    adherence: {
      status:
        adherence,
      summary,
      deviation_stage_order:
        deviationStageOrder,
      what_happened:
        whatHappened,
      missing_information:
        missingInformation,
      why_it_matters:
        whyItMatters,
      ...refs(
        [
          'not_configured',
          'insufficient_evidence',
        ].includes(adherence)
          ? []
          : ['m2'],
      ),
    },
    recovery_guidance:
      recovery,
  }
}

function offMethodAssessment({
  statuses = [
    'partial',
    'active',
    'not_started',
  ],
  whatHappened,
  missingInformation,
  recommendedMove,
  optionalQuestion = null,
}) {
  return methodAssessment({
    statuses,
    adherence:
      'off_method',
    summary:
      'A conversa saiu do método configurado.',
    deviationStageOrder:
      1,
    whatHappened,
    missingInformation,
    whyItMatters:
      'A solução avançou antes de existir diagnóstico suficiente para sustentar valor e decisão.',
    recovery: {
      objective:
        'Retomar a descoberta antes de continuar o avanço.',
      missing_information:
        missingInformation,
      recommended_move:
        recommendedMove,
      optional_question:
        optionalQuestion,
      ...refs(['m2']),
    },
  })
}

function buildModelOutput({
  method =
    methodAssessment(),
  sellerStrengths = [],
  improvementPoints = [],
  customerObjections = [],
  serviceRisks = [],
  interventionNeeded = true,
} = {}) {
  return {
    conversation_summary: {
      initial_context:
        null,
      evolution:
        null,
      important_events: [],
      current_state: {
        summary:
          'O momento atual foi avaliado com base nos segmentos disponíveis.',
        ...refs(['m3']),
      },
      last_customer_request_or_decision:
        null,
    },
    customer: {
      needs: [],
      interests: [],
      decision_criteria: [],
      preferences: [],
      open_questions: [],
      objections: [],
      uncertainties: [],
    },
    commercial_evolution: [],
    method,
    seller_strengths:
      sellerStrengths,
    improvement_points:
      improvementPoints,
    risks: {
      customer_objections:
        customerObjections,
      service_risks:
        serviceRisks,
    },
    best_approach: {
      decision:
        interventionNeeded
          ? 'respond'
          : 'no_intervention',
      reason:
        interventionNeeded
          ? 'A conversa possui uma condução concreta e evidenciada.'
          : 'A venda já alcançou um desfecho legítimo e não exige retorno artificial.',
      channel:
        interventionNeeded
          ? 'text'
          : 'none',
      ...refs(['m3']),
    },
  }
}

function normalizeCase({
  conversation,
  output,
  salesMethod =
    configuredSalesMethod,
  commercialRelevance =
    'commercial',
  currentCrmStatus =
    'respondeu',
  interventionNeeded =
    true,
}) {
  const availableMessageIds =
    conversation.map(
      message =>
        message.id,
    )

  return normalizeCommercialReadingModelOutput({
    value:
      output,
    context: {
      available_message_ids:
        availableMessageIds,
      seller_message_ids:
        conversation
          .filter(
            message =>
              message.direction ===
              'outgoing',
          )
          .map(
            message =>
              message.id,
          ),
      available_memory_ids: [],
      current_crm_status:
        currentCrmStatus,
      reference_time:
        '2026-08-21T20:00:00-03:00',
    },
    derived: {
      analysis_status:
        'complete',
      analysis_limitations: [],
      commercial_role:
        'buyer',
      commercial_relevance:
        commercialRelevance,
      communication: {
        intervention_needed:
          interventionNeeded,
        recommended_question:
          null,
        recommended_message:
          interventionNeeded
            ? 'Posso avançar com o próximo ponto relevante?'
            : null,
      },
      operations: {
        crm: {
          should_change_crm_stage:
            false,
          recommended_status:
            null,
          rationale:
            null,
          requires_human_confirmation:
            true,
        },
        agenda: {
          should_change_agenda:
            false,
          expected_next_action_at:
            null,
          rationale:
            null,
          requires_human_confirmation:
            true,
        },
      },
      sales_method:
        salesMethod,
    },
  })
}

const corpus = [
  {
    name:
      '1. vendedor conduz perfeitamente o método',
    conversation: messages(
      ['incoming', 'Precisamos reduzir perdas de follow-up e isso é prioridade neste trimestre.'],
      ['outgoing', 'Entendi o impacto. Vou conectar a solução diretamente a esse processo.'],
      ['incoming', 'Pode mostrar como funciona.'],
    ),
    output: buildModelOutput({
      sellerStrengths: [
        strength(
          'method_alignment',
          'O vendedor confirmou o impacto antes de apresentar a solução.',
          'A apresentação parte de uma necessidade e de uma prioridade comprovadas.',
        ),
      ],
    }),
    verify(reading) {
      assert.equal(
        reading.method.adherence.status,
        'on_method',
      )
      assert.equal(
        reading.method.current_stage.name,
        'Apresentação',
      )
    },
  },
  {
    name:
      '2. descoberta insuficiente',
    conversation: messages(
      ['incoming', 'Quero conhecer o produto.'],
      ['outgoing', 'Já vou te mostrar o plano completo.'],
      ['incoming', 'Mas ainda nem expliquei o que preciso.'],
    ),
    output: buildModelOutput({
      method: methodAssessment({
        statuses: [
          'partial',
          'not_started',
          'not_started',
        ],
        adherence:
          'partially_on_method',
        summary:
          'A descoberta começou, mas ainda não sustenta apresentação.',
        missingInformation: [
          'problema',
          'impacto',
          'prioridade',
        ],
      }),
      improvementPoints: [
        improvement(
          'insufficient_discovery',
          'O vendedor avançou sem compreender a necessidade.',
          'Retomar problema, impacto e prioridade antes de apresentar.',
        ),
      ],
    }),
    verify(reading) {
      assert.equal(
        reading.improvement_points[0].kind,
        'insufficient_discovery',
      )
      assert.equal(
        reading.method.adherence.status,
        'partially_on_method',
      )
    },
  },
  {
    name:
      '3. preço apresentado cedo',
    conversation: messages(
      ['incoming', 'Quanto custa?'],
      ['outgoing', 'R$ 500.'],
      ['incoming', 'Ainda não sei se serve para mim.'],
    ),
    output: buildModelOutput({
      method: offMethodAssessment({
        whatHappened:
          'O preço foi apresentado antes de existir contexto suficiente de valor.',
        missingInformation: [
          'problema',
          'impacto',
        ],
        recommendedMove:
          'Retomar a descoberta e só então contextualizar investimento.',
        optionalQuestion:
          'Antes de falar do plano, qual resultado você precisa alcançar?',
      }),
      improvementPoints: [
        improvement(
          'premature_price',
          'O vendedor informou preço sem diagnóstico ou valor estabelecido.',
          'Retomar a descoberta antes de contextualizar o investimento.',
        ),
      ],
    }),
    verify(reading) {
      assert.equal(
        reading.improvement_points[0].kind,
        'premature_price',
      )
      assert.equal(
        reading.method.adherence.status,
        'off_method',
      )
      assert.ok(
        reading.method.recovery_guidance,
      )
    },
  },
  {
    name:
      '4. apresentação antes da descoberta',
    conversation: messages(
      ['incoming', 'Queria entender a solução.'],
      ['outgoing', 'Ela tem estes dez recursos e três módulos.'],
      ['incoming', 'Qual deles resolve meu problema?'],
    ),
    output: buildModelOutput({
      method: offMethodAssessment({
        whatHappened:
          'A solução foi apresentada antes de a necessidade ser compreendida.',
        missingInformation: [
          'necessidade',
          'critério de decisão',
        ],
        recommendedMove:
          'Interromper a apresentação genérica e retomar a descoberta.',
      }),
      improvementPoints: [
        improvement(
          'premature_presentation',
          'O vendedor listou recursos antes de entender a necessidade.',
          'Investigar necessidade e critério antes de conectar recursos.',
        ),
      ],
    }),
    verify(reading) {
      assert.equal(
        reading.improvement_points[0].kind,
        'premature_presentation',
      )
    },
  },
  {
    name:
      '5. pergunta do cliente ignorada',
    conversation: messages(
      ['incoming', 'A implantação inclui treinamento?'],
      ['outgoing', 'Podemos assinar ainda hoje.'],
      ['incoming', 'Você pode responder minha pergunta?'],
    ),
    output: buildModelOutput({
      improvementPoints: [
        improvement(
          'unanswered_question',
          'O vendedor pediu avanço sem responder à pergunta sobre treinamento.',
          'Responder objetivamente à pergunta antes de propor decisão.',
        ),
      ],
    }),
    verify(reading) {
      assert.equal(
        reading.improvement_points[0].kind,
        'unanswered_question',
      )
    },
  },
  {
    name:
      '6. vendedor pressiona cliente',
    conversation: messages(
      ['incoming', 'Preciso avaliar com calma.'],
      ['outgoing', 'Você precisa fechar agora para não perder.'],
      ['incoming', 'Prefiro parar por aqui.'],
    ),
    output: buildModelOutput({
      improvementPoints: [
        improvement(
          'pressure',
          'O vendedor criou urgência depois de o cliente pedir espaço.',
          'Respeitar o espaço e combinar uma retomada somente se o cliente aceitar.',
        ),
      ],
      serviceRisks: [
        {
          kind:
            'pressure',
          severity:
            'high',
          summary:
            'A pressão pode encerrar a conversa prematuramente.',
          ...refs(['m2']),
        },
      ],
    }),
    verify(reading) {
      assert.equal(
        reading.risks.service_risks[0].kind,
        'pressure',
      )
      assert.equal(
        reading.risks.customer_objections.length,
        0,
      )
    },
  },
  {
    name:
      '7. vendedor repete pergunta já respondida',
    conversation: messages(
      ['incoming', 'Minha prioridade é integrar o atendimento.'],
      ['outgoing', 'Qual é mesmo a sua prioridade?'],
      ['incoming', 'Eu acabei de explicar.'],
    ),
    output: buildModelOutput({
      improvementPoints: [
        improvement(
          'repetition',
          'O vendedor repetiu uma pergunta cuja resposta já estava disponível.',
          'Usar a resposta existente e aprofundar apenas o que altera a recomendação.',
        ),
      ],
    }),
    verify(reading) {
      assert.equal(
        reading.improvement_points[0].kind,
        'repetition',
      )
    },
  },
  {
    name:
      '8. promessa não sustentada',
    conversation: messages(
      ['incoming', 'Você garante integração em dois dias?'],
      ['outgoing', 'Garanto que estará tudo pronto.'],
      ['incoming', 'Isso está no contrato?'],
    ),
    output: buildModelOutput({
      improvementPoints: [
        improvement(
          'promise_risk',
          'O vendedor garantiu prazo sem sustentação confirmada.',
          'Corrigir a promessa e confirmar o prazo com a área responsável.',
        ),
      ],
      serviceRisks: [
        {
          kind:
            'unsupported_promise',
          severity:
            'high',
          summary:
            'A garantia pode criar expectativa contratual indevida.',
          ...refs(['m2']),
        },
      ],
    }),
    verify(reading) {
      assert.equal(
        reading.improvement_points[0].kind,
        'promise_risk',
      )
    },
  },
  {
    name:
      '9. informação incorreta',
    conversation: messages(
      ['incoming', 'O plano inclui suporte 24 horas?'],
      ['outgoing', 'Inclui, sim.'],
      ['incoming', 'No material diz horário comercial.'],
    ),
    output: buildModelOutput({
      improvementPoints: [
        improvement(
          'incorrect_information',
          'O vendedor afirmou uma condição contrariada pelo material disponível.',
          'Corrigir a informação e usar apenas condições confirmadas.',
        ),
      ],
    }),
    verify(reading) {
      assert.equal(
        reading.improvement_points[0].kind,
        'incorrect_information',
      )
    },
  },
  {
    name:
      '10. objeção bem tratada',
    conversation: messages(
      ['incoming', 'O investimento está acima do que esperava.'],
      ['outgoing', 'Entendi. Posso comparar o custo com a perda mensal que você relatou?'],
      ['incoming', 'Sim, assim faz sentido.'],
    ),
    output: buildModelOutput({
      sellerStrengths: [
        strength(
          'handled_objection',
          'O vendedor acolheu a objeção e conectou valor ao impacto informado.',
          'A objeção foi tratada sem pressão e com base em evidência do cliente.',
        ),
      ],
    }),
    verify(reading) {
      assert.equal(
        reading.seller_strengths[0].kind,
        'handled_objection',
      )
      assert.equal(
        reading.improvement_points.length,
        0,
      )
    },
  },
  {
    name:
      '11. objeção mal tratada',
    conversation: messages(
      ['incoming', 'O investimento está alto para nós.'],
      ['outgoing', 'Preço não deveria ser um problema se você quer resultado.'],
      ['incoming', 'Essa resposta não ajuda.'],
    ),
    output: buildModelOutput({
      improvementPoints: [
        improvement(
          'poor_objection_handling',
          'O vendedor invalidou a objeção em vez de compreender sua origem.',
          'Acolher a objeção, esclarecer o limite e responder com contexto.',
        ),
      ],
      customerObjections: [
        {
          kind:
            'price',
          severity:
            'medium',
          summary:
            'O investimento permanece como objeção do cliente.',
          ...refs(['m1']),
        },
      ],
    }),
    verify(reading) {
      assert.equal(
        reading.improvement_points[0].kind,
        'poor_objection_handling',
      )
      assert.equal(
        reading.risks.customer_objections[0].kind,
        'price',
      )
    },
  },
  {
    name:
      '12. informação espontânea permite pular perguntas formais',
    conversation: messages(
      ['incoming', 'Nosso problema custa vinte horas por semana, é prioridade e temos orçamento aprovado.'],
      ['outgoing', 'Com esse contexto, vou mostrar apenas como a solução reduz esse retrabalho.'],
      ['incoming', 'Perfeito.'],
    ),
    output: buildModelOutput({
      sellerStrengths: [
        strength(
          'method_alignment',
          'O vendedor usou a descoberta espontânea sem repetir perguntas já respondidas.',
          'O método orientou a compreensão sem virar um interrogatório mecânico.',
        ),
      ],
    }),
    verify(reading) {
      assert.equal(
        reading.method.stages[0].status,
        'completed',
      )
      assert.equal(
        reading.improvement_points.some(
          item =>
            item.kind === 'premature_presentation',
        ),
        false,
      )
    },
  },
  {
    name:
      '13. método sem configuração',
    conversation: messages(
      ['incoming', 'Gostaria de conhecer a proposta.'],
      ['outgoing', 'Vou entender seu contexto antes de responder.'],
      ['incoming', 'Tudo bem.'],
    ),
    salesMethod:
      unconfiguredSalesMethod,
    output: buildModelOutput({
      method:
        null,
    }),
    verify(reading) {
      assert.equal(
        reading.method.configured,
        false,
      )
      assert.equal(
        reading.method.adherence.status,
        'not_configured',
      )
      assert.equal(
        reading.method.adherence.summary,
        'Método comercial não configurado.',
      )
    },
  },
  {
    name:
      '14. conversa non-commercial permanece sem coaching e método',
    conversation: messages(
      ['incoming', 'Você vai ao encontro da equipe amanhã?'],
      ['outgoing', 'Vou depois do almoço.'],
      ['incoming', 'Combinado.'],
    ),
    commercialRelevance:
      'non_commercial',
    interventionNeeded:
      false,
    output: buildModelOutput({
      method:
        null,
      sellerStrengths: [
        strength(
          'other',
          'Avaliação indevida de uma fala pessoal.',
          'Este item deve ser neutralizado.',
        ),
      ],
      improvementPoints: [
        improvement(
          'other',
          'Crítica indevida de uma fala pessoal.',
          'Este item deve ser neutralizado.',
        ),
      ],
      interventionNeeded:
        false,
    }),
    verify(reading) {
      assert.equal(
        reading.seller_strengths.length,
        0,
      )
      assert.equal(
        reading.improvement_points.length,
        0,
      )
      assert.equal(
        reading.method.current_stage,
        null,
      )
      assert.equal(
        reading.method.recovery_guidance,
        null,
      )
    },
  },
  {
    name:
      '15. conversa parcialmente aderente',
    conversation: messages(
      ['incoming', 'Temos um problema recorrente, mas ainda não medimos impacto.'],
      ['outgoing', 'Vamos entender melhor antes de falar da solução.'],
      ['incoming', 'Posso levantar esses dados.'],
    ),
    output: buildModelOutput({
      method: methodAssessment({
        statuses: [
          'partial',
          'not_started',
          'not_started',
        ],
        adherence:
          'partially_on_method',
        summary:
          'A descoberta está correta, mas ainda incompleta.',
        missingInformation: [
          'impacto',
        ],
      }),
    }),
    verify(reading) {
      assert.equal(
        reading.method.adherence.status,
        'partially_on_method',
      )
      assert.equal(
        reading.method.current_stage.name,
        'Descoberta',
      )
    },
  },
  {
    name:
      '16. conversa sai do método e depois retorna',
    conversation: messages(
      ['incoming', 'Ainda não explicamos o impacto.'],
      ['outgoing', 'Eu apresentei cedo; vamos voltar ao impacto antes de continuar.'],
      ['incoming', 'O impacto é perder dez oportunidades por mês.'],
      ['outgoing', 'Agora consigo conectar a solução ao ponto correto.'],
    ),
    output: buildModelOutput({
      method: methodAssessment({
        statuses: [
          'completed',
          'active',
          'not_started',
        ],
        adherence:
          'on_method',
        summary:
          'A condução retornou ao método após corrigir a descoberta.',
      }),
      improvementPoints: [
        improvement(
          'method_misapplication',
          'O vendedor reconheceu que apresentou antes de concluir a descoberta.',
          'Manter a correção já iniciada e usar o impacto agora confirmado.',
          'm2',
        ),
      ],
    }),
    verify(reading) {
      assert.equal(
        reading.method.adherence.status,
        'on_method',
      )
      assert.equal(
        reading.method.recovery_guidance,
        null,
      )
      assert.equal(
        reading.improvement_points[0].kind,
        'method_misapplication',
      )
    },
  },
  {
    name:
      '17. CRM em negociação mas método ainda incompleto',
    conversation: messages(
      ['incoming', 'Estamos negociando, mas ainda não sei como isso resolve meu processo.'],
      ['outgoing', 'Vamos retomar seu problema antes de discutir condição.'],
      ['incoming', 'Certo.'],
    ),
    currentCrmStatus:
      'negociacao',
    output: buildModelOutput({
      method: methodAssessment({
        statuses: [
          'partial',
          'not_started',
          'not_started',
        ],
        adherence:
          'partially_on_method',
        summary:
          'O CRM está em negociação, mas a descoberta do método ainda está incompleta.',
        missingInformation: [
          'impacto do problema',
        ],
      }),
    }),
    verify(reading) {
      assert.equal(
        reading.method.current_stage.name,
        'Descoberta',
      )
      assert.equal(
        reading.operations.crm.should_change_crm_stage,
        false,
      )
    },
  },
  {
    name:
      '18. ganho legítimo não exige retorno artificial ao método',
    conversation: messages(
      ['incoming', 'O problema, impacto e condição já estão claros. Quero contratar.'],
      ['outgoing', 'Perfeito, contratação confirmada conforme combinado.'],
      ['incoming', 'Confirmado.'],
    ),
    currentCrmStatus:
      'ganho',
    interventionNeeded:
      false,
    output: buildModelOutput({
      method: methodAssessment({
        statuses: [
          'completed',
          'completed',
          'completed',
        ],
        adherence:
          'on_method',
        summary:
          'O método foi concluído com decisão comprovada.',
      }),
      sellerStrengths: [
        strength(
          'confirmed_information',
          'O vendedor confirmou o desfecho sem reabrir perguntas já resolvidas.',
          'A confirmação preserva clareza sem criar atrito depois do ganho.',
        ),
      ],
      interventionNeeded:
        false,
    }),
    verify(reading) {
      assert.equal(
        reading.method.current_stage.name,
        'Decisão',
      )
      assert.equal(
        reading.method.recovery_guidance,
        null,
      )
      assert.equal(
        reading.communication.intervention_needed,
        false,
      )
    },
  },
]

for (const caseItem of corpus) {
  test(
    caseItem.name,
    () => {
      const reading =
        normalizeCase({
          conversation:
            caseItem.conversation,
          output:
            caseItem.output,
          salesMethod:
            caseItem.salesMethod ??
            configuredSalesMethod,
          commercialRelevance:
            caseItem.commercialRelevance ??
            'commercial',
          currentCrmStatus:
            caseItem.currentCrmStatus ??
            'respondeu',
          interventionNeeded:
            caseItem.interventionNeeded ??
            true,
        })

      const outgoingIds =
        new Set(
          caseItem.conversation
            .filter(
              message =>
                message.direction ===
                'outgoing',
            )
            .map(
              message =>
                message.id,
            ),
        )

      for (
        const feedback of [
          ...reading.seller_strengths,
          ...reading.improvement_points,
        ]
      ) {
        assert.ok(
          feedback
            .evidence_message_ids
            .some(
              id =>
                outgoingIds.has(id),
            ),
          'Feedback do vendedor precisa apontar para mensagem enviada pelo vendedor no corpus.',
        )
      }

      caseItem.verify(reading)
    },
  )
}

test(
  'guardrail rejeita tentativa do modelo de renomear o método canônico',
  () => {
    const conversation =
      corpus[0].conversation

    const output =
      buildModelOutput()

    output.method.configured =
      true

    output.method.name =
      'Método inventado'

    assert.throws(
      () =>
        normalizeCase({
          conversation,
          output,
        }),
      error => {
        assert.equal(
          error.code,
          'ADDITIONAL_FIELD_NOT_ALLOWED',
        )
        assert.equal(
          error.path,
          'reading.method',
        )
        return true
      },
    )
  },
)

test(
  'guardrail exige recovery completo quando a conversa sai do método',
  () => {
    const output =
      buildModelOutput({
        method:
          offMethodAssessment({
            whatHappened:
              'O vendedor avançou antes de concluir a descoberta.',
            missingInformation: [
              'impacto',
            ],
            recommendedMove:
              'Retomar o impacto antes de continuar.',
          }),
      })

    output.method.recovery_guidance =
      null

    assert.throws(
      () =>
        normalizeCase({
          conversation:
            corpus[2].conversation,
          output,
        }),
      error => {
        assert.equal(
          error.code,
          'METHOD_RECOVERY_REQUIRED',
        )
        return true
      },
    )
  },
)

test(
  'guardrail impede etapa obrigatória marcada como pulada',
  () => {
    const output =
      buildModelOutput({
        method:
          methodAssessment({
            statuses: [
              'skipped',
              'active',
              'not_started',
            ],
          }),
      })

    assert.throws(
      () =>
        normalizeCase({
          conversation:
            corpus[0].conversation,
          output,
        }),
      error => {
        assert.equal(
          error.code,
          'REQUIRED_METHOD_STAGE_SKIPPED',
        )
        return true
      },
    )
  },
)

test(
  'guardrail rejeita avaliação nova de método em sessão non-commercial',
  () => {
    assert.throws(
      () =>
        normalizeCase({
          conversation:
            corpus[13].conversation,
          output:
            buildModelOutput(),
          commercialRelevance:
            'non_commercial',
          interventionNeeded:
            false,
        }),
      error => {
        assert.equal(
          error.code,
          'METHOD_ASSESSMENT_NOT_ALLOWED',
        )
        return true
      },
    )
  },
)

test(
  'corpus obrigatório cobre exatamente as dezoito famílias solicitadas',
  () => {
    assert.equal(
      corpus.length,
      18,
    )
  },
)
