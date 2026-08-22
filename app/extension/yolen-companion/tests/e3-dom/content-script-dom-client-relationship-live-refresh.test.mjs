// Fast-follow do PR #186 (Inteligência operacional do cliente): findings
// pós-merge confirmados pelo Controle Mestre.
//
// P1 — o card "Relacionamento" podia buscar o contexto operacional do
// cliente sobre um ledger de mensagens ainda vazio (a ingestão só é
// agendada com debounce) e, uma vez "ready", nunca mais se atualizava
// durante a conversa — mesmo com novas mensagens chegando ou o tempo de
// espera crescendo.
//
// A correção real (ver content-script.js): a ingestão de captura bem
// sucedida (runCaptureIngestion -> rememberSuccessfulCapture) agora
// notifica loadCompanionClientContextForCurrentCycle({ force: true }) via
// notifyCaptureIngestedForClientContext, com um pequeno debounce para
// coalescer múltiplas ingestões próximas numa única requisição.
//
// Como no restante da E3, estes testes carregam content-script.js de
// verdade (sem modificá-lo) e só observam a superfície pública real: o DOM
// resultante e as chamadas para chrome.runtime.sendMessage.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildMessageHtml,
  buildWhatsAppPageHtml,
  clientContextCalls,
  defaultClientContext,
  emptyClientContext,
  ingestCalls,
  loadContentScript,
  waitFor,
} from '../e3-test-support/load-content-script.mjs'

const HEADER_TITLE = '+55 11 98888-7777'
const HEADER_TITLE_B = '+55 21 97777-6666'

function onlyDigits(value) {
  return String(value).replace(/\D/g, '')
}

function initialPageHtml() {
  return buildWhatsAppPageHtml({
    headerTitle: HEADER_TITLE,
    messagesHtml: buildMessageHtml({
      id: 'msg-1',
      prePlainText: '[10:15, 21/08/2026] Cliente Teste: ',
      text: 'Ola, bom dia',
    }),
  })
}

// Cenários 1 e 2 do fast-follow: abre conversa antes da ingestão terminar;
// o contexto buscado precocemente não fica preso como "ready" incorreto.
test('contexto buscado antes da ingestão terminar é corrigido assim que a ingestão confirma', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: initialPageHtml(),
    clientContextResult: (callNumber) =>
      callNumber === 1 ? emptyClientContext() : defaultClientContext(),
  })

  await waitFor(() => clientContextCalls(calls).length > 0)

  await waitFor(() => {
    const card = document.querySelector('.yolen-client-relationship-card')
    return Boolean(card && card.querySelector('.yolen-client-relationship--empty'))
  })

  // A primeira leitura (precoce) não tem histórico ainda — é o estado
  // esperado antes da ingestão confirmar, não um bug em si; o bug seria
  // ficar preso nele.
  await waitFor(() => ingestCalls(calls).length > 0)

  await waitFor(() => {
    const card = document.querySelector('.yolen-client-relationship-card')
    return Boolean(card && /Primeiro contato/.test(card.textContent))
  })

  assert.ok(
    clientContextCalls(calls).length >= 2,
    'esperava uma segunda busca de contexto depois que a ingestão confirmou',
  )

  const card = document.querySelector('.yolen-client-relationship-card')
  assert.doesNotMatch(card.textContent, /Ainda não há histórico suficiente/)
})

// Cenários 3 e 4: contexto precisa se atualizar durante a conversa; nova
// mensagem do cliente muda o estado de espera sem reabrir o WhatsApp.
test('nova mensagem do cliente durante a conversa muda o estado de espera para customer_waiting_for_seller sem reabrir o WhatsApp', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: initialPageHtml(),
    clientContextResult: (callNumber) =>
      defaultClientContext({
        waiting:
          callNumber === 1
            ? {
                state: 'seller_waiting_for_customer',
                waiting_since: '2026-08-22T10:08:00.000Z',
                waiting_duration_ms: 60 * 60 * 1000,
              }
            : {
                state: 'customer_waiting_for_seller',
                waiting_since: '2026-08-22T11:20:00.000Z',
                waiting_duration_ms: 5 * 60 * 1000,
              },
      }),
  })

  await waitFor(() => clientContextCalls(calls).length > 0)

  await waitFor(() =>
    Boolean(document.querySelector('[data-yolen-waiting-state="seller_waiting_for_customer"]')),
  )

  const conversationBody = document.getElementById('conversation-body')

  conversationBody.insertAdjacentHTML(
    'beforeend',
    buildMessageHtml({
      id: 'msg-2-customer-reply',
      prePlainText: '[11:20, 21/08/2026] Cliente Teste: ',
      text: 'Ainda tem interesse na proposta?',
    }),
  )

  await waitFor(() => ingestCalls(calls).length > 0, { timeoutMs: 10000 })

  await waitFor(
    () => Boolean(document.querySelector('[data-yolen-waiting-state="customer_waiting_for_seller"]')),
    { timeoutMs: 10000 },
  )

  assert.ok(
    clientContextCalls(calls).length >= 2,
    'esperava uma nova busca de contexto depois da nova mensagem ser ingerida',
  )
})

