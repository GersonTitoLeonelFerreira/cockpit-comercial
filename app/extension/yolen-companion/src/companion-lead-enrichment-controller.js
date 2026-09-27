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

  // FASE 8 — comparação única (companion-enrichment-comparison.js): a
  // MESMA regra missing/same/different nos dois canais (§19.3/§19.4). O
  // valor atual nunca vai para a view. Canal com payload completo compara
  // aqui; canal sanitizado pede a comparação privada ao background.
  const enrichmentComparison =
    root.YolenCompanionEnrichmentComparison

  // cycleId::campo::valor → comparação privada devolvida pelo background.
  const privateComparisons =
    new Map()
  const privateComparisonRequests =
    new Set()

  function getPrivateComparisonKey(cycleId, candidate) {
    return [
      cycleId || '',
      candidate?.field || '',
      candidate?.normalized_value || '',
    ].join('::')
  }

  function requestPrivateComparisons(cycleId, candidates) {
    const missing = candidates.filter((candidate) => {
      const key = getPrivateComparisonKey(cycleId, candidate)
      return !privateComparisonRequests.has(key)
    })

    if (
      missing.length === 0 ||
      typeof window.YolenCompanionApi
        ?.compareLeadEnrichmentCandidates !== 'function'
    ) {
      return
    }

    for (const candidate of missing) {
      privateComparisonRequests.add(
        getPrivateComparisonKey(cycleId, candidate),
      )
    }

    void window.YolenCompanionApi
      .compareLeadEnrichmentCandidates({
        cycle_id: cycleId,
        conversation_phone:
          ctx.state.conversationPhone || null,
        candidates: missing.map((candidate) => ({
          field: candidate.field,
          normalized_value: candidate.normalized_value,
        })),
      })
      .then((result) => {
        const comparisons =
          Array.isArray(result?.payload?.comparisons)
            ? result.payload.comparisons
            : []

        for (const item of comparisons) {
          if (['missing', 'same', 'different'].includes(item?.comparison)) {
            privateComparisons.set(
              getPrivateComparisonKey(cycleId, item),
              item.comparison,
            )
          }
        }

        // Resposta de outro ciclo (troca de conversa) só fica no cache do
        // próprio ciclo; nada é renderizado fora dele.
        if (getCanonicalResolutionCycleId() === cycleId) {
          renderPanel()
        }
      })
      .catch(() => {
        for (const candidate of missing) {
          privateComparisonRequests.delete(
            getPrivateComparisonKey(cycleId, candidate),
          )
        }
      })
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

    // Novo cadastro: o telefone da conversa não é candidato. Lead
    // existente: a exclusão do telefone principal é da comparação única.
    const candidates =
      leadEnrichmentTools
        .extractLeadEnrichmentCandidates(
          messages,
          {
            currentPhone:
              isNewLead
                ? ctx.state.conversationPhone || null
                : null,
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

    const cycleId =
      getCanonicalResolutionCycleId()

    if (privateContext) {
      const pending = []
      const visible = []

      for (const candidate of candidates) {
        const comparison =
          privateComparisons.get(
            getPrivateComparisonKey(cycleId, candidate),
          )

        if (!comparison) {
          pending.push(candidate)
        } else if (comparison !== 'same') {
          visible.push({
            ...candidate,
            current_value: null,
            comparison,
          })
        }
      }

      if (pending.length > 0) {
        requestPrivateComparisons(cycleId, pending)
      }

      return visible
    }

    return candidates.flatMap(
      (candidate) => {
        const comparison =
          enrichmentComparison
            .compareEnrichmentCandidate(
              candidate,
              {
                lead: resolution?.lead,
                profile: resolution?.lead_profile,
                conversationPhone:
                  ctx.state.conversationPhone || null,
              },
              leadEnrichmentTools,
            )

        return comparison === 'same'
          ? []
          : [{
              ...candidate,
              current_value: null,
              comparison,
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

    // Chave neutra de canal: ciclo canônico (nunca lead.id no DOM).
    return [
      getCanonicalResolutionCycleId() || '',
      candidate?.field || '',
      candidate?.normalized_value || '',
      candidate?.comparison || '',
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
            // CAS: canal com payload completo envia o valor atual; no canal
            // sanitizado o background o reinjeta (nunca chega à view).
            expected_current_value:
              resolution.lead?.id
                ? enrichmentComparison
                    .readCurrentEnrichmentValue(
                      candidate.field,
                      resolution.lead,
                      resolution.lead_profile,
                    )
                : null,
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

          // §19.3: só a semântica; o valor atual não é exibido.
          const comparisonLabel =
            candidate.comparison === 'different'
              ? 'Diferente do valor já cadastrado'
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
