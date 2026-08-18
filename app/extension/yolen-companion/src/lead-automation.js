;(function initYolenCompanionLeadAutomation() {
  const PANEL_ID = 'yolen-companion-panel'
  const CREATE_ACTION = 'create-lead-yolen'
  const REFRESH_ACTION = 'refresh'

  let panelObserver = null

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

    return {
      phone,
      displayName,
      suggestedName:
        displayName && !looksLikePhone(displayName)
          ? displayName
          : '',
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
    const documentInput = form.querySelector('[name="yolen-lead-document"]')
    const submitButton = form.querySelector('button[type="submit"]')

    const name = cleanText(nameInput?.value)
    const phone = onlyDigits(phoneInput?.value)
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
          cpf_cnpj: document || null,
        })

      if (!result?.ok || !result.payload?.ok) {
        const code = result?.payload?.code || result?.payload?.status

        if (code === 'active_lead_conflict' || code === 'concurrent_create_conflict') {
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
    return [
      '<form class="yolen-lead-create-form" data-yolen-lead-create-form>',
        '<div class="yolen-lead-create-heading">',
          '<div class="yolen-lead-create-title">Novo contato</div>',
          '<div class="yolen-lead-create-subtitle">Nenhum lead encontrado</div>',
        '</div>',

        '<label class="yolen-lead-create-field">',
          '<span>Nome</span>',
          '<input',
            ' type="text"',
            ' name="yolen-lead-name"',
            ' autocomplete="off"',
            ' maxlength="160"',
            ' value="' + escapeHtml(context.suggestedName) + '"',
            ' placeholder="Nome do contato"',
          '>',
        '</label>',

        '<label class="yolen-lead-create-field">',
          '<span>WhatsApp</span>',
          '<input',
            ' type="text"',
            ' name="yolen-lead-phone"',
            ' value="' + escapeHtml(context.phone) + '"',
            ' readonly',
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

    if (actionsContainer.querySelector('[data-yolen-lead-create-form]')) {
      return
    }

    const context = getLookupContext()

    if (!context.phone) {
      return
    }

    actionsContainer.innerHTML = buildFormHtml(context)

    const form =
      actionsContainer.querySelector('[data-yolen-lead-create-form]')

    form?.addEventListener('submit', (event) => {
      event.preventDefault()
      void submitLeadCreation(form)
    })
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
