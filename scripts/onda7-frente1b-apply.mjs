import { readFileSync, writeFileSync } from 'node:fs'

function read(path) {
  return readFileSync(path, 'utf8')
}

function write(path, value) {
  writeFileSync(path, value)
}

function replaceOnce(path, before, after, label) {
  const source = read(path)
  const first = source.indexOf(before)
  const second = first >= 0 ? source.indexOf(before, first + before.length) : -1

  if (first < 0 || second >= 0) {
    throw new Error(`${label}: expected exactly one match (first=${first}, second=${second})`)
  }

  write(path, source.slice(0, first) + after + source.slice(first + before.length))
}

const contentPath = 'app/extension/yolen-companion/src/content-script.js'
const leadAutomationPath = 'app/extension/yolen-companion/src/lead-automation.js'
const harnessPath = 'app/extension/yolen-companion/tests/e3-test-support/load-content-script.mjs'
const testPath = 'app/extension/yolen-companion/tests/e3-dom/content-script-dom-conversation-isolation.test.mjs'

replaceOnce(
  contentPath,
  `  let lastResolvedConversationKey = null\n  let lastResolvedContactLookupIdentity = null\n\n  const leadResolutionInFlightKeys =`,
  `  let lastResolvedConversationKey = null\n  let lastResolvedContactLookupIdentity = null\n  // Boundary monotônico da identidade seller-facing. Só muda quando a\n  // conversa REAL muda; mutações do WhatsApp dentro da mesma conversa\n  // (incluindo abrir Dados do contato) preservam o mesmo epoch.\n  let conversationIdentityEpoch = 0\n\n  const leadResolutionInFlightKeys =`,
  'content: add conversation epoch',
)

replaceOnce(
  contentPath,
  `    preSendBypassKey: null,\n  }\n\n  function waitForWhatsAppApp() {`,
  `    preSendBypassKey: null,\n  }\n\n  function captureConversationIdentity() {\n    return Object.freeze({\n      epoch: conversationIdentityEpoch,\n      conversationKey:\n        state.conversationKey || null,\n      conversationPhone:\n        state.conversationPhone || null,\n    })\n  }\n\n  function isConversationIdentityCurrent(\n    identity,\n  ) {\n    return Boolean(\n      identity &&\n      identity.epoch ===\n        conversationIdentityEpoch &&\n      identity.conversationKey ===\n        (state.conversationKey || null) &&\n      identity.conversationPhone ===\n        (state.conversationPhone || null),\n    )\n  }\n\n  function getCurrentLeadDraftIdentityKey(\n    phone = state.conversationPhone,\n  ) {\n    const normalizedPhone =\n      onlyDigits(phone)\n\n    if (\n      !state.conversationKey ||\n      !normalizedPhone\n    ) {\n      return null\n    }\n\n    return [\n      state.conversationKey,\n      normalizedPhone,\n    ].join('::')\n  }\n\n  function waitForWhatsAppApp() {`,
  'content: add identity helpers',
)

replaceOnce(
  contentPath,
  `    panelRegionPendingHtml.delete(\n      regionKey,\n    )\n\n    const openDetailsKeys =`,
  `    panelRegionPendingHtml.delete(\n      regionKey,\n    )\n\n    // Marca o DOM aplicado com a identidade que o produziu. O atributo é\n    // diagnóstico/testável; a autoridade continua sendo epoch + key em\n    // memória, nunca o próprio dataset.\n    container.dataset.yolenConversationEpoch =\n      String(conversationIdentityEpoch)\n    container.dataset.yolenConversationKey =\n      state.conversationKey || ''\n\n    const openDetailsKeys =`,
  'content: stamp region identity',
)

replaceOnce(
  contentPath,
  `      panelRegionPendingHtml.set(\n        regionKey,\n        html,\n      )`,
  `      panelRegionPendingHtml.set(\n        regionKey,\n        {\n          html,\n          identity:\n            captureConversationIdentity(),\n        },\n      )`,
  'content: identity-scope pending region',
)

replaceOnce(
  contentPath,
  `  function flushPendingPanelRegions() {\n    if (\n      panelRegionPendingHtml.size === 0\n    ) {\n      return\n    }\n\n    const panel =\n      document.getElementById(PANEL_ID)\n\n    if (!panel) {\n      return\n    }\n\n    for (const [\n      regionKey,\n      html,\n    ] of panelRegionPendingHtml) {\n      const container =\n        panel.querySelector(\n          \`[data-yolen-region="\${regionKey}"]\`,\n        )\n\n      if (\n        !container ||\n        isRegionInteractionActive(\n          container,\n        )\n      ) {\n        continue\n      }\n\n      applyPanelRegionHtml(\n        container,\n        regionKey,\n        html,\n      )\n    }\n\n    wirePanelInteractions(panel)\n  }`,
  `  function flushPendingPanelRegions() {\n    if (\n      panelRegionPendingHtml.size === 0\n    ) {\n      return\n    }\n\n    const panel =\n      document.getElementById(PANEL_ID)\n\n    if (!panel) {\n      return\n    }\n\n    for (const [\n      regionKey,\n      pendingUpdate,\n    ] of panelRegionPendingHtml) {\n      if (\n        !pendingUpdate ||\n        !isConversationIdentityCurrent(\n          pendingUpdate.identity,\n        )\n      ) {\n        panelRegionPendingHtml.delete(\n          regionKey,\n        )\n        continue\n      }\n\n      const container =\n        panel.querySelector(\n          \`[data-yolen-region="\${regionKey}"]\`,\n        )\n\n      if (\n        !container ||\n        isRegionInteractionActive(\n          container,\n        )\n      ) {\n        continue\n      }\n\n      applyPanelRegionHtml(\n        container,\n        regionKey,\n        pendingUpdate.html,\n      )\n    }\n\n    wirePanelInteractions(panel)\n  }`,
  'content: reject stale pending regions',
)

