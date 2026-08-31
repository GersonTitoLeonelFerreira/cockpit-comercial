import assert from 'node:assert/strict'
import test from 'node:test'

import {
  generateMessageCandidatesV1,
} from './candidate-generator.ts'

import * as GeneratorModule from './candidate-generator.ts'

const TRACE = {
  source_type:
    'commercial_fact',
  source_id: 'fact-1',
  source_version:
    'commercial-fact-v2',
  observed_at:
    '2026-08-31T18:00:00.000Z',
  evidence_message_ids: [
    'm1',
  ],
  evidence_memory_ids: [
    'mem1',
  ],
}

const knownFact = (
  key =
    'fact.support_hours',
  value =
    'Atendimento em horário comercial.',
) => ({
  requirement_key: key,
  necessity: 'required',
  status: 'available',
  knowledge_status: 'resolved',
  subject: {},
  value,
  gap: null,
  gap_impact: null,
  assertion_policy:
    'may_assert',
  provenance: [TRACE],
})

const noneQuestion = () => ({
  should_ask: false,
  purpose: 'none',
  max_questions: 0,
  question_type: 'none',
  required_information: [],
  avoid_reasking_known_fact:
    true,
  known_information_skipped:
    [],
})

const basePlan = (
  overrides = {},
) => ({
  contract_version:
    'message-plan-v1',
  status: 'ready',
  situation: {
    situation:
      'information_request',
    confidence: 'high',
    evidence: [],
  },
  commercial_objective:
    'answer_factually',
  response_mode: 'answer',
  commercial_move: {
    move: 'answer_directly',
    reason:
      'Plano já decidiu o movimento.',
    source:
      'strategy_default',
    requested_move: null,
  },
  method_alignment: {
    status: 'aligned',
    method_name:
      'Método Teste',
    stage_key:
      'diagnostico',
    recommended_move:
      'answer_directly',
    seller_requested_move:
      null,
    requested_move_outside_method:
      false,
    reason: 'Alinhado.',
    constraints: [],
  },
  governance_status:
    'allowed',
  technique: {
    status: 'selected',
    technique_key:
      'yolen_direct_fact_answer',
    commercial_move:
      'answer_directly',
    framework_reference:
      'Yolen-native',
    constraints: [],
  },
  content_requirements: [
    'answer_requested_information',
  ],
  fact_requirements: [
    knownFact(),
  ],
  knowledge_gaps: [],
  forbidden_content: [],
  approval_boundaries: {
    governance_status:
      'allowed',
    requires_human_approval:
      false,
    execution_before_approval:
      'not_applicable',
    constraints: [],
  },
  question_plan:
    noneQuestion(),
  next_step_plan: {
    kind: 'answer_and_wait',
    commercial_move:
      'answer_directly',
    requires_customer_action:
      false,
    mutates_crm: false,
    mutates_agenda: false,
  },
  communication_style: {
    target_length: 'medium',
    directness: 'balanced',
    paragraph_density:
      'balanced',
    question_density: 'none',
    formality: 'neutral',
    emoji_policy:
      'unconstrained',
    greeting_policy: 'omit',
    closing_policy:
      'unconstrained',
  },
  evidence: {
    message_ids: ['m1'],
    memory_ids: ['mem1'],
  },
  provenance: [TRACE],
  generation_constraints: {
    generation_allowed: true,
    items: [],
  },
  ...overrides,
})

const generate = (
  plan,
  max_candidates,
) =>
  generateMessageCandidatesV1({
    message_plan: plan,
    ...(max_candidates
      ? {
          max_candidates,
        }
      : {}),
  })

const allText = result =>
  result.candidates
    .map(
      candidate =>
        candidate.text,
    )
    .join('\n')

const questionCount = text =>
  (text.match(/\?/gu) ?? [])
    .length

const quotePricing = () => ({
  model: 'quote_required',
  amount: null,
  currency: 'BRL',
  amount_qualifier: null,
  recurrence: null,
  installment_count: null,
  installment_amount_basis:
    null,
  note: null,
})

const recurringPricing = () => ({
  model: 'recurring',
  amount: 199.9,
  currency: 'BRL',
  amount_qualifier:
    'exact',
  recurrence: 'monthly',
  installment_count: null,
  installment_amount_basis:
    null,
  note: null,
})

