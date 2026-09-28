import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'

const loader =
  readFileSync(
    new URL(
      '../server/analysis-view-model-loader.ts',
      import.meta.url,
    ),
    'utf8',
  )

const reasoningSource =
  readFileSync(
    new URL(
      '../server/canonical-seller-reasoning-source.ts',
      import.meta.url,
    ),
    'utf8',
  )

const sellerView =
  readFileSync(
    new URL(
      '../../extension/yolen-companion/src/companion-seller-information-view.js',
      import.meta.url,
    ),
    'utf8',
  )

test(
  'ANÁLISE recebe diagnóstico do mesmo snapshot usado pelo Commercial Reasoning',
  () => {
    assert.match(
      loader,
      /loadCanonicalSellerReasoningBundle/,
    )

    assert.match(
      loader,
      /buildCommercialCoachingDiagnosis/,
    )

    assert.match(
      loader,
      /diagnostic_input:\s*reasoningBundle\s*\.diagnostic_input/,
    )

    assert.match(
      loader,
      /coaching_diagnosis:\s*coachingDiagnosis/,
    )
  },
)

test(
  'loader de reasoning preserva API antiga e expõe bundle sem duplicar autoridade',
  () => {
    assert.match(
      reasoningSource,
      /export async function loadCanonicalSellerReasoningBundle/,
    )

    assert.match(
      reasoningSource,
      /export async function loadCanonicalSellerReasoning/,
    )

    assert.match(
      reasoningSource,
      /return bundle\.reasoning/,
    )
  },
)

test(
  'ANÁLISE usa coaching canônico como autoridade e não empilha coaching legado concorrente',
  () => {
    assert.match(
      sellerView,
      /function renderCoachingDiagnosis/,
    )

    assert.match(
      sellerView,
      /const hasCoachingDiagnosis/,
    )

    assert.match(
      sellerView,
      /hasCoachingDiagnosis[\s\S]*\? ''[\s\S]*: renderImprovements/,
    )

    assert.match(
      sellerView,
      /hasCoachingDiagnosis[\s\S]*\? ''[\s\S]*: renderStrengths/,
    )

    assert.match(
      sellerView,
      /Técnica recomendada/,
    )

    assert.match(
      sellerView,
      /hasCoachingDiagnosis[\s\S]*\? ''[\s\S]*: renderOpportunityHeader/,
    )
  },
)

test(
  'ANÁLISE continua informativa e não ganha ação de envio automático',
  () => {
    const diagnosisBlock =
      sellerView.slice(
        sellerView.indexOf(
          'function renderCoachingDiagnosis',
        ),
        sellerView.indexOf(
          'function renderStrengths',
        ),
      )

    assert.doesNotMatch(
      diagnosisBlock,
      /sendMessage|applySuggestedMessage|insertMessage|auto.?send/i,
    )
  },
)


const require =
  createRequire(import.meta.url)

const sellerViewModule =
  require(
    '../../extension/yolen-companion/src/companion-seller-information-view.js',
  )

test(
  'render real de ANÁLISE mostra resumo de coaching com principal acerto, ajuste e próximo objetivo',
  () => {
    const html =
      sellerViewModule.renderAnalysisViewModel({
        available: true,
        unavailable_reason: null,
        neutral: false,
        neutral_headline: null,
        neutral_description: null,
        opportunity: {
          status: 'presentation',
          headline:
            'LEGACY_AVANCANDO_APRESENTACAO_NAO_DEVE_APARECER',
        },
        current_moment: {
          is_active_session: true,
        },
        risks: [],
        objections_open: [],
        commitments: [],
        seller_conduct: {
          method: null,
          stage_divergence: false,
        },
        strengths: [
          {
            kind: 'other',
            summary:
              'LEGACY_ACERTO_NAO_DEVE_APARECER',
          },
        ],
        improvements: [
          {
            kind: 'other',
            summary:
              'LEGACY_AJUSTE_NAO_DEVE_APARECER',
          },
        ],
        continuity: {
          cycle_conversation_count: 1,
          cross_conversation_signals: [],
        },
        history: [],
        provenance: {},
        coaching_diagnosis: {
          status: 'ready',
          current_commercial_goal:
            'Retomar o compromisso que o cliente já demonstrou.',
          seller_strength: {
            summary:
              'O vendedor identificou o próximo compromisso.',
            why_it_matters:
              'A conversa ganhou direção.',
            evidence_message_ids: [
              'm2',
            ],
            memory_ids: [],
          },
          seller_mistake: {
            summary:
              'A condução mudou de objetivo cedo demais.',
            why_it_matters:
              'A sequência perdeu continuidade.',
            impact:
              'O cliente pode abandonar a intenção anterior.',
            how_to_improve:
              'Retomar o objetivo ativo antes de avançar.',
            evidence_message_ids: [
              'm3',
            ],
            memory_ids: [],
          },
          next_action:
            'Concluir o próximo compromisso.',
          client_intent_now: {
            label:
              'Agendamento ou compromisso de agenda',
          },
          seller_last_valid_move: {
            action_label:
              'Pergunta aberta de agendamento',
          },
          chosen_technique: {
            id:
              'technique.contextual_reengagement',
            title:
              'Retomada contextual',
            why_now:
              'A conversa perdeu continuidade.',
            risks: [],
          },
          sequence_break: {
            happened: true,
            what_changed:
              'A condução mudou antes de concluir o objetivo.',
            why_it_hurts:
              'A quebra aumenta fricção.',
          },
          client_context_confidence:
            'high',
          seller_execution_confidence:
            'high',
          do_not_do: [
            'Não abandonar o objetivo ativo.',
          ],
        },
      })

    assert.match(
      html,
      /Leitura da condução/,
    )

    assert.match(
      html,
      /Principal acerto/,
    )

    assert.match(
      html,
      /Principal ajuste/,
    )

    assert.match(
      html,
      /Retomar o objetivo ativo antes de avançar/,
    )

    assert.match(
      html,
      /Concluir o próximo compromisso/,
    )

    assert.match(
      html,
      /Técnica recomendada[\s\S]*Retomada contextual/,
    )

    assert.doesNotMatch(
      html,
      /LEGACY_ACERTO_NAO_DEVE_APARECER|LEGACY_AJUSTE_NAO_DEVE_APARECER/,
    )

    assert.doesNotMatch(
      html,
      /LEGACY_AVANCANDO_APRESENTACAO_NAO_DEVE_APARECER/,
    )

    assert.doesNotMatch(
      html,
      /Enviar mensagem|Inserir mensagem/i,
    )
  },
)

