;(function initYolenCompanionLeadAutomation() {
  const leadDraftsByPhone = new Map()
  const formContextByForm = new WeakMap()

  function onlyDigits(value) {
    return String(value || '').replace(/\D/g, '')
  }

  function cleanText(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  function looksLikePhone(value) {
    const text = cleanText(value)
    const digits = onlyDigits(text)

    if (!text || digits.length < 10 || digits.length > 13) {
      return false
    }

    return text.replace(/[\d\s()+.-]/g, '').length === 0
  }

  function escapeHtml(value) {
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;')
  }

  // Só os campos de enriquecimento (e-mail/documento sugeridos a partir da
  // conversa) ainda vêm de um provedor externo próprio — identidade
  // (telefone/conversa/nome) nunca mais vem daqui, ver buildFormContext().
  function getEnrichmentSuggestions() {
    const candidates =
      globalThis
        .YolenCompanionLeadEnrichmentContext
        ?.getCandidates
        ?.() || []

    const emailCandidates =
      candidates.filter(
        (candidate) =>
          candidate?.field === 'email',
      )

    const documentCandidates =
      candidates.filter(
        (candidate) =>
          candidate?.field === 'cpf' ||
          candidate?.field === 'cnpj',
      )

    return {
      suggestedEmail:
        emailCandidates.length === 1
          ? cleanText(
              emailCandidates[0]
                .normalized_value,
            )
          : '',
      suggestedDocument:
        documentCandidates.length === 1
          ? onlyDigits(
              documentCandidates[0]
                .normalized_value,
            )
          : '',
    }
  }

  // Única fonte de verdade de identidade do formulário: conversationKey e
  // phone SEMPRE vêm do parâmetro explícito passado por content-script.js
  // (state.conversationKey/state.conversationPhone no instante do
  // render/bind) — nunca de um estado global implícito deste ou de outro
  // módulo. Isso é a correção da causa raiz do BLOCKER da Frente 1B: um
  // vazamento visual do telefone/nome de uma conversa anterior para o
  // formulário da conversa atual.
  function buildFormContext(explicitContext) {
    const phone = onlyDigits(explicitContext?.phone)
    const displayName = cleanText(explicitContext?.displayName)
    const enrichment = getEnrichmentSuggestions()

    return {
      conversationKey: explicitContext?.conversationKey || null,
      phone,
      displayName,
      suggestedName:
        displayName && !looksLikePhone(displayName)
          ? displayName
          : '',
      suggestedEmail: enrichment.suggestedEmail,
      suggestedDocument: enrichment.suggestedDocument,
      errorMessage: explicitContext?.errorMessage || null,
    }
  }

  function getDefaultDraft(context) {
    return {
      name: context.suggestedName || '',
      phone: context.phone || '',
      email: context.suggestedEmail || '',
      document: context.suggestedDocument || '',
      dirty: false,
    }
  }

  function getLeadDraft(context) {
    if (!context?.phone) {
      return getDefaultDraft(context || {})
    }

    const existing =
      leadDraftsByPhone.get(context.phone)

    if (existing) {
      if (!existing.dirty) {
        if (!existing.name && context.suggestedName) {
          existing.name = context.suggestedName
        }

        if (!existing.email && context.suggestedEmail) {
          existing.email = context.suggestedEmail
        }

        if (!existing.document && context.suggestedDocument) {
          existing.document = context.suggestedDocument
        }
      }

      return existing
    }

    const draft = getDefaultDraft(context)
    leadDraftsByPhone.set(context.phone, draft)
    return draft
  }

  function captureLeadDraft(form) {
    if (!form) {
      return null
    }

    const phone = onlyDigits(
      form.querySelector('[name="yolen-lead-phone"]')?.value,
    )

    if (!phone) {
      return null
    }

    const draft = {
      name: String(
        form.querySelector('[name="yolen-lead-name"]')?.value || '',
      ),
      phone,
      email: String(
        form.querySelector('[name="yolen-lead-email"]')?.value || '',
      ),
      document: String(
        form.querySelector('[name="yolen-lead-document"]')?.value || '',
      ),
      dirty: true,
    }

    leadDraftsByPhone.set(phone, draft)
    return draft
  }

  function clearLeadDraft(phone) {
    const normalizedPhone = onlyDigits(phone)

    if (normalizedPhone) {
      leadDraftsByPhone.delete(normalizedPhone)
    }
  }

  function getStatusElement(form) {
    return form.querySelector('[data-yolen-lead-create-status]')
  }

  function setFormStatus(form, message, tone = 'neutral') {
    if (!form.isConnected) {
      // O formulário já não pertence mais ao DOM atual (região
      // re-renderizada, provavelmente por troca real de conversa) — não
      // escreve em um node órfão.
      return
    }

    const status = getStatusElement(form)

    if (!status) {
      return
    }

    status.textContent = message || ''
    status.dataset.tone = tone
  }

  // Criação e reconsulta do vínculo são feitas por content-script.js via
  // window.YolenCompanionLeadCreationBridge — nunca mais um clique
  // simulado no botão "Atualizar" com um temporizador. A conclusão
  // (formulário some / "Lead criado. Atualizando o vínculo..." / erro) é
  // 100% dirigida pelo state de content-script.js e chega aqui através do
  // próximo renderPanel(); este módulo só cuida da submissão em si.
  async function submitLeadCreation(form) {
    if (form.dataset.submitting === 'true') {
      return
    }

    const context = formContextByForm.get(form)

    const nameInput = form.querySelector('[name="yolen-lead-name"]')
    const phoneInput = form.querySelector('[name="yolen-lead-phone"]')
    const emailInput = form.querySelector('[name="yolen-lead-email"]')
    const documentInput = form.querySelector('[name="yolen-lead-document"]')
    const submitButton = form.querySelector('button[type="submit"]')

    captureLeadDraft(form)

    const name = cleanText(nameInput?.value)
    const phone = onlyDigits(phoneInput?.value)
    const email = cleanText(emailInput?.value)
      .toLowerCase()
    const document = onlyDigits(documentInput?.value)

    if (!name || looksLikePhone(name)) {
      setFormStatus(
        form,
        'Informe o nome do contato para criar o lead.',
        'error',
      )
      nameInput?.focus()
      return
    }

    if (
      !context?.conversationKey ||
      !phone ||
      phone !== context.phone
    ) {
      setFormStatus(
        form,
        'A conversa mudou. Atualize o Companion antes de criar o lead.',
        'error',
      )
      return
    }

    if (!window.YolenCompanionLeadCreationBridge?.createLead) {
      setFormStatus(
        form,
        'Criação de lead indisponível nesta versão do Companion.',
        'error',
      )
      return
    }

    form.dataset.submitting = 'true'

    if (submitButton) {
      submitButton.disabled = true
    }

    setFormStatus(form, 'Criando lead na Yolen...', 'loading')

    try {
      const result =
        await window.YolenCompanionLeadCreationBridge.createLead({
          name,
          phone,
          email: email || null,
          document: document || null,
          conversationKey: context.conversationKey,
        })

      if (result?.applied === false || result?.code === 'conversation_changed') {
        // A conversa já mudou (antes do POST sair, ou enquanto ele estava
        // em voo) — content-script.js já decidiu não tocar na UI atual, e
        // este formulário específico pode nem existir mais no DOM.
        return
      }

      if (result?.code === 'already_in_flight') {
        // Duplo/triplo clique: a primeira submissão já está cuidando
        // disso, esta chamada não faz nada além de não duplicar o CREATE.
        return
      }

      if (!result?.ok) {
        throw new Error(
          result?.error || 'Não foi possível criar o lead.',
        )
      }

      clearLeadDraft(phone)
      // Sucesso: a partir daqui content-script.js assume o estado
      // (created_resolving/erro de reconsulta) e re-renderiza a região —
      // não há mais nada síncrono para este formulário fazer.
    } catch (error) {
      if (!form.isConnected) {
        return
      }

      form.dataset.submitting = 'false'

      if (submitButton) {
        submitButton.disabled = false
      }

      setFormStatus(
        form,
        error instanceof Error && error.message
          ? error.message
          : 'Erro ao criar lead na Yolen.',
        'error',
      )
    }
  }

  function buildFormHtml(context) {
    const draft = getLeadDraft(context)
    const hasConversationData =
      Boolean(
        context.suggestedEmail ||
        context.suggestedDocument,
      )

    return [
      '<form class="yolen-lead-create-form" data-yolen-lead-create-form>',
        '<div class="yolen-lead-create-heading">',
          '<div class="yolen-lead-create-title">Novo contato</div>',
          '<div class="yolen-lead-create-subtitle">' +
            escapeHtml(
              hasConversationData
                ? 'Dados encontrados na conversa já preenchidos'
                : 'Nenhum lead encontrado',
            ) +
          '</div>',
        '</div>',

        '<label class="yolen-lead-create-field">',
          '<span>Nome</span>',
          '<input',
            ' type="text"',
            ' name="yolen-lead-name"',
            ' autocomplete="off"',
            ' maxlength="160"',
            ' value="' + escapeHtml(draft.name) + '"',
            ' placeholder="Nome do contato"',
          '>',
        '</label>',

        '<label class="yolen-lead-create-field">',
          '<span>WhatsApp</span>',
          '<input',
            ' type="text"',
            ' name="yolen-lead-phone"',
            ' value="' + escapeHtml(draft.phone || context.phone) + '"',
            ' readonly',
          '>',
        '</label>',

        '<label class="yolen-lead-create-field">',
          '<span>E-mail (opcional)</span>',
          '<input',
            ' type="email"',
            ' name="yolen-lead-email"',
            ' autocomplete="email"',
            ' maxlength="254"',
            ' value="' + escapeHtml(draft.email) + '"',
            ' placeholder="email@exemplo.com"',
          '>',
        '</label>',

        '<label class="yolen-lead-create-field">',
          '<span>CPF/CNPJ (opcional)</span>',
          '<input',
            ' type="text"',
            ' inputmode="numeric"',
            ' name="yolen-lead-document"',
            ' autocomplete="off"',
            ' maxlength="18"',
            ' value="' + escapeHtml(draft.document) + '"',
            ' placeholder="CPF ou CNPJ"',
          '>',
        '</label>',

        '<div class="yolen-lead-create-status" data-yolen-lead-create-status data-tone="' +
          (context.errorMessage ? 'error' : 'neutral') + '">' +
          (context.errorMessage ? escapeHtml(context.errorMessage) : '') +
        '</div>',

        '<button class="yolen-primary-button yolen-lead-create-submit" type="submit">',
          'Criar lead',
        '</button>',
      '</form>',
    ].join('')
  }

  function syncLeadCreationFormSuggestions(
    form,
    context,
  ) {
    if (!form || !context) {
      return
    }

    const draft = getLeadDraft(context)
    const nameInput =
      form.querySelector(
        '[name="yolen-lead-name"]',
      )
    const emailInput =
      form.querySelector(
        '[name="yolen-lead-email"]',
      )
    const documentInput =
      form.querySelector(
        '[name="yolen-lead-document"]',
      )
    const subtitle =
      form.querySelector(
        '.yolen-lead-create-subtitle',
      )

    if (!draft.dirty) {
      if (
        nameInput &&
        !cleanText(nameInput.value) &&
        context.suggestedName
      ) {
        nameInput.value = context.suggestedName
        draft.name = context.suggestedName
      }

      if (
        emailInput &&
        !cleanText(emailInput.value) &&
        context.suggestedEmail
      ) {
        emailInput.value = context.suggestedEmail
        draft.email = context.suggestedEmail
      }

      if (
        documentInput &&
        !onlyDigits(documentInput.value) &&
        context.suggestedDocument
      ) {
        documentInput.value = context.suggestedDocument
        draft.document = context.suggestedDocument
      }
    }

    if (
      subtitle &&
      (
        context.suggestedEmail ||
        context.suggestedDocument
      )
    ) {
      subtitle.textContent =
        'Dados encontrados na conversa já preenchidos'
    }
  }

  function bindLeadCreationForm(form) {
    if (!form || form.dataset.yolenDraftBound === 'true') {
      return
    }

    form.dataset.yolenDraftBound = 'true'

    form.addEventListener('input', () => {
      captureLeadDraft(form)
    })

    form.addEventListener('change', () => {
      captureLeadDraft(form)
    })

    form.addEventListener('submit', (event) => {
      event.preventDefault()
      captureLeadDraft(form)
      void submitLeadCreation(form)
    })
  }

  // buildCreateLeadFormHtml()/bindCreateLeadForm() são a única porta de
  // entrada deste arquivo no DOM do painel. Antes, este arquivo observava
  // o painel com seu próprio MutationObserver e substituía o botão
  // "Criar lead na Yolen" por este formulário de forma assíncrona e
  // independente de renderPanel() (content-script.js) — dois renders
  // competindo pelo mesmo pedaço do DOM, sem nenhuma trava entre eles.
  // Quando uma atualização de fundo do Companion chegava nesse meio-tempo
  // (mais frequente com "Dados do contato" do WhatsApp aberto), o botão
  // simples podia reaparecer bem na hora do clique do vendedor, e o
  // primeiro clique em "Criar lead" se perdia. Agora content-script.js
  // chama buildCreateLeadFormHtml() dentro da MESMA passada de render que
  // decide o resto do card "Conversa" (getLeadActionButton()), e
  // bindCreateLeadForm() só liga os handlers do formulário que já está no
  // DOM — nenhum dos dois mexe em DOM por conta própria.
  //
  // explicitContext ({conversationKey, phone, displayName, errorMessage?})
  // é obrigatório e vem sempre de content-script.js — nenhuma identidade
  // de conversa é lida daqui por conta própria.
  function buildCreateLeadFormHtml(explicitContext) {
    const context = buildFormContext(explicitContext)

    if (!context.phone || !context.conversationKey) {
      return ''
    }

    return buildFormHtml(context)
  }

  function bindCreateLeadForm(panel, explicitContext) {
    const form =
      panel?.querySelector(
        '[data-yolen-lead-create-form]',
      )

    if (!form) {
      return
    }

    const context = buildFormContext(explicitContext)
    formContextByForm.set(form, context)

    syncLeadCreationFormSuggestions(
      form,
      context,
    )
    bindLeadCreationForm(form)
  }

  window.YolenCompanionLeadAutomation = {
    buildCreateLeadFormHtml,
    bindCreateLeadForm,
  }
})()