const objectionPlan = () =>
  basePlan({
    situation: {
      situation: 'objection',
      confidence: 'high',
      evidence: [],
    },
    commercial_objective:
      'address_objection',
    response_mode: 'clarify',
    commercial_move: {
      move: 'isolate_objection',
      reason: 'Isolar barreira.',
      source:
        'strategy_default',
      requested_move: null,
    },
    method_alignment: {
      ...basePlan()
        .method_alignment,
      recommended_move:
        'isolate_objection',
    },
    technique: {
      status: 'selected',
      technique_key:
        'sandler_objection_isolation',
      commercial_move:
        'isolate_objection',
      framework_reference:
        'Sandler',
      constraints: [],
    },
    content_requirements: [
      'acknowledge_customer_point',
      'clarify_missing_information',
    ],
    fact_requirements: [],
    question_plan: {
      should_ask: true,
      purpose:
        'isolate_objection',
      max_questions: 1,
      question_type:
        'objection_clarification',
      required_information: [
        'objection_driver',
      ],
      avoid_reasking_known_fact:
        true,
      known_information_skipped:
        [],
    },
    next_step_plan: {
      kind: 'ask',
      commercial_move:
        'isolate_objection',
      requires_customer_action:
        true,
      mutates_crm: false,
      mutates_agenda: false,
    },
    communication_style: {
      ...basePlan()
        .communication_style,
      question_density:
        'balanced',
    },
  })

test(
  '1. fato conhecido pode aparecer',
  () => {
    const result =
      generate(basePlan())

    assert.equal(
      result.status,
      'generated',
    )
    assert.match(
      result.candidates[0].text,
      /Atendimento em horário comercial/u,
    )
    assert.deepEqual(
      result.candidates[0]
        .fact_requirements_used,
      ['fact.support_hours'],
    )
  },
)

test(
  '2. must_not_assert nunca aparece',
  () => {
    const plan =
      basePlan({
        fact_requirements: [
          knownFact(),
          {
            ...knownFact(
              'fact.secret',
              'Prazo inventado de 30 dias.',
            ),
            necessity:
              'supporting',
            status: 'missing',
            knowledge_status:
              'missing',
            assertion_policy:
              'must_not_assert',
          },
        ],
      })

    const result =
      generate(plan)

    assert.doesNotMatch(
      allText(result),
      /30 dias/u,
    )
  },
)

test(
  '3. describe_constraint_only não inventa valor',
  () => {
    const plan =
      basePlan({
        status:
          'ready_with_constraints',
        content_requirements: [
          'answer_requested_information',
          'explain_quote_requirement',
        ],
        fact_requirements: [{
          ...knownFact(
            'product.pricing',
            quotePricing(),
          ),
          assertion_policy:
            'describe_constraint_only',
          gap_impact: 'soft',
        }],
      })

    const result =
      generate(plan)

    assert.match(
      allText(result),
      /cotação|confirmado para o caso/iu,
    )
    assert.doesNotMatch(
      allText(result),
      /R\$\s*\d/iu,
    )
  },
)

test(
  '4. quote_required sem preço',
  () => {
    const result =
      generate(
        basePlan({
          status:
            'ready_with_constraints',
          content_requirements: [
            'answer_requested_information',
            'explain_quote_requirement',
          ],
          fact_requirements: [{
            ...knownFact(
              'product.pricing',
              quotePricing(),
            ),
            assertion_policy:
              'describe_constraint_only',
            gap_impact: 'soft',
          }],
        }),
      )

    assert.ok(
      result.candidates.length >
        0,
    )
    assert.doesNotMatch(
      allText(result),
      /299|500|a partir de R\$/iu,
    )
  },
)

test(
  '5. forbidden claim nunca aparece',
  () => {
    const plan =
      basePlan({
        forbidden_content: [{
          code:
            'PRODUCT_FORBIDDEN_CLAIM',
          source:
            'commercial_product',
          rule:
            'Resultado garantido.',
          provenance: [TRACE],
        }],
      })

    const result =
      generate(plan)

    assert.doesNotMatch(
      allText(result),
      /resultado garantido/iu,
    )
  },
)

