import {
  createStatefulCopilotOpenAIProvider,
} from '../app/lib/companion/stateful-copilot-openai-provider.ts'

import {
  runCommercialReasoningCoreV2,
} from '../app/lib/companion/commercial-reasoning-core-v2.ts'

import {
  buildStatefulCopilotInput,
} from '../app/lib/companion/stateful-copilot-input.ts'

import {
  COMPANION_DIAGNOSTIC_INPUT_VERSION,
} from '../app/lib/companion/diagnostic-input.ts'

import {
  COMPANION_DIAGNOSTIC_CONTRACT_VERSION,
} from '../app/lib/companion/diagnostic-contract.ts'

const DEFAULT_MODEL =
  'gpt-5.6'

const REASONING_EFFORT =
  'none'

function requireEnvironment() {
  if (
    typeof process.env.OPENAI_API_KEY !==
      'string' ||
    !process.env.OPENAI_API_KEY.trim()
  ) {
    throw new Error(
      'OPENAI_API_KEY ausente. Rode com --env-file=.env.local.',
    )
  }
}

function parseArgs(
  argv,
) {
  const index =
    argv.indexOf(
      '--scenario',
    )

  return {
    scenario:
      index >= 0
        ? argv[index + 1] ?? null
        : null,
  }
}

function messageTime(
  index,
) {
  const minute =
    10 + index * 5

  return (
    `2026-09-13T17:${String(
      minute,
    ).padStart(
      2,
      '0',
    )}:00-03:00`
  )
}

function observedTime(
  index,
) {
  const minute =
    10 + index * 5

  return (
    `2026-09-13T17:${String(
      minute,
    ).padStart(
      2,
      '0',
    )}:01-03:00`
  )
}

function buildCommercialContext() {
  return {
    configured:
      true,

    config_version_id:
      'eval-config-v1',

    config_version_number:
      1,

    config_contract_version:
      'eval-commercial-config-v1',

    business_description:
      'Empresa de serviços recorrentes que vende planos mensais.',

    target_audience:
      'Adultos interessados em contratar o serviço.',

    value_proposition:
      'Atendimento consultivo com recomendação adequada à necessidade do cliente.',

    communication_tone:
      'Direto, consultivo, humano e sem pressão artificial.',

    required_behaviors: [
      'Responder perguntas objetivas antes de ampliar a descoberta.',
      'Não repetir perguntas que o cliente já respondeu.',
      'Confirmar fatos operacionais antes de prometer.',
    ],

    prohibited_behaviors: [
      'Inventar descontos.',
      'Inventar disponibilidade.',
      'Pressionar o cliente depois de um pedido explícito de espaço.',
    ],

    sales_method: {
      configured:
        true,

      contract_version:
        'commercial-method-v2',

      name:
        'Método AVANÇAR',

      description:
        'Descobrir somente o necessário e avançar conforme a evidência do cliente.',

      principles: [
        'Não voltar etapas já resolvidas.',
        'Transformar intenção concreta em próximo passo objetivo.',
        'Respeitar o momento do cliente.',
      ],

      definition:
        null,

      steps: [
        {
          step_order:
            1,

          name:
            'Descoberta proporcional',

          objective:
            'Entender somente o necessário para recomendar.',

          completion_criteria: [
            'Necessidade principal compreendida.',
          ],

          recommended_questions: [
            'O que você procura resolver?',
          ],

          is_required:
            true,
        },
        {
          step_order:
            2,

          name:
            'Apresentação',

          objective:
            'Relacionar a solução à necessidade.',

          completion_criteria: [
            'Solução adequada apresentada.',
          ],

          recommended_questions:
            [],

          is_required:
            true,
        },
        {
          step_order:
            3,

          name:
            'Decisão',

          objective:
            'Tratar dúvidas e permitir decisão.',

          completion_criteria: [
            'Cliente declarou próximo passo.',
          ],

          recommended_questions:
            [],

          is_required:
            true,
        },
        {
          step_order:
            4,

          name:
            'Conclusão',

          objective:
            'Executar o próximo passo decidido.',

          completion_criteria: [
            'Contratação ou ação operacional encaminhada.',
          ],

          recommended_questions:
            [],

          is_required:
            true,
        },
      ],
    },

    products: [
      {
        product_id:
          'plan-essential',

        contract_version:
          'commercial-product-v1',

        definition:
          null,

        name:
          'Plano Essencial',

        category:
          'Plano mensal',

        base_price:
          199.9,

        active:
          true,

        indicated_audiences: [
          'Clientes que desejam o serviço padrão.',
        ],

        needs_addressed: [
          'Acesso recorrente ao serviço.',
        ],

        benefits: [
          'Acesso mensal.',
        ],

        verified_differentiators:
          [],

        limitations:
          [],

        contract_conditions:
          [],

        payment_conditions: [
          'Mensalidade de R$ 199,90.',
        ],

        allowed_claims: [
          'O Plano Essencial custa R$ 199,90 por mês.',
        ],

        forbidden_claims: [
          'Não prometer desconto não configurado.',
        ],
      },
    ],

    facts:
      [],

    objection_guides: [
      {
        contract_version:
          'commercial-objection-v1',

        definition:
          null,

        sort_order:
          1,

        objection:
          'Preço alto',

        signals: [
          'Está caro',
          'Achei caro',
        ],

        discovery_questions: [
          'O valor está acima do que você planejava investir ou ficou alguma dúvida sobre o que está incluído?',
        ],

        recommended_approach:
          'Entender a origem da objeção e reforçar valor sem inventar desconto.',

        response_limits: [
          'Não oferecer desconto não configurado.',
        ],
      },
    ],
  }
}

