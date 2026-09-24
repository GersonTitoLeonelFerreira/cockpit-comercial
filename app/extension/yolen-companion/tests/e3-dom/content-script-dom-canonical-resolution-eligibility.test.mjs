import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildWhatsAppPageHtml,
  defaultLeadResolution,
  loadContentScript,
  resolveLeadCalls,
  waitFor,
} from '../e3-test-support/load-content-script.mjs'

const HEADER_TITLE =
  '+55 11 98888-7777'

const PHONE =
  '5511988887777'

async function loadResolvedPage(
  resolution,
  expectedName,
) {
  const {
    document,
    calls,
  } = loadContentScript({
    initialHtml:
      buildWhatsAppPageHtml({
        headerTitle:
          HEADER_TITLE,
      }),
    resolutionsByPhone: {
      [PHONE]:
        resolution,
    },
  })

  await waitFor(
    () =>
      resolveLeadCalls(calls)
        .length > 0,
  )

  await waitFor(() => {
    return document
      .querySelector(
        '.yolen-contact-card',
      )
      ?.textContent
      ?.includes(
        expectedName,
      )
  })

  return {
    document,
    calls,
  }
}

test('capability canônica autoriza análise mesmo quando action legacy diz false', async () => {
  const resolution =
    defaultLeadResolution({
      status:
        'OWNED_BY_OTHER',

      lead: {
        id: 'lead-other',
        name:
          'Lead Canonical Autorizado',
        phone: PHONE,
        email: null,
        cpf_cnpj: null,
      },

      cycle: {
        id: 'cycle-other',
        status: 'contato',
      },

      capabilities: {
        can_create_lead: false,
        can_analyze_conversation: true,
        can_apply_suggestion: false,
        can_open_pool: false,
        can_open_cycle: true,
        can_register_conversation: false,
        can_enrich_lead: false,
      },

      actions: {
        can_analyze_conversation: false,
        can_apply_suggestion: false,
      },

      flags: {
        is_closed: false,
        is_owned_by_me: false,
        is_pool: false,
      },
    })

  const {
    document,
  } = await loadResolvedPage(
    resolution,
    'Lead Canonical Autorizado',
  )

  assert.ok(
    document.querySelector(
      '[data-yolen-action="analyze-conversation"]',
    ),
  )
})

test('CLOSED_CYCLE bloqueia análise mesmo quando capability e action legacy dizem true', async () => {
  const resolution =
    defaultLeadResolution({
      status:
        'CLOSED_CYCLE',

      user_message:
        'Este ciclo comercial já está encerrado.',

      lead: {
        id: 'lead-closed',
        name:
          'Lead Ciclo Fechado',
        phone: PHONE,
        email: null,
        cpf_cnpj: null,
      },

      cycle: {
        id: 'cycle-closed',
        status: 'ganho',
      },

      capabilities: {
        can_create_lead: false,
        can_analyze_conversation: true,
        can_apply_suggestion: true,
        can_open_pool: false,
        can_open_cycle: true,
        can_register_conversation: false,
        can_enrich_lead: false,
      },

      actions: {
        can_analyze_conversation: true,
        can_apply_suggestion: true,
      },

      flags: {
        is_closed: true,
        is_owned_by_me: true,
        is_pool: false,
      },
    })

  const {
    document,
  } = await loadResolvedPage(
    resolution,
    'Lead Ciclo Fechado',
  )

  assert.equal(
    document.querySelector(
      '[data-yolen-action="analyze-conversation"]',
    ),
    null,
  )
})