// Cenário 5: resposta do vendedor muda o estado de espera corretamente.
test('resposta do vendedor durante a conversa muda o estado de espera para seller_waiting_for_customer', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: initialPageHtml(),
    clientContextResult: (callNumber) =>
      defaultClientContext({
        waiting:
          callNumber === 1
            ? {
                state: 'customer_waiting_for_seller',
                waiting_since: '2026-08-22T09:42:00.000Z',
                waiting_duration_ms: 30 * 60 * 1000,
              }
            : {
                state: 'seller_waiting_for_customer',
                waiting_since: '2026-08-22T10:15:00.000Z',
                waiting_duration_ms: 2 * 60 * 1000,
              },
      }),
  })

  await waitFor(() => clientContextCalls(calls).length > 0)

  await waitFor(() =>
    Boolean(document.querySelector('[data-yolen-waiting-state="customer_waiting_for_seller"]')),
  )

  const conversationBody = document.getElementById('conversation-body')

  conversationBody.insertAdjacentHTML(
    'beforeend',
    buildMessageHtml({
      id: 'msg-2-seller-reply',
      prePlainText: '[10:15, 21/08/2026] Você: ',
      text: 'Sim, posso te enviar os detalhes agora.',
      direction: 'outgoing',
    }),
  )

  await waitFor(() => ingestCalls(calls).length > 0, { timeoutMs: 10000 })

  await waitFor(
    () => Boolean(document.querySelector('[data-yolen-waiting-state="seller_waiting_for_customer"]')),
    { timeoutMs: 10000 },
  )
})

// Cenário 6: múltiplas ingestões em sequência não geram uma tempestade de
// requisições de contexto — o debounce coalesce as atualizações.
test('várias mensagens chegando em sequência não disparam uma busca de contexto por mensagem', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: initialPageHtml(),
  })

  await waitFor(() => clientContextCalls(calls).length > 0)

  const conversationBody = document.getElementById('conversation-body')

  for (let index = 0; index < 4; index += 1) {
    conversationBody.insertAdjacentHTML(
      'beforeend',
      buildMessageHtml({
        id: `msg-burst-${index}`,
        prePlainText: `[11:2${index}, 21/08/2026] Cliente Teste: `,
        text: `Mensagem ${index}`,
      }),
    )
  }

  await waitFor(() => ingestCalls(calls).length > 0, { timeoutMs: 10000 })

  // Dá tempo do debounce de refresh (500ms) assentar antes de contar.
  await waitFor(() => clientContextCalls(calls).length >= 2, { timeoutMs: 10000 })

  const totalCalls = clientContextCalls(calls).length

  assert.ok(
    totalCalls <= 3,
    `esperava no máximo poucas buscas coalescidas para 4 mensagens em rajada, recebeu ${totalCalls}`,
  )

  void document
})