function buildDiagnosticInput(
  scenario,
) {
  const messages =
    scenario.messages.map(
      (
        message,
        index,
      ) => {
        const id =
          `${scenario.id}-m${index + 1}`

        return {
          id,

          message_key:
            id,

          version:
            1,

          sequence:
            index + 1,

          direction:
            message.direction,

          occurred_at:
            messageTime(
              index,
            ),

          observed_at:
            observedTime(
              index,
            ),

          content_type:
            'text',

          text_content:
            message.text,

          audio_transcription:
            null,
        }
      },
    )

  return {
    input_version:
      COMPANION_DIAGNOSTIC_INPUT_VERSION,

    diagnostic_contract_version:
      COMPANION_DIAGNOSTIC_CONTRACT_VERSION,

    company_id:
      'eval-company',

    cycle_id:
      `eval-cycle-${scenario.id}`,

    conversation_key:
      `eval:${scenario.id}`,

    current_crm_status:
      scenario.crm_status ??
      'contato',

    reference_time:
      '2026-09-13T18:00:00-03:00',

    analysis_precondition: {
      status:
        'ready',

      limitations:
        [],
    },

    conversation: {
      active_message_ids:
        messages.map(
          message =>
            message.id,
        ),

      excluded_message_ids:
        [],

      messages,

      excluded_messages:
        [],
    },

    commercial_context:
      buildCommercialContext(),
  }
}

function buildInput(
  scenario,
) {
  const diagnosticInput =
    buildDiagnosticInput(
      scenario,
    )

  return buildStatefulCopilotInput({
    diagnostic_input:
      diagnosticInput,

    previous_state:
      null,

    known_message_ids:
      diagnosticInput
        .conversation
        .active_message_ids,
  })
}

