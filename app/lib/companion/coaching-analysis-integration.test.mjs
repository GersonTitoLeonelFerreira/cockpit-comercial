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
  'ANÁLISE renderiza resumo de coaching antes dos detalhes existentes',
  () => {
    assert.match(
      sellerView,
      /function renderCoachingDiagnosis/,
    )

    const diagnosisIndex =
      sellerView.indexOf(
        'renderCoachingDiagnosis(analysisViewModel.coaching_diagnosis)',
      )

    const improvementsIndex =
      sellerView.indexOf(
        'renderImprovements(analysisViewModel.improvements)',
      )

    assert.ok(
      diagnosisIndex >= 0,
    )

    assert.ok(
      improvementsIndex >
        diagnosisIndex,
    )

    assert.match(
      sellerView,
      /Principal acerto/,
    )

    assert.match(
      sellerView,
      /Principal ajuste/,
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
        opportunity: null,
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
          chosen_technique: null,
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

    assert.doesNotMatch(
      html,
      /Enviar mensagem|Inserir mensagem/i,
    )
  },
)
