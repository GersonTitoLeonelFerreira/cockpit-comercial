import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const scenariosUrl =
  new URL(
    '../../../docs/companion-v2/dynamic-validation/scenarios.json',
    import.meta.url,
  )

async function loadDefinition() {
  return JSON.parse(
    await readFile(
      scenariosUrl,
      'utf8',
    ),
  )
}

test(
  'fase 18A possui os cinco dialogos controlados esperados',
  async () => {
    const definition =
      await loadDefinition()

    assert.equal(
      definition.version,
      'phase-18a-dynamic-dialogues-v1',
    )

    assert.equal(
      definition.scenarios.length,
      5,
    )

    assert.deepEqual(
      definition.scenarios
        .map((scenario) => scenario.id)
        .sort(),
      [
        'awaiting-customer-return',
        'confirmed-demo-appointment',
        'discovery-gradual-pain',
        'explicit-loss-competitor',
        'price-objection-existing-system',
      ],
    )
  },
)

test(
  'cenarios dinamicos sao autocontidos, unicos e terminam a entrada em mensagem incoming',
  async () => {
    const definition =
      await loadDefinition()

    const ids =
      new Set()

    for (const scenario of definition.scenarios) {
      assert.equal(
        typeof scenario.id,
        'string',
      )
      assert.ok(scenario.id.length > 0)
      assert.equal(
        ids.has(scenario.id),
        false,
        `id duplicado: ${scenario.id}`,
      )
      ids.add(scenario.id)

      assert.equal(
        typeof scenario.hidden_profile,
        'string',
      )
      assert.ok(
        scenario.hidden_profile.trim().length > 0,
      )

      assert.equal(
        typeof scenario.simulation_instructions,
        'string',
      )
      assert.ok(
        scenario.simulation_instructions.trim().length > 0,
      )

      assert.equal(
        typeof scenario.expected_behavior,
        'string',
      )
      assert.ok(
        scenario.expected_behavior.trim().length > 0,
      )

      assert.ok(
        Array.isArray(scenario.coverage),
      )
      assert.ok(
        scenario.coverage.length > 0,
      )

      assert.ok(
        Array.isArray(scenario.initial_messages),
      )
      assert.ok(
        scenario.initial_messages.length > 0,
      )

      for (const message of scenario.initial_messages) {
        assert.ok(
          [
            'incoming',
            'outgoing',
          ].includes(message.direction),
        )
        assert.equal(
          typeof message.text,
          'string',
        )
        assert.ok(
          message.text.trim().length > 0,
        )
      }

      assert.equal(
        scenario.initial_messages.at(-1).direction,
        'incoming',
        `${scenario.id} precisa iniciar a analise com uma mensagem atual do contato externo`,
      )

      assert.ok(
        Number.isInteger(
          scenario.max_companion_turns,
        ),
      )
      assert.ok(
        scenario.max_companion_turns >= 1 &&
        scenario.max_companion_turns <= 5,
      )

      assert.equal(
        Number.isFinite(
          Date.parse(scenario.base_time),
        ),
        true,
      )
    }
  },
)

test(
  'hard gates cobrem papel, CRM, Agenda, intervencao e confirmacao humana fica implicita no runner',
  async () => {
    const definition =
      await loadDefinition()

    for (const scenario of definition.scenarios) {
      const gates =
        scenario.hard_gates

      assert.ok(gates)
      assert.ok(
        [
          'buyer',
          'provider',
          'unknown',
        ].includes(
          gates.expected_final_role,
        ),
      )

      for (
        const key of [
          'expected_final_crm_change',
          'expected_final_agenda_change',
          'expected_final_intervention_needed',
        ]
      ) {
        assert.ok(
          gates[key] === null ||
          typeof gates[key] === 'boolean',
          `${scenario.id}.${key} precisa ser boolean ou null`,
        )
      }

      if (
        scenario.initial_customer_terminal === true
      ) {
        assert.equal(
          scenario.max_companion_turns,
          1,
        )
      }
    }
  },
)