const scenarios = [
  {
    id:
      'answer-price',

    title:
      'Cliente pergunta preço diretamente',

    messages: [
      {
        direction:
          'incoming',

        text:
          'Oi, quanto custa o Plano Essencial?',
      },
    ],

    expected: {
      waiting_on:
        'seller',

      allowed_actions: [
        'answer_question',
        'present_solution',
      ],

      intervention_needed:
        true,
    },
  },

  {
    id:
      'price-objection',

    title:
      'Cliente apresenta objeção de preço',

    crm_status:
      'negociacao',

    messages: [
      {
        direction:
          'outgoing',

        text:
          'O Plano Essencial custa R$ 199,90 por mês.',
      },
      {
        direction:
          'incoming',

        text:
          'Entendi, mas achei caro para mim.',
      },
    ],

    expected: {
      waiting_on:
        'seller',

      allowed_actions: [
        'handle_objection',
      ],

      intervention_needed:
        true,
    },
  },

  {
    id:
      'seller-waiting-customer',

    title:
      'Vendedor já fez pergunta e deve aguardar',

    messages: [
      {
        direction:
          'incoming',

        text:
          'Estou procurando um plano para começar.',
      },
      {
        direction:
          'outgoing',

        text:
          'Entendi. O que você procura resolver com o serviço?',
      },
    ],

    expected: {
      waiting_on:
        'customer',

      allowed_actions: [
        'wait',
        'give_space',
        'no_intervention',
      ],

      intervention_needed:
        false,
    },
  },

  {
    id:
      'ready-to-close',

    title:
      'Cliente já decidiu comprar',

    crm_status:
      'negociacao',

    messages: [
      {
        direction:
          'outgoing',

        text:
          'O Plano Essencial custa R$ 199,90 por mês e atende ao que você me descreveu.',
      },
      {
        direction:
          'incoming',

        text:
          'Perfeito, pode fechar o Plano Essencial para mim.',
      },
    ],

    expected: {
      waiting_on:
        'seller',

      allowed_actions: [
        'close',
        'confirm_next_step',
      ],

      intervention_needed:
        true,
    },
  },

  {
    id:
      'needs-discovery',

    title:
      'Cliente demonstra interesse sem necessidade definida',

    messages: [
      {
        direction:
          'incoming',

        text:
          'Oi, estou pesquisando e queria entender qual opção faz mais sentido para mim.',
      },
    ],

    expected: {
      waiting_on:
        'seller',

      allowed_actions: [
        'discover',
        'clarify',
      ],

      intervention_needed:
        true,
    },
  },

  {
    id:
      'give-space',

    title:
      'Cliente pede implicitamente espaço para decidir',

    crm_status:
      'negociacao',

    messages: [
      {
        direction:
          'outgoing',

        text:
          'Te enviei as informações do Plano Essencial. Ficou alguma dúvida?',
      },
      {
        direction:
          'incoming',

        text:
          'Obrigada. Vou pensar com calma e te chamo se decidir.',
      },
    ],

    expected: {
      waiting_on:
        'customer',

      allowed_actions: [
        'give_space',
        'wait',
        'no_intervention',
      ],

      intervention_needed:
        false,
    },
  },

  {
    id:
      'non-commercial',

    title:
      'Cliente envia mensagem sem conteúdo comercial',

    messages: [
      {
        direction:
          'incoming',

        text:
          'Sou cliente de vocês e só queria agradecer pelo atendimento. Tenham um ótimo final de semana.',
      },
    ],

    expected: {
      allowed_statuses: [
        'ready',
        'silent',
      ],

      commercial_role:
        'buyer',

      commercial_relevance:
        'non_commercial',

      allowed_waiting_on: [
        'none',
        'customer',
      ],

      allowed_actions: [
        'no_intervention',
      ],

      intervention_needed:
        false,
    },
  },

  {
    id:
      'provider',

    title:
      'Interlocutor está oferecendo serviço para a empresa',

    messages: [
      {
        direction:
          'incoming',

        text:
          'Olá, sou representante da PrintMax e gostaria de apresentar nosso serviço de impressão para a sua empresa. Posso enviar uma proposta?',
      },
    ],

    expected: {
      allowed_statuses: [
        'ready',
        'silent',
      ],

      commercial_role:
        'provider',

      commercial_relevance:
        'commercial',

      allowed_waiting_on: [
        'none',
        'seller',
      ],

      allowed_actions: [
        'no_intervention',
      ],

      intervention_needed:
        false,
    },
  },
]

