// ============================================================================
// sales-copilot-transcript.ts
//
// Helper puro (sem dependência de I/O) para segmentação e leitura estruturada
// de uma conversa de vendas.
//
// Faz parte da Fase 5D — decisão por desfecho final da conversa.
//
// Objetivo:
//   - Parar de tratar a conversa como "saco de palavras soltas".
//   - Permitir que o fallback local classifique pelo ESTADO OPERACIONAL FINAL
//     da conversa, e não pelo primeiro sinal forte encontrado no meio do texto.
//
// Este arquivo NÃO decide status. Apenas:
//   1. Quebra a conversa em turnos (cliente/vendedor/desconhecido).
//   2. Monta segmentos úteis (texto completo, final da conversa, falas do
//      cliente, falas finais do cliente, falas finais do vendedor).
//   3. Detecta sinais dentro desses segmentos:
//       - compromisso concreto final
//       - agendamento final
//       - discussão comercial
//       - tentativa de contato sem resposta
//       - perda explícita
//       - ganho explícito
//
// A decisão propriamente dita fica em sales-copilot.ts, que consome
// esses sinais numa ordem em camadas.
// ============================================================================

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export type TranscriptSpeaker = 'cliente' | 'vendedor' | 'desconhecido'

export interface TranscriptTurn {
  /** índice do turno na conversa (0-based) */
  index: number
  /** quem disse */
  speaker: TranscriptSpeaker
  /** texto do turno já trimado */
  text: string
}

export interface TranscriptSegments {
  /** texto inteiro, normalizado */
  full: string
  /** últimos N turnos juntos (bloco final da conversa) */
  tail: string
  /** todas as falas do cliente concatenadas */
  client_all: string
  /** últimas falas do cliente (bloco final do cliente) */
  client_tail: string
  /** últimas falas do vendedor (bloco final do vendedor) */
  seller_tail: string
  /** turnos parseados (auditoria) */
  turns: TranscriptTurn[]
  /** true se o parsing encontrou marcadores de speaker */
  has_speaker_markers: boolean
}

export interface TranscriptSignalSet {
  final_commitment: string[]
  final_schedule: string[]
  commercial: string[]
  no_response: string[]
  lost: string[]
  won: string[]
}

export interface TranscriptSignals {
  /** sinais no texto inteiro */
  full: TranscriptSignalSet
  /** sinais no trecho final da conversa (últimos turnos) */
  tail: TranscriptSignalSet
  /** sinais nas falas finais do cliente (o que o cliente disse por último) */
  client_tail: TranscriptSignalSet
  /** sinais nas falas finais do vendedor (o que o vendedor ofereceu por último) */
  seller_tail: TranscriptSignalSet
}

// ---------------------------------------------------------------------------
// Configuração de segmentação
// ---------------------------------------------------------------------------

/** Quantos turnos entram no "bloco final" da conversa */
const TAIL_TURNS = 6
/** Quantos turnos do cliente entram no "bloco final do cliente" */
const CLIENT_TAIL_TURNS = 3
/** Quantos turnos do vendedor entram no "bloco final do vendedor" */
const SELLER_TAIL_TURNS = 3

// Regex de marcador de speaker no início da linha.
// Aceita variações comuns no campo e tolera espaços e maiúsculas/minúsculas.
const CLIENT_MARKER_REGEX =
  /^\s*(cliente|lead|prospect|aluno|aluna|paciente|comprador|compradora|consumidor|consumidora)\s*[:\-–—]\s*/i

const SELLER_MARKER_REGEX =
  /^\s*(vendedor|vendedora|consultor|consultora|atendente|corretor|corretora|sdr|operador|operadora)\s*[:\-–—]\s*/i

// Narração do CRM em terceira pessoa — não é fala real de ninguém, mas
// frequentemente carrega sinais fortes (ex: "cliente aceitou visita").
// Tratamos como "desconhecido" na quebra, e ainda assim deixamos disponível
// no texto completo para análise.
const NARRATION_MARKER_REGEX = /^\s*(nota|observacao|observação|obs|vendedor\/cliente)\s*[:\-–—]\s*/i

