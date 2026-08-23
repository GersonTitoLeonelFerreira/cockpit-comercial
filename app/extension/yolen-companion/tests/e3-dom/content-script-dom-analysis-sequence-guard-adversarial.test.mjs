// Frente Paralela 3 (FASE 12A) — validação adversarial independente do
// sequence guard entregue pelo PR #208
// (fix(companion): isola resposta de analise por contexto de conversa (A->B),
// commit 8599d0a8c3b88917327556e789e2b32c9bca73dd).
//
// Este arquivo é INDEPENDENTE dos testes do próprio PR #208
// (content-script-dom-analysis-context-guard.test.mjs) e do teste original
// desta frente (content-script-dom-stale-analysis-cross-conversation-race.test.mjs)
// — cobre dois sub-cenários do guard que nenhum dos dois exercita:
//
// 1. Uma tentativa ANTIGA que termina em ERRO chegando depois de uma
//    tentativa mais NOVA que já teve sucesso — o guard
//    (isAnalysisResponseStillCurrent()) também é checado no bloco `catch`
//    de analyzeCurrentConversation(), mas nenhum teste existente prova isso
//    com uma execução real: só a variante "sucesso antigo vs. sucesso novo"
//    tinha teste.
// 2. Uma tentativa ANTIGA com resultado comercial (CTA/mensagem sugerida)
//    chegando depois de uma tentativa mais NOVA, da MESMA conversa, cujo
//    resultado já é neutro/sem CTA — prova que o guard não distingue por
//    "tipo de conteúdo" (não é uma regra semântica de negócio, é puramente
//    sequência + identidade de contexto), então uma resposta comercial
//    velha não pode reintroduzir uma sugestão sobre um estado que a
//    resposta mais nova já neutralizou.
//
// Ambos os testes usam o mesmo padrão real de UI que o PR #208 já usa para
// conseguir duas requisições em voo na MESMA conversa (o botão "Analisar
// agora" some enquanto `conversationAnalysisLoading` é true; sair da
// conversa e voltar zera esse estado via `clearLeadStateForNewConversation`
// e reexibe o botão, permitindo uma segunda análise real enquanto a
// primeira ainda não respondeu).

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildMessageHtml,
  buildWhatsAppPageHtml,
  ingestCalls,
  loadContentScript,
  resolveLeadCalls,
  waitFor,
} from '../e3-test-support/load-content-script.mjs'

const CONVERSATION_A_TITLE = '+55 11 98888-7777'
const CONVERSATION_B_TITLE = '+55 21 97777-6666'

const CYCLE_A = 'cycle-conversation-a'
const CYCLE_B = 'cycle-conversation-b'

