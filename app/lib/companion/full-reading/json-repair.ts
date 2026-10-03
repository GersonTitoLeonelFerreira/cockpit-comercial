// Rodada 12 (C): o JSON da leitura, consertado localmente antes de desistir
// (sem chamada extra ao modelo), e o diagnóstico da falha sem conteúdo.
//
// Ordem do conserto:
//   1. texto ou cerca de código em volta: fica só o objeto ({ ... });
//   2. passe local que conhece a forma do JSON: aspas duplas sem escape
//      dentro de texto (uma aspa só fecha o texto quando vem seguida do que
//      o JSON espera depois dele), quebra de linha crua dentro de texto e
//      vírgula sobrando antes de } ou ];
//   3. a biblioteca jsonrepair, para o que sobrar.
// Depois do conserto, a validação completa da leitura roda igual.
//
// O diagnóstico nunca leva o texto original: toda letra (inclusive
// acentuada) vira "a" e todo dígito vira "0"; pontuação e espaços ficam.

import {
  jsonrepair,
} from 'jsonrepair'

export type JsonRepairKind =
  | 'texto_em_volta'
  | 'aspas'
  | 'quebra_de_linha'
  | 'virgula'
  | 'virgula_faltando'
  | 'jsonrepair'

export type JsonParseDiagnostic = {
  parse_error: string
  position: number | null
  length: number
  starts_with_brace: boolean
  ends_with_brace: boolean
  window: string
}

const DIAGNOSTIC_WINDOW = 60

// Letras viram "a", dígitos viram "0", marcas de acento somem (a letra já
// virou "a"); pontuação, símbolos ASCII e espaços ficam; o resto (emoji e
// afins) vira "*".
export function maskForDiagnostic(
  value: string,
): string {
  return value
    .normalize('NFC')
    .replace(/\p{M}/gu, '')
    .replace(/\p{L}/gu, 'a')
    .replace(/\p{N}/gu, '0')
    .replace(/[^\p{P}\s!-~]/gu, '*')
}

function parsePosition(
  message: string,
): number | null {
  const match =
    message.match(/position (\d+)/i)

  return match ? Number(match[1]) : null
}

// A mensagem do JSON.parse pode citar um pedaço do texto entre aspas: esse
// pedaço sai mascarado.
function maskParseMessage(
  message: string,
): string {
  return message
    .replace(/"[\s\S]*"/, (quoted) => maskForDiagnostic(quoted))
    .replace(/'[^']*'/g, (quoted) => maskForDiagnostic(quoted))
    .slice(0, 240)
}

export function buildJsonParseDiagnostic(
  text: string,
  error: unknown,
): JsonParseDiagnostic {
  const raw =
    error instanceof Error ? error.message : String(error)

  const position =
    parsePosition(raw)

  const at =
    position ?? text.length

  const trimmed =
    text.trim()

  return {
    parse_error: maskParseMessage(raw),
    position,
    length: text.length,
    starts_with_brace: trimmed.startsWith('{'),
    ends_with_brace: trimmed.endsWith('}'),
    window:
      maskForDiagnostic(
        text.slice(Math.max(0, at - DIAGNOSTIC_WINDOW), at + DIAGNOSTIC_WINDOW),
      ),
  }
}

function skipSpaces(
  source: string,
  from: number,
): number {
  let index = from

  while (index < source.length && /\s/.test(source[index])) {
    index += 1
  }

  return index
}

const KEY_AHEAD =
  /^"(?:[^"\\\n]|\\.)*"\s*:/

