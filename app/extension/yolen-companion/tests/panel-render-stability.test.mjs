// Cobre a promessa central dos dois runtimes de estabilidade do painel do
// Companion (panel-stability-runtime.js e editable-field-stability-runtime.js):
// um rerender de fundo (`panel.innerHTML = ...`, como content-script.js faz a
// cada `renderPanel()`) nunca pode destruir scroll, foco ou valor de um campo
// enquanto o vendedor está interagindo, e só uma mudança REAL de conversa
// pode resetar esse estado.
//
// Os dois arquivos carregam nessa ordem no manifest.json (panel-stability
// primeiro) e cada um substitui `innerHTML` do painel por um getter/setter
// próprio — por isso os testes rodam o mesmo cenário nas duas ordens de
// carregamento (`ORDERS` abaixo): a proteção não pode depender de qual dos
// dois vence a corrida para "patchar" primeiro.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildPanelHtml,
  dispatch,
  flushStabilityQueues,
  loadStabilityRuntimes,
} from './e3-test-support/load-stability-runtimes.mjs'

const ORDERS = [
  ['panel-stability-runtime.js', 'editable-field-stability-runtime.js'],
  ['editable-field-stability-runtime.js', 'panel-stability-runtime.js'],
]

// jsdom não roda layout de verdade: scrollHeight/clientHeight ficam sempre 0.
// Simulamos um painel realmente rolável fixando essas duas leituras, do
// mesmo jeito que o WhatsApp Web real produziria (painel mais alto que a
// viewport).
function makeScrollable(panel, { scrollHeight = 4000, clientHeight = 600 } = {}) {
  Object.defineProperty(panel, 'scrollHeight', { get: () => scrollHeight, configurable: true })
  Object.defineProperty(panel, 'clientHeight', { get: () => clientHeight, configurable: true })
}