test(
  '6. seller request não supera forbidden claim',
  () => {
    const plan =
      basePlan({
        status: 'blocked',
        commercial_move: {
          move:
            'answer_directly',
          reason:
            'Seller pediu promessa proibida.',
          source:
            'seller_request',
          requested_move:
            'answer_directly',
        },
        governance_status:
          'blocked',
        forbidden_content: [{
          code:
            'PRODUCT_FORBIDDEN_CLAIM',
          source:
            'commercial_product',
          rule:
            'Resultado garantido.',
          provenance: [TRACE],
        }],
        generation_constraints: {
          generation_allowed:
            false,
          items: [],
        },
      })

    const result =
      generate(plan)

    assert.equal(
      result.candidates.length,
      0,
    )
  },
)

test(
  '7. blocked produz zero candidates',
  () => {
    const result =
      generate(
        basePlan({
          status: 'blocked',
          governance_status:
            'blocked',
          generation_constraints: {
            generation_allowed:
              false,
            items: [],
          },
        }),
      )

    assert.equal(
      result.status,
      'blocked',
    )
    assert.deepEqual(
      result.candidates,
      [],
    )
  },
)

test(
  '8. approval_required produz zero candidates',
  () => {
    const result =
      generate(
        basePlan({
          status:
            'approval_required',
          governance_status:
            'approval_required',
          generation_constraints: {
            generation_allowed:
              false,
            items: [],
          },
        }),
      )

    assert.equal(
      result.status,
      'approval_required',
    )
    assert.deepEqual(
      result.candidates,
      [],
    )
  },
)

test(
  '9. generation_allowed false produz zero candidates',
  () => {
    const result =
      generate(
        basePlan({
          generation_constraints: {
            generation_allowed:
              false,
            items: [],
          },
        }),
      )

    assert.equal(
      result.status,
      'not_generated',
    )
    assert.deepEqual(
      result.candidates,
      [],
    )
  },
)

test(
  '10. rejection fecha sem nova oferta',
  () => {
    const plan =
      basePlan({
        situation: {
          situation:
            'rejection',
          confidence: 'high',
          evidence: [],
        },
        commercial_objective:
          'stop_pursuit',
        response_mode: 'stop',
        commercial_move: {
          move:
            'close_conversation',
          reason: 'Recusa.',
          source:
            'strategy_default',
          requested_move: null,
        },
        method_alignment: {
          ...basePlan()
            .method_alignment,
          recommended_move:
            'close_conversation',
        },
        technique: {
          status: 'selected',
          technique_key:
            'yolen_graceful_close',
          commercial_move:
            'close_conversation',
          framework_reference:
            'Yolen-native',
          constraints: [],
        },
        content_requirements: [
          'acknowledge_customer_point',
          'close_without_pressure',
        ],
        fact_requirements: [],
        next_step_plan: {
          kind: 'close',
          commercial_move:
            'close_conversation',
          requires_customer_action:
            false,
          mutates_crm: false,
          mutates_agenda: false,
        },
      })

    const text =
      allText(
        generate(plan),
      )

    assert.match(
      text,
      /Obrigado pelo retorno/iu,
    )
    assert.doesNotMatch(
      text,
      /oferta|próxima etapa|mas podemos/iu,
    )
  },
)

test(
  '11. postponement respeita timing',
  () => {
    const plan =
      basePlan({
        situation: {
          situation:
            'postponement',
          confidence: 'high',
          evidence: [],
        },
        commercial_objective:
          'respect_timing',
        response_mode: 'wait',
        commercial_move: {
          move:
            'respect_customer_timing',
          reason: 'Timing.',
          source:
            'strategy_default',
          requested_move: null,
        },
        method_alignment: {
          ...basePlan()
            .method_alignment,
          recommended_move:
            'respect_customer_timing',
        },
        technique: {
          status: 'selected',
          technique_key:
            'yolen_respect_timing',
          commercial_move:
            'respect_customer_timing',
          framework_reference:
            'Yolen-native',
          constraints: [],
        },
        content_requirements: [
          'respect_customer_timing',
          'close_without_pressure',
        ],
        fact_requirements: [],
        next_step_plan: {
          kind:
            'respect_timing',
          commercial_move:
            'respect_customer_timing',
          requires_customer_action:
            false,
          mutates_crm: false,
          mutates_agenda: false,
        },
      })

    const text =
      allText(
        generate(plan),
      )

    assert.match(
      text,
      /respeito seu tempo|respeito o seu tempo/iu,
    )
    assert.doesNotMatch(
      text,
      /dia 15|amanhã|amanha/iu,
    )
  },
)

