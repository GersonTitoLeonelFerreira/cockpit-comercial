// Frente Paralela 3 (FASE 12A) — validação adversarial da arquitetura
// progressiva do Companion.
//
// Cenário do mandato do Controle Mestre, seção "Registrar conversa" (item
// 13): "A gera preview -> muda para B -> A confirma" e variantes. PR #205
// já entregou "Registrar conversa"; PR #207 adicionou o guard de isolamento
// dedicado (`conversation-registration-tools.js`,
// `shouldApplyConversationRegistrationResult`), já coberto por testes de
// unidade puros em
// app/extension/yolen-companion/tests/conversation-registration-tools.test.mjs.
//
// Este teste NÃO duplica aquela cobertura de unidade — ele prova que o
// guard está de fato LIGADO à UI real: que `content-script.js`
// (não modificado) realmente invoca
// `shouldApplyConversationRegistrationResult` no momento certo e descarta
// uma resposta de preview atrasada da conversa A quando o vendedor já
// trocou para a conversa B, usando o mesmo harness/padrão do teste
// equivalente para "Analisar agora"
// (content-script-dom-stale-analysis-cross-conversation-race.test.mjs).
//
// Ao contrário daquele teste (que documenta um BLOCKER confirmado), este é
// esperado como PASS hoje — evidência positiva de que o padrão de guard já
// existe e funciona de ponta a ponta para "Registrar conversa", e é
// exatamente o padrão que falta em `analyzeCurrentConversation` (ver
// RACE_CONDITIONS_MATRIX.md, cenário B).

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildMessageHtml,
  buildWhatsAppPageHtml,
  ingestCalls,
  loadContentScript,
  previewConversationRegistrationCalls,
  waitFor,
} from '../e3-test-support/load-content-script.mjs'

const CONVERSATION_A_TITLE = '+55 11 98888-7777'
const CONVERSATION_B_TITLE = '+55 21 97777-6666'

const CYCLE_A = 'cycle-conversation-a'
const CYCLE_B = 'cycle-conversation-b'

const MARKER_A = 'RESUMO_EXCLUSIVO_DA_CONVERSA_A_NAO_PODE_APARECER_EM_B'
const MARKER_B = 'RESUMO_EXCLUSIVO_DA_CONVERSA_B'

function onlyDigits(value) {
  return String(value).replace(/\D/g, '')
}

function previewPayloadWithSummary(summary) {
  return {
    ok: true,
    data: {
      summary_text: summary,
      watermark: `watermark-${summary}`,
      confirmation_token: `token-${summary}`,
      message_count: 3,
      occurred_at: '2026-08-23T12:00:00.000Z',
      already_registered: false,
    },
  }
}

function initialPageHtmlForConversationA() {
  return buildWhatsAppPageHtml({
    headerTitle: CONVERSATION_A_TITLE,
    messagesHtml: buildMessageHtml({
      id: 'msg-a1',
      prePlainText: '[10:15, 21/08/2026] Cliente A: ',
      text: 'Preciso entender melhor como funciona o plano antes de decidir.',
    }),
  })
}

function leadResolutionFor({ cycleId, phoneDigits }) {
  return {
    ok: true,
    status: 'OWNED_BY_ME',
    lead: {
      id: `lead-${cycleId}`,
      name: `Cliente ${cycleId}`,
      phone: phoneDigits,
      email: null,
      cpf_cnpj: null,
      deleted_at: null,
    },
    cycle: { id: cycleId, status: 'contato', owner_user_id: 'user-1' },
    actions: { can_analyze_conversation: true, can_apply_suggestion: true },
    flags: { is_owned_by_me: true, is_pool: false, is_closed: false },
    phone: phoneDigits,
  }
}

async function clickRegisterConversationButton(document) {
  const button = await waitFor(() =>
    document.querySelector('[data-yolen-action="register-conversation"]'),
  )
  button.click()
}

