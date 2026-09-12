;(function initCompanionReasoningView(root) {
  const base = root.YolenCompanionSellerInformationView

  if (!base || base.__reasoningWrapped === true) {
    return
  }

  const escapeHtml =
    typeof base.escapeHtml === 'function'
      ? base.escapeHtml
      : (value) => String(value ?? '')

  function text(value) {
    return typeof value === 'string' && value.trim()
      ? value.trim()
      : null
  }

  function items(value) {
    return Array.isArray(value)
      ? value.filter(Boolean)
      : []
  }

  // FASE 16.9 (UX validada em Firefox, AGORA): o card principal (Decision
  // State) já disse a prioridade/ação; este bloco só acrescenta COACHING
  // — "Como conduzir agora". Próximo movimento tem prioridade visual
  // (primeiro item, fora de qualquer <details>), "Por que agora" vem
  // logo abaixo, e técnica/cuidados ficam recolhidos em "Ver técnica e
  // cuidados" — nunca mais "Técnica aplicável" dominando a tela como no
  // layout antigo. Esta função só é chamada para o modo 'agora'; ANÁLISE
  // não duplica este bloco (mandato: sem Commercial Brain duplicado).
  function renderReasoningCore(reasoning) {
    if (
      !reasoning ||
      reasoning.status === 'unavailable' ||
      reasoning.status === 'silent'
    ) {
      return ''
    }

    const technique = reasoning.technique
    const whyNow = text(reasoning.why_now)
    const nextAction = text(reasoning.next_best_action)
    const doNotDo = items(reasoning.do_not_do).slice(0, 2)
    const knowledge = items(reasoning.company_knowledge).slice(0, 2)

    const hasTechniqueDetails =
      Boolean(technique) ||
      doNotDo.length > 0 ||
      knowledge.length > 0

    if (
      !whyNow &&
      !nextAction &&
      !hasTechniqueDetails
    ) {
      return ''
    }

    return `
      <section class="yolen-seller-section yolen-reasoning-section" data-yolen-reasoning="agora">
        <div class="yolen-seller-section-heading">
          <div>
            <div class="yolen-seller-section-eyebrow">Coaching</div>
            <h3>Como conduzir agora</h3>
          </div>
        </div>
        ${nextAction ? `
          <div class="yolen-seller-detail yolen-reasoning-next-action">
            <div class="yolen-seller-detail-label">Próximo movimento</div>
            <div class="yolen-seller-detail-copy">${escapeHtml(nextAction)}</div>
          </div>
        ` : ''}
        ${whyNow ? `
          <div class="yolen-seller-detail">
            <div class="yolen-seller-detail-label">Por que agora</div>
            <div class="yolen-seller-detail-copy">${escapeHtml(whyNow)}</div>
          </div>
        ` : ''}
        ${hasTechniqueDetails ? `
          <details class="yolen-seller-secondary-details" data-yolen-preserve-details="reasoning-technique">
            <summary>Ver técnica e cuidados</summary>
            ${technique ? `
              <article class="yolen-seller-insight yolen-seller-insight--positive">
                <div class="yolen-seller-insight-type">Técnica aplicável</div>
                <div class="yolen-seller-insight-title">${escapeHtml(technique.title || '')}</div>
                ${text(technique.why_applicable) ? `<div class="yolen-seller-detail-copy">${escapeHtml(technique.why_applicable)}</div>` : ''}
              </article>
            ` : ''}
            ${doNotDo.length > 0 ? `
              <div class="yolen-seller-detail">
                <div class="yolen-seller-detail-label">Evite agora</div>
                <ul class="yolen-seller-text-list">
                  ${doNotDo.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
                </ul>
              </div>
            ` : ''}
            ${knowledge.length > 0 ? `
              <div class="yolen-seller-detail">
                <div class="yolen-seller-detail-label">Regras da empresa consideradas</div>
                <ul class="yolen-seller-text-list">
                  ${knowledge.map((item) => `<li>${escapeHtml(item.title || item.source_type || 'Conhecimento publicado')}</li>`).join('')}
                </ul>
              </div>
            ` : ''}
          </details>
        ` : ''}
      </section>
    `
  }

  const ROLE_LABELS = {
    prospect: 'Prospect',
    intermediary: 'Interlocutor / intermediário',
    decision_maker: 'Decisor',
    influencer: 'Influenciador',
    user: 'Usuário',
    beneficiary: 'Beneficiário',
  }

  function renderRoles(roles) {
    const visible = items(roles).slice(0, 6)

    if (visible.length === 0) {
      return ''
    }

    return `
      <section class="yolen-seller-section" data-yolen-customer-section="roles">
        <div class="yolen-seller-section-heading">
          <div>
            <div class="yolen-seller-section-eyebrow">Papéis na decisão</div>
            <h3>Quem é quem nesta venda</h3>
          </div>
        </div>
        <div class="yolen-seller-stack">
          ${visible.map((role) => `
            <article class="yolen-seller-insight">
              <div class="yolen-seller-insight-type">${escapeHtml(ROLE_LABELS[role.role] || role.role || 'Papel comercial')}</div>
              <div class="yolen-seller-insight-title">${escapeHtml(role.label || ROLE_LABELS[role.role] || '')}</div>
              <div class="yolen-seller-detail-copy">${role.scope === 'current_contact' ? 'Pessoa que está falando nesta conversa.' : 'Pessoa relacionada à oportunidade.'}</div>
            </article>
          `).join('')}
        </div>
      </section>
    `
  }

  function renderReadyMessage(reasoning) {
    const message = text(
      reasoning?.message?.ready_to_send,
    )

    if (!message) {
      return ''
    }

    return `
      <section class="yolen-seller-section" data-yolen-reasoning-message-preview>
        <div class="yolen-seller-section-heading">
          <div>
            <div class="yolen-seller-section-eyebrow">Mensagem</div>
            <h3>Base pronta para enviar</h3>
          </div>
        </div>
        <div class="yolen-seller-detail-copy">${escapeHtml(message)}</div>
        <div class="yolen-message-footnote">Edite no WhatsApp antes de enviar. A Yolen não envia automaticamente.</div>
      </section>
    `
  }

  const originalAgora =
    base.renderAgoraViewModelSnapshot
      .bind(base)
  const originalAnalysis =
    base.renderAnalysisViewModel
      .bind(base)
  const originalCustomer =
    base.renderCustomerViewModel
      .bind(base)

  const enhanced = {
    ...base,

    renderAgoraViewModelSnapshot(viewModel) {
      const current = originalAgora(viewModel)

      if (!viewModel || viewModel.silent) {
        return current
      }

      return [
        current,
        renderReasoningCore(
          viewModel.reasoning,
        ),
      ].join('')
    },

    // FASE 16.9 (UX validada em Firefox): ANÁLISE não duplica o bloco de
    // Commercial Brain/coaching que já aparece em AGORA — coaching aqui
    // vem só de seller_strengths/improvement_points (renderStrengths/
    // renderImprovements em companion-seller-information-view.js), nunca
    // de um segundo bloco de reasoning.
    renderAnalysisViewModel(viewModel) {
      return originalAnalysis(viewModel)
    },

    renderCustomerViewModel(viewModel) {
      const current = originalCustomer(viewModel)

      return [
        renderRoles(
          viewModel?.roles ||
          viewModel?.reasoning?.customer_roles,
        ),
        current,
      ].join('')
    },

    renderReasoningMessagePreview(reasoning) {
      return renderReadyMessage(reasoning)
    },

    __reasoningWrapped: true,
  }

  root.YolenCompanionSellerInformationView =
    Object.freeze(enhanced)

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = root.YolenCompanionSellerInformationView
  }
})(typeof globalThis !== 'undefined' ? globalThis : window)