function evaluateScenario(
  scenario,
  result,
) {
  const checks =
    []

  const output =
    result.output

  const allowedStatuses =
    scenario
      .expected
      .allowed_statuses ?? [
        'ready',
      ]

  const expectedCommercialRole =
    scenario
      .expected
      .commercial_role ??
    'buyer'

  const expectedCommercialRelevance =
    scenario
      .expected
      .commercial_relevance ??
    'commercial'

  const allowedWaitingOn =
    scenario
      .expected
      .allowed_waiting_on ?? [
        scenario
          .expected
          .waiting_on,
      ]

  checks.push({
    name:
      'status',

    pass:
      allowedStatuses.includes(
        output.status,
      ),

    actual:
      output.status,

    expected:
      allowedStatuses,
  })

  checks.push({
    name:
      'commercial_role',

    pass:
      output
        .commercial_role ===
      expectedCommercialRole,

    actual:
      output
        .commercial_role,

    expected:
      expectedCommercialRole,
  })

  checks.push({
    name:
      'commercial_relevance',

    pass:
      output
        .commercial_relevance ===
      expectedCommercialRelevance,

    actual:
      output
        .commercial_relevance,

    expected:
      expectedCommercialRelevance,
  })

  checks.push({
    name:
      'waiting_on',

    pass:
      allowedWaitingOn.includes(
        output
          .responsibility
          .waiting_on,
      ),

    actual:
      output
        .responsibility
        .waiting_on,

    expected:
      allowedWaitingOn,
  })

  checks.push({
    name:
      'decision_action',

    pass:
      scenario
        .expected
        .allowed_actions
        .includes(
          output
            .decision
            .action,
        ),

    actual:
      output
        .decision
        .action,

    expected:
      scenario
        .expected
        .allowed_actions,
  })

  checks.push({
    name:
      'intervention_needed',

    pass:
      output
        .communication
        .intervention_needed ===
      scenario
        .expected
        .intervention_needed,

    actual:
      output
        .communication
        .intervention_needed,

    expected:
      scenario
        .expected
        .intervention_needed,
  })

  if (
    scenario
      .expected
      .intervention_needed ===
    false
  ) {
    checks.push({
      name:
        'silent_communication',

      pass:
        output
          .communication
          .recommended_question ===
          null &&
        output
          .communication
          .suggested_message ===
          null,

      actual: {
        recommended_question:
          output
            .communication
            .recommended_question,

        suggested_message:
          output
            .communication
            .suggested_message,
      },

      expected:
        'recommended_question=null e suggested_message=null',
    })
  }

  checks.push({
    name:
      'single_call',

    pass:
      result
        .execution
        .attempts ===
      1,

    actual:
      result
        .execution
        .attempts,
  })

  const failed =
    checks.filter(
      check =>
        !check.pass,
    )

  return {
    pass:
      failed.length ===
      0,

    checks,

    failed_checks:
      failed.map(
        check =>
          check.name,
      ),
  }
}