function onlyDigits(value) {
  return String(value).replace(/\D/g, '')
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

function successPayload(summary) {
  return {
    ok: true,
    data: {
      suggestion: {
        summary,
        recommended_status: null,
        confidence: 0.5,
        next_action: null,
        next_action_date: null,
      },
      coaching: null,
    },
  }
}

function errorPayload(message) {
  return {
    ok: false,
    error: message,
  }
}

function initialPageHtml() {
  return buildWhatsAppPageHtml({
    headerTitle: CONVERSATION_A_TITLE,
    messagesHtml: buildMessageHtml({
      id: 'msg-a1',
      prePlainText: '[10:00, 21/08/2026] Cliente A: ',
      text: 'Quero entender melhor as condições antes de decidir.',
    }),
  })
}

async function clickAnalyzeButton(document) {
  const button = await waitFor(() =>
    document.querySelector('[data-yolen-action="analyze-conversation"]'),
  )
  button.click()
}

async function switchConversationAndWait({ document, calls, title, messageId, prePlainText, text }) {
  const headerTitleSpan = document.querySelector('header span[title]')
  const conversationBody = document.getElementById('conversation-body')

  const resolveLeadCountBefore = resolveLeadCalls(calls).length

  headerTitleSpan.setAttribute('title', title)
  headerTitleSpan.textContent = title
  conversationBody.innerHTML = buildMessageHtml({ id: messageId, prePlainText, text })

  await waitFor(() => resolveLeadCalls(calls).length > resolveLeadCountBefore)
  await waitFor(() => {
    const lastIngest = ingestCalls(calls).at(-1)
    return Boolean(
      lastIngest?.payload.messages.some((message) => message.message_key?.includes(messageId)),
    )
  })
}

// Sai para B e volta para A — zera `conversationAnalysisLoading` (via
// `clearLeadStateForNewConversation`) sem esperar a análise pendente de A
// resolver, permitindo uma segunda análise real da mesma conversa A. Espera
// resolveLeadCalls e ingestCalls confirmarem CADA troca antes de seguir
// para a próxima (mesmo padrão usado por goToConversationB em
// content-script-dom-analysis-context-guard.test.mjs, do PR #208).
async function leaveAndReturnToConversationA({ document, calls }) {
  await switchConversationAndWait({
    document,
    calls,
    title: CONVERSATION_B_TITLE,
    messageId: 'msg-b1',
    prePlainText: '[10:05, 21/08/2026] Cliente B: ',
    text: 'Oi, queria saber o horário de atendimento.',
  })

  await switchConversationAndWait({
    document,
    calls,
    title: CONVERSATION_A_TITLE,
    messageId: 'msg-a2',
    prePlainText: '[10:10, 21/08/2026] Cliente A: ',
    text: 'Ainda estou aqui, alguma novidade?',
  })
}

test(
  '(1/2) erro de uma tentativa antiga não pode sobrescrever um sucesso mais novo já aplicado (mesma conversa)',
  async () => {
    let resolveFirstAttempt
    const firstAttemptGate = new Promise((resolve) => {
      resolveFirstAttempt = resolve
    })

    let callCount = 0

    const { document, calls } = loadContentScript({
      initialHtml: initialPageHtml(),
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
      analysisResult: async (requestPayload) => {
        if (requestPayload?.cycle_id !== CYCLE_A) {
          return successPayload('IRRELEVANTE_B')
        }

        callCount += 1

        if (callCount === 1) {
          await firstAttemptGate
          return errorPayload('Falha antiga que não deveria mais importar.')
        }

        return successPayload('SUCESSO_NOVO_DEVE_PREVALECER')
      },
    })

    // 1ª tentativa de A: fica presa (nunca resolve até liberarmos no fim).
    await clickAnalyzeButton(document)
    await waitFor(() =>
      calls.some(
        (call) =>
          call.action === 'ANALYZE_CONVERSATION' && call.payload?.cycle_id === CYCLE_A,
      ),
    )

    // Sai e volta para A — zera o loading, botão reaparece.
    await leaveAndReturnToConversationA({ document, calls })

    // 2ª tentativa de A: responde com sucesso rápido.
    await clickAnalyzeButton(document)
    await waitFor(() =>
      document
        .querySelector('[data-yolen-seller-panel="now"]')
        ?.textContent.includes('SUCESSO_NOVO_DEVE_PREVALECER'),
    )

    // Só agora a 1ª tentativa (presa desde o início) finalmente termina em
    // ERRO.
    resolveFirstAttempt()
    await new Promise((resolve) => setTimeout(resolve, 100))

    const nowPanelText =
      document.querySelector('[data-yolen-seller-panel="now"]')?.textContent ?? ''

    assert.match(
      nowPanelText,
      /SUCESSO_NOVO_DEVE_PREVALECER/,
      'o sucesso mais novo deveria continuar na tela',
    )

    assert.doesNotMatch(
      nowPanelText,
      /Falha antiga que não deveria mais importar/,
      'um erro de uma tentativa antiga não pode sobrescrever um sucesso já aplicado de uma tentativa mais nova',
    )

    assert.equal(
      document.querySelector('[data-yolen-analysis-error]'),
      null,
      'a chegada tardia do erro antigo não pode colocar a conversa em estado de erro depois de um sucesso mais novo',
    )
  },
)

test(
  '(2/2) sucesso comercial de uma tentativa antiga não reintroduz sugestão sobre um resultado mais novo sem evidência comercial (mesma conversa)',
  async () => {
    let resolveFirstAttempt
    const firstAttemptGate = new Promise((resolve) => {
      resolveFirstAttempt = resolve
    })

    let callCount = 0

    const { document, calls } = loadContentScript({
      initialHtml: initialPageHtml(),
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
      analysisResult: async (requestPayload) => {
        if (requestPayload?.cycle_id !== CYCLE_A) {
          return successPayload('IRRELEVANTE_B')
        }

        callCount += 1

        if (callCount === 1) {
          await firstAttemptGate
          // Resultado comercial "antigo" — como se a 1ª leitura tivesse
          // visto evidência comercial que, entre as duas tentativas,
          // deixou de se sustentar (ex.: mensagem reinterpretada/removida).
          return successPayload('CTA_COMERCIAL_ANTIGO_NAO_PODE_VOLTAR')
        }

        // Resultado mais novo: sem evidência comercial (silêncio
        // operacional), mesmo padrão usado por buildCommerciallyInactiveSuggestion.
        return successPayload(
          'Conversa sem evidência comercial relevante para este ciclo.',
        )
      },
    })

    await clickAnalyzeButton(document)
    await waitFor(() =>
      calls.some(
        (call) =>
          call.action === 'ANALYZE_CONVERSATION' && call.payload?.cycle_id === CYCLE_A,
      ),
    )

    await leaveAndReturnToConversationA({ document, calls })

    await clickAnalyzeButton(document)
    await waitFor(() =>
      document
        .querySelector('[data-yolen-seller-panel="now"]')
        ?.textContent.includes('Conversa sem evidência comercial relevante'),
    )

    // Só agora a 1ª tentativa (com CTA comercial) finalmente chega.
    resolveFirstAttempt()
    await new Promise((resolve) => setTimeout(resolve, 100))

    const nowPanelText =
      document.querySelector('[data-yolen-seller-panel="now"]')?.textContent ?? ''

    assert.doesNotMatch(
      nowPanelText,
      /CTA_COMERCIAL_ANTIGO_NAO_PODE_VOLTAR/,
      'um resultado comercial de uma tentativa antiga não pode reintroduzir CTA depois que a tentativa mais nova já neutralizou',
    )

    assert.match(
      nowPanelText,
      /Conversa sem evidência comercial relevante/,
      'o resultado neutro mais novo deveria continuar sendo o que a tela mostra',
    )
  },
)