test(
  '12. no_commercial_move não vende',
  () => {
    const plan =
      basePlan({
        situation: {
          situation:
            'non_commercial',
          confidence: 'high',
          evidence: [],
        },
        commercial_objective:
          'no_commercial_action',
        response_mode:
          'acknowledge',
        commercial_move: {
          move:
            'no_commercial_move',
          reason:
            'Não comercial.',
          source:
            'strategy_default',
          requested_move: null,
        },
        method_alignment: {
          ...basePlan()
            .method_alignment,
          status:
            'not_applicable',
          recommended_move:
            'no_commercial_move',
        },
        technique: {
          status:
            'not_applicable',
          technique_key: null,
          commercial_move:
            'no_commercial_move',
          framework_reference:
            null,
          constraints: [],
        },
        content_requirements: [
          'acknowledge_non_commercial',
        ],
        fact_requirements: [],
        next_step_plan: {
          kind: 'none',
          commercial_move:
            'no_commercial_move',
          requires_customer_action:
            false,
          mutates_crm: false,
          mutates_agenda: false,
        },
      })

    const text =
      allText(
        generate(plan),
      )

    assert.doesNotMatch(
      text,
      /comprar|oferta|próxima etapa|contratar/iu,
    )
  },
)

test(
  '13. max_questions zero',
  () => {
    const result =
      generate(basePlan())

    for (
      const candidate of
      result.candidates
    ) {
      assert.equal(
        candidate.question_count,
        0,
      )
      assert.equal(
        questionCount(
          candidate.text,
        ),
        0,
      )
    }
  },
)

test(
  '14. max_questions um',
  () => {
    const result =
      generate(
        objectionPlan(),
      )

    for (
      const candidate of
      result.candidates
    ) {
      assert.ok(
        candidate.question_count <=
          1,
      )
      assert.ok(
        questionCount(
          candidate.text,
        ) <= 1,
      )
    }
  },
)

test(
  '15. não repete informação conhecida',
  () => {
    const plan =
      objectionPlan()

    plan.question_plan = {
      ...plan.question_plan,
      purpose:
        'clarify_missing_information',
      required_information: [
        'objective',
      ],
      known_information_skipped: [
        'objective',
      ],
    }

    const result =
      generate(plan)

    assert.doesNotMatch(
      allText(result),
      /quer alcançar|pretende alcançar/iu,
    )
  },
)

test(
  '16. commercial_move preservado',
  () => {
    const plan =
      objectionPlan()
    const result =
      generate(plan)

    assert.ok(
      result.candidates.every(
        candidate =>
          candidate
            .commercial_move ===
          plan.commercial_move.move,
      ),
    )
  },
)

test(
  '17. objective preservado',
  () => {
    const plan =
      objectionPlan()
    const result =
      generate(plan)

    assert.ok(
      result.candidates.every(
        candidate =>
          candidate
            .commercial_objective ===
          plan.commercial_objective,
      ),
    )
  },
)

test(
  '18. technique não aparece nominalmente',
  () => {
    const result =
      generate(
        objectionPlan(),
      )

    assert.doesNotMatch(
      allText(result),
      /sandler_objection_isolation/iu,
    )
  },
)

test(
  '19. framework não aparece no texto',
  () => {
    const result =
      generate(
        objectionPlan(),
      )

    assert.doesNotMatch(
      allText(result),
      /\bSandler\b/u,
    )
  },
)

test(
  '20. estilo curto produz candidate curto',
  () => {
    const plan =
      objectionPlan()

    plan.communication_style = {
      ...plan
        .communication_style,
      target_length: 'short',
      directness: 'direct',
      paragraph_density:
        'compact',
    }

    const result =
      generate(plan, 1)
    const words =
      result.candidates[0]
        .text.split(/\s+/u)
        .length

    assert.ok(words <= 30)
  },
)

test(
  '21. estilo longo permite candidate mais desenvolvido',
  () => {
    const shortPlan =
      basePlan({
        communication_style: {
          ...basePlan()
            .communication_style,
          target_length:
            'short',
          directness: 'direct',
          paragraph_density:
            'compact',
        },
      })

    const longPlan =
      basePlan({
        communication_style: {
          ...basePlan()
            .communication_style,
          target_length: 'long',
        },
      })

    const shortText =
      generate(
        shortPlan,
        1,
      ).candidates[0].text

    const longText =
      generate(
        longPlan,
        1,
      ).candidates[0].text

    assert.ok(
      longText.length >
        shortText.length,
    )
  },
)

