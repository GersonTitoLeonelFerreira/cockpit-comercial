import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CommercialReasoningCoreV2ExecutionError,
  executeCommercialReasoningCoreV2,
} from './commercial-reasoning-core-v2-executor.ts'

function buildPlan() {
  return {
    prompt_version:
      'commercial-reasoning-core-v2-prompt-v3',
    output_contract_version:
      'commercial-reasoning-core-v2',
    system_prompt:
      'Analise a venda em uma única passagem.',
    user_prompt:
      JSON.stringify({
        conversation:
          'snapshot',
      }),
  }
}

function buildValidOutput() {
  return {
    contract_version:
      'commercial-reasoning-core-v2',
    status:
      'ready',
    commercial_role:
      'buyer',
    commercial_relevance:
      'commercial',
    situation: {
      summary:
        'A cliente já escolheu a aula e pediu conclusão operacional.',
      customer_intent:
        'Agendar aula experimental para duas pessoas.',
      commercial_stage:
        'conclusao_operacional',
      confidence:
        'high',
      evidence_message_ids: [
        'm1',
        'm2',
      ],
    },
    responsibility: {
      waiting_on:
        'seller',
      summary:
        'O vendedor precisa verificar disponibilidade e concluir o agendamento.',
      evidence_message_ids: [
        'm2',
      ],
    },
    decision: {
      action:
        'schedule',
      objective:
        'Concluir o agendamento sem repetir descoberta já resolvida.',
      reason:
        'Modalidade, dia, horário e quantidade de pessoas já estão definidos.',
      evidence_message_ids: [
        'm1',
        'm2',
      ],
    },
    coaching: {
      strengths: [],
      improvement_points: [
        {
          kind:
            'loss_of_context',
          summary:
            'A retomada genérica obrigou a cliente a reconstruir uma necessidade já explícita.',
          why_it_matters:
            'Aumenta fricção em uma oportunidade de alta intenção.',
          impact:
            'Pode atrasar ou reduzir a chance de conclusão.',
          how_to_improve:
            'Retomar diretamente do pedido pendente e concluir o próximo passo.',
          evidence_message_ids: [
            'm1',
            'm2',
          ],
        },
      ],
    },
    method: {
      configured:
        true,
      name:
        'Método Yolen',
      current_stage:
        'Conclusão',
      adherence:
        'partially_on_method',
      deviation:
        'Houve perda de continuidade depois de um pedido operacional claro.',
      recovery_move:
        'Concluir a ação pendente sem voltar para descoberta básica.',
      evidence_message_ids: [
        'm1',
        'm2',
      ],
    },
    technique: {
      name:
        'redução de fricção',
      why_applicable:
        'A cliente já forneceu os dados necessários para avançar.',
      do_not_do: [
        'Não repetir perguntas já respondidas.',
      ],
    },
    communication: {
      intervention_needed:
        true,
      recommended_question:
        null,
      suggested_message:
        'Vou verificar agora a disponibilidade de sexta às 18h para vocês duas e já te confirmo.',
    },
    factuality: {
      facts_used: [
        {
          summary:
            'A cliente pediu agendamento para duas pessoas.',
          evidence_message_ids: [
            'm2',
          ],
        },
      ],
      unknowns: [
        'Disponibilidade real da turma.',
      ],
    },
    evidence_message_ids: [
      'm1',
      'm2',
    ],
  }
}

test(
  'Commercial Reasoning Core V2 executa exatamente uma chamada principal quando a saída é válida',
  async () => {
    let calls = 0

    const provider =
      async (request) => {
        calls += 1

        assert.equal(
          request.prompt_version,
          'commercial-reasoning-core-v2-prompt-v3',
        )

        assert.equal(
          request.output_contract_version,
          'commercial-reasoning-core-v2',
        )

        assert.equal(
          request.structured_output_format.name,
          'yolen_commercial_reasoning_core_v2',
        )

        return {
          content:
            JSON.stringify(
              buildValidOutput(),
            ),
          provider:
            'openai',
          model:
            'test-model',
          request_id:
            'req-core-v2',
          usage: {
            input_tokens: 100,
            output_tokens: 200,
            total_tokens: 300,
          },
        }
      }

    const result =
      await executeCommercialReasoningCoreV2({
        plan:
          buildPlan(),
        provider,
      })

    assert.equal(calls, 1)
    assert.equal(
      result.execution.attempts,
      1,
    )
    assert.equal(
      result.execution.recovered_after_retry,
      false,
    )
    assert.equal(
      result.output.decision.action,
      'schedule',
    )
    assert.equal(
      result.output.coaching
        .improvement_points[0]
        .kind,
      'loss_of_context',
    )
  },
)

test(
  'Commercial Reasoning Core V2 não faz segunda chamada para reparar JSON inválido',
  async () => {
    let calls = 0

    const provider =
      async () => {
        calls += 1

        return {
          content:
            '{invalid-json',
          provider:
            'openai',
        }
      }

    await assert.rejects(
      () =>
        executeCommercialReasoningCoreV2({
          plan:
            buildPlan(),
          provider,
        }),
      (error) => {
        assert.ok(
          error instanceof
            CommercialReasoningCoreV2ExecutionError,
        )
        assert.equal(
          error.code,
          'INVALID_CORE_V2_JSON',
        )

        return true
      },
    )

    assert.equal(calls, 1)
  },
)

test(
  'Commercial Reasoning Core V2 não faz segunda chamada para reparar saída fora do contrato',
  async () => {
    let calls = 0

    const provider =
      async () => {
        calls += 1

        return {
          content:
            JSON.stringify({
              ...buildValidOutput(),
              status:
                'qualquer-coisa',
            }),
          provider:
            'openai',
        }
      }

    await assert.rejects(
      () =>
        executeCommercialReasoningCoreV2({
          plan:
            buildPlan(),
          provider,
        }),
      (error) => {
        assert.ok(
          error instanceof
            CommercialReasoningCoreV2ExecutionError,
        )
        assert.equal(
          error.code,
          'INVALID_CORE_V2_OUTPUT',
        )
        assert.equal(
          error.details
            ?.contract_error_path,
          'output.status',
        )

        return true
      },
    )

    assert.equal(calls, 1)
  },
)