replaceOnce(
  contentPath,
  `  function clearLeadStateForNewConversation() {\n    capturedAudioBlobEntries = []`,
  `  function invalidateConversationSellerFacingDom() {\n    conversationIdentityEpoch += 1\n\n    panelRegionHtmlCache.clear()\n    panelRegionPendingHtml.clear()\n\n    const panel =\n      document.getElementById(PANEL_ID)\n\n    if (!panel) {\n      return\n    }\n\n    const active = document.activeElement\n\n    if (\n      active &&\n      panel.contains(active) &&\n      typeof active.blur === 'function'\n    ) {\n      active.blur()\n    }\n\n    panel\n      .querySelectorAll(\n        '[data-yolen-region]',\n      )\n      .forEach((region) => {\n        delete region.dataset\n          .yolenRegionActionLock\n        region.replaceChildren()\n        region.dataset\n          .yolenConversationEpoch =\n          String(\n            conversationIdentityEpoch,\n          )\n        region.dataset\n          .yolenConversationKey =\n          state.conversationKey || ''\n      })\n\n    panel.scrollTop = 0\n  }\n\n  function clearLeadStateForNewConversation() {\n    capturedAudioBlobEntries = []`,
  'content: add strong seller-facing boundary',
)

replaceOnce(
  contentPath,
  `    // Mudança REAL de conversa: diferente de uma atualização de estado em\n    // segundo plano (que só troca o conteúdo interno de uma região), aqui\n    // o vendedor trocou de contato de verdade — nenhum rascunho ou\n    // posição de leitura do lead anterior pode vazar para o novo. Limpa o\n    // cache de regiões (força todas a recalcular no próximo renderPanel())\n    // e qualquer render que tivesse ficado retido esperando uma interação\n    // do lead anterior, e volta o scroll ao topo.\n    panelRegionHtmlCache.clear()\n    panelRegionPendingHtml.clear()\n\n    const panel =\n      document.getElementById(PANEL_ID)\n\n    if (panel) {\n      panel.scrollTop = 0\n    }\n\n`,
  ``,
  'content: move DOM invalidation out of generic state reset',
)

replaceOnce(
  contentPath,
  `      isSelfConversation,\n      isGroupConversation,\n    }\n\n    const messageMutationDetected =`,
  `      isSelfConversation,\n      isGroupConversation,\n    }\n\n    if (conversationChanged) {\n      // A nova identidade já está em state. Agora o boundary invalida\n      // imediatamente qualquer DOM/lock/pending update pertencente à\n      // conversa anterior, antes de montar as regiões da nova conversa.\n      invalidateConversationSellerFacingDom()\n    }\n\n    const messageMutationDetected =`,
  'content: apply boundary only on real conversation change',
)

replaceOnce(
  contentPath,
  `    const lookupIdentity =\n      getAutomaticContactLookupIdentity(\n        lookupTitle,\n      )\n\n    if (\n      !conversationKey ||`,
  `    const lookupIdentity =\n      getAutomaticContactLookupIdentity(\n        lookupTitle,\n      )\n\n    const identityAtLookupStart =\n      captureConversationIdentity()\n\n    const lookupStillCurrent = () =>\n      isConversationIdentityCurrent(\n        identityAtLookupStart,\n      ) &&\n      state.conversationKey ===\n        conversationKey\n\n    if (\n      !conversationKey ||\n      identityAtLookupStart\n        .conversationKey !==\n        conversationKey ||`,
  'content: capture automatic lookup identity',
)

replaceOnce(
  contentPath,
  `        await sleep(AUTO_CONTACT_LOOKUP_DELAY_MS)\n      }\n\n      autoLookupAttemptedKeys.add(`,
  `        await sleep(AUTO_CONTACT_LOOKUP_DELAY_MS)\n\n        if (!lookupStillCurrent()) {\n          return\n        }\n      }\n\n      autoLookupAttemptedKeys.add(`,
  'content: abort stale lookup after open delay',
)