test(
  'preview atrasado de "Registrar conversa" da conversa A não pode aparecer depois que o vendedor já trocou para a conversa B',
  async () => {
    let releasePreviewForA
    const deferredPreviewForA = new Promise((resolve) => {
      releasePreviewForA = resolve
    })

    const { document, calls } = loadContentScript({
      initialHtml: initialPageHtmlForConversationA(),
      resolutionsByPhone: {
        [onlyDigits(CONVERSATION_A_TITLE)]: leadResolutionFor({
          cycleId: CYCLE_A,
          phoneDigits: onlyDigits(CONVERSATION_A_TITLE),
        }),
        [onlyDigits(CONVERSATION_B_TITLE)]: leadResolutionFor({
          cycleId: CYCLE_B,
          phoneDigits: onlyDigits(CONVERSATION_B_TITLE),
        }),
      },
      previewConversationRegistrationResult: (requestPayload) => {
        if (requestPayload?.cycle_id === CYCLE_A) {
          return deferredPreviewForA
        }

        return previewPayloadWithSummary(MARKER_B)
      },
    })

    // 1. Vendedor clica "Registrar conversa" em A. A resposta fica
    // pendurada — simula o resumo (gerado por IA) ainda em voo quando o
    // vendedor decide trocar de conversa.
    await clickRegisterConversationButton(document)

    await waitFor(() =>
      previewConversationRegistrationCalls(calls).some(
        (call) => call.payload?.cycle_id === CYCLE_A,
      ),
    )

    // 2. Vendedor troca para a conversa B antes da resposta de A chegar.
    const headerTitleSpan = document.querySelector('header span[title]')
    const conversationBody = document.getElementById('conversation-body')

    headerTitleSpan.setAttribute('title', CONVERSATION_B_TITLE)
    headerTitleSpan.textContent = CONVERSATION_B_TITLE
    conversationBody.innerHTML = buildMessageHtml({
      id: 'msg-b1',
      prePlainText: '[11:30, 21/08/2026] Cliente B: ',
      text: 'Quero fechar o pedido ainda hoje, pode me ajudar?',
    })

    await waitFor(() => {
      const lastIngest = ingestCalls(calls).at(-1)
      return Boolean(
        lastIngest?.payload.messages.some((message) =>
          message.message_key?.includes('msg-b1'),
        ),
      )
    })

    // 3. Vendedor clica "Registrar conversa" em B, que responde
    // imediatamente.
    await clickRegisterConversationButton(document)

    await waitFor(() =>
      document
        .querySelector('.yolen-conversation-registration-card')
        ?.textContent.includes(MARKER_B),
    )

    // 4. Só agora o preview atrasado de A chega.
    releasePreviewForA(previewPayloadWithSummary(MARKER_A))

    // Folga para a promise atrasada de A percorrer o `await` dentro de
    // `registerCurrentConversation` e qualquer `renderPanel()` resultante.
    await new Promise((resolve) => setTimeout(resolve, 50))

    const registrationCardText =
      document.querySelector('.yolen-conversation-registration-card')?.textContent ?? ''

    assert.doesNotMatch(
      registrationCardText,
      new RegExp(MARKER_A),
      'o preview atrasado da conversa A vazou para o card de registro da conversa B — ' +
        'o guard shouldApplyConversationRegistrationResult não impediu a aplicação',
    )

    assert.match(
      registrationCardText,
      new RegExp(MARKER_B),
      'o card de registro deveria continuar mostrando o preview da conversa B',
    )

    // O botão "Confirmar registro" só aparece com um preview válido para a
    // conversa atual — confirma que o estado de B não foi perdido nem
    // corrompido pela chegada tardia de A.
    assert.ok(
      document.querySelector('[data-yolen-action="confirm-conversation-registration"]'),
      'o botão de confirmar registro da conversa B deveria continuar disponível',
    )
  },
)