// ---------------------------------------------------------------------------
// Dicionários de sinais
// ---------------------------------------------------------------------------
//
// IMPORTANTE: tudo aqui é comparado com a versão normalizada do texto, que
// já remove acentos. Por isso vários termos aparecem só sem acento.
// ---------------------------------------------------------------------------

/**
 * "Compromisso final concreto" — o cliente aceitou ir em frente.
 * Costuma aparecer no final da conversa.
 */
const FINAL_COMMITMENT_TERMS: string[] = [
  'pode sim',
  'fechado',
  'fechou',
  'fechamos',
  'combinado',
  'ta combinado',
  'combinadissimo',
  'vou sim',
  'estarei la',
  'estarei ai',
  'estarei ai sim',
  'te espero',
  'te espero aqui',
  'te espero amanha',
  'te espero la',
  'ficou agendado',
  'ficou combinado',
  'confirmado',
  'ta confirmado',
  'tudo certo',
  'pode marcar',
  'pode agendar',
  'pode deixar marcado',
  'aceito',
  'aceitou',
  'aceito sim',
  'vamos marcar',
  'vamos fechar a visita',
  'vamos fechar o test drive',
  'conta comigo',
  'conte comigo',
  'perfeito',
  'beleza',
  'topo',
  'topo sim',
  'pra mim ta bom',
  'pra mim ta otimo',
]

/**
 * "Agendamento final" — compromisso com data, hora ou evento concreto.
 */
const FINAL_SCHEDULE_TERMS: string[] = [
  // horário com âncora
  'pode ser amanha',
  'amanha de manha',
  'amanha a tarde',
  'amanha a noite',
  'hoje a tarde',
  'hoje a noite',
  'hoje mais tarde',
  'mais tarde hoje',
  'pode ser hoje',
  'pode ser sexta',
  'pode ser quarta',
  'pode ser quinta',
  'pode ser segunda',
  'pode ser terca',
  'pode ser sabado',
  'pode ser domingo',
  'sexta de manha',
  'sabado de manha',
  'segunda de manha',
  'terca de manha',
  'quarta de manha',
  'quinta de manha',
  // horário explícito
  'as 8h',
  'as 9h',
  'as 10h',
  'as 11h',
  'as 12h',
  'as 13h',
  'as 14h',
  'as 15h',
  'as 16h',
  'as 17h',
  'as 18h',
  'as 19h',
  'as 20h',
  '10h30',
  '11h30',
  '14h30',
  '15h30',
  '16h30',
  '17h30',
  '18h30',
  // natureza do compromisso
  'test drive agendado',
  'test drive marcado',
  'test drive amanha',
  'marcar o test drive',
  'visita marcada',
  'visita agendada',
  'visita na loja',
  'ir ate a loja',
  'ir na loja',
  'passar na loja',
  'passo ai',
  'passo amanha',
  'passo hoje',
  'vou passar ai',
  'vou na loja',
  'estou indo ai',
  'estou indo na loja',
  'te espero aqui',
  'te espero amanha',
  'aguardo voce',
  'aguardo amanha',
  'agendado',
  'ficou agendado',
  'marcamos para',
  'marcamos pra',
  'marcado para',
  'marcado pra',
  'horario combinado',
  'horario marcado',
  'retorno amanha',
  'retorno as',
  'retornar amanha',
  'retornar as',
  'pode ser nesse horario',
  'funciona esse horario',
  'esse horario ta bom',
  'esse horario ta otimo',
]

/**
 * Discussão comercial real — objeção, preço, proposta, desconto, comparação.
 * Importante: esses sinais NÃO devem vencer quando no bloco final há
 * compromisso / agendamento claros.
 */
