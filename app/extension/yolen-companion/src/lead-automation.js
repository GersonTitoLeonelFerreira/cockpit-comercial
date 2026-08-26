;(function initYolenCompanionLeadAutomation() {
  const PANEL_ID = 'yolen-companion-panel'
  const CREATE_ACTION = 'create-lead-yolen'
  const REFRESH_ACTION = 'refresh'

  let panelObserver = null
  const leadDraftsByPhone = new Map()

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

  function getLookupContext() {
    const context =
      window.YolenCompanionApi
        ?.getLastLeadLookupContext
        ?.()

    const phone = onlyDigits(context?.phone)
    const displayName = cleanText(context?.display_name)

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

    const suggestedEmail =
      emailCandidates.length === 1
        ? cleanText(
            emailCandidates[0]
              .normalized_value,
          )
        : ''

    const suggestedDocument =
      documentCandidates.length === 1
        ? onlyDigits(
            documentCandidates[0]
              .normalized_value,
          )
        : ''

    return {
      phone,
      displayName,
      suggestedName:
        displayName && !looksLikePhone(displayName)
          ? displayName
          : '',
      suggestedEmail,
      suggestedDocument,
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
    const status = getStatusElement(form)

    if (!status) {
      return
    }

    status.textContent = message || ''
    status.dataset.tone = tone
  }

  function refreshLeadResolution() {
    const panel = document.getElementById(PANEL_ID)
    const refreshButton =
      panel?.querySelector(
        `[data-yolen-action="${REFRESH_ACTION}"]`,
      )

    refreshButton?.click()
  }

  async function submitLeadCreation(form) {
    if (form.dataset.submitting === 'true') {
      return
    }

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
    const currentContext = getLookupContext()

    if (!name || looksLikePhone(name)) {
      setFormStatus(
        form,
        'Informe o nome do contato para criar o lead.',
        'error',
      )
      nameInput?.focus()
      return
    }

    if (!phone || phone !== currentContext.phone) {
      setFormStatus(
        form,
        'A conversa mudou. Atualize o Companion antes de criar o lead.',
        'error',
      )
      return
    }

    if (!window.YolenCompanionApi?.createLead) {
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
        await window.YolenCompanionApi.createLead({
          name,
          phone,
          email: email || null,
          cpf_cnpj: document || null,
        })

      if (!result?.ok || !result.payload?.ok) {
        const code = result?.payload?.code || result?.payload?.status

        if (code === 'active_lead_conflict' || code === 'concurrent_create_conflict') {
          clearLeadDraft(phone)
          setFormStatus(
            form,
            'Contato já localizado. Atualizando o vínculo...',
            'success',
          )
          window.setTimeout(refreshLeadResolution, 250)
          return
        }

        throw new Error(
          result?.payload?.error ||
            'Não foi possível criar o lead.',
        )
      }

      clearLeadDraft(phone)

      setFormStatus(
        form,
        'Lead criado. Atualizando o vínculo...',
        'success',
      )

      window.setTimeout(refreshLeadResolution, 150)
    } catch (error) {
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

        '<div class="yolen-lead-create-status" data-yolen-lead-create-status data-tone="neutral"></div>',

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

  function mountLeadCreationForm() {
    const panel = document.getElementById(PANEL_ID)

    if (!panel) {
      return
    }

    const createButton =
      panel.querySelector(
        `[data-yolen-action="${CREATE_ACTION}"]`,
      )

    if (!createButton) {
      return
    }

    const actionsContainer =
      createButton.closest('.yolen-contact-actions') ||
      createButton.parentElement

    if (!actionsContainer) {
      return
    }

    const context =
      getLookupContext()

    if (!context.phone) {
      return
    }

    const existingForm =
      actionsContainer.querySelector(
        '[data-yolen-lead-create-form]',
      )

    if (existingForm) {
      syncLeadCreationFormSuggestions(
        existingForm,
        context,
      )
      bindLeadCreationForm(existingForm)
      return
    }

    actionsContainer.innerHTML = buildFormHtml(context)

    const form =
      actionsContainer.querySelector('[data-yolen-lead-create-form]')

    bindLeadCreationForm(form)
  }

  function observePanel(panel) {
    panelObserver?.disconnect()

    panelObserver = new MutationObserver(() => {
      mountLeadCreationForm()
    })

    panelObserver.observe(panel, {
      childList: true,
      subtree: true,
    })

    mountLeadCreationForm()
  }

  function start() {
    const existingPanel = document.getElementById(PANEL_ID)

    if (existingPanel) {
      observePanel(existingPanel)
      return
    }

    const rootObserver = new MutationObserver(() => {
      const panel = document.getElementById(PANEL_ID)

      if (!panel) {
        return
      }

      rootObserver.disconnect()
      observePanel(panel)
    })

    rootObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    })
  }

  start()
})()