test(
  'método distingue etapa observada da etapa recomendada para recuperação',
  () => {
    const html =
      sellerViewModule.renderAnalysisViewModel({
        available: true,
        unavailable_reason: null,
        neutral: false,
        neutral_headline: null,
        neutral_description: null,
        opportunity: null,
        current_moment: {
          is_active_session: true,
        },
        risks: [],
        objections_open: [],
        commitments: [],
        seller_conduct: {
          stage_divergence: true,
          method: {
            configured: true,
            name: 'Método consultivo',
            stages: [
              {
                step_order: 1,
                stage_key: 'discovery',
                name: 'Descoberta',
                status: 'partial',
                explanation:
                  'Ainda falta concluir a etapa.',
              },
              {
                step_order: 2,
                stage_key: 'presentation',
                name: 'Apresentação',
                status: 'active',
                explanation:
                  'A apresentação ocorreu cedo demais.',
              },
            ],
            current_stage: {
              step_order: 2,
              stage_key: 'presentation',
              name: 'Apresentação',
            },
            adherence: {
              status: 'off_method',
              summary:
                'A sequência perdeu aderência.',
              deviation_stage_order: 1,
              what_happened:
                'A apresentação começou antes de concluir descoberta.',
              missing_information: [],
              why_it_matters:
                'A recomendação pode ficar prematura.',
            },
            recovery_guidance: {
              objective:
                'Concluir o compromisso da etapa anterior.',
              missing_information: [],
              recommended_move:
                'Retomar a descoberta antes de apresentar novamente.',
              optional_question: null,
              evidence_message_ids: [],
              memory_ids: [],
            },
          },
        },
        strengths: [],
        improvements: [],
        continuity: {
          cycle_conversation_count: 1,
          cross_conversation_signals: [],
        },
        history: [],
        provenance: {},
        coaching_diagnosis: {
          status: 'ready',
          current_commercial_goal:
            'Retomar a etapa anterior.',
          seller_strength: null,
          seller_mistake: null,
          next_action:
            'Retomar a etapa anterior.',
          client_intent_now: null,
          seller_last_valid_move: null,
          chosen_technique: null,
          sequence_break: {
            happened: true,
            what_changed:
              'A conversa avançou cedo demais.',
            why_it_hurts:
              'A etapa anterior ficou incompleta.',
          },
          method_state: {
            configured: true,
            current_stage_name:
              'Apresentação',
            recommended_stage_name:
              'Descoberta',
            recommended_stage_reason:
              'Concluir o compromisso da etapa anterior.',
            adherence: 'off_method',
            deviation_detected: true,
            recovery_objective:
              'Concluir o compromisso da etapa anterior.',
            recovery_move:
              'Retomar a descoberta.',
          },
          client_context_confidence: 'high',
          seller_execution_confidence: 'high',
          do_not_do: [],
        },
      })

    assert.match(
      html,
      /Direção do método agora/,
    )

    assert.match(
      html,
      /Etapa observada[\s\S]*Apresentação/,
    )

    assert.match(
      html,
      /Etapa recomendada agora[\s\S]*Descoberta/,
    )

    assert.match(
      html,
      /Etapa observada[\s\S]*Apresentação[\s\S]*Parcialmente|Etapa observada[\s\S]*Apresentação/,
    )
  },
)
