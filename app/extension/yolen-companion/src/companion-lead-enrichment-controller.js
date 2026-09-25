;(function initYolenCompanionLeadEnrichmentController(root) {
function createCompanionLeadEnrichmentController(ctx) {
  // Dependências explícitas do Core (funções e referências estáveis).
  // Estado mutável do Core é lido via ctx.<nome> no momento do uso.
  const {
    MAX_MESSAGE_LEDGER_SIZE,
    PANEL_ID,
    escapeHtml,
    getCanonicalResolutionCycleId,
    getCanonicalResolutionStatus,
    getMessageTranscription,
    getSortedLedgerMessages,
    leadEnrichmentTools,
    messageMutationTools,
    onlyDigits,
    renderPanel,
  } = ctx

  const ignoredLeadEnrichmentCandidateKeys =
    new Set()

  function getStructuredMessagesForEnrichment(
    transcriptionMap = null,
  ) {
    return getSortedLedgerMessages()
      .slice(
        -MAX_MESSAGE_LEDGER_SIZE,
      )
      .map((message) => {
        return {
          id: message.id,
          timestamp_ms:
            message.timestampMs,
          timestamp_label:
            message.timestampLabel,
          date_key: message.dateKey,
          direction:
            message.direction,
          sender: message.sender,
          text:
            messageMutationTools
              .prepareCapturedMessageTextForAnalysis(
                message.text,
              ),
          has_audio:
            message.hasAudio,
          audio_transcription:
            getMessageTranscription(
              message.id,
              transcriptionMap,
            ),
        }
      })
  }

  function getLeadEnrichmentAddressValue(
    profile,
  ) {
    const parts = [
      profile?.address_street,
      profile?.address_number,
      profile?.address_complement,
      profile?.address_neighborhood,
      profile?.address_city,
      profile?.address_state,
    ]
      .map((value) =>
        String(value || '').trim(),
      )
      .filter(Boolean)

    return parts.length > 0
      ? parts.join(', ')
      : null
  }

  function getCurrentLeadEnrichmentValue(
    field,
    resolution,
  ) {
    const lead =
      resolution?.lead || {}

    const profile =
      resolution?.lead_profile || {}

    if (field === 'email') {
      return (
        lead.email ||
        profile.email ||
        null
      )
    }

    if (field === 'cpf') {
      return (
        profile.cpf ||
        (
          onlyDigits(
            lead.cpf_cnpj,
          ).length === 11
            ? onlyDigits(
                lead.cpf_cnpj,
              )
            : null
        )
      )
    }

    if (field === 'cnpj') {
      return (
        profile.cnpj ||
        (
          onlyDigits(
            lead.cpf_cnpj,
          ).length === 14
            ? onlyDigits(
                lead.cpf_cnpj,
              )
            : null
        )
      )
    }

    if (field === 'birth_date') {
      return profile.birth_date || null
    }

    if (field === 'profession') {
      return profile.profession || null
    }

    if (field === 'cep') {
      return profile.cep || null
    }

    if (field === 'address_raw') {
      return getLeadEnrichmentAddressValue(
        profile,
      )
    }

    if (field === 'phone_mobile') {
      return profile.phone_mobile || null
    }

    return null
  }

  function normalizeLeadEnrichmentComparisonValue(
    value,
  ) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('pt-BR')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  function areSameLeadEnrichmentValue(
    field,
    currentValue,
    candidateValue,
  ) {
    if (
      !currentValue ||
      !candidateValue
    ) {
      return false
    }

    if (
      field === 'cpf' ||
      field === 'cnpj' ||
      field === 'cep'
    ) {
      return (
        onlyDigits(currentValue) ===
        onlyDigits(candidateValue)
      )
    }

    if (
      field === 'phone_mobile' &&
      typeof leadEnrichmentTools
        ?.areEquivalentPhones ===
        'function'
    ) {
      return leadEnrichmentTools
        .areEquivalentPhones(
          currentValue,
          candidateValue,
        )
    }

    const currentNormalized =
      normalizeLeadEnrichmentComparisonValue(
        currentValue,
      )

    const candidateNormalized =
      normalizeLeadEnrichmentComparisonValue(
        candidateValue,
      )

    if (
      !currentNormalized ||
      !candidateNormalized
    ) {
      return false
    }

    if (field === 'address_raw') {
      return (
        currentNormalized ===
          candidateNormalized ||
        currentNormalized.includes(
          candidateNormalized,
        ) ||
        candidateNormalized.includes(
          currentNormalized,
        )
      )
    }

    return (
      currentNormalized ===
      candidateNormalized
    )
  }

  // FASE 7 — canal com resolução sanitizada (INV-6): o background entrega
  // só a semântica de presença de cada campo (§19.3) e reinjeta a
  // referência privada do lead ao aplicar.
  function getPrivateEnrichmentContext(resolution) {
    const context =
      resolution?.enrichment_context

    return context &&
      context.available === true &&
      context.fields &&
      typeof context.fields === 'object'
      ? context
      : null
  }

  function hasEnrichableLeadReference(resolution) {
    return Boolean(
      resolution?.lead?.id ||
      getPrivateEnrichmentContext(resolution),
    )
  }

  function getLeadEnrichmentCandidates() {
    // Raw somente para campos cadastrais do lead (lead.id / lead.phone),
    // deliberadamente fora do ViewModel; status/ciclo vêm do canônico.
    const resolution =
      ctx.state.leadResolution

    const privateContext =
      resolution?.lead?.id
        ? null
        : getPrivateEnrichmentContext(
            resolution,
          )

    const isNewLead =
      getCanonicalResolutionStatus() ===
      'NOT_FOUND'

    const isOwnedLead =
      getCanonicalResolutionStatus() ===
        'OWNED_BY_ME' &&
      hasEnrichableLeadReference(
        resolution,
      ) &&
      getCanonicalResolutionCycleId()

    if (
      !leadEnrichmentTools ||
      typeof leadEnrichmentTools
        .extractLeadEnrichmentCandidates !==
        'function' ||
      typeof leadEnrichmentTools
        .isLeadEnrichmentCandidate !==
        'function' ||
      (
        !isNewLead &&
        !isOwnedLead
      )
    ) {
      return []
    }

    const messages =
      getStructuredMessagesForEnrichment()

    const candidates =
      leadEnrichmentTools
        .extractLeadEnrichmentCandidates(
          messages,
          {
            currentPhone:
              resolution?.lead?.phone ||
              ctx.state.conversationPhone ||
              null,
          },
        )
        .filter(
          (candidate) =>
            leadEnrichmentTools
              .isLeadEnrichmentCandidate(
                candidate,
              ),
        )

    if (isNewLead) {
      return candidates.map(
        (candidate) => ({
          ...candidate,
          current_value: null,
          comparison: 'new_lead',
        }),
      )
    }

    return candidates.flatMap(
      (candidate) => {
        if (privateContext) {
          // Valor atual privado: só campos ausentes são oferecidos (nada
          // cadastrado é sobrescrito sem comparação explícita).
          return privateContext.fields[
            candidate.field
          ] === 'missing'
            ? [{
                ...candidate,
                current_value: null,
                comparison: 'missing',
              }]
            : []
        }

        const currentValue =
          getCurrentLeadEnrichmentValue(
            candidate.field,
            resolution,
          )

        if (
          currentValue &&
          areSameLeadEnrichmentValue(
            candidate.field,
            currentValue,
            candidate.normalized_value,
          )
        ) {
          return []
        }

        return [{
          ...candidate,
          current_value:
            currentValue || null,
          comparison:
            currentValue
              ? 'different'
              : 'missing',
        }]
      },
    )
  }

  function getLeadEnrichmentFieldLabel(
    field,
  ) {
    const labels = {
      email: 'E-mail',
      cpf: 'CPF',
      cnpj: 'CNPJ',
      birth_date: 'Data de nascimento',
      profession: 'Profissão',
      cep: 'CEP',
      address_raw: 'Endereço',
      phone_mobile:
        'Telefone adicional',
    }

    return (
      labels[field] ||
      'Dado cadastral'
    )
  }

  function getLeadEnrichmentCandidateKey(
    candidate,
  ) {
    const evidenceIds =
      Array.isArray(
        candidate?.evidence_message_ids,
      )
        ? candidate.evidence_message_ids
        : []

    return [
      ctx.state.leadResolution?.lead?.id ||
        getCanonicalResolutionCycleId() ||
        '',
      candidate?.field || '',
      candidate?.normalized_value || '',
      candidate?.current_value || '',
      ...evidenceIds,
    ].join('::')
  }

  function isConfirmableLeadEnrichmentCandidate(
    candidate,
  ) {
    return [
      'email',
      'cpf',
      'cnpj',
      'birth_date',
      'profession',
      'cep',
      'phone_mobile',
    ].includes(
      candidate?.field,
    )
  }

  function getVisibleLeadEnrichmentCandidates() {
    return getLeadEnrichmentCandidates()
      .filter((candidate) => {
        const candidateKey =
          getLeadEnrichmentCandidateKey(
            candidate,
          )

        return !ignoredLeadEnrichmentCandidateKeys
          .has(candidateKey)
      })
  }

  function ignoreLeadEnrichmentCandidate(
    candidateKey,
  ) {
    if (!candidateKey) {
      return
    }

    ignoredLeadEnrichmentCandidateKeys
      .add(candidateKey)

    ctx.state = {
      ...ctx.state,
      leadEnrichmentApplySuccessKey:
        null,
      leadEnrichmentApplyError:
        null,
    }

    renderPanel()
  }

  async function applyLeadEnrichmentCandidate(
    candidateKey,
  ) {
    if (
      !candidateKey ||
      ctx.state.leadEnrichmentApplyLoadingKey
    ) {
      return
    }

    // Raw somente para lead.id (fora do ViewModel); status/ciclo vêm do
    // canônico.
    const resolution =
      ctx.state.leadResolution

    const cycleId =
      getCanonicalResolutionCycleId()

    if (
      getCanonicalResolutionStatus() !==
        'OWNED_BY_ME' ||
      !hasEnrichableLeadReference(
        resolution,
      ) ||
      !cycleId
    ) {
      return
    }

    const candidate =
      getVisibleLeadEnrichmentCandidates()
        .find((item) => {
          return (
            getLeadEnrichmentCandidateKey(
              item,
            ) === candidateKey
          )
        })

    if (!candidate) {
      return
    }

    if (
      candidate
        .requires_human_confirmation !==
        true ||
      !isConfirmableLeadEnrichmentCandidate(
        candidate,
      )
    ) {
      ctx.state = {
        ...ctx.state,
        leadEnrichmentApplyError:
          'Este dado exige revisão manual antes de alterar o cadastro.',
      }

      renderPanel()
      return
    }

    if (
      !window
        .YolenCompanionApi
        ?.applyLeadEnrichment
    ) {
      ctx.state = {
        ...ctx.state,
        leadEnrichmentApplyError:
          'Atualização cadastral indisponível nesta versão do Companion.',
      }

      renderPanel()
      return
    }

    ctx.state = {
      ...ctx.state,
      leadEnrichmentApplyLoadingKey:
        candidateKey,
      leadEnrichmentApplySuccessKey:
        null,
      leadEnrichmentApplyError:
        null,
    }

    renderPanel()

    try {
      const result =
        await window
          .YolenCompanionApi
          .applyLeadEnrichment({
            // Canal sanitizado: o background reinjeta a referência
            // privada a partir do cycle_id autorizado.
            lead_id:
              resolution.lead?.id ??
              null,
            cycle_id:
              cycleId,
            field:
              candidate.field,
            value:
              candidate.normalized_value,
            expected_current_value:
              candidate.current_value ||
              null,
            evidence_message_ids:
              candidate
                .evidence_message_ids,
            confirmed_by_human:
              true,
          })

      if (
        !result?.ok ||
        !result?.payload?.ok
      ) {
        throw new Error(
          result?.payload?.error ||
            'Não foi possível atualizar o cadastro.',
        )
      }

      ctx.state = {
        ...ctx.state,
        leadEnrichmentApplyLoadingKey:
          null,
        leadEnrichmentApplySuccessKey:
          candidateKey,
        leadEnrichmentApplyError:
          null,
      }

      renderPanel()

      window.setTimeout(() => {
        const panel =
          document.getElementById(
            PANEL_ID,
          )

        panel
          ?.querySelector(
            '[data-yolen-action="refresh"]',
          )
          ?.click()
      }, 350)
    } catch (error) {
      ctx.state = {
        ...ctx.state,
        leadEnrichmentApplyLoadingKey:
          null,
        leadEnrichmentApplySuccessKey:
          null,
        leadEnrichmentApplyError:
          error instanceof Error &&
          error.message
            ? error.message
            : 'Erro ao atualizar o cadastro.',
      }

      renderPanel()
    }
  }

  function getLeadEnrichmentCandidateActionsHtml(
    candidate,
  ) {
    const candidateKey =
      getLeadEnrichmentCandidateKey(
        candidate,
      )

    const isApplying =
      ctx.state
        .leadEnrichmentApplyLoadingKey ===
      candidateKey

    const isApplied =
      ctx.state
        .leadEnrichmentApplySuccessKey ===
      candidateKey

    const actionsLocked =
      Boolean(
        ctx.state
          .leadEnrichmentApplyLoadingKey,
      ) ||
      isApplied

    const ignoreButton = [
      '<button',
        ' class="yolen-secondary-button"',
        ' type="button"',
        ' data-yolen-action="ignore-lead-enrichment"',
        ' data-yolen-enrichment-key="' +
          escapeHtml(candidateKey) +
          '"',
        actionsLocked
          ? ' disabled'
          : '',
      '>',
        'Ignorar',
      '</button>',
    ].join('')

    if (
      !isConfirmableLeadEnrichmentCandidate(
        candidate,
      ) ||
      candidate
        .requires_human_confirmation !==
        true
    ) {
      return [
        '<div class="yolen-inline-actions">',
          ignoreButton,
        '</div>',
        '<div class="yolen-operational-note">',
          'Este campo exige revisão manual.',
        '</div>',
      ].join('')
    }

    const confirmButton = [
      '<button',
        ' class="yolen-primary-button"',
        ' type="button"',
        ' data-yolen-action="confirm-lead-enrichment"',
        ' data-yolen-enrichment-key="' +
          escapeHtml(candidateKey) +
          '"',
        actionsLocked
          ? ' disabled'
          : '',
      '>',
        isApplied
          ? 'Atualizado'
          : isApplying
            ? 'Salvando...'
            : 'Confirmar',
      '</button>',
    ].join('')

    return [
      '<div class="yolen-inline-actions yolen-enrichment-actions">',
        confirmButton,
        ignoreButton,
      '</div>',
    ].join('')
  }

  function getLeadEnrichmentCandidatesHtml() {
    if (
      getCanonicalResolutionStatus() ===
      'NOT_FOUND'
    ) {
      return ''
    }

    const candidates =
      getVisibleLeadEnrichmentCandidates()

    if (candidates.length === 0) {
      return ''
    }

    const items =
      candidates
        .map((candidate) => {
          const evidenceCount =
            candidate
              .evidence_message_ids
              .length

          const evidenceLabel =
            evidenceCount === 1
              ? '1 mensagem de evidência'
              : `${evidenceCount} mensagens de evidência`

          const confidenceLabel =
            candidate.confidence ===
            'high'
              ? 'Alta confiança'
              : 'Média confiança'

          const comparisonLabel =
            candidate.current_value
              ? (
                  'Atual: ' +
                  candidate.current_value
                )
              : 'Ainda não consta no cadastro'

          return [
            '<div class="yolen-decision-list-item">',
              '<div class="yolen-decision-kicker">',
                escapeHtml(
                  getLeadEnrichmentFieldLabel(
                    candidate.field,
                  ),
                ),
              '</div>',
              '<div class="yolen-decision-copy">',
                escapeHtml(
                  candidate.value,
                ),
              '</div>',
              '<div class="yolen-card-description">',
                escapeHtml(
                  confidenceLabel +
                  ' · ' +
                  evidenceLabel +
                  ' · ' +
                  comparisonLabel,
                ),
              '</div>',
              getLeadEnrichmentCandidateActionsHtml(
                candidate,
              ),
            '</div>',
          ].join('')
        })
        .join('')

    return [
      '<div class="yolen-card yolen-lead-enrichment-card">',
        '<div class="yolen-section-label">',
          'Cadastro',
        '</div>',

        '<div class="yolen-card-title">',
          'Dados encontrados na conversa',
        '</div>',

        '<div class="yolen-card-description">',
          'A Yolen identificou informações que podem complementar o cadastro deste lead.',
        '</div>',

        '<div class="yolen-decision-list">',
          items,
        '</div>',

        ctx.state.leadEnrichmentApplyError
          ? [
              '<div class="yolen-operational-note">',
                escapeHtml(
                  ctx.state
                    .leadEnrichmentApplyError,
                ),
              '</div>',
            ].join('')
          : '',

        '<div class="yolen-operational-note">',
          'O cadastro só muda depois que você confirmar.',
        '</div>',
      '</div>',
    ].join('')
  }

  return {
    getLeadEnrichmentCandidates,
    getLeadEnrichmentCandidateKey,
    getVisibleLeadEnrichmentCandidates,
    ignoreLeadEnrichmentCandidate,
    applyLeadEnrichmentCandidate,
    getLeadEnrichmentCandidatesHtml,
  }
}

const api = Object.freeze({
  create: createCompanionLeadEnrichmentController,
})

root.YolenCompanionLeadEnrichmentController = api

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