const VALUE_START =
  /^(?:"|\{|\[|-|\d|true\b|false\b|null\b)/

// Rodada 13 (F): nome do campo que vem logo depois, no padrão de chave
// ("campo":), ou null.
function keyAhead(
  source: string,
  from: number,
): string | null {
  const match =
    source.slice(from, from + 200).match(/^"([A-Za-z_][A-Za-z0-9_]*)"\s*:/)

  return match ? match[1] : null
}

// A aspa em `from - 1` fecha o texto? 'virgula_faltando': fecha, e a
// vírgula antes do próximo campo foi esquecida ("a": "x" "b": "y").
function closesString(
  source: string,
  from: number,
  {
    isKey,
    container,
    knownKeys,
  }: {
    isKey: boolean
    container: '{' | '[' | null
    knownKeys: ReadonlySet<string> | null
  },
): boolean | 'virgula_faltando' {
  const next =
    skipSpaces(source, from)

  const char =
    source[next]

  if (isKey) {
    return char === ':'
  }

  if (char === '"' && container === '{') {
    const key =
      keyAhead(source, next)

    if (key && (!knownKeys || knownKeys.has(key))) {
      return 'virgula_faltando'
    }
  }

  if (char === undefined) {
    return true
  }

  if (char === '}') {
    return container === '{'
  }

  if (char === ']') {
    return container === '['
  }

  if (char !== ',') {
    return false
  }

  const after =
    skipSpaces(source, next + 1)

  const rest =
    source.slice(after, after + 200)

  // Vírgula sobrando antes de fechar o objeto ou a lista.
  if ((rest.startsWith('}') && container === '{') || (rest.startsWith(']') && container === '[')) {
    return true
  }

  // Depois da vírgula, num objeto vem uma chave ("nome": ...); numa lista,
  // um valor.
  return container === '{'
    ? KEY_AHEAD.test(rest)
    : VALUE_START.test(rest)
}

function escapeControl(
  char: string,
): string {
  switch (char) {
    case '\n':
      return '\\n'
    case '\r':
      return '\\r'
    case '\t':
      return '\\t'
    default:
      return `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`
  }
}

export function repairJsonStructure(
  source: string,
  {
    knownKeys = null,
  }: {
    knownKeys?: ReadonlySet<string> | null
  } = {},
): {
  text: string
  kinds: JsonRepairKind[]
} {
  const kinds =
    new Set<JsonRepairKind>()

  const stack: ('{' | '[')[] = []
  let expectKey = false
  let out = ''
  let index = 0

  while (index < source.length) {
    const char =
      source[index]

    if (char === '"') {
      const container =
        stack[stack.length - 1] ?? null

      const isKey =
        container === '{' && expectKey

      out += '"'
      index += 1

      while (index < source.length) {
        const inner =
          source[index]

        if (inner === '\\') {
          out += inner + (source[index + 1] ?? '')
          index += 2
          continue
        }

        if (inner === '"') {
          const closing =
            closesString(source, index + 1, { isKey, container, knownKeys })

          if (closing === 'virgula_faltando') {
            out += '",'
            kinds.add('virgula_faltando')
            index += 1
            expectKey = true
            break
          }

          if (closing) {
            out += '"'
            index += 1
            break
          }

          out += '\\"'
          kinds.add('aspas')
          index += 1
          continue
        }

        if (inner < ' ') {
          out += escapeControl(inner)
          kinds.add('quebra_de_linha')
          index += 1
          continue
        }

        out += inner
        index += 1
      }

      if (isKey) {
        expectKey = false
      }

      continue
    }

    if (char === '{' || char === '[') {
      stack.push(char)
      expectKey = char === '{'
      out += char
      index += 1
      continue
    }

    if (char === '}' || char === ']') {
      stack.pop()
      expectKey = false
      out += char
      index += 1
      continue
    }

    if (char === ',') {
      const next =
        source[skipSpaces(source, index + 1)]

      if (next === '}' || next === ']') {
        kinds.add('virgula')
        index += 1
        continue
      }

      expectKey = stack[stack.length - 1] === '{'
      out += char
      index += 1
      continue
    }

    if (char === ':') {
      expectKey = false
    }

    out += char
    index += 1
  }

  return {
    text: out,
    kinds: [...kinds],
  }
}

export type ParsedJson = {
  value: unknown
  repairs: JsonRepairKind[]
}

// Rodada 13 (F1): um texto do resultado com um nome de campo do formato no
// padrão de chave ("campo":) é sinal de campos juntados por uma vírgula
// esquecida: o conserto não vale.
export function hasEmbeddedFieldKey(
  value: unknown,
  knownKeys: ReadonlySet<string> | null,
): boolean {
  if (!knownKeys || knownKeys.size === 0) {
    return false
  }

  if (typeof value === 'string') {
    for (const match of value.matchAll(/"([A-Za-z_][A-Za-z0-9_]*)"\s*:/g)) {
      if (knownKeys.has(match[1])) {
        return true
      }
    }

    return false
  }

  if (Array.isArray(value)) {
    return value.some((item) => hasEmbeddedFieldKey(item, knownKeys))
  }

  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some((item) => hasEmbeddedFieldKey(item, knownKeys))
  }

  return false
}

export type JsonParseFailure = {
  reason: 'sem_objeto' | 'json_invalido'
  diagnostic: JsonParseDiagnostic
}

// Devolve o valor (com os consertos feitos) ou a falha com o diagnóstico.
export function parseJsonWithRepair(
  text: string,
  {
    knownKeys = null,
  }: {
    // Nomes dos campos do formato (rodada 13, F1).
    knownKeys?: ReadonlySet<string> | null
  } = {},
): ParsedJson | JsonParseFailure {
  const trimmed =
    text.trim()

  try {
    return { value: JSON.parse(trimmed), repairs: [] }
  } catch {
    // segue para o conserto
  }

  const start =
    trimmed.indexOf('{')

  const end =
    trimmed.lastIndexOf('}')

  if (start === -1 || end <= start) {
    return {
      reason: 'sem_objeto',
      diagnostic: buildJsonParseDiagnostic(trimmed, new Error('no object')),
    }
  }

  const sliced =
    trimmed.slice(start, end + 1)

  const around: JsonRepairKind[] =
    sliced.length < trimmed.length ? ['texto_em_volta'] : []

  let firstError: unknown = null

  try {
    return { value: JSON.parse(sliced), repairs: around }
  } catch (error) {
    firstError = error
  }

  const structural =
    repairJsonStructure(sliced, { knownKeys })

  try {
    const value =
      JSON.parse(structural.text)

    // F1: campo engolido por um texto — o passe local não vale.
    if (!hasEmbeddedFieldKey(value, knownKeys)) {
      return {
        value,
        repairs: [...around, ...structural.kinds],
      }
    }
  } catch {
    // segue para a biblioteca
  }

  try {
    const repaired =
      JSON.parse(jsonrepair(sliced))

    if (
      repaired !== null &&
      typeof repaired === 'object' &&
      !Array.isArray(repaired) &&
      !hasEmbeddedFieldKey(repaired, knownKeys)
    ) {
      return { value: repaired, repairs: [...around, 'jsonrepair'] }
    }
  } catch {
    // sem conserto
  }

  return {
    reason: 'json_invalido',
    diagnostic: buildJsonParseDiagnostic(sliced, firstError),
  }
}