test(
  '22. formalidade é preservada',
  () => {
    const plan =
      objectionPlan()

    plan.communication_style = {
      ...plan
        .communication_style,
      formality: 'formal',
    }

    const text =
      allText(
        generate(plan),
      )

    assert.match(
      text,
      /Compreendo o ponto/iu,
    )
  },
)

test(
  '23. emoji reduce não aumenta emoji',
  () => {
    const plan =
      objectionPlan()

    plan.communication_style = {
      ...plan
        .communication_style,
      emoji_policy: 'reduce',
    }

    const text =
      allText(
        generate(plan),
      )

    assert.doesNotMatch(
      text,
      /\p{Extended_Pictographic}/u,
    )
  },
)

test(
  '24. greeting policy não inventa padrão ausente do MessagePlan',
  () => {
    const plan =
      objectionPlan()

    plan.communication_style = {
      ...plan
        .communication_style,
      greeting_policy:
        'preserve_seller',
    }

    const result =
      generate(plan)

    assert.ok(
      result.limitations.some(
        item =>
          item.code ===
          'SELLER_GREETING_PATTERN_NOT_IN_MESSAGE_PLAN',
      ),
    )
    assert.doesNotMatch(
      allText(result),
      /^(olá|ola|oi|bom dia|boa tarde|boa noite)\b/iu,
    )
  },
)

test(
  '25. closing policy não inventa assinatura ausente do MessagePlan',
  () => {
    const plan =
      objectionPlan()

    plan.communication_style = {
      ...plan
        .communication_style,
      closing_policy:
        'preserve_seller',
    }

    const result =
      generate(plan)

    assert.ok(
      result.limitations.some(
        item =>
          item.code ===
          'SELLER_CLOSING_PATTERN_NOT_IN_MESSAGE_PLAN',
      ),
    )
    assert.doesNotMatch(
      allText(result),
      /fico à disposição|qualquer dúvida me chama/iu,
    )
  },
)

test(
  '26. candidate sem jargon interno',
  () => {
    const text =
      allText(
        generate(
          objectionPlan(),
        ),
      )

    for (
      const forbidden of [
        'commercial move',
        'knowledge gap',
        'governance',
        'method alignment',
        'decision criterion',
        'Message Planner',
        'framework',
        'provenance',
      ]
    ) {
      assert.equal(
        text
          .toLocaleLowerCase(
            'pt-BR',
          )
          .includes(
            forbidden
              .toLocaleLowerCase(
                'pt-BR',
              ),
          ),
        false,
      )
    }
  },
)

test(
  '27. candidate sem atributos psicológicos',
  () => {
    const text =
      allText(
        generate(
          objectionPlan(),
        ),
      )

    assert.doesNotMatch(
      text,
      /ansioso|inseguro|personalidade|vulnerável|vulneravel/iu,
    )
  },
)

test(
  '28. provenance preservada',
  () => {
    const candidate =
      generate(
        basePlan(),
      ).candidates[0]

    assert.deepEqual(
      candidate.provenance,
      [TRACE],
    )
  },
)

test(
  '29. evidence IDs preservados',
  () => {
    const candidate =
      generate(
        basePlan(),
      ).candidates[0]

    assert.deepEqual(
      candidate.evidence,
      {
        message_ids: [
          'm1',
        ],
        memory_ids: [
          'mem1',
        ],
      },
    )
  },
)

test(
  '30. deterministic candidate IDs',
  () => {
    const first =
      generate(
        objectionPlan(),
      )
    const second =
      generate(
        objectionPlan(),
      )

    assert.deepEqual(
      first.candidates.map(
        item =>
          item.candidate_id,
      ),
      second.candidates.map(
        item =>
          item.candidate_id,
      ),
    )
  },
)

test(
  '31. same input produz same result',
  () => {
    const plan =
      objectionPlan()

    assert.deepEqual(
      generate(plan),
      generate(plan),
    )
  },
)

