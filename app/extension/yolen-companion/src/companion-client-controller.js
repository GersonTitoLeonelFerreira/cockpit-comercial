;(function initYolenCompanionClientController(root) {
function createCompanionClientController(ctx) {
  // Dependências explícitas do Core (funções e referências estáveis).
  // Estado mutável do Core é lido via ctx.<nome> no momento do uso.
  const {
    clientContextViewTools,
    extractStatefulCommercialReading,
    getCanonicalResolutionCycleId,
    getCaptureConversationKey,
    getCurrentConversationFingerprint,
    loadAgoraDecisionStateForCurrentCycle,
    renderPanel,
  } = ctx
  // Dependências de outros controllers do Core: lidas via ctx no momento
  // da chamada (os controllers são criados em sequência).

  // Depois que uma captura é persistida com sucesso para a conversa aberta,
  // um pequeno debounce antes de rebuscar o contexto operacional do
  // cliente — coalesce múltiplas ingestões próximas (ex.: várias mensagens
  // chegando em sequência) numa única requisição, em vez de uma por
  // mensagem.
  const COMPANION_CLIENT_CONTEXT_REFRESH_DELAY_MS = 500
  // Campos puramente derivados do relógio (tempo de espera, risco de SLA)
  // precisam continuar corretos mesmo sem nenhuma mensagem nova chegar —
  // este intervalo só re-renderiza o painel com os dados já carregados
  // (recalculando localmente a partir de `generated_at`), sem nenhuma
  // chamada de rede nova.
  const COMPANION_CLIENT_CONTEXT_TICK_INTERVAL_MS = 60000
  let companionClientContextTickTimerId = 0
  let companionClientContextRefreshTimerId = 0
  // FASE 16.7 — mesmo padrão acima, para o CLIENTE seller-facing view
  // model.
  let customerViewModelRequestSequence = 0

  // CLIENTE representa conhecimento acumulado sobre o cliente ("o que já
  // sabemos"), não um indicador de execução ao vivo — diferente de ANÁLISE/
  // AGORA, que legitimamente precisam refletir só a tentativa corrente.
  // Toda nova tentativa de análise (automática por nova mensagem, ou
  // manual) zera conversationAnalysis de imediato, antes mesmo de saber se
  // vai suceder — então, sem este snapshot, uma leitura comercial válida
  // desaparece de CLIENTE a cada re-análise em voo e permanece perdida se
  // essa nova tentativa falhar, mesmo sem nenhuma mensagem nova que a
  // invalidasse de fato. getLastKnownClientCommercialReading() devolve o
  // último resultado promovido com sucesso, mas só quando TODA a
  // identidade que originou aquele resultado (company/cycle/conversation)
  // ainda bate com o contexto atual — reavaliado a cada renderPanel(), sem
  // esperar uma análise nova terminar. Isto cobre um caso que
  // hardResetConversationWorkspace() (troca real de aba/conversa) não
  // cobre: a MESMA conversation_key ser resolvida para um cycle_id
  // diferente (ex.: resolveCurrentLead() encontrando um ciclo novo para o
  // mesmo lead), o que não é uma "troca de conversa" no sentido de DOM/
  // captura, mas muda de quem estamos falando comercialmente. O
  // fingerprint sozinho não protege esse caso: mensagens idênticas podem
  // continuar visíveis enquanto o ciclo por trás delas mudou.
  function getLastKnownClientCommercialReading() {
    const snapshot =
      ctx.state.lastKnownCommercialReading

    const context =
      ctx.state.lastKnownCommercialReadingContext

    if (!snapshot || !context) {
      return null
    }

    const currentCycleId =
      getCanonicalResolutionCycleId() ||
      null

    const currentConversationKey =
      getCaptureConversationKey()

    const currentCompanyId =
      ctx.state.companyId ||
      null

    if (
      context.cycleId !==
        currentCycleId ||
      context.conversationKey !==
        currentConversationKey ||
      context.companyId !==
        currentCompanyId
    ) {
      return null
    }

    const currentFingerprint =
      getCurrentConversationFingerprint()

    if (
      currentFingerprint &&
      currentFingerprint !==
        context.fingerprint
    ) {
      return null
    }

    return snapshot
  }

  // Chamado só nos pontos em que uma análise stateful válida acabou de ser
  // aplicada a state.conversationAnalysis (sucesso do polling profundo e
  // sucesso da resposta rápida V1/shadow) — nunca em erro/loading/timeout,
  // então nunca grava lixo por cima de um snapshot bom anterior. Toda a
  // identidade gravada (companyId/cycleId/conversationKey) é a da
  // REQUISIÇÃO que originou este resultado (companyIdAtRequest/cycleId/
  // conversationKeyAtRequest capturados no início de
  // analyzeCurrentConversation(), nunca relidos tarde demais de state) —
  // inclusive companyId: reler state.companyId aqui, no momento da
  // promoção, poderia gravar um resultado iniciado na empresa A com a
  // identidade da empresa B se a sessão ativa tivesse mudado enquanto o
  // job ainda estava em voo. Na prática isAnalysisResponseStillCurrent()
  // já barra esse caso antes de chegar aqui, mas a identidade gravada não
  // pode depender só dessa checagem anterior.
  function rememberLastKnownClientCommercialReadingIfPresent({
    fingerprint,
    cycleId,
    conversationKey,
    companyId,
    analysis =
      ctx.state
        .conversationAnalysis,
  }) {
    const reading =
      extractStatefulCommercialReading(
        analysis,
      )

    if (
      !reading ||
      !fingerprint ||
      !cycleId ||
      !conversationKey
    ) {
      return {}
    }

    return {
      lastKnownCommercialReading: reading,
      lastKnownCommercialReadingContext: {
        companyId:
          companyId ||
          null,
        cycleId,
        conversationKey,
        fingerprint,
      },
    }
  }

  // Inteligência operacional do cliente (histórico da relação, tempo de
  // resposta, quem está aguardando quem, risco por demora). Deliberadamente
  // independente da análise semântica acima: não depende da IA nem do
  // estado `conversationAnalysis` — é buscada e renderizada à parte, a
  // partir de fatos determinísticos do banco (ver
  // app/api/companion/client-context).
  function clearCompanionClientContextRefreshTimer() {
    if (
      companionClientContextRefreshTimerId
    ) {
      window.clearTimeout(
        companionClientContextRefreshTimerId,
      )

      companionClientContextRefreshTimerId = 0
    }
  }

  // Sinal real de "a captura foi persistida", disparado por
  // runCaptureIngestion() após rememberSuccessfulCapture() — não um sleep
  // arbitrário. Corrige tanto a primeira leitura (que pode ter ocorrido
  // sobre um ledger ainda vazio, antes da ingestão terminar) quanto
  // qualquer leitura posterior (nova mensagem chegando durante a
  // conversa): as duas situações são, no fundo, "o contexto pode estar
  // desatualizado porque uma ingestão acabou de confirmar". O pequeno
  // debounce evita uma requisição por mensagem quando várias chegam em
  // sequência.
  function notifyCaptureIngestedForClientContext(
    contextKey,
  ) {
    const cycleId =
      getCanonicalResolutionCycleId()

    const conversationKey =
      getCaptureConversationKey()

    if (!cycleId || !conversationKey) {
      return
    }

    const currentContextKey = [
      cycleId,
      conversationKey,
    ].join('::')

    if (
      currentContextKey !==
      contextKey
    ) {
      return
    }

    clearCompanionClientContextRefreshTimer()

    companionClientContextRefreshTimerId =
      window.setTimeout(() => {
        companionClientContextRefreshTimerId = 0

        void loadCompanionClientContextForCurrentCycle(
          {
            force: true,
          },
        )

        // A captura canônica confirmada pode alterar o working summary.
        // O cache é invalidado no wrapper de ingestão e este refresh
        // debounced evita manter na tela um resumo anterior ao novo lote.
        void ctx.loadCompanionLeadSummaryForCurrentCycle()

        // FASE 16.5 (achado do Codex, rodada 2): uma mensagem nova pode
        // criar ou alterar um sinal operacional que Decision State usa
        // (ex.: cliente passou a aguardar resposta) sem que nenhuma nova
        // análise semântica tenha rodado — sem este refresh, AGORA
        // ficaria presa na decisão calculada antes da mensagem chegar
        // até a próxima análise bem-sucedida (que pode nunca acontecer
        // se o vendedor não reanalisar manualmente).
        void loadAgoraDecisionStateForCurrentCycle({
          force: true,
        })

        // FASE 16.6 — mesmo raciocínio: um novo compromisso, objeção ou
        // sinal de condução pode mudar sem nenhuma reanálise semântica
        // ter rodado ainda (ex.: ledger de mensagens/mutações do ciclo
        // afetando Cycle Memory diretamente).
        void ctx.loadAnalysisViewModelForCurrentCycle({
          force: true,
        })

        // FASE 16.7 — mesmo raciocínio para CLIENTE: uma preferência,
        // padrão de comunicação ou lacuna de descoberta pode mudar sem
        // nenhuma reanálise semântica manual ter rodado ainda.
        void loadCustomerViewModelForCurrentCycle({
          force: true,
        })
      }, COMPANION_CLIENT_CONTEXT_REFRESH_DELAY_MS)
  }

  async function loadCompanionClientContextForCurrentCycle(
    options = {},
  ) {
    const force =
      options.force === true

    const cycleId =
      getCanonicalResolutionCycleId()

    const conversationKey =
      getCaptureConversationKey()

    if (!cycleId || !conversationKey) {
      ctx.state = {
        ...ctx.state,
        companionClientContext: {
          status: 'idle',
        },
        companionClientContextCycleId:
          null,
        companionClientContextConversationKey:
          null,
      }

      renderPanel()
      return
    }

    const isSameContext =
      ctx.state.companionClientContextCycleId ===
        cycleId &&
      ctx.state.companionClientContextConversationKey ===
        conversationKey

    const alreadyReady =
      isSameContext &&
      ctx.state.companionClientContext
        ?.status === 'ready'

    if (alreadyReady && !force) {
      return
    }

    // Uma atualização forçada sobre dados já prontos (nova ingestão
    // confirmada, tick periódico) acontece em silêncio: o cartão continua
    // mostrando os últimos dados válidos em vez de piscar para o estado de
    // carregamento a cada mensagem nova. Só a primeiríssima busca de um
    // ciclo (ou uma busca depois de erro/idle) mostra o estado de
    // carregamento.
    const showLoadingState = !alreadyReady

    if (showLoadingState) {
      ctx.state = {
        ...ctx.state,
        companionClientContext: {
          status: 'loading',
        },
        companionClientContextCycleId:
          cycleId,
        companionClientContextConversationKey:
          conversationKey,
      }

      renderPanel()
    } else {
      ctx.state = {
        ...ctx.state,
        companionClientContextCycleId:
          cycleId,
        companionClientContextConversationKey:
          conversationKey,
      }
    }

    const isStillCurrentContext =
      () =>
        ctx.state.companionClientContextCycleId ===
          cycleId &&
        ctx.state.companionClientContextConversationKey ===
          conversationKey

    try {
      const result =
        await window.YolenCompanionApi
          .loadClientContext({
            cycle_id: cycleId,
            conversation_key:
              conversationKey,
          })

      if (!isStillCurrentContext()) {
        return
      }

      if (
        !result?.ok ||
        !result.payload?.ok
      ) {
        if (!alreadyReady) {
          ctx.state = {
            ...ctx.state,
            companionClientContext: {
              status: 'error',
              error:
                result?.payload
                  ?.error ||
                'Não foi possível carregar o relacionamento com o cliente.',
            },
          }

          renderPanel()
        }

        // Atualização em segundo plano que falhou: mantém os dados bons
        // já exibidos em vez de substituí-los por um erro por causa de uma
        // falha transitória — a próxima ingestão/tick tenta de novo.
        return
      }

      ctx.state = {
        ...ctx.state,
        companionClientContext: {
          status: 'ready',
          data: result.payload.data,
        },
      }

      renderPanel()
    } catch (error) {
      if (!isStillCurrentContext()) {
        return
      }

      if (!alreadyReady) {
        ctx.state = {
          ...ctx.state,
          companionClientContext: {
            status: 'error',
            error:
              error instanceof Error &&
              error.message
                ? error.message
                : 'Não foi possível carregar o relacionamento com o cliente.',
          },
        }

        renderPanel()
      }
    }
  }

  // FASE 16.7 — CLIENTE seller-facing view model (Commercial Reading
  // canônica atual, traduzida por app/lib/server/customer-view-model.ts).
  // Mesmo desenho de ctx.loadAnalysisViewModelForCurrentCycle acima (FASE
  // 16.6) — três estados, requestSequence monotônico contra respostas
  // stale, e guard de escopo por cycleId/conversationKey/companyId
  // aplicado desde o início (mandato FASE 16.7 §33/§34: cross-
  // conversation/cross-company stale render é o mesmo risco de
  // segurança em qualquer aba seller-facing, e para CLIENTE é
  // explicitamente safety-critical).
  async function loadCustomerViewModelForCurrentCycle(
    options = {},
  ) {
    const force =
      options.force === true

    const requestSequence =
      ++customerViewModelRequestSequence

    const cycleId =
      getCanonicalResolutionCycleId()

    const conversationKey =
      getCaptureConversationKey()

    const companyIdAtRequest =
      ctx.state.companyId ||
      null

    if (!cycleId || !conversationKey) {
      ctx.state = {
        ...ctx.state,
        customerViewModel: {
          status: 'idle',
        },
        customerViewModelCycleId:
          null,
        customerViewModelConversationKey:
          null,
        customerViewModelCompanyId:
          null,
      }

      renderPanel()
      return
    }

    const isSameContext =
      ctx.state.customerViewModelCycleId ===
        cycleId &&
      ctx.state.customerViewModelConversationKey ===
        conversationKey &&
      ctx.state.customerViewModelCompanyId ===
        companyIdAtRequest

    const alreadyReady =
      isSameContext &&
      ctx.state.customerViewModel
        ?.status === 'ready'

    if (alreadyReady && !force) {
      return
    }

    ctx.state = {
      ...ctx.state,
      customerViewModelCycleId:
        cycleId,
      customerViewModelConversationKey:
        conversationKey,
      customerViewModelCompanyId:
        companyIdAtRequest,
    }

    const isStillCurrentContext =
      () =>
        requestSequence ===
          customerViewModelRequestSequence &&
        ctx.state.customerViewModelCycleId ===
          cycleId &&
        ctx.state.customerViewModelConversationKey ===
          conversationKey &&
        ctx.state.customerViewModelCompanyId ===
          companyIdAtRequest &&
        companyIdAtRequest ===
          (
            ctx.state.companyId ||
            null
          )

    try {
      const result =
        await window.YolenCompanionApi
          .loadCustomerViewModel({
            cycle_id: cycleId,
            conversation_key:
              conversationKey,
          })

      if (!isStillCurrentContext()) {
        return
      }

      if (
        !result?.ok ||
        !result.payload?.ok
      ) {
        if (!alreadyReady) {
          ctx.state = {
            ...ctx.state,
            customerViewModel: {
              status: 'idle',
            },
          }

          renderPanel()
        }

        return
      }

      ctx.state = {
        ...ctx.state,
        customerViewModel: {
          status: 'ready',
          data: result.payload.data,
        },
      }

      renderPanel()
    } catch {
      if (!isStillCurrentContext()) {
        return
      }

      if (!alreadyReady) {
        ctx.state = {
          ...ctx.state,
          customerViewModel: {
            status: 'idle',
          },
        }

        renderPanel()
      }
    }
  }

  function getCompanionClientRelationshipCardHtml() {
    if (
      ctx.state.companionClientContext
        ?.status === 'idle'
    ) {
      return ''
    }

    return `
      <div class="yolen-card yolen-client-relationship-card">
        <div class="yolen-section-label">
          Relacionamento e histórico
        </div>

        ${clientContextViewTools.renderClientContextSection(
          ctx.state.companionClientContext,
          Date.now(),
        )}
      </div>
    `
  }

  function startCompanionClientContextTicker() {
    if (companionClientContextTickTimerId) {
      window.clearInterval(
        companionClientContextTickTimerId,
      )
    }

    companionClientContextTickTimerId =
      window.setInterval(() => {
        if (
          ctx.state.companionClientContext
            ?.status === 'ready'
        ) {
          renderPanel()
        }

        // FASE 16.5 (achado do Codex, rodada 2): ao contrário do
        // client-context (cujo tempo decorrido a própria UI recalcula
        // localmente a cada render), o AGORA seller-facing view model é
        // uma fotografia do servidor — sem um refetch periódico, um SLA
        // que evolui de médio para alto (ou um cliente que passa a
        // aguardar por tempo suficiente) puramente pela passagem do
        // tempo, sem nenhuma mensagem nova nem reanálise, deixaria AGORA
        // presa na decisão antiga indefinidamente. Só refaz a busca
        // quando já existe um AGORA carregado (não força a primeira
        // busca por aqui, isso já é responsabilidade dos outros dois
        // pontos de disparo).
        if (
          ctx.state.agoraDecisionState
            ?.status === 'ready'
        ) {
          void loadAgoraDecisionStateForCurrentCycle({
            force: true,
          })
        }

        // FASE 16.6 — mesmo raciocínio de AGORA acima: ANÁLISE também é
        // uma fotografia do servidor (Integrated Commercial Context),
        // não recalculada ao vivo no cliente.
        if (
          ctx.state.analysisViewModel
            ?.status === 'ready'
        ) {
          void ctx.loadAnalysisViewModelForCurrentCycle({
            force: true,
          })
        }

        // FASE 16.7 — mesmo raciocínio para CLIENTE: também é uma
        // fotografia do servidor (Commercial Reading canônica atual).
        if (
          ctx.state.customerViewModel
            ?.status === 'ready'
        ) {
          void loadCustomerViewModelForCurrentCycle({
            force: true,
          })
        }
      }, COMPANION_CLIENT_CONTEXT_TICK_INTERVAL_MS)
  }

  return {
    getLastKnownClientCommercialReading,
    rememberLastKnownClientCommercialReadingIfPresent,
    clearCompanionClientContextRefreshTimer,
    notifyCaptureIngestedForClientContext,
    loadCompanionClientContextForCurrentCycle,
    loadCustomerViewModelForCurrentCycle,
    getCompanionClientRelationshipCardHtml,
    startCompanionClientContextTicker,
  }
}

const api = Object.freeze({
  create: createCompanionClientController,
})

root.YolenCompanionClientController = api

if (
  typeof module !== 'undefined' &&
  module.exports
) {
  module.exports = api
}
})(
  typeof globalThis !== 'undefined'
    ? globalThis
    : window,
)
