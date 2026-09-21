;(function initYolenCompanionWorkspaceRuntime(root) {
  'use strict'

  // STEP 2B.5-A — primeira extração da fundação platform-agnostic do
  // workspace seller-facing do Companion (UX8 FASE C, antes só dentro de
  // content-script.js). Este módulo pertence ao produto Companion, nunca a
  // uma plataforma: não conhece web.whatsapp.com, app.manychat.com, JID,
  // subscriber_id/wa_id, React Fiber, nem qualquer seletor de mensagem ou
  // composer. Recebe estado (área ativa), dados (rótulos/conteúdo por
  // região) e primitivas de evento (key, currentArea) — nunca lê o DOM da
  // conversa nem despacha ações de captura/análise sozinho.
  //
  // Fonte canônica ÚNICA das áreas seller-facing e sua ordem oficial
  // (Agora, Mensagem, Análise, Cliente): antes desta extração,
  // setActiveSellerArea()/handleSellerAreaKeyboard() em content-script.js
  // usavam sua própria lista — se uma área nova fosse adicionada num lugar
  // e esquecida no outro, a navegação por teclado e o valor aceito por
  // setActiveSellerArea() divergiriam silenciosamente. Uma única lista, em
  // um único módulo, elimina essa classe de bug estruturalmente.
  const SELLER_AREAS = Object.freeze(['now', 'message', 'analysis', 'client'])

  const SELLER_AREA_LABELS = Object.freeze({
    now: 'Agora',
    message: 'Mensagem',
    analysis: 'Análise',
    client: 'Cliente',
  })

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;')
  }

  function isValidSellerArea(area) {
    return SELLER_AREAS.includes(area)
  }

  function normalizeSellerArea(area, fallback = SELLER_AREAS[0]) {
    return isValidSellerArea(area) ? area : fallback
  }

  // Navegação por teclado das tabs: só a computação pura de "qual é a
  // próxima área" a partir de currentArea/key — nunca toca em DOM ou
  // evento algum. O adapter de cada plataforma extrai currentArea (do
  // data-yolen-seller-area do alvo) e key do evento real de teclado, chama
  // esta função, e decide (nextArea !== null) se chama
  // event.preventDefault() e aplica a troca/foco real.
  function getNextSellerAreaForKeydown(currentArea, key) {
    const currentIndex = SELLER_AREAS.indexOf(currentArea)

    if (currentIndex < 0) {
      return null
    }

    if (key === 'ArrowRight' || key === 'ArrowDown') {
      return SELLER_AREAS[(currentIndex + 1) % SELLER_AREAS.length]
    }

    if (key === 'ArrowLeft' || key === 'ArrowUp') {
      return SELLER_AREAS[
        (currentIndex - 1 + SELLER_AREAS.length) % SELLER_AREAS.length
      ]
    }

    if (key === 'Home') {
      return SELLER_AREAS[0]
    }

    if (key === 'End') {
      return SELLER_AREAS[SELLER_AREAS.length - 1]
    }

    return null
  }

  function getSellerAreaTabHtml(area, label, activeArea) {
    const selected = activeArea === area

    return `
      <button
        id="yolen-seller-tab-${escapeHtml(area)}"
        class="yolen-seller-tab ${selected ? 'yolen-seller-tab--active' : ''}"
        type="button"
        role="tab"
        data-yolen-seller-area="${escapeHtml(area)}"
        aria-selected="${selected ? 'true' : 'false'}"
        aria-controls="yolen-seller-panel-${escapeHtml(area)}"
        tabindex="${selected ? '0' : '-1'}"
      >
        ${escapeHtml(label)}
      </button>
    `
  }

  function getSellerAreaPanelHtml(area, content, activeArea) {
    const selected = activeArea === area

    return `
      <section
        id="yolen-seller-panel-${escapeHtml(area)}"
        class="yolen-seller-panel"
        role="tabpanel"
        aria-labelledby="yolen-seller-tab-${escapeHtml(area)}"
        data-yolen-seller-panel="${escapeHtml(area)}"
        ${selected ? '' : 'hidden'}
      >
        ${content}
      </section>
    `
  }

  // UX8 (shell estável): a barra de abas precisa viver FORA da região
  // rolável (workspace-body) para não fazer scroll junto com o conteúdo —
  // decisão de layout de quem monta o painel (content-script.js), não
  // deste módulo, que só devolve o HTML da barra em si.
  function getSellerAreaTabsBarHtml(activeArea, labels = SELLER_AREA_LABELS) {
    return `
      <div
        class="yolen-seller-tabs"
        role="tablist"
        aria-label="Áreas do Yolen Companion"
      >
        ${SELLER_AREAS.map((area) =>
          getSellerAreaTabHtml(area, labels[area], activeArea),
        ).join('')}
      </div>
    `
  }

  const api = Object.freeze({
    SELLER_AREAS,
    SELLER_AREA_LABELS,
    escapeHtml,
    isValidSellerArea,
    normalizeSellerArea,
    getNextSellerAreaForKeydown,
    getSellerAreaTabHtml,
    getSellerAreaPanelHtml,
    getSellerAreaTabsBarHtml,
  })

  root.YolenCompanionWorkspaceRuntime = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