test(
  '32. Scenario 20 produz candidates materialmente diferentes',
  () => {
    const customerA =
      basePlan({
        status:
          'ready_with_constraints',
        content_requirements: [
          'answer_requested_information',
          'explain_quote_requirement',
        ],
        fact_requirements: [{
          ...knownFact(
            'product.pricing',
            quotePricing(),
          ),
          assertion_policy:
            'describe_constraint_only',
          gap_impact: 'soft',
        }],
        communication_style: {
          ...basePlan()
            .communication_style,
          target_length:
            'short',
          directness: 'direct',
          paragraph_density:
            'compact',
        },
      })

    const customerB =
      basePlan({
        situation: {
          situation:
            'comparison',
          confidence: 'high',
          evidence: [],
        },
        commercial_objective:
          'confirm_decision_criteria',
        response_mode:
          'clarify',
        commercial_move: {
          move:
            'compare_on_criteria',
          reason:
            'Comparação.',
          source:
            'strategy_default',
          requested_move: null,
        },
        method_alignment: {
          ...basePlan()
            .method_alignment,
          recommended_move:
            'compare_on_criteria',
        },
        technique: {
          status: 'selected',
          technique_key:
            'challenger_constructive_reframe',
          commercial_move:
            'compare_on_criteria',
          framework_reference:
            'Challenger',
          constraints: [],
        },
        content_requirements: [
          'confirm_decision_criterion',
          'surface_verified_difference',
        ],
        fact_requirements: [{
          ...knownFact(
            'product.allowed_claims',
            ['Suporte incluído.'],
          ),
          necessity:
            'supporting',
        }],
        question_plan:
          noneQuestion(),
        next_step_plan: {
          kind:
            'answer_and_wait',
          commercial_move:
            'compare_on_criteria',
          requires_customer_action:
            false,
          mutates_crm: false,
          mutates_agenda: false,
        },
        communication_style: {
          ...basePlan()
            .communication_style,
          target_length: 'long',
        },
      })

    const a =
      generate(customerA)
    const b =
      generate(customerB)

    assert.notEqual(
      a.commercial_move,
      b.commercial_move,
    )
    assert.notDeepEqual(
      a.candidates.map(
        item => item.text,
      ),
      b.candidates.map(
        item => item.text,
      ),
    )
  },
)

test(
  '33. mesmo move e fatos + estilo A/B muda texto sem mudar estratégia',
  () => {
    const shortPlan =
      basePlan({
        communication_style: {
          ...basePlan()
            .communication_style,
          target_length:
            'short',
          directness: 'direct',
          paragraph_density:
            'compact',
        },
      })

    const longPlan =
      basePlan({
        communication_style: {
          ...basePlan()
            .communication_style,
          target_length: 'long',
        },
      })

    const shortResult =
      generate(shortPlan)
    const longResult =
      generate(longPlan)

    assert.equal(
      shortResult.commercial_move,
      longResult.commercial_move,
    )
    assert.equal(
      shortResult
        .commercial_objective,
      longResult
        .commercial_objective,
    )
    assert.deepEqual(
      shortResult.candidates[0]
        .fact_requirements_used,
      longResult.candidates[0]
        .fact_requirements_used,
    )
    assert.notEqual(
      shortResult.candidates[0]
        .text,
      longResult.candidates[0]
        .text,
    )
  },
)

test(
  '34. contextos semanticamente equivalentes geram candidates estáveis',
  () => {
    const first =
      basePlan()
    const second =
      basePlan({
        evidence: {
          message_ids: [
            'different-message-id',
          ],
          memory_ids: [],
        },
        provenance: [{
          ...TRACE,
          source_id:
            'fact-equivalent',
        }],
      })

    const a =
      generate(first)
    const b =
      generate(second)

    assert.deepEqual(
      a.candidates.map(
        item => ({
          id:
            item.candidate_id,
          text: item.text,
        }),
      ),
      b.candidates.map(
        item => ({
          id:
            item.candidate_id,
          text: item.text,
        }),
      ),
    )
  },
)

test(
  '35. duas candidates válidas não divergem factual ou estrategicamente',
  () => {
    const result =
      generate(
        objectionPlan(),
        2,
      )

    assert.equal(
      result.candidates.length,
      2,
    )

    const [first, second] =
      result.candidates

    assert.equal(
      first.commercial_move,
      second.commercial_move,
    )
    assert.equal(
      first.commercial_objective,
      second.commercial_objective,
    )
    assert.deepEqual(
      first
        .fact_requirements_used,
      second
        .fact_requirements_used,
    )
  },
)

test(
  '36. zero auto-send/runtime side effects',
  () => {
    const exports =
      Object.keys(
        GeneratorModule,
      )

    assert.equal(
      exports.some(
        name =>
          /send|whatsapp|clipboard|crm|agenda|runtime/i
            .test(name),
      ),
      false,
    )
  },
)

