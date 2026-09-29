;(function initCompanionReasoningView(root) {
  // FASE 5: esta view só compõe o raciocínio comercial sobre as views
  // seller-facing. O fallback de anexos que lia/escrevia o DOM do WhatsApp
  // saiu daqui (Q6: normalização em memória no adapter) e a composição com
  // a view base é explícita — o bootstrap chama
  // enhanceSellerInformationView(base); nenhum global é sobrescrito.
  function enhanceSellerInformationView(base) {
    if (!base || base.__reasoningWrapped === true) {
      return base
    }

    const escapeHtml =
      typeof base.escapeHtml === 'function'
        ? base.escapeHtml
        : (value) => String(value ?? '')

    const sellerText =
      typeof base.sellerText === 'function'
        ? base.sellerText
        : (value, fallback = null) => {
            const clean =
              typeof value === 'string'
                ? value.trim()
                : ''

            return clean || fallback
          }

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

    // Helpers de deduplicação semântica da view base (mesma régua na
    // ANÁLISE e no AGORA).
    const repeatsContent =
      typeof base.repeatsContent === 'function'
        ? base.repeatsContent
        : () => false

    const splitSentences =
      typeof base.splitSentences === 'function'
        ? base.splitSentences
        : (value) => (text(value) ? [text(value)] : [])

    const novelSentences =
      typeof base.novelSentences === 'function'
        ? base.novelSentences
        : (value) => splitSentences(value)

    // AGORA = 1 decisão → 1 ação → 1 justificativa curta. O loader já pôs
    // a situação e a próxima ação do raciocínio no card principal; aqui só
    // se escolhe UM "por quê" que acrescente informação, e a situação perde
    // a sentença que virou esse "por quê". Momento, raciocínio restante,
    // técnica e cuidados ficam em progressive disclosure.
    function planAgoraFirstLevel(viewModel) {
      const reasoning = viewModel?.reasoning

      if (
        !reasoning ||
        reasoning.status === 'unavailable' ||
        reasoning.status === 'silent'
      ) {
        return null
      }

      const headline = text(viewModel?.primary?.headline)
      const action = text(viewModel?.primary?.action)
      const whyNow = sellerText(text(reasoning.why_now), null)
      const momentum =
        reasoning.momentum &&
        typeof reasoning.momentum === 'object'
          ? reasoning.momentum
          : null
      const temporalFacts =
        momentum && momentum.state !== 'active'
          ? items(momentum.facts).map(text).filter(Boolean)
          : []

      const headlineSentences = splitSentences(headline)
      const factSentences =
        temporalFacts.length > 0
          ? headlineSentences.filter((sentence) => repeatsContent(sentence, temporalFacts))
          : []
      const situationSentences = headlineSentences.filter(
        (sentence) => !factSentences.includes(sentence),
      )

      let situation = headline
      let why = null
      let whySource = null

      if (factSentences.length > 0 && situationSentences.length > 0) {
        // A própria situação já traz o fato temporal que justifica a ação.
        situation = situationSentences.join(' ')
        why = factSentences.join(' ')
        whySource = 'temporal_facts'
      } else {
        // Só o motivo que a situação e a ação ainda não disseram. Se nada
        // for novo, não há "por quê" no primeiro nível: a situação já
        // justifica a ação e os fatos ficam nos detalhes.
        const novelWhy = novelSentences(
          whyNow,
          [headline, action],
          { clauses: true },
        )

        if (novelWhy.length > 0) {
          why = novelWhy[0]
          whySource = 'why_now'
        }
      }

      const shown = [situation, action, why].filter(Boolean)

      return {
        situation,
        why,
        whySource,
        momentum,
        remainingFacts: temporalFacts.filter((fact) => !repeatsContent(fact, shown)),
        remainingReasoning: novelSentences(whyNow, shown, { clauses: true }),
      }
    }

    function renderAgoraRationale(reasoning, plan) {
      if (!plan) {
        return ''
      }

      const technique = reasoning.technique
      const doNotDo = items(reasoning.do_not_do).slice(0, 2)
      const momentum = plan.momentum
      const momentumLabel =
        momentum && momentum.state !== 'active'
          ? text(momentum.label)
          : null

      const detailBlocks = [
        momentumLabel ? `
          <div class="yolen-seller-detail">
            <div class="yolen-seller-detail-label">Momento</div>
            <div class="yolen-seller-detail-copy">${escapeHtml(momentumLabel)}</div>
          </div>
        ` : '',
        plan.remainingFacts.length > 0 ? `
          <div class="yolen-seller-detail">
            <div class="yolen-seller-detail-label">Fatos do momento</div>
            <ul class="yolen-seller-text-list">
              ${plan.remainingFacts.map((fact) => `<li>${escapeHtml(fact)}</li>`).join('')}
            </ul>
          </div>
        ` : '',
        plan.remainingReasoning.length > 0 ? `
          <div class="yolen-seller-detail">
            <div class="yolen-seller-detail-label">Raciocínio</div>
            <div class="yolen-seller-detail-copy">${escapeHtml(plan.remainingReasoning.join(' '))}</div>
          </div>
        ` : '',
        technique ? `
          <div class="yolen-seller-detail">
            <div class="yolen-seller-detail-label">Técnica aplicável</div>
            <div class="yolen-seller-detail-copy">${escapeHtml(sellerText(technique.title, 'Técnica comercial'))}</div>
          </div>
        ` : '',
        doNotDo.length > 0 ? `
          <div class="yolen-seller-detail">
            <div class="yolen-seller-detail-label">Evite agora</div>
            <ul class="yolen-seller-text-list">
              ${doNotDo.map((item) => `<li>${escapeHtml(sellerText(item, 'Cuidado comercial'))}</li>`).join('')}
            </ul>
          </div>
        ` : '',
      ].filter(Boolean)

      if (!plan.why && detailBlocks.length === 0) {
        return ''
      }

      const summary =
        technique && doNotDo.length > 0
          ? 'Ver técnica e cuidados'
          : technique
            ? 'Ver técnica'
            : doNotDo.length > 0
              ? 'Ver cuidados'
              : 'Ver detalhes'

      return `
        <section
          class="yolen-seller-section yolen-reasoning-section yolen-now-rationale"
          data-yolen-reasoning="agora"
          ${momentumLabel ? `data-yolen-agora-momentum="${escapeHtml(momentum.state || 'unknown')}"` : ''}
        >
          ${plan.why ? `
            <div
              class="yolen-seller-detail yolen-now-rationale-main"
              data-yolen-agora-why="${escapeHtml(plan.whySource)}"
            >
              <div class="yolen-seller-detail-label">Por que essa ação</div>
              <div class="yolen-seller-detail-copy">${escapeHtml(plan.why)}</div>
            </div>
          ` : ''}

          ${detailBlocks.length > 0 ? `
            <details
              class="yolen-seller-secondary-details"
              data-yolen-preserve-details="agora-technique"
            >
              <summary>${summary}</summary>
              ${detailBlocks.join('')}
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
                <div class="yolen-seller-insight-type">${escapeHtml(ROLE_LABELS[role.role] || 'Papel comercial')}</div>
                <div class="yolen-seller-insight-title">${escapeHtml(sellerText(role.label, ROLE_LABELS[role.role] || 'Pessoa relacionada à oportunidade'))}</div>
                <div class="yolen-seller-detail-copy">${role.scope === 'current_contact' ? 'Pessoa que está falando nesta conversa.' : 'Pessoa relacionada à oportunidade.'}</div>
              </article>
            `).join('')}
          </div>
        </section>
      `
    }

    function renderReadyMessage(reasoning, { platformDisplayName = '' } = {}) {
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
          <div class="yolen-message-footnote">${platformDisplayName ? `Edite no ${escapeHtml(platformDisplayName)} antes de enviar.` : 'Edite a mensagem antes de enviar.'} A Yolen não envia automaticamente.</div>
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
        if (!viewModel || viewModel.silent) {
          return originalAgora(viewModel)
        }

        const plan = planAgoraFirstLevel(viewModel)

        const current = originalAgora(
          plan &&
          viewModel.primary &&
          plan.situation &&
          plan.situation !== text(viewModel.primary.headline)
            ? {
                ...viewModel,
                primary: {
                  ...viewModel.primary,
                  headline: plan.situation,
                },
              }
            : viewModel,
        )

        return [
          current,
          renderAgoraRationale(
            viewModel.reasoning,
            plan,
          ),
        ].join('')
      },

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

      renderReasoningMessagePreview(reasoning, options) {
        return renderReadyMessage(reasoning, options)
      },

      __reasoningWrapped: true,
    }

    return Object.freeze(enhanced)
  }

  const api = Object.freeze({
    enhanceSellerInformationView,
  })

  root.YolenCompanionReasoningView = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : window)
