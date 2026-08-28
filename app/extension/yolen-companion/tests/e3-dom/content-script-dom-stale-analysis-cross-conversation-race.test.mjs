// Frente Paralela 3 (FASE 12A) — validação adversarial da arquitetura
// progressiva do Companion.
//
// Este teste NÃO valida a nova arquitetura de background (PR A/B/C), que
// ainda não existe neste repositório. Ele documenta, contra o
// content-script.js REAL de hoje (sem modificá-lo), um cenário de condição
// de corrida que a nova arquitetura progressiva precisa resolver antes de
// introduzir qualquer job assíncrono de verdade: uma resposta de análise
// atrasada, iniciada para a conversa A, chega DEPOIS do vendedor já ter
// trocado para a conversa B.
//
// Achado da auditoria (Frente Paralela 3, sem alterar runtime):
// `analyzeCurrentConversation` (content-script.js) captura `cycleId` no
// início da função e, ao receber a resposta, aplica
// `conversationAnalysis: result.payload.data` incondicionalmente — sem
// checar se a conversa ativa ainda é a mesma para a qual a análise foi
// pedida. Isso contrasta com `loadCompanionClientContextForCurrentCycle`,
// que já implementa esse guard (`isStillCurrentContext()`) e descarta a
// resposta se a conversa mudou nesse meio tempo.
//
// Estes testes são construídos para refletir o comportamento real de hoje.
// Se algum falhar, a falha é a evidência do gap — não um teste quebrado. O
// sintoma observado hoje não é literalmente "o texto da conversa A aparece
// na tela da conversa B": é mais sutil e mais confuso para o vendedor. Como
// `conversationAnalysis` e `analyzedConversationFingerprint` são
// sobrescritos incondicionalmente com os dados/fingerprint da conversa A, e
// esse fingerprint não bate com o DOM real da conversa B,
// `isCurrentAnalysisOutdated()` passa a ser `true` — a análise correta que
// já estava na tela da conversa B é silenciosamente substituída pelo banner
// genérico "A conversa mudou desde a última leitura. Atualize a análise
// antes de usar a orientação anterior.", sem nenhuma mudança real ter
// acontecido na conversa B. Esse já é, por si só, um resultado incorreto:
// dado de uma conversa vazou para o estado interno de outra, mesmo que a UI
// não repita literalmente o texto de A.
//
// Estes testes devem virar verdes apenas quando um guard equivalente ao de
// `isStillCurrentContext()` for aplicado a `analyzeCurrentConversation`
// (dentro do escopo da Frente Principal / Frente 1, nunca desta frente). Ver
// docs/companion-v2/phase12/RACE_CONDITIONS_MATRIX.md, cenário B.
//
// Triagem do Controle Mestre (Fase 12A, sobre o PR #206): confirmado como
// BLOCKER estrutural do background foundation, a corrigir na Frente
// Principal (nunca aqui). A regra de aceite exigida é bidirecional
// ("A inicia → B abre → B analisa → A termina depois") e cobre
// explicitamente cinco pontos, cada um abaixo como um `test()` independente
// para servir de checklist de regressão quando a correção for aplicada:
// (1) análise de B, (2) fingerprint de B, (3) loading/error de B,
// (4) área ANÁLISE de B, (5) área CLIENTE de B (controle — já protegida por
// `isStillCurrentContext()`, deve continuar passando).

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildMessageHtml,
  buildWhatsAppPageHtml,
  ingestCalls,
  loadContentScript,
  waitFor,
} from '../e3-test-support/load-content-script.mjs'

const CONVERSATION_A_TITLE = '+55 11 98888-7777'
const CONVERSATION_B_TITLE = '+55 21 97777-6666'

const CYCLE_A = 'cycle-conversation-a'
const CYCLE_B = 'cycle-conversation-b'

const MARKER_A = 'MARCADOR_EXCLUSIVO_DA_CONVERSA_A_NAO_PODE_APARECER_EM_B'
const MARKER_B = 'MARCADOR_EXCLUSIVO_DA_CONVERSA_B'