replaceOnce(
  contentPath,
  `      const phone =\n        await waitForContactPanelPhone(\n          AUTO_CONTACT_LOOKUP_TIMEOUT_MS,\n        )\n\n      if (!hadContactPanelOpen) {`,
  `      const phone =\n        await waitForContactPanelPhone(\n          AUTO_CONTACT_LOOKUP_TIMEOUT_MS,\n        )\n\n      if (!lookupStillCurrent()) {\n        return\n      }\n\n      if (!hadContactPanelOpen) {`,
  'content: abort stale lookup before closing sidebar',
)

replaceOnce(
  contentPath,
  `      const currentLookupIdentity =\n        getAutomaticContactLookupIdentity(\n          getMainHeaderPrimaryTitle() ||\n          state.conversationTitle,\n        )\n\n      if (\n        currentLookupIdentity !==\n        lookupIdentity\n      ) {`,
  `      const currentLookupIdentity =\n        getAutomaticContactLookupIdentity(\n          getMainHeaderPrimaryTitle() ||\n          state.conversationTitle,\n        )\n\n      if (\n        !lookupStillCurrent() ||\n        currentLookupIdentity !==\n        lookupIdentity\n      ) {`,
  'content: final automatic lookup identity guard',
)

replaceOnce(
  contentPath,
  `    } finally {\n      autoContactLookupInFlight = false\n    }\n  }\n\n  function invalidateConversationSellerFacingDom() {`,
  `    } finally {\n      const becameStale =\n        !lookupStillCurrent()\n\n      autoContactLookupInFlight = false\n\n      // Se A estava fazendo lookup quando o vendedor abriu B, o intento de\n      // B pode ter encontrado a trava global ainda ativa. Reagenda somente\n      // a identidade que continua visível, sem permitir que A manipule B.\n      if (\n        becameStale &&\n        state.connected &&\n        !state.isSelfConversation &&\n        !state.isGroupConversation &&\n        !state.conversationPhone &&\n        state.conversationKey\n      ) {\n        const currentConversationKey =\n          state.conversationKey\n\n        window.setTimeout(() => {\n          runAutomaticContactLookup(\n            currentConversationKey,\n          )\n        }, 0)\n      }\n    }\n  }\n\n  function invalidateConversationSellerFacingDom() {`,
  'content: hand off stale lookup to active conversation',
)

replaceOnce(
  contentPath,
  `      window.setTimeout(() => {\n        if (autoContactLookupInFlight) {\n          return\n        }\n\n        const messageMutationDetected =`,
  `      window.setTimeout(() => {\n        // Mesmo durante a leitura de Dados do contato, mutações externas\n        // precisam continuar detectando uma troca REAL A→B. O lookup\n        // assíncrono possui seu próprio token e se auto-invalida.\n        const messageMutationDetected =`,
  'content: never suppress conversation boundary while contact lookup runs',
)

replaceOnce(
  contentPath,
  `    const titleAtRequest =\n      state.conversationTitle\n\n    if (\n      !keyAtRequest ||`,
  `    const titleAtRequest =\n      state.conversationTitle\n\n    const identityAtRequest =\n      captureConversationIdentity()\n\n    if (\n      !keyAtRequest ||`,
  'content: capture lead resolution epoch',
)

replaceOnce(
  contentPath,
  `    const requestStillCurrent = () => {\n      return (\n        state.conversationPhone ===\n          phoneAtRequest &&\n        state.conversationKey ===\n          keyAtRequest\n      )\n    }`,
  `    const requestStillCurrent = () => {\n      return (\n        isConversationIdentityCurrent(\n          identityAtRequest,\n        ) &&\n        state.conversationPhone ===\n          phoneAtRequest &&\n        state.conversationKey ===\n          keyAtRequest\n      )\n    }`,
  'content: reject stale lead resolution by epoch',
)

replaceOnce(
  contentPath,
  `  }\n\n  function createActionTelemetryInteractionId() {`,
  `  }\n\n  // Superfície mínima para runtimes injetados depois do content-script.\n  // Lead automation nunca recebe state mutável: captura um token imutável\n  // e só pode solicitar refresh se o token ainda representar a conversa\n  // ativa. O refresh retira o formulário do estado authoritative antes da\n  // nova resolução, eliminando o formulário sobrevivente pós-create.\n  globalThis.YolenCompanionConversationRuntime =\n    Object.freeze({\n      captureIdentity: () =>\n        captureConversationIdentity(),\n      isIdentityCurrent: (identity) =>\n        isConversationIdentityCurrent(\n          identity,\n        ),\n      getDraftIdentityKey: (phone) =>\n        getCurrentLeadDraftIdentityKey(\n          phone,\n        ),\n      refreshLeadResolution: async (\n        identity,\n      ) => {\n        if (\n          !isConversationIdentityCurrent(\n            identity,\n          )\n        ) {\n          return false\n        }\n\n        lastResolvedConversationKey = null\n        lastResolvedContactLookupIdentity =\n          null\n\n        state = {\n          ...state,\n          leadResolutionLoading: true,\n          leadResolution: null,\n          leadResolutionError: null,\n        }\n\n        renderPanel()\n        await resolveCurrentLead()\n\n        return (\n          isConversationIdentityCurrent(\n            identity,\n          ) &&\n          Boolean(state.leadResolution)\n        )\n      },\n    })\n\n  function createActionTelemetryInteractionId() {`,
  'content: expose identity-scoped lead refresh runtime',
)