const COMMERCIAL_TERMS: string[] = [
  'proposta',
  'valor',
  'preco',
  'desconto',
  'parcelado',
  'parcelamento',
  'avista',
  'a vista',
  'pix',
  'boleto',
  'condicao',
  'condicao especial',
  'pensar ate',
  'vou pensar',
  'preciso pensar',
  'retorna na sexta',
  'retorno na sexta',
  'negociar',
  'negociacao',
  'achou caro',
  'achou o valor alto',
  'ficou caro',
  'muito caro',
  'esta caro',
  'ta caro',
  'concorrente',
  'comparando',
  'comparando plano',
  'comparando preco',
  'comparando com',
  'fidelidade',
  'entrada',
  'sem entrada',
  'consumo',
  'manutencao',
  'revisao',
  'seguro',
  'ipva',
  'quanto fica',
  'ficaria quanto',
  'qual o valor',
  'qual o preco',
]

/** Tentativa de contato sem resposta */
const NO_RESPONSE_TERMS: string[] = [
  'sem resposta',
  'nao respondeu',
  'mensagem enviada',
  'tentativa de contato',
  'liguei e nao atendeu',
  'nao atendeu',
  'visualizou e nao respondeu',
  'visualizou mas nao respondeu',
  'visualizou e nada',
  'nao retornou',
  'sem retorno',
  'enviei mensagem',
  'enviei ontem',
  'caixa postal',
  'chamada nao atendida',
]

/** Perda explícita */
const LOST_TERMS: string[] = [
  'fechou com concorrente',
  'fechou com a concorrente',
  'fechou com o concorrente',
  'sem interesse',
  'nao tem interesse',
  'nao tem mais interesse',
  'nao quer mais',
  'desistiu',
  'fora do perfil',
  'contato invalido',
  'nao entrar mais em contato',
  'pediu para nao entrar em contato',
  'nao me procure mais',
]

/** Ganho explícito */
const WON_TERMS: string[] = [
  'confirmou pagamento',
  'pagou',
  'assinou',
  'matriculou',
  'contrato assinado',
  'cadastro concluido',
  'fechou comigo',
  'fechou conosco',
  'fechou com a gente',
  'fechou o plano',
  'fechamos negocio',
  'fechamos o negocio',
]

// ---------------------------------------------------------------------------
// Utilitários de normalização
// ---------------------------------------------------------------------------

