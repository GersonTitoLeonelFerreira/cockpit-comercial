// Eventos internos do ManyChat gravados no ledger (rodada 9, B).
//
// A captura do ManyChat gravava as linhas de sistema da conversa ("Regra
// acionada", "Tag adicionada", "Conversa atribuída a ...") como mensagem
// do robô (author_kind automation). Elas não são mensagens: não contam como
// mensagem nova, nem na vez, nem em "última sua/do cliente", nem nas
// interações.
//
// As linhas antigas continuam gravadas (o ledger não é apagado nem
// alterado). Este classificador, por texto, separa na leitura:
// - eventos úteis (atribuição de atendente, conversa fechada ou reaberta,
//   automação pausada), que entram na transcrição como uma linha EVENTO
//   compacta, sem autoria quando a linha não diz quem fez;
// - eventos internos (campo personalizado, tag, regra ou automação
//   acionada, atraso inteligente, mudança de fila), que ficam fora.
//
// A extensão reconhece o evento pela estrutura do DOM e usa o mesmo texto
// como reserva (manychat-system-events.js); os dois classificadores são
// conferidos com as mesmas frases nos testes.

export type LedgerEventKind =
  | 'assignment'
  | 'closed'
  | 'reopened'
  | 'automation_paused'
  | 'internal'

export type LedgerEvent = {
  kind: LedgerEventKind
  // Texto da linha EVENTO (null para evento interno, que fica fora).
  text: string | null
}

export type LedgerEventCandidate = {
  author_kind?: string | null
  direction?: string | null
  content_type?: string | null
  text_content?: string | null
}

// Os links da linha de sistema (nome da regra, da automação) eram lidos
// como botões e iam para o fim do texto como "[opções: ...]".
const OPTIONS_SUFFIX =
  /\n?\s*\[opções: [^\]]*\]\s*$/

function clean(
  value: string,
): string {
  return value
    .replace(OPTIONS_SUFFIX, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripEnd(
  value: string,
): string {
  return value.replace(/[\s.:;]+$/, '').trim()
}

const MOVED_PATTERNS = [
  /^a conversa foi movida de (.+?) para (.+?)$/i,
  /^conversa movida de (.+?) para (.+?)$/i,
  /^conversation (?:was )?moved from (.+?) to (.+?)$/i,
]

const CLOSED_STATE =
  /fechad|closed/i

const ASSIGNMENT_PATTERNS: {
  pattern: RegExp
  byAutomation: boolean
}[] = [
  { pattern: /^atribuir automaticamente a (.+?) pela automação\b/i, byAutomation: true },
  { pattern: /^conversa atribuída automaticamente a (.+?)$/i, byAutomation: true },
  { pattern: /^conversa atribuída a (.+?)$/i, byAutomation: false },
  { pattern: /^conversation (?:was )?assigned to (.+?)$/i, byAutomation: false },
]

const AUTOMATION_PAUSED =
  /automação das respostas foi desativada|respostas automáticas (?:foram )?(?:pausadas|desativadas)|automação (?:foi )?pausada|automation (?:was )?paused/i

const INTERNAL_PATTERNS = [
  /^campo personalizado\b/i,
  /^tag (?:adicionada|removida)\b/i,
  /^regra acionada\b/i,
  /^a automação foi acionada\b/i,
  /^automação acionada\b/i,
  /atraso inteligente/i,
  /^conversa desatribuída\b/i,
  /^atribuição (?:removida|desfeita)\b/i,
  /^custom field\b/i,
  /^tag (?:added|removed)\b/i,
  /^rule triggered\b/i,
  /^automation (?:was )?triggered\b/i,
  /^smart delay\b/i,
  /^conversation (?:was )?unassigned\b/i,
]

// Classifica o texto de uma linha do robô. null: é mensagem de verdade.
export function classifyManyChatEventText(
  rawText: string | null | undefined,
): LedgerEvent | null {
  if (typeof rawText !== 'string') {
    return null
  }

  const text =
    clean(rawText)

  if (text.length === 0) {
    return null
  }

  for (const pattern of MOVED_PATTERNS) {
    const match =
      pattern.exec(stripEnd(text))

    if (match) {
      const from =
        match[1] ?? ''

      const to =
        match[2] ?? ''

      if (CLOSED_STATE.test(to) && !CLOSED_STATE.test(from)) {
        return { kind: 'closed', text: 'conversa marcada como fechada' }
      }

      if (CLOSED_STATE.test(from) && !CLOSED_STATE.test(to)) {
        return { kind: 'reopened', text: 'conversa reaberta' }
      }

      return { kind: 'internal', text: null }
    }
  }

  for (const { pattern, byAutomation } of ASSIGNMENT_PATTERNS) {
    const match =
      pattern.exec(stripEnd(text))

    if (match) {
      const target =
        stripEnd(match[1] ?? '')

      if (!target) {
        return { kind: 'internal', text: null }
      }

      return {
        kind: 'assignment',
        text: byAutomation
          ? `conversa atribuída a ${target} pela automação`
          : `conversa atribuída a ${target}`,
      }
    }
  }

  if (AUTOMATION_PAUSED.test(text)) {
    return { kind: 'automation_paused', text: 'respostas automáticas desativadas nesta conversa' }
  }

  if (INTERNAL_PATTERNS.some((pattern) => pattern.test(text))) {
    return { kind: 'internal', text: null }
  }

  return null
}

// Linha do ledger: só o robô (automation) grava evento.
export function classifyLedgerEvent(
  message: LedgerEventCandidate,
): LedgerEvent | null {
  if (message.author_kind !== 'automation') {
    return null
  }

  if ((message.content_type ?? 'text').toLowerCase() !== 'text') {
    return null
  }

  return classifyManyChatEventText(message.text_content ?? null)
}

export function isLedgerEvent(
  message: LedgerEventCandidate,
): boolean {
  return classifyLedgerEvent(message) !== null
}

// Mensagem de uma pessoa da empresa (vendedor ou atendente), nunca o robô.
export function isCompanyPersonMessage(
  message: LedgerEventCandidate,
): boolean {
  if (message.author_kind === 'human_agent') {
    return true
  }

  return (
    message.direction === 'outgoing' &&
    message.author_kind !== 'automation' &&
    message.author_kind !== 'customer'
  )
}

export function isCustomerMessage(
  message: LedgerEventCandidate,
): boolean {
  if (message.author_kind === 'customer') {
    return true
  }

  return (
    message.direction === 'incoming' &&
    message.author_kind !== 'automation' &&
    message.author_kind !== 'human_agent'
  )
}