// -------------------------------------------------------------------------
// lead-automation.js — drafts por conversa + single-flight + delegation.
// -------------------------------------------------------------------------
replaceOnce(
  leadAutomationPath,
  `  const leadDraftsByPhone = new Map()\n`,
  `  const leadDraftsByIdentity = new Map()\n  const leadCreationInFlightKeys = new Set()\n\n  function getConversationRuntime() {\n    return globalThis\n      .YolenCompanionConversationRuntime ||\n      null\n  }\n\n  function captureConversationIdentity() {\n    return getConversationRuntime()\n      ?.captureIdentity?.() || null\n  }\n\n  function isConversationIdentityCurrent(\n    identity,\n  ) {\n    const runtime =\n      getConversationRuntime()\n\n    if (!runtime?.isIdentityCurrent) {\n      return true\n    }\n\n    return runtime.isIdentityCurrent(\n      identity,\n    )\n  }\n\n  function getLeadDraftKey(\n    context,\n    identity = null,\n  ) {\n    const phone =\n      onlyDigits(context?.phone)\n\n    if (!phone) {\n      return null\n    }\n\n    const runtime =\n      getConversationRuntime()\n\n    const runtimeKey =\n      runtime?.getDraftIdentityKey?.(\n        phone,\n      )\n\n    if (runtimeKey) {\n      return runtimeKey\n    }\n\n    const conversationKey =\n      identity?.conversationKey\n\n    return conversationKey\n      ? \`\${conversationKey}::\${phone}\`\n      : phone\n  }\n`,
  'lead automation: identity stores',
)

replaceOnce(
  leadAutomationPath,
  `    const existing =\n      leadDraftsByPhone.get(context.phone)`,
  `    const draftKey =\n      getLeadDraftKey(context)\n\n    const existing =\n      draftKey\n        ? leadDraftsByIdentity.get(\n            draftKey,\n          )\n        : null`,
  'lead automation: read draft by identity',
)

replaceOnce(
  leadAutomationPath,
  `    const draft = getDefaultDraft(context)\n    leadDraftsByPhone.set(context.phone, draft)\n    return draft`,
  `    const draft = getDefaultDraft(context)\n\n    if (draftKey) {\n      leadDraftsByIdentity.set(\n        draftKey,\n        draft,\n      )\n    }\n\n    return draft`,
  'lead automation: create draft by identity',
)

replaceOnce(
  leadAutomationPath,
  `    leadDraftsByPhone.set(phone, draft)\n    return draft\n  }\n\n  function clearLeadDraft(phone) {\n    const normalizedPhone = onlyDigits(phone)\n\n    if (normalizedPhone) {\n      leadDraftsByPhone.delete(normalizedPhone)\n    }\n  }`,
  `    const draftKey =\n      getLeadDraftKey({ phone })\n\n    if (draftKey) {\n      leadDraftsByIdentity.set(\n        draftKey,\n        draft,\n      )\n    }\n\n    return {\n      draft,\n      draftKey,\n    }\n  }\n\n  function clearLeadDraftByKey(\n    draftKey,\n  ) {\n    if (draftKey) {\n      leadDraftsByIdentity.delete(\n        draftKey,\n      )\n    }\n  }`,
  'lead automation: capture and clear identity draft',
)

replaceOnce(
  leadAutomationPath,
  `  function refreshLeadResolution() {\n    const panel = document.getElementById(PANEL_ID)\n    const refreshButton =\n      panel?.querySelector(\n        \`[data-yolen-action="\${REFRESH_ACTION}"]\`,\n      )\n\n    refreshButton?.click()\n  }`,
  `  async function refreshLeadResolution(\n    identity,\n  ) {\n    const runtime =\n      getConversationRuntime()\n\n    if (runtime?.refreshLeadResolution) {\n      return runtime\n        .refreshLeadResolution(\n          identity,\n        )\n    }\n\n    if (\n      !isConversationIdentityCurrent(\n        identity,\n      )\n    ) {\n      return false\n    }\n\n    const panel = document.getElementById(PANEL_ID)\n    const refreshButton =\n      panel?.querySelector(\n        \`[data-yolen-action="\${REFRESH_ACTION}"]\`,\n      )\n\n    refreshButton?.click()\n    return Boolean(refreshButton)\n  }`,
  'lead automation: identity-scoped refresh',
)

replaceOnce(
  leadAutomationPath,
  `  async function submitLeadCreation(form) {\n    if (form.dataset.submitting === 'true') {\n      return\n    }\n\n    const nameInput = form.querySelector('[name="yolen-lead-name"]')`,
  `  async function submitLeadCreation(form) {\n    if (form.dataset.submitting === 'true') {\n      return\n    }\n\n    const identityAtSubmit =\n      captureConversationIdentity()\n\n    if (\n      !isConversationIdentityCurrent(\n        identityAtSubmit,\n      )\n    ) {\n      return\n    }\n\n    const nameInput = form.querySelector('[name="yolen-lead-name"]')`,
  'lead automation: capture submit identity',
)