export function normalizeForCompare(text: string): string {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeLines(text: string): string {
  return String(text ?? '').replace(/\r/g, '\n')
}

function findAnyTerms(haystackNormalized: string, terms: string[]): string[] {
  if (!haystackNormalized) return []
  const found: string[] = []
  for (const term of terms) {
    const t = normalizeForCompare(term)
    if (!t) continue
    if (haystackNormalized.includes(t)) found.push(term)
  }
  return found
}

// ---------------------------------------------------------------------------
// 1) Parsing de turnos
// ---------------------------------------------------------------------------

/**
 * Quebra o texto em turnos, identificando speaker quando houver marcador.
 *
 * Estratégia:
 *  - Se a linha começa com "Cliente:", "Vendedor:", "Consultor:" etc,
 *    abre um novo turno com o speaker correspondente.
 *  - Linhas subsequentes sem marcador são anexadas ao turno atual.
 *  - Se NÃO houver nenhum marcador na conversa inteira, cada linha não vazia
 *    vira um turno "desconhecido" (fallback de texto bruto).
 */
export function parseTranscriptTurns(rawText: string): TranscriptTurn[] {
  const text = normalizeLines(rawText).trim()
  if (!text) return []

  const lines = text.split('\n')
  const turns: TranscriptTurn[] = []

  // varredura inicial: verifica se existe pelo menos um marcador
  let hasMarker = false
  for (const line of lines) {
    if (
      CLIENT_MARKER_REGEX.test(line) ||
      SELLER_MARKER_REGEX.test(line) ||
      NARRATION_MARKER_REGEX.test(line)
    ) {
      hasMarker = true
      break
    }
  }

  if (!hasMarker) {
    // Fallback de texto bruto: trata cada linha não vazia como um turno
    // "desconhecido". Preserva a ordem temporal — é isso que importa pro tail.
    const blocks = text
      .split(/\n{2,}/) // parágrafos
      .map((b) => b.trim())
      .filter(Boolean)

    const source = blocks.length > 1 ? blocks : lines.map((l) => l.trim()).filter(Boolean)

    source.forEach((chunk, i) => {
      turns.push({
        index: i,
        speaker: 'desconhecido',
        text: chunk,
      })
    })
    return turns
  }

  let current: TranscriptTurn | null = null

  const pushCurrent = () => {
    if (current && current.text.trim()) {
      current.text = current.text.trim()
      turns.push(current)
    }
    current = null
  }

  for (const rawLine of lines) {
    const line = rawLine
    const trimmed = line.trim()
    if (!trimmed) {
      // linha em branco não fecha o turno — no WhatsApp colado costuma haver
      // quebras gratuitas dentro da mesma fala. Deixamos a fala continuar.
      continue
    }

    const clientMatch = CLIENT_MARKER_REGEX.exec(line)
    const sellerMatch = SELLER_MARKER_REGEX.exec(line)
    const narrationMatch = NARRATION_MARKER_REGEX.exec(line)

    if (clientMatch) {
      pushCurrent()
      current = {
        index: turns.length,
        speaker: 'cliente',
        text: line.replace(CLIENT_MARKER_REGEX, '').trim(),
      }
      continue
    }

    if (sellerMatch) {
      pushCurrent()
      current = {
        index: turns.length,
        speaker: 'vendedor',
        text: line.replace(SELLER_MARKER_REGEX, '').trim(),
      }
      continue
    }

    if (narrationMatch) {
      pushCurrent()
      current = {
        index: turns.length,
        speaker: 'desconhecido',
        text: line.replace(NARRATION_MARKER_REGEX, '').trim(),
      }
      continue
    }

    // continuação do turno atual
    if (current) {
      current.text = current.text ? `${current.text}\n${trimmed}` : trimmed
    } else {
      // linha solta antes do primeiro marcador — vira turno desconhecido
      current = {
        index: turns.length,
        speaker: 'desconhecido',
        text: trimmed,
      }
    }
  }

  pushCurrent()

  return turns
}

// ---------------------------------------------------------------------------
// 2) Construção de segmentos
// ---------------------------------------------------------------------------

export function buildTranscriptSegments(rawText: string): TranscriptSegments {
  const fullNormalizedWhitespace = normalizeLines(rawText).trim()
  const turns = parseTranscriptTurns(rawText)

  const hasMarkers = turns.some((t) => t.speaker !== 'desconhecido')

  const joinTurns = (list: TranscriptTurn[]): string =>
    list
      .map((t) => t.text)
      .filter(Boolean)
      .join('\n')

  const tailTurns = turns.slice(-TAIL_TURNS)
  const clientTurns = turns.filter((t) => t.speaker === 'cliente')
  const sellerTurns = turns.filter((t) => t.speaker === 'vendedor')

  const clientAll = joinTurns(clientTurns)
  const clientTail = joinTurns(clientTurns.slice(-CLIENT_TAIL_TURNS))
  const sellerTail = joinTurns(sellerTurns.slice(-SELLER_TAIL_TURNS))

  // fallback — se NÃO há marcadores de speaker, client_tail e seller_tail
  // ficariam vazios. Nesse caso, reaproveitamos o bloco final como
  // "voz do cliente" (é a hipótese mais razoável: o vendedor está resumindo
  // a conversa, então o desfecho vale como voz do cliente também).
  const effectiveClientAll = hasMarkers ? clientAll : fullNormalizedWhitespace
  const effectiveClientTail = hasMarkers ? clientTail : joinTurns(tailTurns)
  const effectiveSellerTail = hasMarkers ? sellerTail : joinTurns(tailTurns)

  return {
    full: fullNormalizedWhitespace,
    tail: joinTurns(tailTurns),
    client_all: effectiveClientAll,
    client_tail: effectiveClientTail,
    seller_tail: effectiveSellerTail,
    turns,
    has_speaker_markers: hasMarkers,
  }
}

// ---------------------------------------------------------------------------
// 3) Detecção de sinais por segmento
// ---------------------------------------------------------------------------

function detectSignalSet(segmentText: string): TranscriptSignalSet {
  const n = normalizeForCompare(segmentText)
  return {
    final_commitment: findAnyTerms(n, FINAL_COMMITMENT_TERMS),
    final_schedule: findAnyTerms(n, FINAL_SCHEDULE_TERMS),
    commercial: findAnyTerms(n, COMMERCIAL_TERMS),
    no_response: findAnyTerms(n, NO_RESPONSE_TERMS),
    lost: findAnyTerms(n, LOST_TERMS),
    won: findAnyTerms(n, WON_TERMS),
  }
}

export function detectFinalCommitmentSignals(segmentText: string): string[] {
  return findAnyTerms(normalizeForCompare(segmentText), FINAL_COMMITMENT_TERMS)
}

export function detectFinalScheduleSignals(segmentText: string): string[] {
  return findAnyTerms(normalizeForCompare(segmentText), FINAL_SCHEDULE_TERMS)
}

export function detectCommercialSignals(segmentText: string): string[] {
  return findAnyTerms(normalizeForCompare(segmentText), COMMERCIAL_TERMS)
}

export function detectNoResponseSignals(segmentText: string): string[] {
  return findAnyTerms(normalizeForCompare(segmentText), NO_RESPONSE_TERMS)
}

export function detectLostSignals(segmentText: string): string[] {
  return findAnyTerms(normalizeForCompare(segmentText), LOST_TERMS)
}

export function detectWonSignals(segmentText: string): string[] {
  return findAnyTerms(normalizeForCompare(segmentText), WON_TERMS)
}

export function buildTranscriptSignals(segments: TranscriptSegments): TranscriptSignals {
  return {
    full: detectSignalSet(segments.full),
    tail: detectSignalSet(segments.tail),
    client_tail: detectSignalSet(segments.client_tail),
    seller_tail: detectSignalSet(segments.seller_tail),
  }
}

// ---------------------------------------------------------------------------
// 4) Agregadores úteis para a decisão
// ---------------------------------------------------------------------------

/**
 * Retorna true se o desfecho final da conversa indica compromisso concreto,
 * mesmo que no meio tenha havido objeção comercial.
 *
 * Critério:
 *  - há final_commitment OU final_schedule no bloco final da conversa
 *  - OU o cliente disse algo de compromisso/agenda nas últimas falas
 */
export function hasFinalResolution(signals: TranscriptSignals): boolean {
  const tailHasIt =
    signals.tail.final_commitment.length > 0 || signals.tail.final_schedule.length > 0
  const clientTailHasIt =
    signals.client_tail.final_commitment.length > 0 ||
    signals.client_tail.final_schedule.length > 0
  return tailHasIt || clientTailHasIt
}

/**
 * Retorna true se existe negociação real ATIVA e nenhum desfecho final superou.
 *
 * Critério:
 *  - há commercial no texto (qualquer lugar)
 *  - E NÃO há final_commitment / final_schedule no tail nem no client_tail
 */
export function hasActiveNegotiationWithoutResolution(signals: TranscriptSignals): boolean {
  const hasCommercial =
    signals.full.commercial.length > 0 ||
    signals.tail.commercial.length > 0 ||
    signals.client_tail.commercial.length > 0
  if (!hasCommercial) return false
  return !hasFinalResolution(signals)
}

/**
 * Texto curto (preview) para auditoria.
 */
export function segmentPreview(text: string, max = 280): string {
  const t = String(text ?? '').trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}...`
}

/**
 * Resumo plain de "quantas categorias foram acionadas" em um segmento.
 * Usado só pela auditoria.
 */
export function countActiveCategories(set: TranscriptSignalSet): number {
  return [
    set.final_commitment.length > 0,
    set.final_schedule.length > 0,
    set.commercial.length > 0,
    set.no_response.length > 0,
    set.lost.length > 0,
    set.won.length > 0,
  ].filter(Boolean).length
}