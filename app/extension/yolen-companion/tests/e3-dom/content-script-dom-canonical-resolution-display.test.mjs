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

test('contact card usa somente display allowlisted da resolução canônica', async () => {
  const rawResolution =
    defaultLeadResolution({
      user_message:
        'Lead localizado com sucesso.',
      lead: {
        id: 'LEAD-ID-SECRETO',
        name: 'Cliente Permitido',
        phone: 'PHONE-RAW-SECRETO',
        email: 'EMAIL-RAW-SECRETO',
        cpf_cnpj: 'CPF-RAW-SECRETO',
      },
      cycle: {
        id: 'cycle-allowed',
        status: 'contato',
        owner_name:
          'Vendedora Autorizada',
        owner_user_id:
          'OWNER-ID-SECRETO',
      },
      phone:
        'PHONE-TOP-LEVEL-SECRETO',
      phone_variants: [
        'VARIANTE-SECRETA-1',
        'VARIANTE-SECRETA-2',
      ],
    })

  const {
    document,
    calls,
  } = loadContentScript({
    initialHtml:
      buildWhatsAppPageHtml({
        headerTitle: HEADER_TITLE,
      }),
    resolutionsByPhone: {
      [PHONE]: rawResolution,
    },
  })

  await waitFor(
    () =>
      resolveLeadCalls(calls)
        .length > 0,
  )

  const card =
    await waitFor(() => {
      const element =
        document.querySelector(
          '.yolen-contact-card',
        )

      if (
        element
          ?.textContent
          ?.includes(
            'Cliente Permitido',
          )
      ) {
        return element
      }

      return null
    })

  const text =
    card.textContent || ''

  assert.match(
    text,
    /Cliente Permitido/,
  )

  assert.match(
    text,
    /Contato/,
  )

  assert.match(
    text,
    /Vendedora Autorizada/,
  )

  for (const secret of [
    'LEAD-ID-SECRETO',
    'PHONE-RAW-SECRETO',
    'EMAIL-RAW-SECRETO',
    'CPF-RAW-SECRETO',
    'OWNER-ID-SECRETO',
    'PHONE-TOP-LEVEL-SECRETO',
    'VARIANTE-SECRETA-1',
    'VARIANTE-SECRETA-2',
  ]) {
    assert.equal(
      text.includes(secret),
      false,
      `contact card não pode exibir ${secret}`,
    )
  }
})