replaceOnce(
  leadAutomationPath,
  `    captureLeadDraft(form)\n\n    const name = cleanText(nameInput?.value)`,
  `    const capturedDraft =\n      captureLeadDraft(form)\n\n    const draftKey =\n      capturedDraft?.draftKey ||\n      getLeadDraftKey(\n        {\n          phone:\n            phoneInput?.value,\n        },\n        identityAtSubmit,\n      )\n\n    const name = cleanText(nameInput?.value)`,
  'lead automation: capture immutable draft key',
)

replaceOnce(
  leadAutomationPath,
  `    if (!window.YolenCompanionApi?.createLead) {\n      setFormStatus(\n        form,\n        'Criação de lead indisponível nesta versão do Companion.',\n        'error',\n      )\n      return\n    }\n\n    form.dataset.submitting = 'true'`,
  `    if (!window.YolenCompanionApi?.createLead) {\n      setFormStatus(\n        form,\n        'Criação de lead indisponível nesta versão do Companion.',\n        'error',\n      )\n      return\n    }\n\n    const requestKey =\n      draftKey || phone\n\n    if (\n      leadCreationInFlightKeys.has(\n        requestKey,\n      )\n    ) {\n      return\n    }\n\n    leadCreationInFlightKeys.add(\n      requestKey,\n    )\n\n    form.dataset.submitting = 'true'`,
  'lead automation: single-flight by identity',
)

replaceOnce(
  leadAutomationPath,
  `      if (!result?.ok || !result.payload?.ok) {\n        const code = result?.payload?.code || result?.payload?.status\n\n        if (code === 'active_lead_conflict' || code === 'concurrent_create_conflict') {\n          clearLeadDraft(phone)\n          setFormStatus(\n            form,\n            'Contato já localizado. Atualizando o vínculo...',\n            'success',\n          )\n          window.setTimeout(refreshLeadResolution, 250)\n          return\n        }\n\n        throw new Error(\n          result?.payload?.error ||\n            'Não foi possível criar o lead.',\n        )\n      }\n\n      clearLeadDraft(phone)\n\n      setFormStatus(\n        form,\n        'Lead criado. Atualizando o vínculo...',\n        'success',\n      )\n\n      window.setTimeout(refreshLeadResolution, 150)\n    } catch (error) {\n      form.dataset.submitting = 'false'\n\n      if (submitButton) {\n        submitButton.disabled = false\n      }\n\n      setFormStatus(\n        form,\n        error instanceof Error && error.message\n          ? error.message\n          : 'Erro ao criar lead na Yolen.',\n        'error',\n      )\n    }`,
  `      if (\n        !isConversationIdentityCurrent(\n          identityAtSubmit,\n        )\n      ) {\n        return\n      }\n\n      if (!result?.ok || !result.payload?.ok) {\n        const code = result?.payload?.code || result?.payload?.status\n\n        if (code === 'active_lead_conflict' || code === 'concurrent_create_conflict') {\n          clearLeadDraftByKey(\n            draftKey,\n          )\n          setFormStatus(\n            form,\n            'Contato já localizado. Atualizando o vínculo...',\n            'success',\n          )\n          await refreshLeadResolution(\n            identityAtSubmit,\n          )\n          return\n        }\n\n        throw new Error(\n          result?.payload?.error ||\n            'Não foi possível criar o lead.',\n        )\n      }\n\n      clearLeadDraftByKey(\n        draftKey,\n      )\n\n      setFormStatus(\n        form,\n        'Lead criado. Atualizando o vínculo...',\n        'success',\n      )\n\n      await refreshLeadResolution(\n        identityAtSubmit,\n      )\n    } catch (error) {\n      if (\n        !isConversationIdentityCurrent(\n          identityAtSubmit,\n        )\n      ) {\n        return\n      }\n\n      form.dataset.submitting = 'false'\n\n      if (submitButton) {\n        submitButton.disabled = false\n      }\n\n      setFormStatus(\n        form,\n        error instanceof Error && error.message\n          ? error.message\n          : 'Erro ao criar lead na Yolen.',\n        'error',\n      )\n    } finally {\n      leadCreationInFlightKeys.delete(\n        requestKey,\n      )\n    }`,
  'lead automation: stale-safe create result and authoritative refresh',
)

