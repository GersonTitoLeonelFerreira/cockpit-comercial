;(function initYolenCompanionLeadCreationController(root) {
function createCompanionLeadCreationController(ctx) {
  // Dependências explícitas do Core (funções e referências estáveis).
  // Estado mutável do Core é lido via ctx.<nome> no momento do uso.
  const {
    escapeHtml,
    renderPanel,
    resolveCurrentLead,
    sleep,
  } = ctx
  // Idempotência determinística de createLead por conversa: nenhum clique
  // duplicado/triplo pode gerar uma segunda requisição CREATE_LEAD
  // enquanto a primeira ainda está em voo para a MESMA conversationKey.
  const leadCreationInFlightKeys =
    new Set()

  function getLeadCreationStatusHtml(message, tone) {
    return `
      <div class="yolen-lead-create-status" data-tone="${escapeHtml(tone)}">
        ${escapeHtml(message)}
      </div>
    `
  }

  function getLeadActionButton() {
    if (ctx.state.isSelfConversation) {
      return ''
    }

    // O estado de criação de lead (creating/created_resolving/error) só
    // pode ser aplicado à região "Conversa" se ele pertencer à conversa
    // ATUAL — se o vendedor já trocou de conversa, leadCreationConversationKey
    // não bate mais com state.conversationKey e este bloco fica inerte
    // (hardResetConversationWorkspace() já zera os dois campos numa
    // troca real, isto aqui é uma segunda trava de segurança).
    const creationBelongsToCurrentConversation =
      Boolean(ctx.state.conversationKey) &&
      ctx.state.leadCreationConversationKey === ctx.state.conversationKey

    if (creationBelongsToCurrentConversation) {
      if (ctx.state.leadCreationStatus === 'creating') {
        return getLeadCreationStatusHtml(
          'Criando lead na Yolen...',
          'loading',
        )
      }

      if (ctx.state.leadCreationStatus === 'created_resolving') {
        return getLeadCreationStatusHtml(
          'Lead criado. Atualizando o vínculo...',
          'success',
        )
      }

      // O backend já confirmou a criação — nunca pode voltar a mostrar o
      // formulário/botão "Criar lead" (permitiria um segundo create do
      // mesmo lead). Só uma reconsulta manual (RESOLVE, nunca CREATE) pode
      // sair daqui — ver retryLeadLinkAfterCreation().
      if (ctx.state.leadCreationStatus === 'created_unresolved') {
        return `
          <div class="yolen-lead-create-status" data-tone="warning">
            Lead criado, mas o vínculo ainda não foi atualizado.
          </div>
          <button class="yolen-secondary-button" type="button" data-yolen-action="retry-lead-link">
            Atualizar vínculo
          </button>
        `
      }
    }

    if (ctx.state.leadResolutionLoading) {
      return ''
    }

    const resolution =
      ctx.state.leadResolutionViewModel

    if (!resolution || !ctx.state.connected) {
      return ''
    }

    // A autoridade de cada ação é a capability canônica do ViewModel
    // (resolve-lead → controller), nunca o status. Sem capability
    // aplicável, mantém o fallback atual "Abrir vínculo na Yolen".
    const capabilities =
      resolution.capabilities

    if (capabilities?.can_create_lead === true) {
      // O formulário de criação de lead (Nome/WhatsApp/E-mail/CPF-CNPJ)
      // é montado aqui, na MESMA passada de renderPanel() que decide o
      // resto da região "Conversa" — não por um MutationObserver
      // separado substituindo esse trecho depois. Antes, lead-automation.js
      // observava o painel e trocava este botão por um formulário assim
      // que ele aparecia no DOM; quando uma atualização em segundo plano
      // (mais frequente com "Dados do contato" aberto) chegava nesse
      // meio-tempo, o botão simples podia reaparecer entre o pointerdown e
      // o click do vendedor, e o primeiro clique se perdia. Com uma única
      // fonte de verdade por região, isso não pode mais acontecer.
      //
      // conversationKey/phone/displayName são passados explicitamente —
      // lead-automation.js NÃO decide sozinho a partir de um estado global
      // implícito qual é "a conversa atual" (causa raiz do vazamento A→B
      // corrigido na Frente 1B): a única fonte de verdade é o state deste
      // arquivo, no instante exato deste render.
      const formHtml =
        window.YolenCompanionLeadAutomation
          ?.buildCreateLeadFormHtml
          ?.({
            conversationKey: ctx.state.conversationKey,
            phone: ctx.state.conversationPhone,
            displayName: ctx.state.conversationTitle,
            errorMessage:
              creationBelongsToCurrentConversation &&
              ctx.state.leadCreationStatus === 'error'
                ? ctx.state.leadCreationError
                : null,
          })

      if (formHtml) {
        return formHtml
      }

      return `
        <button class="yolen-secondary-button" type="button" data-yolen-action="create-lead-yolen">
          Criar lead na Yolen
        </button>
      `
    }

    if (capabilities?.can_open_pool === true) {
      return `
        <button class="yolen-secondary-button" type="button" data-yolen-action="open-pool">
          Abrir Pool na Yolen
        </button>
      `
    }

    return `
      <button class="yolen-secondary-button" type="button" data-yolen-action="open-cycle-yolen">
        Abrir vínculo na Yolen
      </button>
    `
  }

  const LEAD_CREATION_RESOLVE_RETRY_DELAYS_MS =
    [400, 900, 1600]

  // Depois de um CREATE_LEAD confirmado, o vínculo pode ainda não estar
  // visível na primeira consulta (eventual consistency) — poucas
  // tentativas curtas com backoff, nunca polling agressivo/indefinido
  // (ver TESTE 3 e TESTE 7 da Frente 1B). A cada tentativa valida de novo
  // se a conversa/telefone ainda são os mesmos de quando o create foi
  // disparado: se o vendedor já trocou de conversa, para silenciosamente
  // sem tocar em nada da UI atual (ver TESTE 5/TESTE 6). Se uma tentativa
  // coincidir com outra resolução da mesma conversa já em voo (guard de
  // resolveCurrentLead()), ela vira um no-op silencioso — o pedido não se
  // perde porque a PRÓXIMA tentativa deste laço tenta de novo pouco
  // depois (ver TESTE 2); não precisamos de uma fila própria dentro de
  // resolveCurrentLead() só para isso.
  // Criação já confirmada pelo backend e ainda aguardando o vínculo
  // (created_resolving/created_unresolved) para a conversa informada.
  function isLeadCreationPendingForConversation(
    conversationKey,
  ) {
    return (
      ctx.state.leadCreationConversationKey === conversationKey &&
      (
        ctx.state.leadCreationStatus === 'created_resolving' ||
        ctx.state.leadCreationStatus === 'created_unresolved'
      )
    )
  }

  async function resolveAfterLeadCreation(
    conversationKeyAtCreate,
    phoneAtCreate,
  ) {
    const stillCurrent = () =>
      ctx.state.conversationKey === conversationKeyAtCreate &&
      ctx.state.conversationPhone === phoneAtCreate

    for (
      let attempt = 0;
      attempt <= LEAD_CREATION_RESOLVE_RETRY_DELAYS_MS.length;
      attempt += 1
    ) {
      if (!stillCurrent()) {
        return
      }

      await resolveCurrentLead()

      if (!stillCurrent()) {
        return
      }

      if (
        ctx.state.leadResolutionViewModel &&
        ctx.state.leadResolutionViewModel.status !== 'NOT_FOUND'
      ) {
        ctx.state = {
          ...ctx.state,
          leadCreationStatus: null,
          leadCreationConversationKey: null,
          leadCreationError: null,
        }

        renderPanel()
        return
      }

      if (attempt < LEAD_CREATION_RESOLVE_RETRY_DELAYS_MS.length) {
        await sleep(
          LEAD_CREATION_RESOLVE_RETRY_DELAYS_MS[attempt],
        )
      }
    }

    // Tentativas esgotadas: o backend já confirmou a criação (senão nunca
    // teríamos chegado aqui) — isso NUNCA pode voltar a ser um estado de
    // "erro de criação" genérico, porque 'error' também é usado para um
    // CREATE que falhou de verdade (ver createLeadForCurrentConversation),
    // e esse caso reabre o formulário com o botão "Criar lead" habilitado
    // de propósito. Aqui o lead já existe no backend: reabrir o formulário
    // permitiria um SEGUNDO create depois de um primeiro já confirmado —
    // proibido. 'created_unresolved' é um estado à parte, sem permissão
    // de criar de novo: só uma reconsulta manual (ver
    // retryLeadLinkAfterCreation()) pode sair dele.
    if (stillCurrent()) {
      ctx.state = {
        ...ctx.state,
        leadCreationStatus: 'created_unresolved',
        leadCreationConversationKey: conversationKeyAtCreate,
        leadCreationError: null,
      }

      renderPanel()
    }
  }

  // Clique em "Atualizar vínculo" a partir do estado created_unresolved —
  // dispara só uma reconsulta (RESOLVE), nunca um novo CREATE. Se o
  // vínculo aparecer, sai do estado pendente; se continuar NOT_FOUND, o
  // vendedor continua vendo "Lead criado, mas o vínculo ainda não foi
  // atualizado." sem nenhum formulário de criação reaparecer.
  async function retryLeadLinkAfterCreation() {
    // resolveCurrentLead() já é a fonte única de verdade para sair de
    // created_unresolved (ver o bloco de sucesso lá dentro) — dispara
    // sempre a MESMA reconsulta que o botão global "Atualizar" dispara,
    // sem lógica própria duplicada aqui.
    await resolveCurrentLead()
  }

  // Fonte única de verdade para criar um lead a partir do formulário de
  // "Novo contato": chamado por lead-automation.js via
  // window.YolenCompanionLeadCreationBridge, nunca por clique sintético em
  // [data-yolen-action="refresh"] (ver causa raiz do BLOCKER da Frente
  // 1B). conversationKey/phone recebidos são os que estavam vinculados ao
  // FORMULÁRIO no momento do clique — comparados aqui contra o state atual
  // antes de qualquer efeito colateral, e de novo depois do POST, porque o
  // vendedor pode trocar de conversa a qualquer momento durante o create.
  async function createLeadForCurrentConversation(payload) {
    const {
      name,
      phone,
      email,
      document,
      conversationKey,
    } = payload || {}

    if (
      !conversationKey ||
      conversationKey !== ctx.state.conversationKey ||
      !phone ||
      phone !== ctx.state.conversationPhone
    ) {
      return {
        ok: false,
        code: 'conversation_changed',
      }
    }

    if (leadCreationInFlightKeys.has(conversationKey)) {
      return {
        ok: false,
        code: 'already_in_flight',
      }
    }

    leadCreationInFlightKeys.add(conversationKey)

    ctx.state = {
      ...ctx.state,
      leadCreationStatus: 'creating',
      leadCreationConversationKey: conversationKey,
      leadCreationError: null,
    }

    renderPanel()

    const stillCurrent = () =>
      ctx.state.conversationKey === conversationKey &&
      ctx.state.conversationPhone === phone

    try {
      const result =
        await window.YolenCompanionApi.createLead({
          name,
          phone,
          email: email || null,
          cpf_cnpj: document || null,
        })

      if (!stillCurrent()) {
        // A conversa já mudou — o resultado deste create pertence à
        // conversa anterior e não pode alterar a UI da conversa atual.
        return { ok: true, applied: false }
      }

      if (!result?.ok || !result.payload?.ok) {
        const code =
          result?.payload?.code ||
          result?.payload?.status

        if (
          code === 'active_lead_conflict' ||
          code === 'concurrent_create_conflict'
        ) {
          ctx.state = {
            ...ctx.state,
            leadCreationStatus: 'created_resolving',
            leadCreationError: null,
          }

          renderPanel()

          await resolveAfterLeadCreation(
            conversationKey,
            phone,
          )

          return { ok: true, applied: true, code }
        }

        ctx.state = {
          ...ctx.state,
          leadCreationStatus: 'error',
          leadCreationConversationKey: conversationKey,
          leadCreationError:
            result?.payload?.error ||
            'Não foi possível criar o lead.',
        }

        renderPanel()

        return {
          ok: false,
          applied: true,
          error: ctx.state.leadCreationError,
        }
      }

      ctx.state = {
        ...ctx.state,
        leadCreationStatus: 'created_resolving',
        leadCreationError: null,
      }

      renderPanel()

      await resolveAfterLeadCreation(
        conversationKey,
        phone,
      )

      return { ok: true, applied: true }
    } catch (error) {
      if (!stillCurrent()) {
        return { ok: true, applied: false }
      }

      ctx.state = {
        ...ctx.state,
        leadCreationStatus: 'error',
        leadCreationConversationKey: conversationKey,
        leadCreationError:
          error instanceof Error && error.message
            ? error.message
            : 'Erro ao criar lead na Yolen.',
      }

      renderPanel()

      return {
        ok: false,
        applied: true,
        error: ctx.state.leadCreationError,
      }
    } finally {
      leadCreationInFlightKeys.delete(conversationKey)
    }
  }

  window.YolenCompanionLeadCreationBridge = {
    createLead: createLeadForCurrentConversation,
  }

  return {
    getLeadActionButton,
    isLeadCreationPendingForConversation,
    retryLeadLinkAfterCreation,
  }
}

const api = Object.freeze({
  create: createCompanionLeadCreationController,
})

root.YolenCompanionLeadCreationController = api

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
