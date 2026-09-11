import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

import {
  evaluateCommercialExperience,
} from './commercial-experience-eval.ts'

import {
  assessCommercialTruthFromUserPrompt,
} from './commercial-truth.ts'

import {
  deriveCommercialResponsibilityFromUserPrompt,
} from './commercial-responsibility.ts'

import {
  GENERAL_COMMERCIAL_INTELLIGENCE_LIBRARY,
} from './commercial-intelligence-library.ts'

const EXPERIENCES =
  JSON.parse(
    readFileSync(
      new URL(
        '../../../docs/companion-v2/corpus/phase16-r5-commercial-experiences.json',
        import.meta.url,
      ),
      'utf8',
    ),
  )

const DETERMINISTIC_TRUTH_GUARD_CASES =
  new Set([
    'r5-sister-referral',
    'r5-no-card',
    'r5-plan-link-objection',
    'r5-scroll-invariant',
  ])

function buildPrompt(experience) {
  return JSON.stringify({
    input: {
      diagnostic_input: {
        current_crm_status: 'contato',
        commercial_context: {
          products: [
            {
              product_id: 'product-premium',
              name: 'Plano Premium',
              definition: null,
            },
          ],
        },
        conversation: {
          messages:
            experience.turns.map(
              (turn, index) => ({
                id: `m${index + 1}`,
                direction:
                  turn.direction,
                text_content:
                  turn.text,
                audio_transcription:
                  null,
              }),
            ),
          context_bridge_messages: [],
        },
      },
    },
  })
}

function perfectObserved(experience) {
  return {
    commercial_relevance:
      experience.expected
        .commercial_relevance,
    buyer_side:
      experience.expected.buyer_side,
    third_party_prospect:
      experience.expected
        .third_party_prospect,
    stage:
      experience.expected
        .minimum_stage,
    waiting_on:
      experience.expected.waiting_on,
    decision:
      experience.expected.decision,
    technique_ids: [
      ...experience.expected
        .technique_ids,
    ],
    company_knowledge_sources: [
      ...experience.expected
        .required_company_knowledge_sources,
    ],
    orientation:
      'Orientação contextual válida, sem reproduzir nenhum comportamento proibido pelo caso.',
  }
}

test(
  'corpus R5 contém os seis casos reais obrigatórios e todos são experiências completas',
  () => {
    assert.equal(EXPERIENCES.length, 6)

    const ids =
      new Set(
        EXPERIENCES.map(item => item.id),
      )

    assert.equal(ids.size, 6)

    for (const experience of EXPERIENCES) {
      assert.ok(experience.title)
      assert.ok(experience.scenario)
      assert.ok(
        experience.turns.length > 0,
        experience.id,
      )
      assert.ok(
        experience.company_rules.length > 0,
        experience.id,
      )
      assert.ok(
        experience.expected,
        experience.id,
      )
    }
  },
)

test(
  'guard determinístico cobre os falsos negativos inequívocos sem assumir o papel do reasoning contextual',
  () => {
    for (
      const experience of
      EXPERIENCES.filter(
        item =>
          DETERMINISTIC_TRUTH_GUARD_CASES
            .has(item.id),
      )
    ) {
      const prompt =
        buildPrompt(experience)

      const truth =
        assessCommercialTruthFromUserPrompt(
          prompt,
        )

      assert.equal(
        truth.requires_commercial_relevance,
        true,
        `${experience.id}: relevance`,
      )

      assert.equal(
        truth.third_party_prospect_detected,
        experience.expected
          .third_party_prospect,
        `${experience.id}: third party`,
      )

      if (
        experience.expected.minimum_stage
      ) {
        assert.equal(
          truth.stage_floor,
          experience.expected.minimum_stage,
          `${experience.id}: stage`,
        )
      }
    }
  },
)

test(
  'responsabilidade do próximo movimento é avaliada em todos os casos reais',
  () => {
    for (const experience of EXPERIENCES) {
      const responsibility =
        deriveCommercialResponsibilityFromUserPrompt(
          buildPrompt(experience),
        )

      assert.equal(
        responsibility.waiting_on,
        experience.expected.waiting_on,
        `${experience.id}: waiting_on`,
      )
    }
  },
)

test(
  'todas as técnicas esperadas pelo corpus existem na Intelligence Library',
  () => {
    const knownIds =
      new Set(
        GENERAL_COMMERCIAL_INTELLIGENCE_LIBRARY
          .map(entry => entry.id),
      )

    for (const experience of EXPERIENCES) {
      for (
        const techniqueId of
        experience.expected.technique_ids
      ) {
        assert.equal(
          knownIds.has(techniqueId),
          true,
          `${experience.id}: ${techniqueId}`,
        )
      }
    }
  },
)

test(
  'eval comercial perfeito exige 100% em todas as dimensões do caso',
  () => {
    for (const experience of EXPERIENCES) {
      const result =
        evaluateCommercialExperience({
          experience,
          observed:
            perfectObserved(experience),
        })

      assert.equal(
        result.passed,
        true,
        experience.id,
      )
      assert.equal(
        result.score,
        100,
        experience.id,
      )
    }
  },
)

test(
  'eval comercial reprova técnica errada mesmo quando schema e relevância estão corretos',
  () => {
    const experience =
      EXPERIENCES.find(
        item =>
          item.id === 'r5-no-card',
      )

    const observed =
      perfectObserved(experience)

    observed.technique_ids = [
      'technique.guided_choice',
    ]

    const result =
      evaluateCommercialExperience({
        experience,
        observed,
      })

    assert.equal(result.passed, false)
    assert.ok(result.score < 100)
    assert.equal(
      result.checks.find(
        check =>
          check.key === 'techniques',
      ).passed,
      false,
    )
  },
)

test(
  'eval comercial reprova ausência de conhecimento da empresa quando a orientação depende dele',
  () => {
    const experience =
      EXPERIENCES.find(
        item =>
          item.id ===
            'r5-plan-link-objection',
      )

    const observed =
      perfectObserved(experience)

    observed.company_knowledge_sources = []

    const result =
      evaluateCommercialExperience({
        experience,
        observed,
      })

    assert.equal(result.passed, false)
    assert.equal(
      result.checks.find(
        check =>
          check.key ===
            'company_knowledge',
      ).passed,
      false,
    )
  },
)

test(
  'eval comercial reprova orientação que repete comportamento explicitamente proibido no caso',
  () => {
    const experience =
      EXPERIENCES.find(
        item =>
          item.id ===
            'r5-scheduling-open',
      )

    const observed =
      perfectObserved(experience)

    observed.orientation =
      'Qual horário você prefere?'

    const result =
      evaluateCommercialExperience({
        experience,
        observed,
      })

    assert.equal(result.passed, false)
    assert.equal(
      result.checks.find(
        check => check.key === 'must_not',
      ).passed,
      false,
    )
  },
)