replaceOnce(
  leadAutomationPath,
  `  function bindLeadCreationForm(form) {\n    if (!form || form.dataset.yolenDraftBound === 'true') {\n      return\n    }\n\n    form.dataset.yolenDraftBound = 'true'\n\n    form.addEventListener('input', () => {\n      captureLeadDraft(form)\n    })\n\n    form.addEventListener('change', () => {\n      captureLeadDraft(form)\n    })\n\n    form.addEventListener('submit', (event) => {\n      event.preventDefault()\n      captureLeadDraft(form)\n      void submitLeadCreation(form)\n    })\n  }`,
  `  function getLeadCreationFormFromEvent(\n    panel,\n    event,\n  ) {\n    const form =\n      event?.target?.closest?.(\n        '[data-yolen-lead-create-form]',\n      )\n\n    return (\n      form &&\n      panel?.contains(form)\n    )\n      ? form\n      : null\n  }\n\n  function bindLeadCreationForm(panel) {\n    if (\n      !panel ||\n      panel.dataset\n        .yolenLeadAutomationBound ===\n        'true'\n    ) {\n      return\n    }\n\n    panel.dataset.yolenLeadAutomationBound =\n      'true'\n\n    const captureFromEvent = (event) => {\n      const form =\n        getLeadCreationFormFromEvent(\n          panel,\n          event,\n        )\n\n      if (form) {\n        captureLeadDraft(form)\n      }\n    }\n\n    panel.addEventListener(\n      'input',\n      captureFromEvent,\n      true,\n    )\n\n    panel.addEventListener(\n      'change',\n      captureFromEvent,\n      true,\n    )\n\n    panel.addEventListener(\n      'submit',\n      (event) => {\n        const form =\n          getLeadCreationFormFromEvent(\n            panel,\n            event,\n          )\n\n        if (!form) {\n          return\n        }\n\n        event.preventDefault()\n        captureLeadDraft(form)\n        void submitLeadCreation(form)\n      },\n      true,\n    )\n  }`,
  'lead automation: stable delegated form handlers',
)

replaceOnce(
  leadAutomationPath,
  `    syncLeadCreationFormSuggestions(\n      form,\n      getLookupContext(),\n    )\n    bindLeadCreationForm(form)`,
  `    syncLeadCreationFormSuggestions(\n      form,\n      getLookupContext(),\n    )\n    bindLeadCreationForm(panel)`,
  'lead automation: bind delegated handler to stable panel',
)

// Test harness: allow deterministic delayed/dynamic lead resolution.
replaceOnce(
  harnessPath,
  `    RESOLVE_LEAD: async (payload) => {\n      const phoneDigits = String(payload?.phone ?? '').replace(/\\D/g, '')\n      const resolution = resolutionsByPhone[phoneDigits] ?? defaultLeadResolution({ phone: phoneDigits })\n      return { ok: true, statusCode: 200, payload: resolution }\n    },`,
  `    RESOLVE_LEAD: async (payload) => {\n      const phoneDigits = String(payload?.phone ?? '').replace(/\\D/g, '')\n      const configuredResolution =\n        resolutionsByPhone[phoneDigits]\n      const resolution =\n        typeof configuredResolution === 'function'\n          ? await configuredResolution(payload)\n          : (configuredResolution ?? defaultLeadResolution({ phone: phoneDigits }))\n      return { ok: true, statusCode: 200, payload: resolution }\n    },`,
  'harness: dynamic lead resolutions',
)