async function main() {
  requireEnvironment()

  const {
    scenario:
      requestedScenario,
  } =
    parseArgs(
      process.argv.slice(2),
    )

  const selected =
    requestedScenario
      ? scenarios.filter(
          scenario =>
            scenario.id ===
            requestedScenario,
        )
      : scenarios

  if (
    selected.length ===
    0
  ) {
    throw new Error(
      `Cenário desconhecido: ${requestedScenario}`,
    )
  }

  const model =
    process.env
      .OPENAI_COMMERCIAL_REASONING_CORE_V2_MODEL
      ?.trim() ||
    DEFAULT_MODEL

  const provider =
    createStatefulCopilotOpenAIProvider({
      model,

      diagnostic_reasoning_effort:
        REASONING_EFFORT,
    })

  const results =
    []

  console.log(
    '\n=== YOLEN — CORE V2 MULTI-SCENARIO EVAL ===',
  )

  console.log(
    JSON.stringify(
      {
        mode:
          'synthetic_read_only',

        model,

        reasoning_effort:
          REASONING_EFFORT,

        scenario_count:
          selected.length,
      },
      null,
      2,
    ),
  )

  for (
    const scenario of
    selected
  ) {
    console.log(
      `\n--- ${scenario.id}: ${scenario.title} ---`,
    )

    const startedAt =
      Date.now()

    try {
      const result =
        await runCommercialReasoningCoreV2({
          input:
            buildInput(
              scenario,
            ),

          provider,
        })

      const evaluation =
        evaluateScenario(
          scenario,
          result,
        )

      const durationMs =
        Date.now() -
        startedAt

      const summary = {
        scenario:
          scenario.id,

        pass:
          evaluation.pass,

        duration_ms:
          durationMs,

        model_duration_ms:
          result
            .execution
            .duration_ms,

        usage:
          result
            .execution
            .usage,

        status:
          result
            .output
            .status,

        commercial_role:
          result
            .output
            .commercial_role,

        commercial_relevance:
          result
            .output
            .commercial_relevance,

        decision:
          result
            .output
            .decision
            .action,

        waiting_on:
          result
            .output
            .responsibility
            .waiting_on,

        intervention_needed:
          result
            .output
            .communication
            .intervention_needed,

        factual_guard:
          result
            .factual_guard,

        failed_checks:
          evaluation
            .failed_checks,

        suggested_message:
          result
            .output
            .communication
            .suggested_message,
      }

      results.push(
        summary,
      )

      console.log(
        JSON.stringify(
          summary,
          null,
          2,
        ),
      )
    } catch (error) {
      const durationMs =
        Date.now() -
        startedAt

      const failure = {
        scenario:
          scenario.id,

        pass:
          false,

        duration_ms:
          durationMs,

        error:
          error instanceof Error
            ? {
                name:
                  error.name,

                message:
                  error.message,

                code:
                  typeof error.code ===
                    'string'
                    ? error.code
                    : null,
              }
            : {
                name:
                  'Error',

                message:
                  String(error),

                code:
                  null,
              },
      }

      results.push(
        failure,
      )

      console.log(
        JSON.stringify(
          failure,
          null,
          2,
        ),
      )
    }
  }

  const passed =
    results.filter(
      result =>
        result.pass,
    ).length

  const failed =
    results.length -
    passed

  const durations =
    results
      .map(
        result =>
          result
            .model_duration_ms,
      )
      .filter(
        value =>
          typeof value ===
          'number',
      )

  const outputTokens =
    results
      .map(
        result =>
          result
            .usage
            ?.output_tokens,
      )
      .filter(
        value =>
          typeof value ===
          'number',
      )

  const average =
    values =>
      values.length ===
      0
        ? null
        : Math.round(
            values.reduce(
              (
                total,
                value,
              ) =>
                total +
                value,
              0,
            ) /
              values.length,
          )

  const finalSummary = {
    total:
      results.length,

    passed,

    failed,

    pass_rate:
      results.length ===
      0
        ? 0
        : Number(
            (
              passed /
              results.length
            ).toFixed(
              3,
            ),
          ),

    average_model_duration_ms:
      average(
        durations,
      ),

    average_output_tokens:
      average(
        outputTokens,
      ),

    failed_scenarios:
      results
        .filter(
          result =>
            !result.pass,
        )
        .map(
          result =>
            result.scenario,
        ),
  }

  console.log(
    '\n=== RESUMO FINAL ===',
  )

  console.log(
    JSON.stringify(
      finalSummary,
      null,
      2,
    ),
  )

  if (failed > 0) {
    process.exitCode =
      1
  }
}

main().catch(
  error => {
    console.error(
      '\nEVAL_FAILED',
      error,
    )

    process.exitCode =
      1
  },
)
