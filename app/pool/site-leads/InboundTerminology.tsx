'use client'

import * as React from 'react'

const REPLACEMENTS: Array<[string, string]> = [
  ['Leads do site', 'Leads Inbound'],
  ['+ Conectar site', '+ Conectar origem'],
  ['Leads recebidos', 'Leads Inbound recebidos'],
  ['Conexões do site', 'Origens Inbound'],
  ['Acompanhamento dos leads recebidos', 'Acompanhamento dos Leads Inbound'],
  ['Carregando leads recebidos...', 'Carregando Leads Inbound...'],
  ['Nenhum lead foi recebido por integração ainda.', 'Nenhum Lead Inbound foi recebido por integração ainda.'],
  ['Integração do site', 'Origem Inbound'],
  ['Contrato da API', 'Contrato da integração'],
  ['Nova conexão', 'Nova origem inbound'],
  ['Nome da conexão', 'Nome da origem'],
]

function applyInboundTerminology() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []

  while (walker.nextNode()) {
    nodes.push(walker.currentNode as Text)
  }

  for (const node of nodes) {
    let value = node.nodeValue ?? ''

    for (const [from, to] of REPLACEMENTS) {
      value = value.replaceAll(from, to)
    }

    if (value !== node.nodeValue) {
      node.nodeValue = value
    }
  }
}

export default function InboundTerminology() {
  React.useEffect(() => {
    let frame: number | null = null

    const scheduleApply = () => {
      if (frame !== null) return

      frame = window.requestAnimationFrame(() => {
        frame = null
        applyInboundTerminology()
      })
    }

    const observer = new MutationObserver(scheduleApply)
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    scheduleApply()

    return () => {
      observer.disconnect()

      if (frame !== null) {
        window.cancelAnimationFrame(frame)
      }
    }
  }, [])

  return null
}