const testSource = String.raw`import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildWhatsAppPageHtml,
  createLeadCalls,
  defaultLeadResolution,
  loadContentScript,
  resolveLeadCalls,
  waitFor,
} from '../e3-test-support/load-content-script.mjs'

const A = '+55 44 92000-6235'
const B = '+55 21 97777-6666'
const C = '+55 11 98888-7777'

function digits(value) {
  return String(value).replace(/\D/g, '')
}

function notFound(phone) {
  return {
    ok: true,
    status: 'NOT_FOUND',
    lead: null,
    cycle: null,
    actions: {
      can_analyze_conversation: false,
      can_apply_suggestion: false,
      create_lead_url: '/leads',
    },
    flags: {
      is_owned_by_me: false,
      is_pool: false,
      is_closed: false,
    },
    phone,
    user_message: 'Nenhum lead encontrado',
  }
}

function linked(phone, name) {
  return defaultLeadResolution({
    phone,
    lead: {
      id: 'lead-' + phone.slice(-4),
      name,
      phone,
      email: null,
      cpf_cnpj: null,
      deleted_at: null,
    },
    cycle: {
      id: 'cycle-' + phone.slice(-4),
      status: 'contato',
      owner_user_id: 'user-1',
    },
  })
}

function initialHtml(title = A) {
  return buildWhatsAppPageHtml({
    headerTitle: title,
    messagesHtml: '',
  })
}

function switchConversation(document, title) {
  const titleNode = document.querySelector('#main > header span[title]')
  assert.ok(titleNode, 'header principal da conversa não encontrado')
  titleNode.setAttribute('title', title)
  titleNode.textContent = title
}

function openContactSidebar(document, phone = A) {
  const sidebar = document.createElement('aside')
  sidebar.setAttribute('data-test-contact-sidebar', 'true')
  sidebar.innerHTML = [
    '<header><span>Dados do contato</span></header>',
    '<div>Perfil do contato</div>',
    '<div>' + phone + '</div>',
  ].join('')
  document.getElementById('app').appendChild(sidebar)
  return sidebar
}

function dispatchInput(window, input) {
  input.dispatchEvent(new window.Event('input', {
    bubbles: true,
    cancelable: true,
  }))
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function createDeferred() {
  let resolve
  const promise = new Promise((next) => {
    resolve = next
  })
  return { promise, resolve }
}

async function waitForCreateForm(document) {
  return waitFor(() =>
    document.querySelector('[data-yolen-lead-create-form]'),
  )
}

test('P0: A→B com formulário focado invalida imediatamente o DOM seller-facing de A', async () => {
  const { document, window, calls } = loadContentScript({
    initialHtml: initialHtml(A),
    resolutionsByPhone: {
      [digits(A)]: notFound(digits(A)),
      [digits(B)]: linked(digits(B), 'Cliente B'),
    },
    withStabilityRuntimes: true,
  })

  const formA = await waitForCreateForm(document)
  const name = formA.querySelector('[name="yolen-lead-name"]')
  const doc = formA.querySelector('[name="yolen-lead-document"]')
  const createButtonA = formA.querySelector('button[type="submit"]')

  name.value = 'Dori'
  doc.value = '12345678901'
  dispatchInput(window, name)
  dispatchInput(window, doc)
  name.focus()

  switchConversation(document, B)

  await waitFor(() =>
    resolveLeadCalls(calls).some((call) => call.payload.phone === digits(B)),
  )
  await waitFor(() => document.getElementById('yolen-companion-panel')?.textContent?.includes('Cliente B'))

  const panelText = document.getElementById('yolen-companion-panel').textContent
  assert.equal(formA.isConnected, false)
  assert.equal(createButtonA.isConnected, false)
  assert.equal(panelText.includes('Dori'), false)
  assert.equal(panelText.includes('12345678901'), false)
  assert.equal(panelText.includes(digits(A)), false)
  assert.equal(panelText.includes('Cliente B'), true)
})

test('async stale create de A não atualiza nem re-resolve B depois da troca', async () => {
  const createA = createDeferred()
  const { document, calls } = loadContentScript({
    initialHtml: initialHtml(A),
    resolutionsByPhone: {
      [digits(A)]: notFound(digits(A)),
      [digits(B)]: linked(digits(B), 'Cliente B'),
    },
    createLeadResult: () => createA.promise,
    withStabilityRuntimes: true,
  })

  const formA = await waitForCreateForm(document)
  const name = formA.querySelector('[name="yolen-lead-name"]')
  name.value = 'Dori'
  name.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }))
  formA.querySelector('button[type="submit"]').click()

  await waitFor(() => createLeadCalls(calls).length === 1)
  switchConversation(document, B)
  await waitFor(() => document.getElementById('yolen-companion-panel')?.textContent?.includes('Cliente B'))

  const resolvesForBBefore = resolveLeadCalls(calls)
    .filter((call) => call.payload.phone === digits(B)).length

  createA.resolve({
    ok: true,
    lead: { id: 'lead-a-created', name: 'Dori', phone: digits(A) },
  })

  await sleep(450)

  const panelText = document.getElementById('yolen-companion-panel').textContent
  const resolvesForBAfter = resolveLeadCalls(calls)
    .filter((call) => call.payload.phone === digits(B)).length

  assert.equal(panelText.includes('Cliente B'), true)
  assert.equal(panelText.includes('Dori'), false)
  assert.equal(resolvesForBAfter, resolvesForBBefore)
})

test('abrir Dados do contato é mutação da mesma identidade e preserva formulário, draft e scroll', async () => {
  const { document, window, calls } = loadContentScript({
    initialHtml: initialHtml(A),
    resolutionsByPhone: {
      [digits(A)]: notFound(digits(A)),
    },
    withStabilityRuntimes: true,
  })

  const form = await waitForCreateForm(document)
  const name = form.querySelector('[name="yolen-lead-name"]')
  name.value = 'Dori'
  dispatchInput(window, name)
  name.focus()

  const panel = document.getElementById('yolen-companion-panel')
  panel.scrollTop = 123
  const resolvesBefore = resolveLeadCalls(calls).length

  openContactSidebar(document, A)
  await sleep(850)

  assert.equal(document.querySelector('#main > header span[title]').textContent, A)
  assert.equal(form.isConnected, true)
  assert.equal(name.value, 'Dori')
  assert.equal(panel.scrollTop, 123)
  assert.equal(resolveLeadCalls(calls).length, resolvesBefore)
})

test('Dados do contato aberto: pointerdown + mutação externa + click gera exatamente um CREATE_LEAD', async () => {
  let linkedAfterCreate = false

  const { document, window, calls } = loadContentScript({
    initialHtml: initialHtml(A),
    resolutionsByPhone: {
      [digits(A)]: () =>
        linkedAfterCreate
          ? linked(digits(A), 'Dori')
          : notFound(digits(A)),
    },
    createLeadResult: async (payload) => {
      linkedAfterCreate = true
      return {
        ok: true,
        lead: { id: 'lead-created', name: payload.name, phone: payload.phone },
      }
    },
    withStabilityRuntimes: true,
  })

  const form = await waitForCreateForm(document)
  const name = form.querySelector('[name="yolen-lead-name"]')
  const button = form.querySelector('button[type="submit"]')
  name.value = 'Dori'
  dispatchInput(window, name)

  button.dispatchEvent(new window.Event('pointerdown', {
    bubbles: true,
    cancelable: true,
  }))

  openContactSidebar(document, A)
  await sleep(750)

  assert.equal(button.isConnected, true, 'o botão não pode ser substituído entre pointerdown e click')
  button.click()

  await waitFor(() => createLeadCalls(calls).length === 1)
  await waitFor(() => document.getElementById('yolen-companion-panel')?.textContent?.includes('Dori'))
  await sleep(100)

  assert.equal(createLeadCalls(calls).length, 1)
})

test('sucesso de criação remove o formulário authoritative e mostra o lead vinculado', async () => {
  let linkedAfterCreate = false

  const { document, calls } = loadContentScript({
    initialHtml: initialHtml(A),
    resolutionsByPhone: {
      [digits(A)]: () =>
        linkedAfterCreate
          ? linked(digits(A), 'Dori Vinculada')
          : notFound(digits(A)),
    },
    createLeadResult: async (payload) => {
      linkedAfterCreate = true
      return {
        ok: true,
        lead: { id: 'lead-created', name: payload.name, phone: payload.phone },
      }
    },
    withStabilityRuntimes: true,
  })

  const form = await waitForCreateForm(document)
  const name = form.querySelector('[name="yolen-lead-name"]')
  name.value = 'Dori Vinculada'
  name.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }))
  form.querySelector('button[type="submit"]').click()

  await waitFor(() => createLeadCalls(calls).length === 1)
  await waitFor(() =>
    !document.querySelector('[data-yolen-lead-create-form]') &&
    document.getElementById('yolen-companion-panel')?.textContent?.includes('Dori Vinculada'),
  )

  assert.equal(document.querySelector('[data-yolen-lead-create-form]'), null)
})

test('A→B→A restaura somente o draft de A', async () => {
  const { document, window } = loadContentScript({
    initialHtml: initialHtml(A),
    resolutionsByPhone: {
      [digits(A)]: notFound(digits(A)),
      [digits(B)]: notFound(digits(B)),
    },
    withStabilityRuntimes: true,
  })

  const formA = await waitForCreateForm(document)
  const nameA = formA.querySelector('[name="yolen-lead-name"]')
  const docA = formA.querySelector('[name="yolen-lead-document"]')
  nameA.value = 'Dori'
  docA.value = '12345678901'
  dispatchInput(window, nameA)
  dispatchInput(window, docA)

  switchConversation(document, B)
  const formB = await waitFor(() => {
    const form = document.querySelector('[data-yolen-lead-create-form]')
    const phone = form?.querySelector('[name="yolen-lead-phone"]')?.value
    return digits(phone) === digits(B) ? form : false
  })
  const nameB = formB.querySelector('[name="yolen-lead-name"]')
  nameB.value = 'Beatriz'
  dispatchInput(window, nameB)

  switchConversation(document, A)
  const restoredA = await waitFor(() => {
    const form = document.querySelector('[data-yolen-lead-create-form]')
    const phone = form?.querySelector('[name="yolen-lead-phone"]')?.value
    return digits(phone) === digits(A) ? form : false
  })

  assert.equal(restoredA.querySelector('[name="yolen-lead-name"]').value, 'Dori')
  assert.equal(restoredA.querySelector('[name="yolen-lead-document"]').value, '12345678901')
  assert.equal(restoredA.textContent.includes('Beatriz'), false)
})

test('A→B→C com resoluções A/B pendentes: somente C pode vencer', async () => {
  const pendingA = createDeferred()
  const pendingB = createDeferred()

  const { document, calls } = loadContentScript({
    initialHtml: initialHtml(A),
    resolutionsByPhone: {
      [digits(A)]: () => pendingA.promise,
      [digits(B)]: () => pendingB.promise,
      [digits(C)]: linked(digits(C), 'Cliente C'),
    },
    withStabilityRuntimes: true,
  })

  await waitFor(() =>
    resolveLeadCalls(calls).some((call) => call.payload.phone === digits(A)),
  )

  switchConversation(document, B)
  await waitFor(() =>
    resolveLeadCalls(calls).some((call) => call.payload.phone === digits(B)),
  )

  switchConversation(document, C)
  await waitFor(() => document.getElementById('yolen-companion-panel')?.textContent?.includes('Cliente C'))

  pendingA.resolve(linked(digits(A), 'Cliente A tardia'))
  pendingB.resolve(linked(digits(B), 'Cliente B tardia'))
  await sleep(450)

  const panelText = document.getElementById('yolen-companion-panel').textContent
  assert.equal(panelText.includes('Cliente C'), true)
  assert.equal(panelText.includes('Cliente A tardia'), false)
  assert.equal(panelText.includes('Cliente B tardia'), false)
})
`

write(testPath, testSource)

console.log('onda7-frente1b patch applied')
