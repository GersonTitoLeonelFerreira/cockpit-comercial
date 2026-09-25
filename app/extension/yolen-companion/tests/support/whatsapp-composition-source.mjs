// Fonte da composição WhatsApp do Companion para testes estáticos.
//
// Até a FASE 4, toda a lógica do Companion no WhatsApp vivia no monólito
// src/content-script.js e os testes estáticos liam somente esse arquivo.
// A FASE 5 extraiu o monólito em WhatsAppAdapter + Core compartilhado +
// bootstrap. As asserções continuam as mesmas; só o local de leitura muda:
// esta função devolve o source concatenado dos arquivos que, juntos,
// contêm o código que antes estava no monólito. A ordem é a de leitura
// (adapter, Core e, depois do Core, os controllers extraídos dele), não a
// de carga do manifest: blocos que as asserções delimitam entre duas
// funções continuam na mesma ordem relativa do monólito.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const EXTENSION_ROOT = fileURLToPath(new URL('../../', import.meta.url))

// Arquivos que substituíram o monólito content-script.js.
export const WHATSAPP_COMPOSITION_FILES = Object.freeze([
  'src/whatsapp-adapter.js',
  'src/companion-core.js',
  'src/companion-analysis-controller.js',
  'src/companion-lead-creation-controller.js',
  'src/companion-conversation-registration-controller.js',
  'src/companion-lead-enrichment-controller.js',
  'src/companion-lead-summary-controller.js',
  'src/companion-message-controller.js',
  'src/companion-core-api-composition.js',
  'src/content-script.js',
])

export function readWhatsAppCompositionSource() {
  return WHATSAPP_COMPOSITION_FILES
    .map((file) => readFileSync(`${EXTENSION_ROOT}${file}`, 'utf8'))
    .join('\n')
}

// A sincronização do ledger de mensagens foi dividida na FASE 5: a leitura
// das bolhas visíveis (DOM do WhatsApp) passou para o adapter
// (readVisibleMessageEntries) e as decisões do ledger ficaram no Core
// (synchronizeConversationMessageLedger). As asserções sobre a
// sincronização continuam valendo para o conjunto das duas partes.
export function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker)

  if (start === -1) {
    return ''
  }

  const end = source.indexOf(endMarker, start + startMarker.length)

  return end === -1 ? '' : source.slice(start, end)
}

export function sliceMessageLedgerSynchronization(source, coreBlock) {
  const adapterBlock = sliceBetween(
    source,
    '  function readVisibleMessageEntries(',
    '\n  function ',
  )

  return adapterBlock ? `${coreBlock}\n${adapterBlock}` : ''
}