const OUTDATED_BANNER = /A conversa mudou desde a última leitura/

function onlyDigits(value) {
  return String(value).replace(/\D/g, '')
}

function analysisPayloadWithSummary(summary) {
  return {
    ok: true,
    data: {
      engine_source: 'v1',
      suggestion: {
        summary,
        recommended_status: 'contato',
        tags: [],
      },
      coaching: {},
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

async function clickAnalyzeButton(document) {
  const button = await waitFor(() =>
    document.querySelector('[data-yolen-action="analyze-conversation"]'),
  )
  button.click()
}

// Monta o cenário de corrida completo: A inicia (fica pendurado) -> vendedor
// troca para B -> B analisa e responde imediatamente -> só então a resposta
// atrasada de A chega. Devolve o runtime já no estado final, pronto para
// qualquer uma das cinco verificações.
async function setupCrossConversationRace() {
  let releaseAnalysisForA
  const deferredAnalysisForA = new Promise((resolve) => {
    releaseAnalysisForA = resolve
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
    analysisResult: (requestPayload) => {
      if (requestPayload?.cycle_id === CYCLE_A) {
        return deferredAnalysisForA
      }

      return analysisPayloadWithSummary(MARKER_B)
    },
  })

  // 1. Vendedor pede análise da conversa A. A resposta fica pendurada
  // (deferredAnalysisForA) — simula um job profundo que ainda não terminou
  // quando o vendedor decide trocar de conversa.
  await clickAnalyzeButton(document)

  await waitFor(() =>
    calls.some(
      (call) =>
        call.action === 'ANALYZE_CONVERSATION' &&
        call.payload?.cycle_id === CYCLE_A,
    ),
  )

  // 2. Vendedor troca para a conversa B antes da resposta de A chegar —
  // exatamente como o WhatsApp Web faz ao trocar de chat (cabeçalho e corpo
  // da conversa mudam via mutação de DOM real).
  const headerTitleSpan = document.querySelector('header span[title]')
  const conversationBody = document.getElementById('conversation-body')

  headerTitleSpan.setAttribute('title', CONVERSATION_B_TITLE)
  headerTitleSpan.textContent = CONVERSATION_B_TITLE
  conversationBody.innerHTML = buildMessageHtml({
    id: 'msg-b1',
    prePlainText: '[11:30, 21/08/2026] Cliente B: ',
    text: 'Quero fechar o pedido ainda hoje, pode me ajudar?',
  })

  // Espera o ledger/captura da conversa B assentar antes de pedir a
  // análise, para que o fingerprint da conversa não continue mudando por
  // baixo enquanto a análise está em voo (o que marcaria a própria leitura
  // de B como desatualizada por um motivo não relacionado ao que este teste
  // quer provar).
  await waitFor(() => {
    const lastIngest = ingestCalls(calls).at(-1)
    return Boolean(
      lastIngest?.payload.messages.some((message) =>
        message.message_key?.includes('msg-b1'),
      ),
    )
  })

  // 3. Vendedor pede análise da conversa B, que responde imediatamente (o
  // job "rápido"/leitura imediata de B termina antes do job lento de A).
  await clickAnalyzeButton(document)

  await waitFor(() =>
    document.querySelector('.yolen-decision-title')?.textContent.includes(MARKER_B),
  )

  // 4. Só agora a resposta atrasada de A chega.
  releaseAnalysisForA(analysisPayloadWithSummary(MARKER_A))

  // Dá uma folga para a promise atrasada de A percorrer o `await` dentro de
  // `analyzeCurrentConversation` e qualquer `renderPanel()` resultante.
  await new Promise((resolve) => setTimeout(resolve, 50))

  return { document, calls }
}

test(
  '(1/5) análise de B não pode ser substituída pela resposta atrasada de A',
  async () => {
    const { document } = await setupCrossConversationRace()

    const nowPanelText =
      document.querySelector('.yolen-decision-title')?.textContent ?? ''

    assert.doesNotMatch(
      nowPanelText,
      new RegExp(MARKER_A),
      'a resposta atrasada da conversa A vazou para a tela da conversa B — ' +
        'resultado obsoleto sobrescreveu o estado da conversa atual',
    )

    assert.match(
      nowPanelText,
      new RegExp(MARKER_B),
      'a tela deveria continuar mostrando o resultado da conversa B, não vazio nem revertido',
    )
  },
)

test(
  '(2/5) fingerprint de B não pode ser contaminado pelo fingerprint de A',
  async () => {
    const { document } = await setupCrossConversationRace()

    const nowPanelText =
      document.querySelector('.yolen-decision-title')?.textContent ?? ''

    // O sintoma externo de fingerprint contaminado é a leitura de B ser
    // marcada como "desatualizada" sem que nada tenha realmente mudado na
    // conversa B.
    assert.doesNotMatch(
      nowPanelText,
      OUTDATED_BANNER,
      'o fingerprint da conversa B foi contaminado pelo da conversa A — ' +
        'a leitura correta de B foi falsamente marcada como desatualizada',
    )
  },
)

test(
  '(3/5) loading/error de B não pode ser alterado pela chegada tardia de A',
  async () => {
    const { document } = await setupCrossConversationRace()

    assert.equal(
      document.querySelector('[data-yolen-analysis-loading]'),
      null,
      'a chegada tardia de A não deveria deixar a conversa B presa em "carregando"',
    )

    assert.equal(
      document.querySelector('[data-yolen-analysis-error]'),
      null,
      'a chegada tardia de A não deveria colocar a conversa B em estado de erro',
    )
  },
)

test(
  '(4/5) área ANÁLISE de B não pode ser contaminada pela resposta de A',
  async () => {
    const { document } = await setupCrossConversationRace()

    // A área ANÁLISE usa os mesmos campos de estado
    // (`conversationAnalysis`/`analyzedConversationFingerprint`/
    // `conversationAnalysisError`/`conversationAnalysisLoading`) que a área
    // AGORA, mas é renderizada por um caminho de código diferente
    // (`getDetailedAnalysisAreaHtml`) — precisa da própria verificação.
    document.querySelector('[data-yolen-seller-area="analysis"]')?.click()

    const analysisPanelText =
      document.querySelector('[data-yolen-seller-panel="analysis"]')?.textContent ?? ''

    assert.doesNotMatch(
      analysisPanelText,
      new RegExp(MARKER_A),
      'a área ANÁLISE da conversa B não pode mostrar dado da conversa A',
    )

    // A área ANÁLISE usa um texto diferente da área AGORA para o mesmo
    // estado ("A conversa mudou. Atualize a leitura...", marcado com
    // `data-yolen-analysis-outdated`) — checar o atributo, não o texto
    // literal da área AGORA.
    assert.equal(
      document.querySelector('[data-yolen-analysis-outdated]'),
      null,
      'a área ANÁLISE da conversa B não pode ser marcada como desatualizada por causa de A',
    )
  },
)

test(
  '(5/5, controle) área CLIENTE de B não é afetada pela resposta de análise de A',
  async () => {
    const { document } = await setupCrossConversationRace()

    // Controle: `companionClientContext` é um estado completamente separado
    // de `conversationAnalysis`, já protegido por `isStillCurrentContext()`
    // (`loadCompanionClientContextForCurrentCycle`). Espera-se que este
    // teste já passe hoje — se falhar, o problema deixou de ser isolado ao
    // caminho de análise e passou a contaminar também o card de
    // relacionamento.
    document.querySelector('[data-yolen-seller-area="client"]')?.click()

    const clientPanelText =
      document.querySelector('[data-yolen-seller-panel="client"]')?.textContent ?? ''

    assert.doesNotMatch(
      clientPanelText,
      new RegExp(MARKER_A),
      'a área CLIENTE não deveria ser afetada pela análise de outra conversa',
    )

    assert.doesNotMatch(
      clientPanelText,
      new RegExp(MARKER_B),
      'a área CLIENTE não deveria conter texto de análise — sinal de contaminação entre estados',
    )
  },
)