test(
  '37. zero Final Message selection',
  () => {
    const exports =
      Object.keys(
        GeneratorModule,
      )

    assert.equal(
      exports.some(
        name =>
          /final.*message|select.*message|choose.*candidate/i
            .test(name),
      ),
      false,
    )
  },
)

test(
  '38. zero Critic',
  () => {
    const exports =
      Object.keys(
        GeneratorModule,
      )

    assert.equal(
      exports.some(
        name =>
          /critic|naturalness|score/i
            .test(name),
      ),
      false,
    )
  },
)

test(
  '39. zero Candidate ranking downstream',
  () => {
    const exports =
      Object.keys(
        GeneratorModule,
      )

    assert.equal(
      exports.some(
        name =>
          /rank|best.*candidate|winner/i
            .test(name),
      ),
      false,
    )
  },
)

test(
  '40. texto não expõe frameworks comerciais ao cliente',
  () => {
    const text =
      allText(
        generate(
          objectionPlan(),
        ),
      )

    for (
      const framework of [
        'SPIN',
        'GAP',
        'Sandler',
        'JOLT',
        'MEDDPICC',
        'Challenger',
        'Cialdini',
      ]
    ) {
      assert.equal(
        text.includes(
          framework,
        ),
        false,
      )
    }
  },
)

test(
  '41. hard fact gap não é completado',
  () => {
    const gap = {
      contract_version:
        'knowledge-gap-v1',
      domain:
        'commercial_fact',
      reason: 'not_found',
      sought:
        'cancellation_policy',
      explanation:
        'Política não encontrada.',
      partial_sources: [],
    }

    const plan =
      basePlan({
        status:
          'needs_information',
        fact_requirements: [{
          ...knownFact(
            'fact.cancellation_policy',
            null,
          ),
          status: 'missing',
          knowledge_status:
            'missing',
          value: null,
          gap,
          gap_impact: 'hard',
          assertion_policy:
            'must_not_assert',
        }],
        knowledge_gaps: [
          gap,
        ],
        question_plan: {
          should_ask: true,
          purpose:
            'clarify_missing_information',
          max_questions: 1,
          question_type:
            'direct',
          required_information: [
            'missing_factual_information',
          ],
          avoid_reasking_known_fact:
            true,
          known_information_skipped:
            [],
        },
      })

    const result =
      generate(plan)

    assert.equal(
      result.status,
      'needs_information',
    )
    assert.deepEqual(
      result.candidates,
      [],
    )
  },
)

test(
  '42. needs_information pode gerar pergunta quando não depende de hard factual gap',
  () => {
    const plan =
      basePlan({
        status:
          'needs_information',
        situation: {
          situation:
            'insufficient_context',
          confidence: 'low',
          evidence: [],
        },
        commercial_objective:
          'obtain_context',
        response_mode: 'clarify',
        commercial_move: {
          move:
            'request_more_context',
          reason:
            'Contexto insuficiente.',
          source:
            'strategy_default',
          requested_move: null,
        },
        method_alignment: {
          ...basePlan()
            .method_alignment,
          recommended_move:
            'request_more_context',
        },
        technique: {
          status:
            'not_applicable',
          technique_key: null,
          commercial_move:
            'request_more_context',
          framework_reference:
            null,
          constraints: [],
        },
        content_requirements: [
          'clarify_missing_information',
        ],
        fact_requirements: [],
        question_plan: {
          should_ask: true,
          purpose:
            'obtain_context',
          max_questions: 1,
          question_type:
            'context_clarification',
          required_information: [
            'current_request_context',
          ],
          avoid_reasking_known_fact:
            true,
          known_information_skipped:
            [],
        },
        next_step_plan: {
          kind: 'ask',
          commercial_move:
            'request_more_context',
          requires_customer_action:
            true,
          mutates_crm: false,
          mutates_agenda: false,
        },
      })

    const result =
      generate(plan)

    assert.equal(
      result.status,
      'needs_information',
    )
    assert.equal(
      result.candidates.length >
        0,
      true,
    )
    assert.equal(
      result.candidates[0]
        .question_count,
      1,
    )
  },
)

test(
  '43. máximo absoluto de três candidates',
  () => {
    const result =
      generate(
        objectionPlan(),
        3,
      )

    assert.ok(
      result.candidates.length <=
        3,
    )
  },
)
