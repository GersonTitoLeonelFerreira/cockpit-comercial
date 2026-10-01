;(function initCompanionSellerInformationView(root) {
  const METHOD_STATUS_LABELS = {
    completed: 'Concluída',
    active: 'Ativa',
    partial: 'Parcial',
    not_started: 'Não iniciada',
    skipped: 'Pulada',
    not_applicable: 'Não se aplica',
  }

  const METHOD_ADHERENCE_LABELS = {
    on_method: 'Dentro do método',
    partially_on_method: 'Parcialmente dentro do método',
    off_method: 'Fora do método',
    not_configured: 'Método não configurado',
    insufficient_evidence: 'Evidência insuficiente',
  }

  const STRENGTH_KIND_LABELS = {
    answered_question: 'Pergunta respondida',
    good_discovery: 'Boa descoberta',
    correct_information: 'Informação correta',
    respected_space: 'Espaço respeitado',
    method_alignment: 'Aderência ao método',
    clear_explanation: 'Explicação clara',
    handled_objection: 'Objeção bem conduzida',
    confirmed_information: 'Informação confirmada',
    other: 'Acerto observado',
  }

  const IMPROVEMENT_KIND_LABELS = {
    unanswered_question: 'Pergunta sem resposta',
    premature_price: 'Preço apresentado cedo demais',
    premature_presentation: 'Apresentação prematura',
    insufficient_discovery: 'Descoberta insuficiente',
    interrogation: 'Conversa em formato de interrogatório',
    repetition: 'Repetição desnecessária',
    pressure: 'Pressão comercial',
    incorrect_information: 'Informação incorreta',
    poor_objection_handling: 'Objeção mal conduzida',
    advance_without_confirmation: 'Avanço sem confirmação',
    missing_next_commitment: 'Próximo compromisso indefinido',
    method_misapplication: 'Aplicação incorreta do método',
    promise_risk: 'Risco de promessa',
    missed_commitment: 'Compromisso não cumprido',
    other: 'Melhoria observada',
  }

  const RISK_SEVERITY_LABELS = {
    low: 'Baixo',
    medium: 'Médio',
    high: 'Alto',
  }

  // FASE 16.5 (recalibração seller-facing do AGORA): as tabelas locais de
  // prioridade/tie-break (ATTENTION_PRIORITY_RANK/ATTENTION_SOURCE_RANK),
  // os conjuntos de severidade (CRITICAL_RISK_KINDS/HIGH_IMPROVEMENT_KINDS)
  // e o limiar de "cliente aguardando" (CUSTOMER_WAITING_ATTENTION_MS) que
  // existiam aqui foram removidos — eram uma segunda implementação,
  // independente e já divergente, da mesma priorização que Decision State
  // (canonical-decision-state-source.ts, FASE 16.3E) já computa
  // server-side. AGORA agora consome o AgoraViewModel pronto (ver
  // renderAgoraViewModelSnapshot mais abaixo) em vez de reconstruir a
  // decisão a partir da leitura crua — achado da auditoria da FASE 16.5.

  const AGORA_VIEW_MODEL_STATUS_LABELS = {
    respond: 'Responder agora',
    follow_up: 'Retomar contato',
    handle_objection: 'Objeção em aberto',
    escalate: 'Atenção',
    give_space: 'Dê espaço',
    deepen_discovery: 'Descoberta incompleta',
    no_intervention: 'Nada a fazer agora',
  }

  const AGORA_VIEW_MODEL_STATUS_TONE = {
    escalate: 'risk',
    handle_objection: 'warning',
    deepen_discovery: 'warning',
    respond: 'warning',
    follow_up: 'warning',
    give_space: 'information',
    no_intervention: 'information',
  }

  const PRODUCT_INTEREST_LABELS = {
    discussed: 'Produto discutido',
    interested: 'Interesse demonstrado',
    primary: 'Maior interesse',
  }

  const COMMUNICATION_OBSERVATION_LABELS = {
    event: 'Comportamento observado',
    explicit_preference: 'Preferência explícita',
    pattern: 'Padrão observado',
  }

  const COMMUNICATION_BEHAVIOR_LABELS = {
    short_responses: 'Mensagens objetivas',
    direct_questions: 'Perguntas diretas',
    requests_data_or_numbers: 'Busca dados ou números',
    frequent_audio: 'Uso frequente de áudio',
    prefers_short_explanations: 'Prefere explicações curtas',
    negative_reaction_to_pressure: 'Reação negativa à pressão',
    responds_to_clear_alternatives: 'Responde a alternativas claras',
    other_observed_behavior: 'Outro comportamento observado',
  }

  const MISSING_DISCOVERY_LABELS = {
    objective: 'Objetivo',
    problem: 'Problema',
    impact: 'Impacto',
    need: 'Necessidade',
    budget: 'Orçamento',
    timeline: 'Prazo',
    decision_maker: 'Decisor',
    priority: 'Prioridade',
    decision_criteria: 'Critério de decisão',
    current_process: 'Processo atual',
    product_fit: 'Aderência do produto',
    other: 'Outro ponto',
  }

  // UX-01 — vocabulário técnico que pode chegar à camada de apresentação.
  // O domínio continua intacto; a tradução acontece somente na view.
  const SELLER_TEXT_LABELS = {
    discovery_gap: 'Ainda falta aprofundar a descoberta.',
    qualification_gap: 'Ainda faltam informações para qualificar a oportunidade.',
    wait: 'Aguardar antes de retomar o contato.',
    respond: 'Responder agora.',
    follow_up: 'Retomar o contato.',
    handle_objection: 'Tratar a objeção antes de avançar.',
    deepen_discovery: 'Aprofundar a descoberta antes de avançar.',
    give_space: 'Dar espaço ao cliente neste momento.',
    no_intervention: 'Nenhuma intervenção comercial é necessária agora.',
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  function displayText(value) {
    if (typeof value !== 'string') {
      return null
    }

    const clean = value.trim()
    return clean || null
  }

  function sellerText(value, fallback = null) {
    const clean = displayText(value)

    if (!clean) {
      return fallback
    }

    if (SELLER_TEXT_LABELS[clean]) {
      return SELLER_TEXT_LABELS[clean]
    }

    const channelRecommendation =
      clean.match(/^Canal recomendado:\s*([a-z][a-z0-9_]*)\.?$/i)

    if (channelRecommendation) {
      const translated =
        SELLER_TEXT_LABELS[channelRecommendation[1].toLowerCase()]

      return translated || fallback || 'Revise o contexto antes de decidir o próximo contato.'
    }

    // Token técnico puro nunca vira copy visível por fallback.
    if (/^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/i.test(clean)) {
      return fallback
    }

    return clean
  }

  function displayItems(items) {
    return Array.isArray(items)
      ? items.filter((item) => item && typeof item === 'object')
      : []
  }

  // Deduplicação seller-facing por FUNÇÃO SEMÂNTICA, não por igualdade de
  // string: dois textos dizem a mesma coisa quando o conteúdo informativo
  // de um (radicais de palavras de conteúdo e números) já está no outro.
  // Só decide o que fica no primeiro nível; o que se repete desce para
  // detalhes, nunca é apagado.
  const OVERLAP_STOPWORDS = new Set([
    'a', 'o', 'as', 'os', 'um', 'uma', 'uns', 'umas', 'de', 'do', 'da',
    'dos', 'das', 'em', 'no', 'na', 'nos', 'nas', 'por', 'pelo', 'pela',
    'para', 'pra', 'com', 'que', 'e', 'ou', 'se', 'ao', 'aos',
    'mas', 'mais', 'ja', 'ainda', 'isso', 'esse', 'essa', 'este', 'esta',
    'ele', 'ela', 'foi', 'ser', 'estar', 'estava', 'ter', 'tem',
    'ha', 'antes', 'depois', 'desde', 'entao', 'como', 'muito',
    'sobre', 'cliente', 'vendedor', 'hoje', 'agora',
  ])

  // Negação carrega sentido: "não confirmou" nunca repete "confirmou". O
  // negador marca o radical de conteúdo seguinte com "!".
  const OVERLAP_NEGATORS = new Set([
    'nao', 'nem', 'nunca', 'jamais', 'sem', 'nenhum', 'nenhuma', 'ninguem',
  ])

  const OVERLAP_STEM_LENGTH = 5
  const REPEATED_CONTENT_RATIO = 0.6

  function contentStems(value) {
    const clean = displayText(value)
    const stems = new Set()

    if (!clean) {
      return stems
    }

    const tokens = clean
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)

    let negated = false

    for (const token of tokens) {
      if (OVERLAP_NEGATORS.has(token)) {
        negated = true
        continue
      }

      if (
        !/^\d+$/.test(token) &&
        (token.length <= 2 || OVERLAP_STOPWORDS.has(token))
      ) {
        continue
      }

      const stem = token.slice(0, OVERLAP_STEM_LENGTH)

      stems.add(negated ? `!${stem}` : stem)
      negated = false
    }

    return stems
  }

  function oppositeStem(stem) {
    return stem.startsWith('!') ? stem.slice(1) : `!${stem}`
  }

  // Fração do conteúdo de `candidate` que já aparece em `references`.
  // Polaridade oposta ("não confirmou" x "confirmou") nunca é repetição.
  function contentCoverage(candidate, references) {
    const stems = contentStems(candidate)

    if (stems.size === 0) {
      return 1
    }

    const known = new Set()

    for (const reference of references || []) {
      for (const stem of contentStems(reference)) {
        known.add(stem)
      }
    }

    for (const stem of stems) {
      const opposite = oppositeStem(stem)

      if (
        known.has(opposite) &&
        !known.has(stem) &&
        !stems.has(opposite)
      ) {
        return 0
      }
    }

    let shared = 0

    for (const stem of stems) {
      if (known.has(stem)) {
        shared += 1
      }
    }

    return shared / stems.size
  }

  function repeatsContent(candidate, references) {
    return contentCoverage(candidate, references) >= REPEATED_CONTENT_RATIO
  }

  // "Dra. Ana", "Sr. João", "Av. Brasil": o ponto da abreviação não
  // encerra a frase.
  const SENTENCE_ABBREVIATION =
    /(?<![A-Za-zÀ-ÿ])(Dra|Dr|Sra|Srta|Sr|Profa|Prof|Av|Ltda|Jr|Eng|Arq|Cia)\.(?=\s)/g
  const ABBREVIATION_DOT = '․'

  function splitSentences(value) {
    const clean = displayText(value)

    if (!clean) {
      return []
    }

    return clean
      .replace(SENTENCE_ABBREVIATION, `$1${ABBREVIATION_DOT}`)
      .split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9])/)
      .map((sentence) => sentence.split(ABBREVIATION_DOT).join('.').trim())
      .filter(Boolean)
  }

  function asSentence(clause) {
    const clean = clause.trim().replace(/[,;:\s]+$/, '')

    if (!clean) {
      return null
    }

    const capitalized = clean.charAt(0).toUpperCase() + clean.slice(1)

    return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`
  }

  // Sentenças de `value` que acrescentam informação além de `references`.
  // Com `clauses`, cada oração separada por ";" é avaliada sozinha — assim
  // "conclusão já dita; motivo novo" preserva só o motivo novo.
  function novelSentences(value, references, { clauses = false } = {}) {
    const units = clauses
      ? splitSentences(value)
          .flatMap((sentence) => sentence.split(/;\s+/))
          .map(asSentence)
          .filter(Boolean)
      : splitSentences(value)

    return units.filter(
      (sentence) => !repeatsContent(sentence, references),
    )
  }

  function isNeutralCommercialSession(reading) {
    if (!reading || typeof reading !== 'object') {
      return false
    }

    if (
      reading.commercial_relevance &&
      reading.commercial_relevance !== 'commercial'
    ) {
      return true
    }

    return Boolean(
      reading.commercial_role &&
      reading.commercial_role !== 'buyer',
    )
  }

  function getNeutralSessionCopy(reading) {
    if (reading?.commercial_relevance === 'uncertain') {
      return {
        title: 'Ainda não há evidência comercial suficiente.',
        description: 'Nenhuma ação comercial será recomendada até o contexto ficar claro.',
      }
    }

    return {
      title: 'Conversa sem evidência comercial relevante.',
      description: 'Nenhuma ação comercial necessária.',
    }
  }

  function getMethodStatusLabel(status) {
    return METHOD_STATUS_LABELS[status] || null
  }

  function getMethodAdherenceLabel(status) {
    return METHOD_ADHERENCE_LABELS[status] || null
  }

  function getStatusClass(status) {
    const supported = [
      'completed',
      'active',
      'partial',
      'not_started',
      'skipped',
      'not_applicable',
    ]

    return supported.includes(status)
      ? `yolen-rich-status-${status.replaceAll('_', '-')}`
      : 'yolen-rich-status-neutral'
  }

  function getAdherenceClass(status) {
    const classes = {
      on_method: 'yolen-adherence-on',
      partially_on_method: 'yolen-adherence-partial',
      off_method: 'yolen-adherence-off',
      not_configured: 'yolen-adherence-neutral',
      insufficient_evidence: 'yolen-adherence-neutral',
    }

    return classes[status] || 'yolen-adherence-neutral'
  }

  function renderEvidence(item) {
    const messageCount = Array.isArray(item?.evidence_message_ids)
      ? item.evidence_message_ids.length
      : 0

    const memoryCount = Array.isArray(item?.memory_ids)
      ? item.memory_ids.length
      : 0

    if (messageCount === 0 && memoryCount === 0) {
      return ''
    }

    const parts = []

    if (messageCount > 0) {
      parts.push(
        `${messageCount} ${messageCount === 1 ? 'mensagem' : 'mensagens'} da conversa`,
      )
    }

    if (memoryCount > 0) {
      parts.push(
        `${memoryCount} ${memoryCount === 1 ? 'memória comercial' : 'memórias comerciais'}`,
      )
    }

    return `
      <div class="yolen-seller-evidence">
        Evidência: ${escapeHtml(parts.join(' e '))}
      </div>
    `
  }

  function renderLabeledCopy(label, value) {
    const clean = displayText(value)

    if (!clean) {
      return ''
    }

    return `
      <div class="yolen-seller-detail">
        <div class="yolen-seller-detail-label">${escapeHtml(label)}</div>
        <div class="yolen-seller-detail-copy">${escapeHtml(clean)}</div>
      </div>
    `
  }

  function renderTextList(label, items) {
    const values = Array.isArray(items)
      ? items.map(displayText).filter(Boolean)
      : []

    if (values.length === 0) {
      return ''
    }

    return `
      <div class="yolen-seller-detail">
        <div class="yolen-seller-detail-label">${escapeHtml(label)}</div>
        <ul class="yolen-seller-text-list">
          ${values.map((value) => `<li>${escapeHtml(value)}</li>`).join('')}
        </ul>
      </div>
    `
  }

  const TECHNIQUE_SIMPLE_EXPLANATIONS = Object.freeze({
    'technique.contextual_reengagement':
      'Use um microcompromisso: peça uma decisão pequena que reabra a conversa antes de voltar ao agendamento, à oferta ou a um passo maior.',
    'technique.guided_choice':
      'Reduza o esforço da decisão oferecendo poucas opções reais, em vez de deixar toda a escolha aberta para o cliente.',
    'technique.objection_diagnosis':
      'Antes de responder à objeção, descubra qual é a causa real da resistência para não prescrever uma solução genérica.',
    'technique.third_party_handoff':
      'Quando alguém fala por outra pessoa, preserve os papéis e conduza a passagem para o prospect real sem misturar identidade ou decisão.',
    'technique.discovery_before_prescription':
      'Antes de recomendar uma solução, descubra apenas a informação que realmente pode mudar a recomendação.',
    'technique.commitment_wait':
      'Quando o próximo movimento já depende do cliente, não repita a ação; preserve o compromisso e espere resposta ou vencimento do prazo.',
    'technique.decision_criteria_clarification':
      'Descubra o que realmente pesa na decisão do cliente antes de comparar opções ou recomendar uma delas.',
    'technique.impact_exploration':
      'Explore o impacto concreto do problema para entender por que a mudança importa, sem dramatizar nem inventar dor.',
    'technique.value_linkage':
      'Conecte uma capacidade real da solução a uma necessidade ou objetivo que o cliente já demonstrou.',
    'technique.objection_isolation':
      'Confirme se a objeção atual é realmente a principal trava antes de negociar, conceder ou responder em profundidade.',
    'technique.evidence_based_reassurance':
      'Reduza a incerteza usando evidência oficial e pertinente, sem prometer o que não está comprovado.',
    'technique.stakeholder_mapping':
      'Mapeie quem usa, influencia e decide para que o próximo passo respeite o processo real de decisão.',
    'technique.commitment_ladder':
      'Transforme a intenção atual no menor próximo compromisso útil que realmente faça a negociação avançar.',
    'technique.explicit_close_execution':
      'Quando a decisão já está madura, execute o próximo passo do fechamento sem reabrir uma descoberta que já foi superada.',
    'technique.comparison_by_criteria':
      'Compare alternativas pelos critérios que o cliente declarou e pelos fatos oficiais disponíveis.',
    'principle.company_rules_before_claim':
      'Antes de afirmar preço, condição, política, promessa ou capacidade, use somente a informação oficial da empresa.',
    'technique.state_change_reactivation':
      'Relembre de forma concreta o que o cliente estava avaliando e pergunte como está isso hoje — descubra o estado atual antes de retomar o passo antigo.',
    'technique.permission_based_reengagement':
      'Depois de tentativas sem resposta, peça permissão para retomar o assunto e deixe uma saída fácil; qualquer resposta curta já é avanço.',
    'technique.pattern_interrupt_reengagement':
      'Se o mesmo tipo de mensagem já ficou sem resposta, mude o formato: mensagem curta, diferente e ancorada no que o cliente trouxe.',
    'technique.delayed_response_recovery':
      'O cliente ficou esperando: reconheça a demora em uma frase, responda ao pedido e confirme o que ainda faz sentido agora.',
    'technique.respectful_closure':
      'O cliente encerrou ou resolveu por outro caminho: agradeça, respeite a decisão e deixe a porta aberta, sem nova oferta.',
  })

  const COACHING_TEMPORAL_VISIBLE_FACTS = 3

  // Momento da oportunidade subordinado ao que já está aberto na tela: o
  // rótulo só aparece se o diagnóstico ainda não disse a mesma coisa, e um
  // fato já explicado em outro bloco aberto não se repete aqui. Fatos
  // além do limite descem para "Ver raciocínio".
  function coachingTemporalParts(temporal, shownElsewhere) {
    if (!temporal || typeof temporal !== 'object') {
      return null
    }

    const label = displayText(temporal.momentum_label)
    const labelLine = label
      ? `${label}${temporal.requalify_before_continuing ? ' — interesse atual precisa ser reconfirmado.' : ''}`
      : null
    const facts = Array.isArray(temporal.facts)
      ? temporal.facts.map(displayText).filter(Boolean)
      : []

    if (!labelLine && facts.length === 0) {
      return null
    }

    const novelFacts = facts.filter(
      (fact) => !repeatsContent(fact, shownElsewhere),
    )

    return {
      state: temporal.momentum_state || 'unknown',
      labelLine:
        labelLine && !repeatsContent(labelLine, shownElsewhere)
          ? labelLine
          : null,
      visibleFacts: novelFacts.slice(0, COACHING_TEMPORAL_VISIBLE_FACTS),
      overflowFacts: novelFacts.slice(COACHING_TEMPORAL_VISIBLE_FACTS),
    }
  }

  function renderCoachingTemporal(parts) {
    if (
      !parts ||
      (!parts.labelLine && parts.visibleFacts.length === 0)
    ) {
      return ''
    }

    return `
      <div
        class="yolen-seller-detail"
        data-yolen-coaching-temporal="${escapeHtml(parts.state)}"
      >
        <div class="yolen-seller-detail-label">Momento da oportunidade</div>
        ${parts.labelLine ? `<div class="yolen-seller-detail-copy">${escapeHtml(parts.labelLine)}</div>` : ''}
        ${parts.visibleFacts.length > 0 ? `
          <ul class="yolen-seller-text-list">
            ${parts.visibleFacts.map((fact) => `<li>${escapeHtml(fact)}</li>`).join('')}
          </ul>
        ` : ''}
      </div>
    `
  }

  function techniqueSimpleExplanation(technique) {
    const id = displayText(technique?.id)

    return (
      TECHNIQUE_SIMPLE_EXPLANATIONS[id] ||
      displayText(technique?.why_now) ||
      null
    )
  }

  // Os mesmos aprendizados que a seção "Outros aprendizados" mostra — o
  // diagnóstico usa esta lista para não repetir no primeiro nível o que um
  // card aberto logo abaixo já explica.
  function visibleCoachingFindings(findingsList) {
    return displayItems(findingsList)
      .map((item) => ({
        item,
        title:
          displayText(item.title),
        summary:
          displayText(item.summary),
        whyItMatters:
          displayText(
            item.why_it_matters,
          ),
        howToImprove:
          displayText(
            item.how_to_improve,
          ),
      }))
      .filter(
        ({ title, summary }) =>
          title && summary,
      )
      .slice(0, 3)
  }

  function renderAdditionalCoachingFindings(findingsList) {
    const findings =
      visibleCoachingFindings(findingsList)

    if (findings.length === 0) {
      return ''
    }

    return `
      <section
        class="yolen-seller-section"
        data-yolen-analysis-section="additional-coaching-findings"
      >
        <div class="yolen-seller-section-heading">
          <div>
            <div class="yolen-seller-section-eyebrow">Coaching</div>
            <h3>Outros aprendizados do atendimento</h3>
          </div>
          <span class="yolen-seller-count">${findings.length}</span>
        </div>

        <div class="yolen-seller-stack">
          ${findings.map(({
            item,
            title,
            summary,
            whyItMatters,
            howToImprove,
          }) => `
            <article class="yolen-seller-insight yolen-seller-insight--improvement">
              <div class="yolen-seller-insight-type">${escapeHtml(title)}</div>
              <div class="yolen-seller-insight-title">${escapeHtml(summary)}</div>
              ${renderLabeledCopy('Como melhorar', howToImprove)}
              ${
                whyItMatters ||
                renderEvidence(item)
                  ? `
                    <details
                      class="yolen-seller-secondary-details"
                      data-yolen-preserve-details="additional-finding-${escapeHtml(item.kind || 'other')}"
                    >
                      <summary>Entender o porquê</summary>
                      ${renderLabeledCopy('Por que isso importa', whyItMatters)}
                      ${renderEvidence(item)}
                    </details>
                  `
                  : ''
              }
            </article>
          `).join('')}
        </div>
      </section>
    `
  }

  // Primeiro nível sem redundância (ganho informacional): cada conclusão
  // aparece aberta uma vez, no bloco que melhor a explica. O diagnóstico
  // perde as sentenças que o principal ajuste ou um aprendizado aberto
  // logo abaixo já explicam; o momento fica subordinado ao diagnóstico; a
  // explicação da técnica desce para detalhes quando só repete a ação.
  // Nada é apagado: o texto completo continua em "Ver raciocínio".
  function renderCoachingDiagnosis(diagnosis) {
    if (
      !diagnosis ||
      typeof diagnosis !== 'object' ||
      diagnosis.status === 'silent'
    ) {
      return ''
    }

    const strength = diagnosis.seller_strength
    const mistake = diagnosis.seller_mistake
    const lastMove = diagnosis.seller_last_valid_move
    const technique = diagnosis.chosen_technique
    const intent = diagnosis.client_intent_now

    const synthesis = diagnosis.synthesis || null

    const hasContent = [
      diagnosis.current_commercial_goal,
      strength?.summary,
      mistake?.summary,
      lastMove?.summary,
      technique?.title,
      intent?.label,
      synthesis?.diagnosis,
    ].some((value) => displayText(value))

    if (!hasContent) {
      return ''
    }

    const findings = visibleCoachingFindings(diagnosis.additional_findings)
    const mistakeSummary = displayText(mistake?.summary)
    const mistakeFix = displayText(mistake?.how_to_improve)

    const fullDiagnosis = displayText(synthesis?.diagnosis)
    const explainedBelow = [
      mistakeSummary,
      ...findings.map(({ summary }) => summary),
    ].filter(Boolean)
    const diagnosisSentences = novelSentences(fullDiagnosis, explainedBelow)
    const diagnosisText =
      diagnosisSentences.length > 0
        ? diagnosisSentences.join(' ')
        : fullDiagnosis
    const diagnosisCondensed =
      Boolean(fullDiagnosis) && diagnosisText !== fullDiagnosis

    const temporal = coachingTemporalParts(
      diagnosis.temporal,
      [diagnosisText, ...explainedBelow].filter(Boolean),
    )

    // Elogio e crítica sobre a MESMA mensagem do vendedor não convivem como
    // "acerto" pleno: o card vira acerto parcial e aponta a ressalva.
    const strengthIds = new Set(
      Array.isArray(strength?.evidence_message_ids)
        ? strength.evidence_message_ids
        : [],
    )
    const strengthCaveat = findings.find(({ item }) =>
      Array.isArray(item.evidence_message_ids) &&
      item.evidence_message_ids.some((id) => strengthIds.has(id)),
    )

    const nextAction = displayText(diagnosis.next_action)
    const firstLevel = [
      diagnosisText,
      temporal?.labelLine,
      mistakeSummary,
      mistakeFix,
    ].filter(Boolean)
    const actionVisible =
      Boolean(nextAction) && !repeatsContent(nextAction, firstLevel)
    const simpleExplanation = techniqueSimpleExplanation(technique)
    const explanationVisible =
      Boolean(simpleExplanation) &&
      !repeatsContent(
        simpleExplanation,
        [...firstLevel, nextAction].filter(Boolean),
      )
    const hiddenTechniqueCopy = [
      explanationVisible ? '' : renderLabeledCopy('Em termos simples', simpleExplanation),
      actionVisible ? '' : renderLabeledCopy('Como aplicar agora', nextAction),
    ].join('')

    const goal = displayText(diagnosis.current_commercial_goal)

    return `
      <section
        class="yolen-seller-section"
        data-yolen-analysis-section="coaching-diagnosis"
      >
        <div class="yolen-seller-section-heading">
          <div>
            <div class="yolen-seller-section-eyebrow">Coaching</div>
            <h3>Leitura da condução</h3>
          </div>
        </div>

        <div class="yolen-seller-stack">
          ${diagnosisText ? `
            <article
              class="yolen-seller-insight"
              data-yolen-coaching-synthesis
            >
              <div class="yolen-seller-insight-type">Diagnóstico da condução</div>
              <div class="yolen-seller-insight-title">${escapeHtml(diagnosisText)}</div>
              ${renderCoachingTemporal(temporal)}
            </article>
          ` : renderCoachingTemporal(temporal)}

          ${strength?.summary ? `
            <article
              class="yolen-seller-insight yolen-seller-insight--positive"
              data-yolen-coaching-strength="${strengthCaveat ? 'partial' : 'full'}"
            >
              <div class="yolen-seller-insight-type">${strengthCaveat ? 'Acerto parcial' : 'Principal acerto'}</div>
              <div class="yolen-seller-insight-title">${escapeHtml(displayText(strength.summary))}</div>
              ${strengthCaveat ? renderLabeledCopy('Ressalva', strengthCaveat.title) : ''}
              ${renderLabeledCopy('Por que isso importa', strength.why_it_matters)}
              ${renderEvidence(strength)}
            </article>
          ` : ''}

          ${mistake?.summary ? `
            <article class="yolen-seller-insight yolen-seller-insight--improvement">
              <div class="yolen-seller-insight-type">Principal ajuste</div>
              <div class="yolen-seller-insight-title">${escapeHtml(displayText(mistake.summary))}</div>
              ${renderLabeledCopy('Como corrigir', mistake.how_to_improve)}
              ${renderLabeledCopy('Impacto ou risco', mistake.impact)}
              ${renderEvidence(mistake)}
            </article>
          ` : ''}

          ${technique?.title ? `
            <article
              class="yolen-seller-insight yolen-seller-insight--positive"
              data-yolen-coaching-technique
            >
              <div class="yolen-seller-insight-type">Técnica recomendada</div>
              <div class="yolen-seller-insight-title">${escapeHtml(displayText(technique.title))}</div>
              ${explanationVisible ? renderLabeledCopy('Em termos simples', simpleExplanation) : ''}
              ${actionVisible ? renderLabeledCopy('Como aplicar agora', nextAction) : ''}
              ${hiddenTechniqueCopy.trim() ? `
                <details
                  class="yolen-seller-secondary-details"
                  data-yolen-preserve-details="analysis-technique-how"
                >
                  <summary>Como aplicar</summary>
                  ${hiddenTechniqueCopy}
                </details>
              ` : ''}
            </article>
          ` : renderLabeledCopy('Próximo passo', diagnosis.next_action)}

          <details
            class="yolen-seller-secondary-details"
            data-yolen-preserve-details="analysis-coaching-diagnosis"
          >
            <summary>Ver raciocínio</summary>
            ${diagnosisCondensed ? renderLabeledCopy('Diagnóstico completo', fullDiagnosis) : ''}
            ${temporal && !temporal.labelLine && diagnosis.temporal?.momentum_label
              ? renderLabeledCopy('Momento da oportunidade', diagnosis.temporal.momentum_label)
              : ''}
            ${temporal ? renderTextList('Outros fatos do momento', temporal.overflowFacts) : ''}
            ${goal && !(nextAction && repeatsContent(goal, [nextAction]))
              ? renderLabeledCopy('Objetivo comercial agora', goal)
              : ''}
            ${renderLabeledCopy(
              intent && intent.is_current === false
                ? 'Intenção demonstrada (histórico)'
                : 'Intenção atual do cliente',
              intent?.label,
            )}
            ${nextAction && repeatsContent(synthesis?.next_learning, [nextAction])
              ? ''
              : renderLabeledCopy('Próximo aprendizado', synthesis?.next_learning)}
            ${renderLabeledCopy('Último movimento válido do vendedor', lastMove?.action_label)}
            ${renderLabeledCopy('Por que esta técnica', technique?.why_now)}
            ${diagnosis.sequence_break?.happened
              ? renderLabeledCopy('Quebra de sequência', diagnosis.sequence_break.what_changed)
              : ''}
            ${diagnosis.sequence_break?.happened
              ? renderLabeledCopy('Por que isso prejudica', diagnosis.sequence_break.why_it_hurts)
              : ''}
            ${renderLabeledCopy(
              'Confiança de contexto do cliente',
              diagnosis.client_context_confidence,
            )}
            ${renderLabeledCopy(
              'Confiança sobre execução do vendedor',
              diagnosis.seller_execution_confidence,
            )}
            ${renderTextList('Evite agora', diagnosis.do_not_do)}
          </details>
        </div>
      </section>
    `
  }

  function renderStrengths(strengthsList) {
    const strengths = displayItems(strengthsList)
      .map((item) => ({
        item,
        summary: displayText(item.summary),
        whyItMatters: displayText(item.why_it_matters),
        kindLabel: STRENGTH_KIND_LABELS[item.kind] || STRENGTH_KIND_LABELS.other,
      }))
      .filter((item) => item.summary)

    if (strengths.length === 0) {
      return ''
    }

    return `
      <section class="yolen-seller-section" data-yolen-analysis-section="strengths">
        <div class="yolen-seller-section-heading">
          <div>
            <div class="yolen-seller-section-eyebrow">Coaching</div>
            <h3>Acertos</h3>
          </div>
          <span class="yolen-seller-count">${strengths.length}</span>
        </div>

        <div class="yolen-seller-stack">
          ${strengths.map(({ item, summary, whyItMatters, kindLabel }) => `
            <article class="yolen-seller-insight yolen-seller-insight--positive">
              <div class="yolen-seller-insight-type">${escapeHtml(kindLabel)}</div>
              <div class="yolen-seller-insight-title">${escapeHtml(summary)}</div>

              ${
                whyItMatters || renderEvidence(item)
                  ? `
                    <details
                      class="yolen-seller-secondary-details"
                      data-yolen-preserve-details="strength-${escapeHtml(item.kind || 'other')}"
                    >
                      <summary>Ver detalhes</summary>
                      ${renderLabeledCopy('Por que isso importa', whyItMatters)}
                      ${renderEvidence(item)}
                    </details>
                  `
                  : ''
              }
            </article>
          `).join('')}
        </div>
      </section>
    `
  }

  function renderImprovements(improvementsList) {
    const improvements = displayItems(improvementsList)
      .map((item) => ({
        item,
        summary: displayText(item.summary),
        whyItMatters: displayText(item.why_it_matters),
        impact: displayText(item.impact),
        howToImprove: displayText(item.how_to_improve),
        kindLabel: IMPROVEMENT_KIND_LABELS[item.kind] || IMPROVEMENT_KIND_LABELS.other,
      }))
      .filter((item) => item.summary)

    if (improvements.length === 0) {
      return ''
    }

    return `
      <section class="yolen-seller-section" data-yolen-analysis-section="improvements">
        <div class="yolen-seller-section-heading">
          <div>
            <div class="yolen-seller-section-eyebrow">Coaching</div>
            <h3>Pontos de melhoria</h3>
          </div>
          <span class="yolen-seller-count">${improvements.length}</span>
        </div>

        <div class="yolen-seller-stack">
          ${improvements.map(({ item, summary, whyItMatters, impact, howToImprove, kindLabel }) => `
            <article class="yolen-seller-insight yolen-seller-insight--improvement">
              <div class="yolen-seller-insight-type">${escapeHtml(kindLabel)}</div>
              <div class="yolen-seller-insight-title">${escapeHtml(summary)}</div>

              ${renderLabeledCopy('Como corrigir', howToImprove)}

              ${
                whyItMatters || impact || renderEvidence(item)
                  ? `
                    <details
                      class="yolen-seller-secondary-details"
                      data-yolen-preserve-details="improvement-${escapeHtml(item.kind || 'other')}"
                    >
                      <summary>Ver detalhes</summary>
                      ${renderLabeledCopy('Por que isso importa', whyItMatters)}
                      ${renderLabeledCopy('Impacto ou risco', impact)}
                      ${renderEvidence(item)}
                    </details>
                  `
                  : ''
              }
            </article>
          `).join('')}
        </div>
      </section>
    `
  }

  function isCurrentMethodStage(stage, currentStage) {
    if (!stage || !currentStage) {
      return false
    }

    if (
      Number.isSafeInteger(stage.step_order) &&
      stage.step_order === currentStage.step_order
    ) {
      return true
    }

    if (stage.stage_key && currentStage.stage_key) {
      return stage.stage_key === currentStage.stage_key
    }

    return Boolean(stage.name && stage.name === currentStage.name)
  }

  function renderMethodStages(method, guidance) {
    const currentStage = method?.current_stage
    const recommendedStageName =
      displayText(guidance?.recommended_stage_name)
    const currentStageName =
      displayText(currentStage?.name)
    const stageMismatch =
      Boolean(
        recommendedStageName &&
        currentStageName &&
        recommendedStageName !== currentStageName,
      )

    const stages = displayItems(method?.stages)
      .map((stage) => ({
        ...stage,
        name: displayText(stage.name),
        explanation: displayText(stage.explanation),
        statusLabel: getMethodStatusLabel(stage.status),
      }))
      .filter((stage) => stage.name && stage.statusLabel)
      .sort((left, right) => (left.step_order || 0) - (right.step_order || 0))

    if (stages.length === 0) {
      return ''
    }

    return `
      <div class="yolen-method-stages">
        ${stages.map((stage) => {
          const current = isCurrentMethodStage(stage, currentStage)

          return `
            <div
              class="yolen-method-stage ${current ? 'yolen-method-stage--current' : ''}"
              data-yolen-method-stage-status="${escapeHtml(stage.status)}"
              ${current ? 'data-yolen-current-method-stage="true"' : ''}
            >
              <div class="yolen-method-stage-header">
                <div>
                  ${current ? `<div class="yolen-method-stage-current-label">${stageMismatch ? 'Etapa observada' : 'Etapa atual'}</div>` : ''}
                  <div class="yolen-method-stage-name">${escapeHtml(stage.name)}</div>
                </div>
                <span class="yolen-rich-status ${getStatusClass(stage.status)}">
                  ${escapeHtml(stage.statusLabel)}
                </span>
              </div>
              ${stage.explanation ? `<div class="yolen-method-stage-copy">${escapeHtml(stage.explanation)}</div>` : ''}
            </div>
          `
        }).join('')}
      </div>
    `
  }

  function renderRecovery(method, guidance = null) {
    const adherence = method?.adherence
    // Depois de um intervalo longo, o que faltou na última tentativa (ex.:
    // dia/horário) é histórico — não a lacuna atual da venda.
    const historical = guidance?.historical_open_loops === true

    if (adherence?.status !== 'off_method') {
      return ''
    }

    const deviationStage = displayItems(method.stages).find(
      (stage) => stage.step_order === adherence.deviation_stage_order,
    )

    const recovery = method.recovery_guidance
    const whereItLeft =
      displayText(deviationStage?.name) ||
      displayText(method.current_stage?.name) ||
      (Number.isSafeInteger(adherence.deviation_stage_order)
        ? `Etapa ${adherence.deviation_stage_order}`
        : null)
    const missing = [
      ...(Array.isArray(adherence.missing_information) ? adherence.missing_information : []),
      ...(Array.isArray(recovery?.missing_information) ? recovery.missing_information : []),
    ].filter((value, index, values) => displayText(value) && values.indexOf(value) === index)

    return `
      <div class="yolen-method-recovery" data-yolen-method-recovery>
        <div class="yolen-method-recovery-heading">Como voltar para o método</div>
        ${renderLabeledCopy('Onde saiu', whereItLeft)}
        ${renderLabeledCopy('O que aconteceu', adherence.what_happened)}
        ${renderTextList(historical ? 'O que ficou em aberto na última tentativa' : 'O que faltou', missing)}
        ${historical ? renderLabeledCopy('Antes de retomar', 'Reconfirmar se o interesse do cliente continua depois do intervalo.') : ''}
        ${renderLabeledCopy('Por que importa', adherence.why_it_matters)}
        ${renderLabeledCopy('Objetivo da correção', recovery?.objective)}
        ${historical ? '' : renderLabeledCopy('Próximo movimento', recovery?.recommended_move)}
        ${renderLabeledCopy('Pergunta opcional', recovery?.optional_question)}
        ${renderEvidence(recovery || adherence)}
      </div>
    `
  }

  function renderMethodGuidance(method, guidance) {
    const observed =
      displayText(
        guidance?.current_stage_name ||
        method?.current_stage?.name,
      )
    const recommended =
      displayText(
        guidance?.recommended_stage_name,
      )
    const reason =
      displayText(
        guidance?.recommended_stage_reason,
      )

    if (
      !recommended ||
      !observed ||
      recommended === observed
    ) {
      return ''
    }

    return `
      <div class="yolen-method-recovery" data-yolen-method-guidance>
        <div class="yolen-method-recovery-heading">Direção do método agora</div>
        ${renderLabeledCopy('Etapa observada', observed)}
        ${renderLabeledCopy('Etapa recomendada agora', recommended)}
        ${renderLabeledCopy('Por que voltar', reason)}
      </div>
    `
  }

  function renderMethod(method, guidance = null) {
    if (!method || typeof method !== 'object') {
      return ''
    }

    const adherenceStatus = method.adherence?.status

    if (method.configured === false || adherenceStatus === 'not_configured') {
      return `
        <section class="yolen-seller-section" data-yolen-analysis-section="method">
          <div class="yolen-seller-section-heading">
            <div>
              <div class="yolen-seller-section-eyebrow">Método</div>
              <h3>Método comercial</h3>
            </div>
          </div>
          <div class="yolen-seller-empty-state">Método comercial não configurado.</div>
        </section>
      `
    }

    if (method.configured !== true) {
      return ''
    }

    const methodName = displayText(method.name)
    const adherenceLabel = getMethodAdherenceLabel(adherenceStatus)
    const observedStageName =
      displayText(
        guidance?.current_stage_name ||
        method.current_stage?.name,
      )
    const recommendedStageName =
      displayText(
        guidance?.recommended_stage_name,
      )
    const hasRecoveryDirection =
      Boolean(
        guidance?.deviation_detected === true &&
        observedStageName &&
        recommendedStageName &&
        observedStageName !==
          recommendedStageName,
      )
    const adherenceSummary =
      hasRecoveryDirection
        ? `A execução chegou a ${observedStageName} antes de concluir o que o método ainda exige em ${recommendedStageName}.`
        : displayText(
            method.adherence?.summary,
          )

    const methodSummary = [
      methodName || 'Método comercial',
      adherenceLabel,
    ]
      .filter(Boolean)
      .join(' · ')

    return `
      <details
        class="yolen-seller-secondary-details"
        data-yolen-analysis-section="method"
        data-yolen-preserve-details="analysis-method"
      >
        <summary>${escapeHtml(methodSummary)}</summary>

        <section class="yolen-seller-section">
          ${adherenceLabel ? `
            <div
              class="yolen-method-adherence ${getAdherenceClass(adherenceStatus)}"
              data-yolen-method-adherence="${escapeHtml(adherenceStatus)}"
            >
              <div class="yolen-method-adherence-label">${escapeHtml(adherenceLabel)}</div>
              ${adherenceSummary ? `<div class="yolen-method-adherence-copy">${escapeHtml(adherenceSummary)}</div>` : ''}
              ${adherenceStatus === 'insufficient_evidence' ? '<div class="yolen-method-adherence-note">Não há evidência suficiente para avaliar esta etapa.</div>' : ''}
            </div>
          ` : ''}

          ${renderMethodGuidance(method, guidance)}
          ${renderMethodStages(method, guidance)}
          ${renderRecovery(method, guidance)}
          <div class="yolen-operational-note" data-yolen-method-crm-independence>
            Método comercial e etapa do CRM são avaliações independentes.
          </div>
        </section>
      </details>
    `
  }

  function renderRiskGroup(label, risks, group) {
    const items = displayItems(risks)
      .map((risk) => ({
        risk,
        summary: displayText(risk.summary),
        severityLabel: RISK_SEVERITY_LABELS[risk.severity] || null,
      }))
      .filter((item) => item.summary)

    if (items.length === 0) {
      return ''
    }

    return `
      <div class="yolen-risk-group" data-yolen-risk-group="${escapeHtml(group)}">
        <div class="yolen-risk-group-title">${escapeHtml(label)}</div>
        <div class="yolen-seller-stack">
          ${items.map(({ risk, summary, severityLabel }) => `
            <article class="yolen-seller-insight yolen-seller-insight--risk">
              <div class="yolen-seller-insight-row">
                <div class="yolen-seller-insight-title">${escapeHtml(summary)}</div>
                ${severityLabel ? `<span class="yolen-risk-severity yolen-risk-severity--${escapeHtml(risk.severity)}">${escapeHtml(severityLabel)}</span>` : ''}
              </div>
              ${renderEvidence(risk)}
            </article>
          `).join('')}
        </div>
      </div>
    `
  }

  // FASE 16.6 (recalibração seller-facing de ANÁLISE): `risks` já chega
  // combinado e filtrado (severidade medium/high, máximo 3) do
  // AnalysisViewModel — este presenter só particiona por `source` para
  // rotular os dois grupos, nunca reclassifica severidade nem decide o
  // que é relevante (achado da auditoria: antes, apenas `service_risks`
  // aparecia em ANÁLISE — `risks.customer_objections` nunca tinha
  // renderer, mandato §12).
  function renderRisks(risks) {
    const serviceRisks = displayItems(risks).filter((risk) => risk.source === 'service_risk')
    const objectionRisks = displayItems(risks).filter((risk) => risk.source === 'customer_objection')

    const service = renderRiskGroup('Risco no atendimento', serviceRisks, 'service')
    const objection = renderRiskGroup('Objeção com risco comercial', objectionRisks, 'objection')

    if (!service && !objection) {
      return ''
    }

    return `
      <section class="yolen-seller-section" data-yolen-analysis-section="risks">
        <div class="yolen-seller-section-heading">
          <div>
            <div class="yolen-seller-section-eyebrow">Riscos e travas</div>
            <h3>Riscos da venda</h3>
          </div>
        </div>
        ${objection}
        ${service}
      </section>
    `
  }

  // Objeções ainda ABERTAS do ciclo (mandato §11) — distintas de
  // `risks` acima: `risks` vem da leitura da CONVERSA ATUAL (pode não
  // ter reavaliado uma objeção antiga), `objections` vem da memória do
  // ciclo inteiro já filtrada por `memory_status === 'active'` no
  // AnalysisViewModel — uma objeção resolvida nunca chega aqui.
  function renderObjections(objections) {
    const items = displayItems(objections)
      .map((item) => ({ item, summary: displayText(item.summary) }))
      .filter((entry) => entry.summary)

    if (items.length === 0) {
      return ''
    }

    return `
      <section class="yolen-seller-section" data-yolen-analysis-section="objections">
        <div class="yolen-seller-section-heading">
          <div>
            <div class="yolen-seller-section-eyebrow">Riscos e travas</div>
            <h3>Objeções ainda abertas</h3>
          </div>
          <span class="yolen-seller-count">${items.length}</span>
        </div>
        <div class="yolen-seller-stack">
          ${items.map(({ item, summary }) => `
            <article class="yolen-seller-insight yolen-seller-insight--risk">
              <div class="yolen-seller-insight-title">${escapeHtml(summary)}</div>
              ${renderEvidence(item)}
            </article>
          `).join('')}
        </div>
      </section>
    `
  }

  const ANALYSIS_COMMITMENT_STATUS_LABELS = {
    overdue: 'Vencido',
    due_today: 'Previsto para hoje',
    pending: 'Pendente',
    reschedule_requested: 'Reagendamento pendente',
    completed: 'Cumprido',
    cancelled: 'Cancelado',
  }

  const ANALYSIS_COMMITMENT_STATUS_ORDER = [
    'overdue',
    'due_today',
    'pending',
    'reschedule_requested',
    'completed',
    'cancelled',
  ]

  // Compromissos do ciclo (mandato §13) — já categorizados pelo
  // AnalysisViewModel (overdue/due_today/pending/reschedule_requested/
  // completed/cancelled); este presenter só agrupa por status para
  // exibição, nunca recalcula vencimento.
  function renderCommitments(commitments) {
    const items = displayItems(commitments)
      .map((item) => ({ item, summary: displayText(item.summary) }))
      .filter((entry) => entry.summary)

    if (items.length === 0) {
      return ''
    }

    const groups = ANALYSIS_COMMITMENT_STATUS_ORDER
      .map((status) => ({
        status,
        entries: items.filter((entry) => entry.item.status === status),
      }))
      .filter((group) => group.entries.length > 0)

    return `
      <section class="yolen-seller-section" data-yolen-analysis-section="commitments">
        <div class="yolen-seller-section-heading">
          <div>
            <div class="yolen-seller-section-eyebrow">Continuidade</div>
            <h3>Compromissos</h3>
          </div>
          <span class="yolen-seller-count">${items.length}</span>
        </div>
        <div class="yolen-seller-stack">
          ${groups.map(({ status, entries }) => `
            <div class="yolen-commitment-group" data-yolen-commitment-status="${escapeHtml(status)}">
              <div class="yolen-commitment-group-title">${escapeHtml(ANALYSIS_COMMITMENT_STATUS_LABELS[status] || 'Status do compromisso')}</div>
              ${entries.map(({ item, summary }) => `
                <article class="yolen-seller-insight">
                  <div class="yolen-seller-insight-title">${escapeHtml(summary)}</div>
                  ${item.scheduled_at ? renderLabeledCopy('Data', item.scheduled_at) : ''}
                  ${renderEvidence(item)}
                </article>
              `).join('')}
            </div>
          `).join('')}
        </div>
      </section>
    `
  }

  function renderCommercialEvolution(evolutionItems) {
    const items = displayItems(evolutionItems)
      .map((item) => ({
        label: displayText(item.label),
        explanation: displayText(item.explanation),
        status: item.status,
        statusLabel: getMethodStatusLabel(item.status) || (item.status === 'pending' ? 'Pendente' : null),
      }))
      .filter((item) => item.label && item.explanation && item.statusLabel)

    if (items.length === 0) {
      return ''
    }

    return `
      <details class="yolen-seller-secondary-details" data-yolen-preserve-details="commercial-evolution">
        <summary>Ver evolução comercial</summary>
        <div class="yolen-method-stages">
          ${items.map((item) => `
            <div class="yolen-method-stage">
              <div class="yolen-method-stage-header">
                <div class="yolen-method-stage-name">${escapeHtml(item.label)}</div>
                <span class="yolen-rich-status ${getStatusClass(item.status)}">${escapeHtml(item.statusLabel)}</span>
              </div>
              <div class="yolen-method-stage-copy">${escapeHtml(item.explanation)}</div>
            </div>
          `).join('')}
        </div>
      </details>
    `
  }

  const ANALYSIS_OPPORTUNITY_STATUS_LABELS = {
    no_intervention: 'Sem sinal comercial',
    give_space: 'Sessão pessoal',
    advancing: 'Avançando',
    follow_up: 'Aguardando retomada',
    handle_objection: 'Travada em objeção',
    escalate: 'Em risco',
    deepen_discovery: 'Descoberta incompleta',
    wait: 'Aguardando deliberadamente',
  }

  const ANALYSIS_OPPORTUNITY_STATUS_TONE = {
    no_intervention: 'information',
    give_space: 'information',
    advancing: 'positive',
    follow_up: 'warning',
    handle_objection: 'warning',
    escalate: 'risk',
    deepen_discovery: 'warning',
    wait: 'information',
  }

  // Estado da venda (mandato §8/§19) — primeira leitura da aba, nunca
  // apenas o stage do CRM (mandato §8: "stage é uma fonte operacional,
  // Commercial Reading é a interpretação comercial"). `status`/
  // `headline`/`stage_name` já vêm decididos pelo AnalysisViewModel —
  // este presenter só escolhe rótulo/tom a partir de `status`.
  function renderOpportunityHeader(opportunity, currentMoment) {
    if (!opportunity) {
      return ''
    }

    const label = ANALYSIS_OPPORTUNITY_STATUS_LABELS[opportunity.status] || 'Estado da venda'
    const tone = ANALYSIS_OPPORTUNITY_STATUS_TONE[opportunity.status] || 'information'
    const headline = displayText(opportunity.headline)
    const stageName = displayText(opportunity.stage_name)

    // Camada 1 vs camada 2 (mandato §9): uma sessão cuja atividade mais
    // recente já saiu da janela de sessão ativa não apaga a leitura —
    // só adiciona uma nota de contexto, nunca esconde a oportunidade.
    const staleNote = currentMoment?.is_active_session === false
      ? '<div class="yolen-opportunity-note">A conversa mais recente já não está ativa — a leitura abaixo reflete a última análise concluída, e a oportunidade continua registrada.</div>'
      : ''

    return `
      <section
        class="yolen-seller-section yolen-opportunity-header"
        data-yolen-analysis-section="opportunity"
        data-yolen-opportunity-status="${escapeHtml(opportunity.status)}"
      >
        <div class="yolen-opportunity-status yolen-opportunity-status--${escapeHtml(tone)}">
          <span class="yolen-opportunity-status-label">${escapeHtml(label)}</span>
          ${stageName ? `<span class="yolen-opportunity-stage">${escapeHtml(stageName)}</span>` : ''}
        </div>
        ${headline ? `<div class="yolen-opportunity-headline">${escapeHtml(headline)}</div>` : ''}
        ${staleNote}
      </section>
    `
  }

  // Continuidade da oportunidade (mandato §10/§17/§31) — nunca esvaziada
  // por sessão pessoal ou gap de sessão; sinais de outras conversas do
  // ciclo aparecem só como histórico de coaching, nunca como leitura da
  // conversa atual (mandato §14/§19).
  function renderContinuity(continuity) {
    const count = continuity?.cycle_conversation_count || 0
    const signals = displayItems(continuity?.cross_conversation_signals)

    if (count <= 1 && signals.length === 0) {
      return ''
    }

    const conversationNote = count > 1
      ? `<div class="yolen-seller-detail-copy">Esta oportunidade já teve ${count} conversas.</div>`
      : ''

    const signalsHtml = signals.length > 0
      ? `
        <div class="yolen-seller-detail">
          <div class="yolen-seller-detail-label">Coaching de outras conversas deste ciclo</div>
          <ul class="yolen-seller-text-list">
            ${signals.map((signal) => {
              const total = (signal.strengths_count || 0) + (signal.improvements_count || 0)
              return `<li>${escapeHtml(total > 0 ? `${signal.strengths_count} acerto(s), ${signal.improvements_count} ponto(s) de melhoria` : 'Sem pontos relevantes')}</li>`
            }).join('')}
          </ul>
        </div>
      `
      : ''

    return `
      <details class="yolen-seller-secondary-details" data-yolen-preserve-details="continuity">
        <summary>Ver continuidade da oportunidade</summary>
        ${conversationNote}
        ${signalsHtml}
      </details>
    `
  }

  // FASE 16.6 — adaptador de fallback (nunca o presenter canônico): a
  // tentativa de análise corrente (state.conversationAnalysis) resolve de
  // forma síncrona e local, antes de o ANÁLISE view model canônico
  // (Integrated Commercial Context, buscado à parte por
  // loadAnalysisViewModelForCurrentCycle) voltar do servidor. Sem este
  // adaptador, content-script.js teria que escolher entre mostrar uma
  // leitura já pronta com atraso artificial (esperando um fetch void
  // ANÁLISE já tem os dados) ou descartá-la (regressão de UX — mandato
  // §46, nenhuma leitura já concluída pode desaparecer da tela). Isto NÃO
  // reconstrói a leitura comercial em si (mandato §4) — a leitura já
  // veio pronta do servidor via ANALYZE_CONVERSATION/GET_ANALYSIS_JOB_STATUS;
  // aqui só traduz a MESMA leitura para a forma que renderAnalysisViewModel
  // já sabe desenhar. Por não ter Cycle Memory/Method Coaching locais,
  // objeções abertas, compromissos, estado da oportunidade e continuidade
  // ficam vazios/nulos aqui — nunca inventados, apenas ainda não
  // disponíveis nesta camada; o view model canônico os preenche assim que
  // chega (e, quando chega, sempre substitui este fallback — ver
  // getDetailedAnalysisAreaHtml em content-script.js).
  function buildAnalysisViewModelFromReading(reading) {
    if (!reading || typeof reading !== 'object') {
      return null
    }

    if (isNeutralCommercialSession(reading)) {
      const copy = getNeutralSessionCopy(reading)

      return {
        available: true,
        unavailable_reason: null,
        neutral: true,
        neutral_headline: copy.title,
        neutral_description: copy.description,
        opportunity: null,
        current_moment: { is_active_session: null },
        risks: [],
        objections_open: [],
        commitments: [],
        seller_conduct: {
          method: { configured: false, name: null, stages: [], current_stage: null, adherence: null, recovery_guidance: null },
          stage_divergence: false,
        },
        strengths: [],
        improvements: [],
        continuity: { cycle_conversation_count: 0, cross_conversation_signals: [] },
        history: [],
        provenance: {},
      }
    }

    // Sem reordenar por severidade aqui de propósito (mesma lição da
    // FASE 16.5 — ver comentário logo acima, ATTENTION_PRIORITY_RANK):
    // um segundo critério de priorização no cliente duplicaria o mesmo
    // julgamento que o presenter server-side já faz
    // (RISK_SEVERITY_RANK, analysis-view-model.ts) e poderia divergir
    // dele silenciosamente. Este fallback só filtra severidade baixa e
    // limita a quantidade — a ordem/priorização fina só vem do view
    // model canônico, quando ele chega.
    const risks = [
      ...(reading.risks?.customer_objections || []).map((risk) => ({ source: 'customer_objection', ...risk })),
      ...(reading.risks?.service_risks || []).map((risk) => ({ source: 'service_risk', ...risk })),
    ]
      .filter((risk) => risk.severity !== 'low')
      .slice(0, 3)

    return {
      available: true,
      unavailable_reason: null,
      neutral: false,
      neutral_headline: null,
      neutral_description: null,
      // Sem Decision State local para traduzir best_approach.decision no
      // mesmo mapeamento do presenter server-side (DECISION_TO_OPPORTUNITY_STATUS,
      // analysis-view-model.ts) — mostrar um status adivinhado seria
      // inventar (mandato §34); melhor não mostrar cabeçalho de
      // oportunidade aqui do que mostrar um errado.
      opportunity: null,
      current_moment: { is_active_session: true },
      risks,
      objections_open: [],
      commitments: [],
      seller_conduct: {
        method: reading.method || null,
        stage_divergence: false,
      },
      strengths: (reading.seller_strengths || []).slice(0, 3),
      improvements: (reading.improvement_points || []).slice(0, 3),
      continuity: { cycle_conversation_count: 0, cross_conversation_signals: [] },
      history: reading.commercial_evolution || [],
      provenance: {},
    }
  }

  // FASE 16.6 (recalibração seller-facing de ANÁLISE): ponto único de
  // renderização — traduz o AnalysisViewModel (Integrated Commercial
  // Context, FASE 16.4, via app/lib/server/analysis-view-model.ts) em
  // HTML. Nunca decide disponibilidade/neutralidade/prioridade por
  // conta própria — `available`/`neutral`/`unavailable_reason` já
  // vieram prontos do presenter server-side.
  function renderAnalysisViewModel(analysisViewModel) {
    if (!analysisViewModel || typeof analysisViewModel !== 'object') {
      return ''
    }

    if (!analysisViewModel.available) {
      return `
        <div class="yolen-seller-empty-state" data-yolen-analysis-unavailable>
          Análise ainda não disponível.
        </div>
      `
    }

    if (analysisViewModel.neutral) {
      // Pouca certeza sobre o cliente não apaga a leitura da execução do
      // vendedor: o servidor só envia coaching não silencioso aqui quando
      // há evidência determinística da condução (escopo seller_execution_only).
      const sellerExecutionCoaching =
        analysisViewModel.coaching_diagnosis &&
        analysisViewModel.coaching_diagnosis.status !== 'silent' &&
        analysisViewModel.coaching_diagnosis.scope === 'seller_execution_only'

      return [
        `
          <div class="yolen-seller-empty-state" data-yolen-analysis-neutral>
            ${escapeHtml(analysisViewModel.neutral_headline || '')} ${escapeHtml(analysisViewModel.neutral_description || '')}
          </div>
        `,
        sellerExecutionCoaching
          ? renderCoachingDiagnosis(analysisViewModel.coaching_diagnosis)
          : '',
        sellerExecutionCoaching
          ? renderAdditionalCoachingFindings(
              analysisViewModel.coaching_diagnosis.additional_findings,
            )
          : '',
        renderCommitments(analysisViewModel.commitments),
        renderContinuity(analysisViewModel.continuity),
      ].filter(Boolean).join('')
    }

    if (analysisViewModel.unavailable_reason === 'no_reading') {
      return [
        `
          <div class="yolen-seller-empty-state" data-yolen-analysis-progressive>
            Esta conversa ainda não possui análise detalhada de condução.
          </div>
        `,
        renderObjections(analysisViewModel.objections_open),
        renderCommitments(analysisViewModel.commitments),
        renderContinuity(analysisViewModel.continuity),
      ].filter(Boolean).join('')
    }

    const hasCoachingDiagnosis =
      Boolean(
        analysisViewModel.coaching_diagnosis &&
        analysisViewModel.coaching_diagnosis.status !== 'silent',
      )

    const sections = [
      renderCoachingDiagnosis(analysisViewModel.coaching_diagnosis),
      hasCoachingDiagnosis
        ? renderAdditionalCoachingFindings(
            analysisViewModel.coaching_diagnosis?.additional_findings,
          )
        : '',
      hasCoachingDiagnosis
        ? ''
        : renderImprovements(analysisViewModel.improvements),
      hasCoachingDiagnosis
        ? ''
        : renderStrengths(analysisViewModel.strengths),
      hasCoachingDiagnosis
        ? ''
        : renderOpportunityHeader(
            analysisViewModel.opportunity,
            analysisViewModel.current_moment,
          ),
      renderMethod(
        analysisViewModel.seller_conduct?.method,
        analysisViewModel.coaching_diagnosis?.method_state,
      ),
      renderObjections(analysisViewModel.objections_open),
      renderRisks(analysisViewModel.risks),
      renderCommitments(analysisViewModel.commitments),
      renderContinuity(analysisViewModel.continuity),
      renderCommercialEvolution(analysisViewModel.history),
    ].filter(Boolean)

    if (sections.length === 0) {
      return `
        <div class="yolen-seller-empty-state" data-yolen-analysis-empty>
          Esta leitura ainda não possui análise detalhada de condução.
        </div>
      `
    }

    return sections.join('')
  }

  function renderCustomerItems(label, items, field) {
    const summaries = displayItems(items)
      .map((item) => displayText(item.summary))
      .filter(Boolean)

    if (summaries.length === 0) {
      return ''
    }

    return `
      <div
        class="yolen-client-knowledge-group"
        data-yolen-client-field="${escapeHtml(field)}"
      >
        <div class="yolen-client-knowledge-label">${escapeHtml(label)}</div>
        <ul class="yolen-client-knowledge-list">
          ${summaries.map((summary) => `<li>${escapeHtml(summary)}</li>`).join('')}
        </ul>
      </div>
    `
  }

  function renderCustomerRichItems(label, items, renderItem, field) {
    const renderedItems = displayItems(items)
      .map(renderItem)
      .filter(Boolean)

    if (renderedItems.length === 0) {
      return ''
    }

    return `
      <div
        class="yolen-client-knowledge-group"
        data-yolen-client-field="${escapeHtml(field)}"
      >
        <div class="yolen-client-knowledge-label">${escapeHtml(label)}</div>
        <div class="yolen-client-rich-list">
          ${renderedItems.join('')}
        </div>
      </div>
    `
  }

  function uniqueProducts(customer) {
    const products = displayItems(customer?.discussed_products)
      .filter((item) => displayText(item.name) || displayText(item.summary))

    const primary = customer?.primary_product_interest

    if (!primary || typeof primary !== 'object') {
      return products
    }

    const alreadyIncluded = products.some((product) => (
      product.canonical_product_id === primary.canonical_product_id &&
      displayText(product.name) === displayText(primary.name) &&
      product.interest_level === primary.interest_level &&
      displayText(product.summary) === displayText(primary.summary)
    ))

    return alreadyIncluded
      ? products
      : [...products, primary]
  }

  function renderProduct(product) {
    const name = displayText(product?.name)
    const summary = displayText(product?.summary)
    const interestLabel = PRODUCT_INTEREST_LABELS[product?.interest_level]

    if ((!name && !summary) || !interestLabel) {
      return ''
    }

    const source = displayText(product.canonical_product_id)
      ? 'catalog'
      : 'observed'

    const sourceLabel = source === 'catalog'
      ? 'Produto identificado'
      : 'Menção observada'

    return `
      <article
        class="yolen-client-rich-item"
        data-yolen-client-product-source="${source}"
        data-yolen-client-product-interest="${escapeHtml(product.interest_level)}"
      >
        <div class="yolen-client-rich-item-meta">
          ${escapeHtml(sourceLabel)} · ${escapeHtml(interestLabel)}
        </div>
        <div class="yolen-client-rich-item-title">${escapeHtml(name || summary)}</div>
        ${summary && summary !== name ? `<div class="yolen-client-rich-item-copy">${escapeHtml(summary)}</div>` : ''}
      </article>
    `
  }

  function renderCompetitor(competitor) {
    const summary = displayText(competitor?.summary)
    const mentionType = competitor?.mention_type

    if (
      mentionType !== 'named' &&
      mentionType !== 'unnamed_alternative'
    ) {
      return ''
    }

    const name = mentionType === 'named'
      ? displayText(competitor.name)
      : null

    if (mentionType === 'named' && !name) {
      return ''
    }

    if (!name && !summary) {
      return ''
    }

    return `
      <article
        class="yolen-client-rich-item"
        data-yolen-client-competitor-type="${escapeHtml(mentionType)}"
      >
        <div class="yolen-client-rich-item-meta">
          ${mentionType === 'named' ? 'Concorrente identificado' : 'Alternativa sem nome'}
        </div>
        <div class="yolen-client-rich-item-title">
          ${escapeHtml(name || 'Outra solução em avaliação')}
        </div>
        ${summary && summary !== name ? `<div class="yolen-client-rich-item-copy">${escapeHtml(summary)}</div>` : ''}
      </article>
    `
  }

  function renderCommunicationObservation(observation) {
    const summary = displayText(observation?.summary)
    const observationLabel = COMMUNICATION_OBSERVATION_LABELS[
      observation?.observation_type
    ]
    const behaviorLabel = COMMUNICATION_BEHAVIOR_LABELS[
      observation?.behavior
    ]

    if (!summary || !observationLabel || !behaviorLabel) {
      return ''
    }

    return `
      <article
        class="yolen-client-rich-item"
        data-yolen-client-communication="${escapeHtml(observation.behavior)}"
        data-yolen-client-communication-type="${escapeHtml(observation.observation_type)}"
      >
        <div class="yolen-client-rich-item-meta">${escapeHtml(observationLabel)}</div>
        <div class="yolen-client-rich-item-title">${escapeHtml(behaviorLabel)}</div>
        <div class="yolen-client-rich-item-copy">${escapeHtml(summary)}</div>
      </article>
    `
  }

  // FASE 16.7 — traduz uma lacuna de conhecimento (missing_discovery, ou
  // open_questions/uncertainties como fallback — ver buildKnowledgeGaps,
  // customer-view-model.ts) em HTML. Ao contrário do antigo
  // renderMissingDiscovery, aceita `topic: null` sem descartar o item —
  // o fallback nunca tem topic, mas ainda é uma lacuna específica válida
  // (mandato §22/§23: nunca genérica, mas também nunca escondida só por
  // faltar categoria).
  function renderKnowledgeGap(gap) {
    const summary = displayText(gap?.summary)

    if (!summary) {
      return ''
    }

    const currentInterest = gap?.kind === 'current_interest'
    // Lacuna da etapa antiga enquanto o reasoning exige requalificação:
    // continua verdadeira, mas só volta a ser operacional se o interesse
    // for reconfirmado.
    const conditional = gap?.conditional_on_reconfirmation === true

    const topicLabel = currentInterest
      ? 'Estado atual do interesse'
      : MISSING_DISCOVERY_LABELS[gap?.topic] || null

    return `
      <article
        class="yolen-client-rich-item ${conditional ? 'yolen-client-rich-item--conditional' : 'yolen-client-rich-item--attention'}"
        data-yolen-customer-gap-topic="${escapeHtml(gap.topic || 'unspecified')}"
        data-yolen-customer-gap-kind="${escapeHtml(gap?.kind || 'discovery')}"
        ${conditional ? 'data-yolen-customer-gap-conditional' : ''}
      >
        ${topicLabel ? `<div class="yolen-client-rich-item-meta">${escapeHtml(topicLabel)}</div>` : ''}
        <div class="yolen-client-rich-item-title">${conditional ? 'Se o interesse continuar: ' : ''}${escapeHtml(summary)}</div>
      </article>
    `
  }

  // "Como prefere interagir" (mandato §37/§12) — preferências +
  // padrões de comunicação, sempre como observação da leitura atual,
  // nunca como traço confirmado entre ciclos (não há memória durável
  // para provar recorrência — mandato §8).
  function renderCustomerPreferences(preferences, communicationPatterns) {
    const sections = [
      renderCustomerItems('Preferências observadas', preferences, 'preferences'),
      renderCustomerRichItems('Padrões de comunicação', communicationPatterns, renderCommunicationObservation, 'communication_patterns'),
    ].filter(Boolean)

    if (sections.length === 0) {
      return ''
    }

    return `
      <section class="yolen-seller-section" data-yolen-customer-section="preferences">
        <div class="yolen-seller-section-heading">
          <div>
            <div class="yolen-seller-section-eyebrow">Como prefere interagir</div>
            <h3>Preferências</h3>
          </div>
        </div>
        <div class="yolen-seller-detail-copy">Observado nesta conversa — ainda não confirmado como padrão permanente.</div>
        ${sections.join('')}
      </section>
    `
  }

  function renderCustomerKnowledgeSection(section, eyebrow, title, items, note) {
    const rows = displayItems(items)
      .filter((item) => displayText(item?.summary))

    if (rows.length === 0) {
      return ''
    }

    return `
      <section class="yolen-seller-section" data-yolen-customer-section="${escapeHtml(section)}">
        <div class="yolen-seller-section-heading">
          <div>
            <div class="yolen-seller-section-eyebrow">${escapeHtml(eyebrow)}</div>
            <h3>${escapeHtml(title)}</h3>
          </div>
        </div>
        ${note ? `<div class="yolen-seller-detail-copy">${escapeHtml(note)}</div>` : ''}
        <ul class="yolen-client-knowledge-list" data-yolen-customer-knowledge="${escapeHtml(section)}">
          ${rows.map((item) => `<li><span class="yolen-client-knowledge-label">${escapeHtml(displayText(item.label) || '')}</span> ${escapeHtml(displayText(item.summary))}</li>`).join('')}
        </ul>
      </section>
    `
  }

  // "O que ainda falta descobrir" (mandato §22/§23) — 1 lacuna principal
  // em destaque + até 2 secundárias, nunca uma lista genérica.
  function renderCustomerKnowledgeGaps(gaps) {
    const items = displayItems(gaps).filter((item) => displayText(item.summary))

    if (items.length === 0) {
      return ''
    }

    const [principal, ...secondary] = items
    const secondaryConditional =
      secondary.length > 0 &&
      secondary.every((item) => item?.conditional_on_reconfirmation === true)

    return `
      <section class="yolen-seller-section" data-yolen-customer-section="knowledge-gaps">
        <div class="yolen-seller-section-heading">
          <div>
            <div class="yolen-seller-section-eyebrow">Ainda não sabemos</div>
            <h3>O que falta descobrir</h3>
          </div>
        </div>
        <div class="yolen-seller-stack" data-yolen-customer-gap="principal">
          ${renderKnowledgeGap(principal)}
        </div>
        ${secondary.length > 0 ? `
          ${secondaryConditional ? '<div class="yolen-seller-detail-copy" data-yolen-customer-gap-after>Depois, se o interesse continuar</div>' : ''}
          <div class="yolen-client-rich-list" data-yolen-customer-gap="secondary">
            ${secondary.map(renderKnowledgeGap).join('')}
          </div>
        ` : ''}
      </section>
    `
  }

  // "Contexto desta oportunidade" — secundário, recolhido, subordinado
  // (mandato §7/§13, opção "Balanceado" do Controle Mestre FASE 16.7):
  // tudo aqui é específico deste ciclo, nunca oferecido como traço
  // durável da pessoa nem como bloco principal da aba.
  function renderCustomerOpportunityContext(context) {
    if (!context || typeof context !== 'object') {
      return ''
    }

    const products = uniqueProducts({
      discussed_products: context.discussed_products,
      primary_product_interest: context.primary_product_interest,
    })

    const groups = [
      renderCustomerItems('Objetivos', context.objectives, 'objectives'),
      renderCustomerItems('Necessidades', context.needs, 'needs'),
      renderCustomerItems('Interesses', context.interests, 'interests'),
      renderCustomerItems('Problemas', context.problems, 'problems'),
      renderCustomerItems('Impactos', context.impacts, 'impacts'),
      renderCustomerItems('Critérios de decisão', context.decision_criteria, 'decision_criteria'),
      renderCustomerRichItems('Produtos avaliados', products, renderProduct, 'discussed_products'),
      renderCustomerRichItems('Concorrentes e alternativas', context.competitors, renderCompetitor, 'competitors'),
      renderCustomerRichItems('Observações recentes', context.communication_events, renderCommunicationObservation, 'communication_events'),
    ].filter(Boolean)

    if (groups.length === 0) {
      return ''
    }

    return `
      <details class="yolen-seller-secondary-details" data-yolen-customer-section="opportunity-context" data-yolen-preserve-details="customer-opportunity-context">
        <summary>Contexto desta oportunidade</summary>
        <div class="yolen-seller-detail-copy">Específico desta oportunidade — não é uma característica permanente confirmada deste cliente.</div>
        <div class="yolen-client-intelligence-groups">
          ${groups.join('')}
        </div>
      </details>
    `
  }

  // FASE 16.7 (recalibração seller-facing de CLIENTE): ponto único de
  // renderização — traduz o CustomerViewModel (Commercial Reading
  // canônica atual, via app/lib/server/customer-view-model.ts) em HTML.
  // Nunca decide disponibilidade por conta própria —
  // `available`/`unavailable_reason` já vieram prontos do presenter
  // server-side (ou do fallback local equivalente,
  // buildCustomerViewModelFromReading, logo abaixo). Ao contrário de
  // renderAnalysisViewModel/renderAgoraViewModelSnapshot, não tem branch
  // `neutral` — mandato §19, regra não-negociável: uma sessão pessoal
  // nunca apaga o que já sabemos sobre o cliente.
  function renderCustomerViewModel(customerViewModel) {
    if (!customerViewModel || typeof customerViewModel !== 'object') {
      return ''
    }

    if (!customerViewModel.available) {
      return `
        <div class="yolen-seller-empty-state" data-yolen-customer-unavailable>
          Ainda não há informações suficientes sobre este cliente.
        </div>
      `
    }

    // R8 — firewall de proveniência: com a leitura já filtrada pelo gate,
    // CLIENTE separa o que a fala real do cliente sustenta ("O que
    // sabemos") da interpretação da Yolen ("O que inferimos") e do que
    // falta descobrir. Os mesmos itens não se repetem em outra seção.
    const knowledge =
      customerViewModel.knowledge &&
      typeof customerViewModel.knowledge === 'object'
        ? customerViewModel.knowledge
        : null

    const sections = (knowledge
      ? [
          renderCustomerKnowledgeSection('known', 'Confirmado na conversa', 'O que sabemos', knowledge.known, null),
          renderCustomerKnowledgeSection('inferred', 'Interpretação da Yolen', 'O que inferimos', knowledge.inferred, 'Leitura a partir da conversa — o cliente não disse isso literalmente. Confirme antes de tratar como fato.'),
          renderCustomerKnowledgeGaps(customerViewModel.knowledge_gaps),
        ]
      : [
          renderCustomerPreferences(customerViewModel.preferences, customerViewModel.communication_patterns),
          renderCustomerKnowledgeGaps(customerViewModel.knowledge_gaps),
          renderCustomerOpportunityContext(customerViewModel.opportunity_context),
        ]).filter(Boolean)

    if (sections.length === 0) {
      return `
        <div class="yolen-seller-empty-state" data-yolen-customer-empty>
          Ainda não há informações suficientes sobre preferências ou contexto deste cliente.
        </div>
      `
    }

    return `
      <div class="yolen-card yolen-client-commercial-card" data-yolen-client-intelligence>
        <div class="yolen-client-intelligence-heading">
          <div class="yolen-section-label">${knowledge ? 'Fatos, inferências e lacunas' : 'O que sabemos'}</div>
          <h3>Cliente</h3>
        </div>
        ${sections.join('')}
      </div>
    `
  }

  // FASE 16.7 — adaptador de fallback (nunca o presenter canônico):
  // mesma razão de buildAnalysisViewModelFromReading (FASE 16.6) — a
  // leitura comercial da tentativa corrente já pode estar disponível
  // localmente (via getLastKnownClientCommercialReading, o mesmo
  // snapshot com identidade que CLIENTE já usava antes desta fase)
  // antes de o CustomerViewModel canônico (fetch separado) voltar do
  // servidor. Sem este adaptador, uma leitura já pronta desapareceria
  // artificialmente da tela por um instante (regressão de UX — mesma
  // lição da FASE 16.6). Replica exatamente a mesma classificação
  // person/cycle do presenter server-side (customer-view-model.ts) —
  // nunca uma segunda interpretação diferente.
  function buildClientKnowledgeGaps(customer) {
    const activeMissingDiscovery = (customer.missing_discovery || [])
      .filter((item) => !hasClientSharedMemoryId(
        item,
        [
          ...(customer.resolved_information || []),
          ...(customer.superseded_information || []),
        ],
      ))

    if (activeMissingDiscovery.length > 0) {
      return activeMissingDiscovery.slice(0, 3).map((item) => ({
        summary: item.summary,
        topic: item.topic || null,
        evidence_message_ids: item.evidence_message_ids || [],
        memory_ids: item.memory_ids || [],
      }))
    }

    // Fallback (mandato §22): sem lacuna específica de descoberta,
    // perguntas em aberto/incertezas ainda podem apontar uma lacuna
    // concreta — mesma regra de buildKnowledgeGaps, customer-view-model.ts.
    return [
      ...(customer.open_questions || []),
      ...(customer.uncertainties || []),
    ].slice(0, 3).map((item) => ({
      summary: item.summary,
      topic: null,
      evidence_message_ids: item.evidence_message_ids || [],
      memory_ids: item.memory_ids || [],
    }))
  }

  function buildCustomerViewModelFromReading(reading) {
    const customer = reading?.customer

    if (!customer || typeof customer !== 'object') {
      return null
    }

    return {
      available: true,
      unavailable_reason: null,

      preferences: (customer.preferences || []).slice(0, 5),

      communication_patterns:
        (customer.communication?.patterns || []).slice(0, 5),

      knowledge_gaps: buildClientKnowledgeGaps(customer),

      opportunity_context: {
        objectives: (customer.objectives || []).slice(0, 5),
        needs: (customer.needs || []).slice(0, 5),
        interests: (customer.interests || []).slice(0, 5),
        problems: (customer.problems || []).slice(0, 5),
        impacts: (customer.impacts || []).slice(0, 5),
        decision_criteria: (customer.decision_criteria || []).slice(0, 5),
        discussed_products: (customer.discussed_products || []).slice(0, 5),
        primary_product_interest: customer.primary_product_interest || null,
        competitors: (customer.competitors || []).slice(0, 5),
        communication_events: (customer.communication?.events || []).slice(0, 5),
      },

      provenance: {},
    }
  }

  function hasClientSharedMemoryId(item, historyItems) {
    const memoryIds = Array.isArray(item?.memory_ids)
      ? item.memory_ids.filter(displayText)
      : []

    if (memoryIds.length === 0) {
      return false
    }

    return displayItems(historyItems).some((history) => (
      history.category === 'missing_discovery' &&
      Array.isArray(history.memory_ids) &&
      history.memory_ids.some((id) => memoryIds.includes(id))
    ))
  }

  // FASE 16.5 (recalibração seller-facing do AGORA): renderAttentionItem
  // é o único primitivo de apresentação que sobrevive daqui — ele só
  // desenha um card a partir de valores já decididos, nunca decide o que
  // mostrar. Quem decide é o AgoraViewModel (Decision State traduzido por
  // app/lib/server/agora-view-model.ts, FASE 16.3E/16.5), consumido por
  // renderAgoraViewModelSnapshot logo abaixo.
  function renderAttentionItem({
    label,
    headline,
    action,
    priority,
    source,
    tone,
    variant,
  }) {
    const cleanHeadline =
      sellerText(
        headline,
        'Há um ponto comercial que merece atenção.',
      )

    const cleanAction =
      sellerText(action)

    if (!cleanHeadline) {
      return ''
    }

    return `
      <div
        class="yolen-now-attention yolen-now-attention--${escapeHtml(tone)}"
        data-yolen-now-attention="${escapeHtml(source || '')}"
        data-yolen-alert-priority="${escapeHtml(priority || '')}"
        ${variant ? `data-yolen-now-attention-variant="${escapeHtml(variant)}"` : ''}
      >
        <div class="yolen-decision-kicker">${escapeHtml(label)}</div>
        <div class="yolen-now-attention-decision">${escapeHtml(cleanHeadline)}</div>
        ${cleanAction ? `
          <div class="yolen-now-attention-action">
            <span>Próxima ação</span>
            ${escapeHtml(cleanAction)}
          </div>
        ` : ''}
      </div>
    `
  }

  // Traduz um AgoraViewModelSignal (primary ou um item de secondary) em
  // texto/tom seller-facing — o `headline`/`action` já vêm concretos e
  // específicos do candidato real que Decision State elegeu (mandato
  // §7/§8); este mapa só decide rótulo curto e tom visual a partir de
  // `status`, nunca reclassifica prioridade nem reescreve o texto.
  function renderAgoraSignal(signal, variant) {
    if (!signal) {
      return ''
    }

    const label =
      AGORA_VIEW_MODEL_STATUS_LABELS[signal.status] ||
      'Atenção'

    const tone =
      signal.priority === 'critical'
        ? 'risk'
        : (AGORA_VIEW_MODEL_STATUS_TONE[signal.status] || 'warning')

    return renderAttentionItem({
      label,
      headline: signal.headline,
      action: signal.action,
      priority: signal.priority || '',
      source: signal.status,
      tone,
      variant,
    })
  }

  // Ponto único de renderização do AGORA seller-facing (FASE 16.5): no
  // máximo 1 card primário + no máximo 2 cards secundários (mandato §4),
  // já garantido por construção em app/lib/server/agora-view-model.ts —
  // esta função nunca reordena, nunca filtra por conta própria, nunca
  // inventa um card quando `silent` é `true` (mandato §9/§23).
  function renderAgoraViewModelSnapshot(agoraViewModel) {
    if (!agoraViewModel || agoraViewModel.silent) {
      return ''
    }

    const secondaryHtml =
      (agoraViewModel.secondary || [])
        .slice(0, 2)
        .map((signal) => renderAgoraSignal(signal, 'secondary'))
        .join('')

    // `primary` pode ser `null` mesmo com `silent: false` — a decisão
    // principal foi deliberadamente suprimida (Decision State marcou
    // `primary_decision.silent`, comunicação explicitamente
    // desnecessária agora), mas um sinal secundário real sobrevive
    // (achado do Codex, PR #283, rodada 2) e ainda deve renderizar.
    const primaryHtml =
      agoraViewModel.primary
        ? renderAgoraSignal(agoraViewModel.primary, 'primary')
        : ''

    if (!primaryHtml) {
      return secondaryHtml
    }

    if (!secondaryHtml) {
      return primaryHtml
    }

    const secondaryCount =
      Math.min(
        2,
        (agoraViewModel.secondary || []).length,
      )

    return `
      ${primaryHtml}
      <details
        class="yolen-seller-secondary-details yolen-now-secondary-details"
        data-yolen-preserve-details="agora-secondary-signals"
      >
        <summary>Ver outros sinais (${secondaryCount})</summary>
        <div class="yolen-seller-stack">
          ${secondaryHtml}
        </div>
      </details>
    `
  }

  // Leitura completa (HML, flag COMPANION_FULL_READING_PANEL no backend).
  // O texto do modelo NUNCA entra em HTML: o HTML do painel leva só um
  // marcador com a chave da view, e o conteúdo é montado depois por
  // hydrateFullReadingSlots, com createElement e textContent.
  function renderFullReadingSlot(kind, view) {
    if (
      (kind !== 'agora' && kind !== 'analysis') ||
      !view ||
      typeof view !== 'object' ||
      typeof view.view_key !== 'string'
    ) {
      return ''
    }

    return (
      '<div class="yolen-card yolen-seller-area-card yolen-full-reading"' +
      ` data-yolen-full-reading="${escapeHtml(kind)}"` +
      ` data-yolen-full-reading-key="${escapeHtml(view.view_key)}"` +
      ` data-yolen-full-reading-state="${escapeHtml(String(view.state || ''))}"` +
      '></div>'
    )
  }

  function fullReadingText(value) {
    return typeof value === 'string'
      ? value.replace(/\s+/g, ' ').trim()
      : ''
  }

  function createTextElement(doc, tag, className, value) {
    const node = doc.createElement(tag)

    if (className) {
      node.className = className
    }

    node.textContent = fullReadingText(value)

    return node
  }

  function appendFullReadingNotice(doc, nodes, view) {
    const notice = fullReadingText(view.notice)

    if (!notice) {
      return
    }

    const line = doc.createElement('div')
    line.className =
      view.state === 'failed'
        ? 'yolen-full-reading-notice yolen-status-warning'
        : 'yolen-inline-loading-status yolen-full-reading-notice'
    line.setAttribute('role', 'status')
    line.setAttribute('aria-live', 'polite')
    line.setAttribute('data-yolen-full-reading-notice', String(view.state || ''))

    if (view.state === 'running') {
      const spinner = doc.createElement('span')
      spinner.className = 'yolen-spinner'
      spinner.setAttribute('aria-hidden', 'true')
      line.appendChild(spinner)
    }

    line.appendChild(doc.createTextNode(notice))
    nodes.push(line)
  }

  function buildAgoraFullReadingNodes(doc, view, options) {
    const nodes = []

    nodes.push(createTextElement(doc, 'div', 'yolen-section-label', 'Agora'))

    const kanbanLine = fullReadingText(view.kanban_line)

    if (kanbanLine) {
      const kanban = createTextElement(doc, 'div', 'yolen-full-reading-kanban', kanbanLine)
      kanban.setAttribute('data-yolen-full-reading-kanban', String(view.kanban?.status || ''))
      nodes.push(kanban)
    }

    appendFullReadingNotice(doc, nodes, view)

    const main = view.main && typeof view.main === 'object' ? view.main : null

    if (main) {
      const card = doc.createElement('div')
      card.className = 'yolen-full-reading-main'
      card.setAttribute('data-yolen-full-reading-main', '')

      for (const [label, value, key] of [
        ['Situação', main.situacao, 'situacao'],
        ['Ação', main.acao, 'acao'],
        ['Por quê', main.por_que, 'por_que'],
      ]) {
        const text = fullReadingText(value)

        if (!text) {
          continue
        }

        const block = doc.createElement('div')
        block.className = 'yolen-decision-block'
        block.setAttribute('data-yolen-full-reading-field', key)
        block.appendChild(createTextElement(doc, 'div', 'yolen-decision-kicker', label))
        block.appendChild(createTextElement(doc, 'div', 'yolen-decision-copy', text))
        card.appendChild(block)
      }

      nodes.push(card)
    }

    const stage = view.stage_card && typeof view.stage_card === 'object' ? view.stage_card : null

    if (stage) {
      const card = doc.createElement('div')
      card.className = 'yolen-decision-block yolen-full-reading-stage'
      card.setAttribute('data-yolen-full-reading-stage-kind', String(stage.kind || ''))
      card.appendChild(createTextElement(doc, 'div', 'yolen-decision-kicker', 'Etapa'))
      card.appendChild(createTextElement(doc, 'div', 'yolen-decision-copy yolen-full-reading-stage-title', stage.title))

      if (fullReadingText(stage.reason)) {
        card.appendChild(createTextElement(doc, 'div', 'yolen-decision-copy yolen-full-reading-stage-reason', stage.reason))
      }

      const button = doc.createElement('button')
      button.type = 'button'
      button.className = 'yolen-primary-button'
      button.setAttribute('data-yolen-action', 'full-reading-stage')
      button.setAttribute('data-yolen-full-reading-stage-kind', String(stage.kind || ''))
      button.textContent = fullReadingText(stage.button_label)

      if (options?.stageBusy === true) {
        button.disabled = true
      }

      const actions = doc.createElement('div')
      actions.className = 'yolen-inline-actions'
      actions.appendChild(button)
      card.appendChild(actions)

      const status = fullReadingText(options?.stageStatus)

      if (status) {
        const statusLine = createTextElement(doc, 'div', 'yolen-card-description', status)
        statusLine.setAttribute('data-yolen-full-reading-stage-status', '')
        statusLine.setAttribute('role', 'status')
        card.appendChild(statusLine)
      }

      nodes.push(card)
    }

    const footer = fullReadingText(view.footer)

    if (footer) {
      nodes.push(createTextElement(doc, 'div', 'yolen-message-footnote yolen-full-reading-footer', footer))
    }

    return nodes
  }

  function appendFullReadingList(doc, section, items) {
    const list = doc.createElement('ul')
    list.className = 'yolen-seller-text-list'

    for (const item of items) {
      const text = fullReadingText(item)

      if (text) {
        list.appendChild(createTextElement(doc, 'li', '', text))
      }
    }

    if (list.childNodes.length > 0) {
      section.appendChild(list)
    }
  }

  function createFullReadingSection(doc, key, title) {
    const section = doc.createElement('section')
    section.className = 'yolen-seller-section yolen-full-reading-section'
    section.setAttribute('data-yolen-full-reading-section', key)
    section.appendChild(createTextElement(doc, 'h3', '', title))

    return section
  }

  function buildAnalysisFullReadingNodes(doc, view) {
    const nodes = []

    nodes.push(createTextElement(doc, 'div', 'yolen-section-label', 'Análise'))

    appendFullReadingNotice(doc, nodes, view)

    const sections = Array.isArray(view.sections) ? view.sections : []

    for (const entry of sections) {
      if (!entry || typeof entry !== 'object') {
        continue
      }

      const section = createFullReadingSection(doc, String(entry.key || ''), fullReadingText(entry.title))
      const blocks = Array.isArray(entry.blocks) ? entry.blocks : []

      for (const block of blocks) {
        const items = Array.isArray(block?.items) ? block.items : []

        if (block?.type === 'list') {
          appendFullReadingList(doc, section, items)
        } else {
          for (const item of items) {
            if (fullReadingText(item)) {
              section.appendChild(createTextElement(doc, 'div', 'yolen-seller-detail-copy', item))
            }
          }
        }
      }

      nodes.push(section)
    }

    for (const [key, title, items] of [
      ['afirmacoes_a_confirmar', 'Afirmações a confirmar', view.afirmacoes_a_confirmar],
      ['alertas_de_captura', 'Alertas de captura', view.alertas_de_captura],
    ]) {
      const list = Array.isArray(items) ? items.filter((item) => fullReadingText(item)) : []

      if (list.length === 0) {
        continue
      }

      const section = createFullReadingSection(doc, key, title)
      appendFullReadingList(doc, section, list)
      nodes.push(section)
    }

    const footer = fullReadingText(view.footer)

    if (footer) {
      nodes.push(createTextElement(doc, 'div', 'yolen-message-footnote yolen-full-reading-footer', footer))
    }

    return nodes
  }

  // Preenche os marcadores da leitura completa dentro de `container`. Só
  // preenche o marcador cuja chave bate com a view atual (um HTML antigo
  // ainda pendente nunca recebe o conteúdo de uma view nova).
  function hydrateFullReadingSlots(container, views, options) {
    if (!container || typeof container.querySelectorAll !== 'function') {
      return 0
    }

    let hydrated = 0

    container
      .querySelectorAll('[data-yolen-full-reading]')
      .forEach((slot) => {
        const kind = slot.getAttribute('data-yolen-full-reading')
        const view =
          kind === 'agora'
            ? views?.agora
            : kind === 'analysis'
              ? views?.analysis
              : null

        if (
          !view ||
          typeof view.view_key !== 'string' ||
          slot.getAttribute('data-yolen-full-reading-key') !== view.view_key
        ) {
          return
        }

        // Já montado com o mesmo conteúdo: não recria (um botão recriado
        // entre o pointerdown e o click perderia o clique).
        const signature =
          kind === 'agora'
            ? `${view.view_key}|${options?.stageBusy === true}|${fullReadingText(options?.stageStatus)}`
            : view.view_key

        if (
          slot.getAttribute('data-yolen-full-reading-hydrated') === signature &&
          slot.childNodes.length > 0
        ) {
          return
        }

        const doc = slot.ownerDocument
        const nodes =
          kind === 'agora'
            ? buildAgoraFullReadingNodes(doc, view, options)
            : buildAnalysisFullReadingNodes(doc, view)

        slot.replaceChildren(...nodes)
        slot.setAttribute('data-yolen-full-reading-hydrated', signature)
        hydrated += 1
      })

    return hydrated
  }

  const api = Object.freeze({
    escapeHtml,
    sellerText,
    getMethodStatusLabel,
    getMethodAdherenceLabel,
    getNeutralSessionCopy,
    isNeutralCommercialSession,
    buildAnalysisViewModelFromReading,
    buildCustomerViewModelFromReading,
    renderAgoraViewModelSnapshot,
    renderAnalysisViewModel,
    renderCustomerViewModel,
    renderFullReadingSlot,
    hydrateFullReadingSlots,
    repeatsContent,
    novelSentences,
    splitSentences,
  })

  root.YolenCompanionSellerInformationView = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : window)
