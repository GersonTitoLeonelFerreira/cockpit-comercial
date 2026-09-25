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

async function loadResolved(
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

  await waitFor(() =>
    document
      .querySelector(
        '.yolen-contact-card',
      )
      ?.textContent
      ?.includes(
        expectedName,
      ),
  )

  return document
}

function sellerTabCount(document) {
  return document.querySelectorAll(
    '[data-yolen-seller-area]',
  ).length
}

function workspaceText(document) {
  return (
    document.querySelector(
      '[data-yolen-region="seller-information-architecture"]',
    )?.textContent || ''
  ).trim()
}

test('OWNED_BY_ME elegível apresenta as quatro áreas', async () => {
  const document =
    await loadResolved(
      defaultLeadResolution({
        lead: {
          id: 'lead-open',
          name: 'Lead Aberto',
          phone: PHONE,
        },
      }),
      'Lead Aberto',
    )

  assert.equal(
    sellerTabCount(document),
    4,
  )

  assert.notEqual(
    workspaceText(document),
    '',
  )
})

test('CLOSED_CYCLE não apresenta workspace mesmo com analyze=true', async () => {
  const document =
    await loadResolved(
      defaultLeadResolution({
        status: 'CLOSED_CYCLE',

        lead: {
          id: 'lead-closed',
          name: 'Lead Fechado',
          phone: PHONE,
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
      }),
      'Lead Fechado',
    )

  assert.equal(
    sellerTabCount(document),
    0,
  )

  assert.equal(
    workspaceText(document),
    '',
  )
})

test('OWNED_BY_OTHER com capability canônica apresenta workspace mesmo com action legacy=false', async () => {
  const document =
    await loadResolved(
      defaultLeadResolution({
        status: 'OWNED_BY_OTHER',

        lead: {
          id: 'lead-other',
          name:
            'Lead Outro Autorizado',
          phone: PHONE,
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
      }),
      'Lead Outro Autorizado',
    )

  assert.equal(
    sellerTabCount(document),
    4,
  )

  assert.notEqual(
    workspaceText(document),
    '',
  )
})

function getMeResponse(companyId) {
  return {
    ok: true,
    statusCode: 200,
    origin: 'https://cockpit-comercial-vocn.vercel.app',
    payload: {
      ok: true,
      user: { full_name: 'Vendedor Teste' },
      active_company: {
        id: companyId,
        name: 'Empresa Teste',
        role: 'member',
      },
    },
  }
}

// Primeira resolução responde na hora; a partir da segunda, a resposta
// fica presa em voo até o teste liberá-la — permite observar o painel
// DURANTE a re-resolução.
function heldAfterFirstResolution(resolution) {
  let resolveCount = 0
  const pending = []

  return {
    handler: () => {
      resolveCount += 1

      if (resolveCount === 1) {
        return resolution
      }

      return new Promise((resolve) => {
        pending.push(() => resolve(resolution))
      })
    },
    get pendingCount() {
      return pending.length
    },
    releaseAll() {
      pending.splice(0).forEach((release) => release())
    },
  }
}

function clickRefresh(document) {
  const button = document.querySelector(
    '[data-yolen-action="refresh"]',
  )

  assert.ok(button, 'esperava o botão global de atualizar')

  button.dispatchEvent(
    new document.defaultView.Event('click', { bubbles: true }),
  )
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

test('refresh da mesma boundary preserva workspace enquanto a nova resolução está em voo', async () => {
  const held =
    heldAfterFirstResolution(
      defaultLeadResolution({
        lead: {
          id: 'lead-refresh',
          name: 'Lead Refresh',
          phone: PHONE,
        },
      }),
    )

  const { document, calls } = loadContentScript({
    initialHtml:
      buildWhatsAppPageHtml({
        headerTitle: HEADER_TITLE,
      }),
    resolutionsByPhone: {
      [PHONE]: held.handler,
    },
  })

  await waitFor(() =>
    document
      .querySelector('.yolen-contact-card')
      ?.textContent
      ?.includes('Lead Refresh'),
  )

  assert.equal(sellerTabCount(document), 4)

  const resolveCountBefore =
    resolveLeadCalls(calls).length

  clickRefresh(document)

  await waitFor(
    () =>
      resolveLeadCalls(calls).length >
        resolveCountBefore &&
      held.pendingCount > 0,
  )
  await sleep(50)

  assert.equal(
    sellerTabCount(document),
    4,
    'mesma boundary: as quatro abas continuam durante a re-resolução',
  )

  assert.notEqual(
    workspaceText(document),
    '',
    'mesma boundary: o workspace continua durante a re-resolução',
  )

  held.releaseAll()
  await sleep(50)

  assert.equal(sellerTabCount(document), 4)
})

test('troca de empresa invalida o workspace antigo antes de qualquer nova resolução terminar', async () => {
  let activeCompanyId = 'company-1'
  let getMeCallCount = 0

  const held =
    heldAfterFirstResolution(
      defaultLeadResolution({
        lead: {
          id: 'lead-company',
          name: 'Lead Empresa Um',
          phone: PHONE,
        },
      }),
    )

  const { document, calls } = loadContentScript({
    initialHtml:
      buildWhatsAppPageHtml({
        headerTitle: HEADER_TITLE,
      }),
    getMeResult: () => {
      getMeCallCount += 1
      return getMeResponse(activeCompanyId)
    },
    resolutionsByPhone: {
      [PHONE]: held.handler,
    },
  })

  await waitFor(() =>
    document
      .querySelector('.yolen-contact-card')
      ?.textContent
      ?.includes('Lead Empresa Um'),
  )

  assert.equal(sellerTabCount(document), 4)

  const getMeCountBefore = getMeCallCount
  const resolveCountBefore =
    resolveLeadCalls(calls).length

  activeCompanyId = 'company-2'

  clickRefresh(document)

  await waitFor(
    () =>
      getMeCallCount > getMeCountBefore &&
      resolveLeadCalls(calls).length >
        resolveCountBefore,
  )
  await sleep(50)

  assert.ok(
    held.pendingCount > 0,
    'a nova resolução ainda precisa estar em voo nesta asserção',
  )

  assert.equal(
    sellerTabCount(document),
    0,
    'workspace da empresa anterior não pode continuar visível',
  )

  assert.equal(
    workspaceText(document),
    '',
  )

  held.releaseAll()

  // Recovery: a nova resolução, feita sob a boundary da empresa nova,
  // reabre o workspace.
  await waitFor(
    () => sellerTabCount(document) === 4,
  )
})
