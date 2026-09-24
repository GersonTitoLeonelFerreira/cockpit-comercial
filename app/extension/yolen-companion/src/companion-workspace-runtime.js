;(function initYolenCompanionWorkspaceRuntime(root) {
  'use strict'

  // FASE 4A.1 (reconstrução do Companion multicanal) — autoridade canônica
  // ÚNICA do workspace seller-facing (contrato v1.1.0, §12 e gate A3).
  //
  // Este módulo pertence ao Core do Companion e é platform-neutral: recebe
  // estado (área ativa), dados (rótulos/conteúdo) e primitivas de evento
  // já extraídas (área atual + tecla) e devolve apenas valores puros ou o
  // HTML do próprio painel Yolen. Receber eventos reais, preventDefault(),
  // foco, scroll e re-render continuam com quem monta o painel no canal.
  //
  // Comportamento extraído sem alteração de content-script.js (UX8 FASE C):
  // mesma lista, mesma ordem, mesmos rótulos, mesmo HTML/ARIA/classes.

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

  function createSellerWorkspaceState(
    initialArea = SELLER_AREAS[0],
  ) {
    let activeArea =
      normalizeSellerArea(initialArea)

    return Object.freeze({
      getActiveArea() {
        return activeArea
      },

      setActiveArea(nextArea) {
        if (!isValidSellerArea(nextArea)) {
          return false
        }

        activeArea = nextArea
        return true
      },

      resetActiveArea() {
        activeArea = SELLER_AREAS[0]
        return activeArea
      },
    })
  }

  // Navegação por teclado entre as abas: função pura de (área atual,
  // tecla) → próxima área, com wrap nas setas. Devolve null quando a
  // tecla não navega ou a área atual é inválida — quem chama decide, só
  // nesse caso, se previne o comportamento padrão e aplica a troca.
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

  // A barra vive numa região própria do painel, fora da área rolável —
  // decisão de layout de quem monta o painel; aqui só o HTML da barra,
  // sempre na ordem canônica. `labels` permite sobrescrever rótulos
  // pontuais; a ausência de um rótulo cai no rótulo canônico.
  function getSellerAreaTabsBarHtml(activeArea, labels = SELLER_AREA_LABELS) {
    const tabs = SELLER_AREAS.map((area) =>
      getSellerAreaTabHtml(
        area,
        labels?.[area] ?? SELLER_AREA_LABELS[area],
        activeArea,
      ),
    ).join('\n        ')

    return `
      <div
        class="yolen-seller-tabs"
        role="tablist"
        aria-label="Áreas do Yolen Companion"
      >
        ${tabs}
      </div>
    `
  }

  function getSellerWorkspaceHtml({
    activeArea = SELLER_AREAS[0],
    nowHtml = '',
    messageHtml = '',
    analysisHtml = '',
    clientHtml = '',
  } = {}) {
    const normalizedActiveArea =
      normalizeSellerArea(activeArea)

    return `
      <div class="yolen-seller-workspace yolen-seller-workspace--ux7" data-yolen-ux-build="UX7">
        ${getSellerAreaPanelHtml('now', nowHtml, normalizedActiveArea)}

        ${getSellerAreaPanelHtml('message', messageHtml, normalizedActiveArea)}

        ${getSellerAreaPanelHtml('analysis', analysisHtml, normalizedActiveArea)}

        ${getSellerAreaPanelHtml('client', clientHtml, normalizedActiveArea)}
      </div>
    `
  }

  const api = Object.freeze({
    SELLER_AREAS,
    SELLER_AREA_LABELS,
    isValidSellerArea,
    normalizeSellerArea,
    createSellerWorkspaceState,
    getNextSellerAreaForKeydown,
    getSellerAreaTabHtml,
    getSellerAreaPanelHtml,
    getSellerAreaTabsBarHtml,
    getSellerWorkspaceHtml,
  })

  root.YolenCompanionWorkspaceRuntime = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