for (const order of ORDERS) {
  const orderLabel = order.join(' -> ')

  test(`[${orderLabel}] scroll preservado durante rerender de fundo`, async () => {
    const { document, getPanel } = loadStabilityRuntimes({
      order,
      panelHtml: buildPanelHtml({ leadName: 'Cliente A' }),
    })
    const panel = getPanel()
    makeScrollable(panel)

    panel.scrollTop = 1200
    dispatch(panel, 'scroll')
    await flushStabilityQueues()

    // Rerender de fundo: mesma identidade de lead, conteúdo novo.
    panel.innerHTML = buildPanelHtml({ leadName: 'Cliente A', nameValue: 'Novo valor vindo do estado' })
    await flushStabilityQueues()

    assert.equal(
      document.querySelector('[data-yolen-field="name"]')?.getAttribute('value'),
      'Novo valor vindo do estado',
      'o rerender de fundo deveria ter sido aplicado (nada estava travando)',
    )
    assert.equal(panel.scrollTop, 1200, 'scroll não deveria voltar ao topo nem pular')
  })

  test(`[${orderLabel}] input preservado durante rerender: valor não é destruído enquanto o campo tem foco`, async () => {
    const { document, getPanel } = loadStabilityRuntimes({
      order,
      panelHtml: buildPanelHtml({ leadName: 'Cliente A' }),
    })
    const panel = getPanel()
    makeScrollable(panel)

    const nameField = document.querySelector('[data-yolen-field="name"]')
    nameField.focus()
    dispatch(nameField, 'focusin')
    nameField.value = 'Jo'
    dispatch(nameField, 'input')
    await flushStabilityQueues()

    const fieldBeforeRerender = document.querySelector('[data-yolen-field="name"]')

    // Um rerender de fundo chega enquanto o vendedor ainda está digitando
    // (ex.: resumo do lead terminou de carregar em paralelo).
    panel.innerHTML = buildPanelHtml({ leadName: 'Cliente A', nameValue: 'Valor do servidor' })
    await flushStabilityQueues()

    assert.equal(
      document.querySelector('[data-yolen-field="name"]'),
      fieldBeforeRerender,
      'o node do campo focado não pode ser substituído enquanto o vendedor digita',
    )
    assert.equal(
      document.querySelector('[data-yolen-field="name"]').value,
      'Jo',
      'o valor digitado não pode ser apagado/sobrescrito pelo rerender de fundo',
    )

    // Ao sair do campo, o rerender pendente pode ser aplicado.
    nameField.blur()
    dispatch(nameField, 'focusout')
    await flushStabilityQueues()

    assert.equal(
      document.querySelector('[data-yolen-field="name"]')?.getAttribute('value'),
      'Valor do servidor',
      'depois do blur, o rerender que ficou pendente deveria ser aplicado',
    )
  })

  test(`[${orderLabel}] trocar de campo dentro do mesmo formulário mantém a trava sem flush prematuro`, async () => {
    const { document, getPanel } = loadStabilityRuntimes({
      order,
      panelHtml: buildPanelHtml({ leadName: 'Cliente A' }),
    })
    const panel = getPanel()
    makeScrollable(panel)

    const nameField = document.querySelector('[data-yolen-field="name"]')
    nameField.focus()
    dispatch(nameField, 'focusin')
    nameField.value = 'Maria'
    dispatch(nameField, 'input')
    await flushStabilityQueues()

    panel.innerHTML = buildPanelHtml({ leadName: 'Cliente A', intentValue: 'rascunho pendente' })
    await flushStabilityQueues()

    // Ainda travado (o campo Nome nunca perdeu o foco de verdade) — o
    // rerender de fundo não pode ter sido aplicado.
    assert.equal(
      document.querySelector('[data-yolen-field="name"]').value,
      'Maria',
      'trocar de campo não pode ter perdido o valor do campo anterior',
    )

    // O vendedor move o foco para outro campo editável do MESMO painel
    // (Tab, por exemplo) — isso deve manter a trava ativa (é outro campo do
    // mesmo formulário, não uma saída do painel).
    const intentField = document.querySelector('[data-yolen-seller-message-intent]')
    dispatch(nameField, 'focusout')
    intentField.focus()
    dispatch(intentField, 'focusin')
    await flushStabilityQueues()

    panel.innerHTML = buildPanelHtml({ leadName: 'Cliente A', nameValue: 'Valor do servidor 2' })
    await flushStabilityQueues()

    assert.equal(
      document.querySelector('[data-yolen-seller-message-intent]'),
      intentField,
      'o campo de intenção não pode ter sido substituído ao ganhar foco em seguida',
    )
  })

  test(`[${orderLabel}] clique em botão completa a ação sem o botão ser destruído entre pointerdown e click`, async () => {
    const { document, getPanel } = loadStabilityRuntimes({
      order,
      panelHtml: buildPanelHtml({ leadName: 'Cliente A' }),
    })
    const panel = getPanel()
    makeScrollable(panel)

    const button = document.querySelector('[data-yolen-action="submit"]')
    let clicked = false
    button.addEventListener('click', () => {
      clicked = true
    })

    dispatch(button, 'pointerdown')

    // Um rerender assíncrono é solicitado entre o pointerdown e o click
    // (o cenário real que fazia o botão "desclicar").
    panel.innerHTML = buildPanelHtml({ leadName: 'Cliente A', nameValue: 'Estado atualizado' })

    const buttonAfterPointerdown = document.querySelector('[data-yolen-action="submit"]')
    assert.equal(buttonAfterPointerdown, button, 'o botão não pode ser trocado entre pointerdown e click')

    dispatch(button, 'click')
    assert.equal(clicked, true, 'o click precisa disparar no mesmo node em que o pointerdown ocorreu')

    await flushStabilityQueues()

    assert.equal(
      document.querySelector('[data-yolen-field="name"]')?.getAttribute('value'),
      'Estado atualizado',
      'depois do click concluído, o rerender pendente deveria ser aplicado',
    )
  })

  test(`[${orderLabel}] ação mantém o controle clicado na mesma altura visual durante rerenders`, async () => {
    const { document, window, getPanel } = loadStabilityRuntimes({
      order,
      panelHtml: buildPanelHtml({ leadName: 'Cliente A' }),
    })
    const panel = getPanel()
    makeScrollable(panel)

    const actionDocumentTop = 1800
    const originalGetBoundingClientRect =
      window.Element.prototype.getBoundingClientRect

    window.Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
      if (
        this.matches?.(
          '[data-yolen-action="submit"]',
        )
      ) {
        const top =
          actionDocumentTop -
          panel.scrollTop

        return {
          x: 0,
          y: top,
          top,
          bottom: top + 40,
          left: 0,
          right: 120,
          width: 120,
          height: 40,
          toJSON() {
            return {}
          },
        }
      }

      return originalGetBoundingClientRect.call(
        this,
      )
    }

    try {
      panel.scrollTop = 1375
      dispatch(panel, 'scroll')
      await flushStabilityQueues()

      const button = document.querySelector(
        '[data-yolen-action="submit"]',
      )

      assert.equal(
        button.getBoundingClientRect().top,
        425,
      )

      button.addEventListener('click', () => {
        // Simula o Firefox tentando levar o painel ao topo enquanto a ação
        // também provoca um rerender que substitui o node clicado.
        panel.scrollTop = 0

        panel.innerHTML = buildPanelHtml({
          leadName: 'Cliente A',
          nameValue:
            'Resultado imediato da ação',
        })
      })

      dispatch(button, 'pointerdown')
      dispatch(button, 'click')

      await flushStabilityQueues()

      const buttonAfterClick =
        document.querySelector(
          '[data-yolen-action="submit"]',
        )

      assert.equal(
        buttonAfterClick
          .getBoundingClientRect()
          .top,
        425,
        'o controle clicado deve continuar na mesma altura da viewport',
      )
      assert.equal(
        panel.scrollTop,
        1375,
      )

      panel.innerHTML = buildPanelHtml({
        leadName: 'Cliente A',
        nameValue:
          'Resultado assíncrono concluído',
      })

      await flushStabilityQueues()

      assert.equal(
        document
          .querySelector(
            '[data-yolen-action="submit"]',
          )
          .getBoundingClientRect()
          .top,
        425,
        'resposta assíncrona posterior não pode deslocar visualmente a ação',
      )

      // Scroll tardio do navegador sem gesto real do vendedor também deve
      // voltar para a âncora visual.
      panel.scrollTop = 0
      dispatch(panel, 'scroll')
      await flushStabilityQueues()

      assert.equal(
        document
          .querySelector(
            '[data-yolen-action="submit"]',
          )
          .getBoundingClientRect()
          .top,
        425,
      )

      // Navegação real libera a âncora.
      dispatch(panel, 'wheel')
      panel.scrollTop = 910
      dispatch(panel, 'scroll')

      panel.innerHTML = buildPanelHtml({
        leadName: 'Cliente A',
        nameValue:
          'Render após navegação real',
      })

      await flushStabilityQueues()

      assert.equal(
        panel.scrollTop,
        910,
        'wheel deve aceitar a nova posição escolhida pelo vendedor',
      )
    } finally {
      window.Element.prototype.getBoundingClientRect =
        originalGetBoundingClientRect
    }
  })

  test(`[${orderLabel}] enriquecimento ancora o candidato exato quando ações repetem o mesmo data-yolen-action`, async () => {
    const initialHtml = `
      <div class="yolen-lead-name">Cliente A</div>
      <button
        type="button"
        data-yolen-action="confirm-lead-enrichment"
        data-yolen-enrichment-key="candidate-1"
      >Confirmar primeiro</button>
      <button
        type="button"
        data-yolen-action="confirm-lead-enrichment"
        data-yolen-enrichment-key="candidate-2"
      >Confirmar segundo</button>
      <div class="yolen-filler" style="height:4000px"></div>
    `

    const { document, window, getPanel } =
      loadStabilityRuntimes({
        order,
        panelHtml: initialHtml,
      })

    const panel = getPanel()
    makeScrollable(panel)

    const originalGetBoundingClientRect =
      window.Element.prototype
        .getBoundingClientRect

    window.Element.prototype.getBoundingClientRect =
      function getBoundingClientRect() {
        const key =
          this.getAttribute?.(
            'data-yolen-enrichment-key',
          )

        if (
          key === 'candidate-1' ||
          key === 'candidate-2'
        ) {
          const documentTop =
            key === 'candidate-1'
              ? 1200
              : 1800
          const top =
            documentTop -
            panel.scrollTop

          return {
            x: 0,
            y: top,
            top,
            bottom: top + 40,
            left: 0,
            right: 120,
            width: 120,
            height: 40,
            toJSON() {
              return {}
            },
          }
        }

        return originalGetBoundingClientRect.call(
          this,
        )
      }

    try {
      panel.scrollTop = 1375
      dispatch(panel, 'scroll')
      await flushStabilityQueues()

      const second =
        document.querySelector(
          '[data-yolen-enrichment-key="candidate-2"]',
        )

      assert.equal(
        second
          .getBoundingClientRect()
          .top,
        425,
      )

      second.addEventListener(
        'click',
        () => {
          panel.scrollTop = 0
          panel.innerHTML =
            initialHtml.replace(
              'Confirmar segundo',
              'Confirmar segundo atualizado',
            )
        },
      )

      dispatch(second, 'pointerdown')
      dispatch(second, 'click')

      await flushStabilityQueues()

      const secondAfter =
        document.querySelector(
          '[data-yolen-enrichment-key="candidate-2"]',
        )

      assert.equal(
        secondAfter
          .getBoundingClientRect()
          .top,
        425,
        'a âncora precisa reencontrar o segundo candidato, não o primeiro botão com a mesma ação',
      )
      assert.equal(
        panel.scrollTop,
        1375,
      )
    } finally {
      window.Element.prototype
        .getBoundingClientRect =
          originalGetBoundingClientRect
    }
  })

  test(`[${orderLabel}] Tab libera a âncora visual antes da navegação de foco`, async () => {
    const {
      document,
      window,
      getPanel,
    } = loadStabilityRuntimes({
      order,
      panelHtml:
        buildPanelHtml({
          leadName: 'Cliente A',
        }),
    })

    const panel = getPanel()
    makeScrollable(panel)

    panel.scrollTop = 1375
    dispatch(panel, 'scroll')
    await flushStabilityQueues()

    const button =
      document.querySelector(
        '[data-yolen-action="submit"]',
      )

    dispatch(button, 'pointerdown')
    dispatch(button, 'click')
    await flushStabilityQueues()

    button.dispatchEvent(
      new window.KeyboardEvent(
        'keydown',
        {
          bubbles: true,
          cancelable: true,
          key: 'Tab',
        },
      ),
    )

    panel.scrollTop = 910
    dispatch(panel, 'scroll')

    panel.innerHTML =
      buildPanelHtml({
        leadName: 'Cliente A',
        nameValue:
          'Render após Tab',
      })

    await flushStabilityQueues()

    assert.equal(
      panel.scrollTop,
      910,
      'Tab deve liberar a âncora anterior e permitir o novo foco/scroll do navegador',
    )
  })

  test(`[${orderLabel}] mutação fora do painel (ex.: abrir "Dados do contato") não mexe em scroll nem destrava o painel`, async () => {
    const { document, getPanel } = loadStabilityRuntimes({
      order,
      panelHtml: buildPanelHtml({ leadName: 'Cliente A' }),
    })
    const panel = getPanel()
    makeScrollable(panel)
    panel.scrollTop = 900
    dispatch(panel, 'scroll')
    await flushStabilityQueues()

    // Simula o WhatsApp Web abrindo o painel lateral "Dados do contato":
    // nós inteiramente novos aparecem no documento, fora da subtree do
    // painel do Companion.
    const sidePanel = document.createElement('div')
    sidePanel.id = 'contact-info-drawer'
    sidePanel.innerHTML = '<div>Dados do contato</div>'
    document.body.appendChild(sidePanel)
    await flushStabilityQueues()

    assert.equal(
      panel.scrollTop,
      900,
      'uma mutação fora do painel não pode mexer no scroll do Companion',
    )
    assert.equal(
      document.querySelector('.yolen-lead-name')?.textContent,
      'Cliente A',
      'a identidade do lead exibida não pode mudar por causa de um painel lateral do WhatsApp',
    )

    document.body.removeChild(sidePanel)
  })

  test(`[${orderLabel}] retorno de aba: rerender fica retido durante o guard e é aplicado depois, sem "Localizando..." piscando`, async () => {
    const { document, window, getPanel } = loadStabilityRuntimes({
      order,
      panelHtml: buildPanelHtml({ leadName: 'Cliente A' }),
    })
    const panel = getPanel()
    makeScrollable(panel)
    panel.scrollTop = 500
    dispatch(panel, 'scroll')
    await flushStabilityQueues()

    // Volta de aba: visibilitychange para 'visible' liga o resume guard.
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    dispatch(document, 'visibilitychange')
    await flushStabilityQueues()

    // Durante o guard, uma resolução de lead que chega do background não
    // pode substituir o painel já montado (isso é o que produzia o flash de
    // "Localizando...").
    panel.innerHTML = buildPanelHtml({ leadName: 'Cliente A', nameValue: 'Reresolvido no retorno' })
    await flushStabilityQueues()

    assert.equal(
      document.querySelector('[data-yolen-field="name"]')?.getAttribute('value'),
      '',
      'enquanto o resume guard está ativo, o rerender não pode substituir o painel já visível',
    )

    // Depois que o guard expira (RESUME_GUARD_MS = 2000ms na origem), o
    // conteúdo pendente é aplicado e o scroll continua onde estava.
    await new Promise((resolve) => window.setTimeout(resolve, 2200))
    await flushStabilityQueues()

    assert.equal(
      document.querySelector('[data-yolen-field="name"]')?.getAttribute('value'),
      'Reresolvido no retorno',
      'depois do guard expirar, o rerender retido deveria ter sido aplicado',
    )
    assert.equal(panel.scrollTop, 500, 'a posição de scroll não pode ter sido perdida no retorno de aba')
  })

  test(`[${orderLabel}] mudança real de conversa reseta scroll e destrava o painel`, async () => {
    const { document, getPanel } = loadStabilityRuntimes({
      order,
      panelHtml: buildPanelHtml({ leadName: 'Cliente A' }),
    })
    const panel = getPanel()
    makeScrollable(panel)

    const nameField = document.querySelector('[data-yolen-field="name"]')
    nameField.focus()
    dispatch(nameField, 'focusin')
    nameField.value = 'Rascunho do Cliente A'
    dispatch(nameField, 'input')
    panel.scrollTop = 1500
    dispatch(panel, 'scroll')
    await flushStabilityQueues()

    // O usuário troca de conversa de verdade no WhatsApp: content-script.js
    // detecta o novo contato e monta o painel do zero para o Cliente B, sem
    // que nenhum campo esteja focado neste novo DOM.
    nameField.blur()
    dispatch(nameField, 'focusout')
    await flushStabilityQueues()

    panel.innerHTML = buildPanelHtml({ leadName: 'Cliente B' })
    await flushStabilityQueues()

    assert.equal(
      document.querySelector('.yolen-lead-name')?.textContent,
      'Cliente B',
      'o painel deveria mostrar o novo lead',
    )
    assert.equal(
      document.querySelector('[data-yolen-field="name"]')?.getAttribute('value'),
      '',
      'o rascunho do Cliente A não pode vazar para o painel do Cliente B',
    )
    assert.equal(panel.scrollTop, 0, 'uma mudança real de conversa deve resetar o scroll para o topo')
  })
}