// Cenário 7: troca de conversa não reaproveita o contexto da conversa
// anterior.
test('ao trocar de conversa, o card de relacionamento nunca mostra dados da conversa anterior', async () => {
  const CYCLE_A = 'cycle-conversation-a'
  const CYCLE_B = 'cycle-conversation-b'

  const { document, calls } = loadContentScript({
    initialHtml: buildWhatsAppPageHtml({
      headerTitle: HEADER_TITLE,
      messagesHtml: buildMessageHtml({
        id: 'msg-a1',
        prePlainText: '[10:15, 21/08/2026] Cliente A: ',
        text: 'Mensagem da conversa A',
      }),
    }),
    resolutionsByPhone: {
      [onlyDigits(HEADER_TITLE)]: {
        ok: true,
        status: 'OWNED_BY_ME',
        lead: { id: 'lead-a', name: 'Cliente A', phone: onlyDigits(HEADER_TITLE), email: null, cpf_cnpj: null, deleted_at: null },
        cycle: { id: CYCLE_A, status: 'contato', owner_user_id: 'user-1' },
        actions: { can_analyze_conversation: true, can_apply_suggestion: true },
        flags: { is_owned_by_me: true, is_pool: false, is_closed: false },
        phone: onlyDigits(HEADER_TITLE),
      },
      [onlyDigits(HEADER_TITLE_B)]: {
        ok: true,
        status: 'OWNED_BY_ME',
        lead: { id: 'lead-b', name: 'Cliente B', phone: onlyDigits(HEADER_TITLE_B), email: null, cpf_cnpj: null, deleted_at: null },
        cycle: { id: CYCLE_B, status: 'contato', owner_user_id: 'user-1' },
        actions: { can_analyze_conversation: true, can_apply_suggestion: true },
        flags: { is_owned_by_me: true, is_pool: false, is_closed: false },
        phone: onlyDigits(HEADER_TITLE_B),
      },
    },
    clientContextResult: (_callNumber, requestPayload) => {
      if (requestPayload?.cycle_id === CYCLE_B) {
        return defaultClientContext({
          identity: {
            company_id: 'company-1',
            cycle_id: CYCLE_B,
            conversation_key: 'whatsapp:conversation-b',
            current_status: 'contato',
          },
          waiting: {
            state: 'no_pending_response',
            waiting_since: null,
            waiting_duration_ms: null,
          },
        })
      }

      return defaultClientContext({
        identity: {
          company_id: 'company-1',
          cycle_id: CYCLE_A,
          conversation_key: 'whatsapp:conversation-a',
          current_status: 'contato',
        },
      })
    },
  })

  await waitFor(() =>
    Boolean(document.querySelector('[data-yolen-waiting-state="customer_waiting_for_seller"]')),
  )

  const headerTitleSpan = document.querySelector('header span[title]')
  const conversationBody = document.getElementById('conversation-body')

  headerTitleSpan.setAttribute('title', HEADER_TITLE_B)
  headerTitleSpan.textContent = HEADER_TITLE_B
  conversationBody.innerHTML = buildMessageHtml({
    id: 'msg-b1',
    prePlainText: '[11:30, 21/08/2026] Cliente B: ',
    text: 'Mensagem da conversa B',
  })

  await waitFor(
    () => Boolean(document.querySelector('[data-yolen-waiting-state="no_pending_response"]')),
    { timeoutMs: 10000 },
  )

  assert.equal(
    document.querySelector('[data-yolen-waiting-state="customer_waiting_for_seller"]'),
    null,
    'o card não deveria mais mostrar o estado de espera da conversa A depois da troca',
  )

  void calls
})

// Cenário 13: recuperação após erro transitório — uma falha na atualização
// em segundo plano não apaga os dados bons já exibidos, e a próxima
// ingestão confirmada recupera normalmente.
test('uma falha transitória na atualização em segundo plano preserva os dados já exibidos, e a ingestão seguinte recupera', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: initialPageHtml(),
    clientContextResult: (callNumber) => {
      if (callNumber === 1) {
        return defaultClientContext()
      }

      if (callNumber === 2) {
        return {
          ok: false,
          error: 'Falha transitória ao consultar o relacionamento.',
        }
      }

      return defaultClientContext({
        relationship: {
          first_known_interaction_at: '2026-08-05T08:00:00.000Z',
          relationship_age_ms: 17 * 24 * 60 * 60 * 1000,
          latest_customer_message_at: '2026-08-22T11:45:00.000Z',
          latest_seller_message_at: null,
          last_interaction_at: '2026-08-22T11:45:00.000Z',
          known_interaction_count: 4,
        },
      })
    },
  })

  await waitFor(() => clientContextCalls(calls).length > 0)

  await waitFor(() => {
    const card = document.querySelector('.yolen-client-relationship-card')
    return Boolean(card && /Primeiro contato/.test(card.textContent))
  })

  const conversationBody = document.getElementById('conversation-body')

  conversationBody.insertAdjacentHTML(
    'beforeend',
    buildMessageHtml({
      id: 'msg-2-triggers-failed-refresh',
      prePlainText: '[11:30, 21/08/2026] Cliente Teste: ',
      text: 'Mensagem que dispara uma atualização que vai falhar',
    }),
  )

  await waitFor(() => clientContextCalls(calls).length >= 2, { timeoutMs: 10000 })

  // A busca em segundo plano falhou: o card continua mostrando os dados
  // bons anteriores, sem virar um banner de erro.
  const cardAfterFailedRefresh = document.querySelector('.yolen-client-relationship-card')
  assert.match(cardAfterFailedRefresh.textContent, /Primeiro contato/)
  assert.equal(cardAfterFailedRefresh.querySelector('.yolen-client-relationship--error'), null)

  conversationBody.insertAdjacentHTML(
    'beforeend',
    buildMessageHtml({
      id: 'msg-3-triggers-recovery',
      prePlainText: '[11:45, 21/08/2026] Cliente Teste: ',
      text: 'Mensagem que dispara a atualização que recupera',
    }),
  )

  await waitFor(() => clientContextCalls(calls).length >= 3, { timeoutMs: 10000 })

  await waitFor(() => {
    const card = document.querySelector('.yolen-client-relationship-card')
    return Boolean(card && /Interações conhecidas/.test(card.textContent) && /4/.test(card.textContent))
  }, { timeoutMs: 10000 })
})
