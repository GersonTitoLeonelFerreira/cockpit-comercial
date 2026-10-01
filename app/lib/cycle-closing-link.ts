// Pedido de fechamento vindo do Companion (leitura completa do HML).
//
// O botão "Confirmar venda"/"Confirmar perda" do painel abre a tela do
// ciclo com ?fechar=ganho|perdido e, quando a conversa disse, produto,
// valor, forma de pagamento ou motivo da perda. A tela só ABRE o modal de
// fechamento já existente, pré-preenchido; quem fecha é o vendedor, pelo
// mesmo botão e pela mesma RPC de sempre.
//
// O modal preenche pelos campos codificados da leitura (valor_total,
// pagamento_codigo, tipo_codigo), com mapeamento direto. Os textos livres
// (produto, valor, pagamento) só aparecem como dica para o vendedor; nada
// é deduzido deles.

export const CLOSING_PAYMENT_METHOD_CODES = [
  'pix',
  'credito',
  'debito',
  'boleto',
  'dinheiro',
  'transferencia',
  'misto',
  'outro',
] as const

export const CLOSING_PAYMENT_TYPE_CODES = [
  'avista',
  'entrada_parcelas',
  'parcelado_sem_entrada',
  'recorrente',
  'outro',
] as const

export type CycleClosingRequest = {
  close: 'ganho' | 'perdido'
  produto: string
  valor: string
  pagamento: string
  motivo: string
  valor_total: string
  pagamento_codigo: (typeof CLOSING_PAYMENT_METHOD_CODES)[number] | ''
  tipo_codigo: (typeof CLOSING_PAYMENT_TYPE_CODES)[number] | ''
}

const MAX_VALUE_LENGTH = 200

const ALLOWED_KEYS = [
  'fechar',
  'produto',
  'valor',
  'pagamento',
  'motivo',
  'valor_total',
  'pagamento_codigo',
  'tipo_codigo',
] as const

// Só um número de valor (ex.: "149,90", "1.234,56", "149.90").
const AMOUNT_PATTERN = /^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$|^\d+\.\d{1,2}$/

type SearchValue = string | string[] | null | undefined

function first(value: SearchValue): string {
  const raw = Array.isArray(value) ? value[0] : value

  return typeof raw === 'string'
    ? raw.replace(/\s+/g, ' ').trim().slice(0, MAX_VALUE_LENGTH)
    : ''
}

function code<T extends string>(value: string, allowed: readonly T[]): T | '' {
  return (allowed as readonly string[]).includes(value) ? (value as T) : ''
}

export function readCycleClosingRequest(
  read: (key: string) => SearchValue,
): CycleClosingRequest | null {
  const close = first(read('fechar'))

  if (close !== 'ganho' && close !== 'perdido') {
    return null
  }

  const won = close === 'ganho'
  const total = won ? first(read('valor_total')) : ''

  return {
    close,
    produto: won ? first(read('produto')) : '',
    valor: won ? first(read('valor')) : '',
    pagamento: won ? first(read('pagamento')) : '',
    motivo: close === 'perdido' ? first(read('motivo')) : '',
    valor_total: AMOUNT_PATTERN.test(total) ? total : '',
    pagamento_codigo: won ? code(first(read('pagamento_codigo')), CLOSING_PAYMENT_METHOD_CODES) : '',
    tipo_codigo: won ? code(first(read('tipo_codigo')), CLOSING_PAYMENT_TYPE_CODES) : '',
  }
}

// "149,90" → "149.90"; "1.234,56" → "1234.56"; "149.90" → "149.90". Só
// normaliza um número já validado; texto livre nunca chega aqui.
export function closingAmountToDecimal(valorTotal: string): string {
  if (!AMOUNT_PATTERN.test(valorTotal)) {
    return ''
  }

  if (valorTotal.includes(',')) {
    return valorTotal.replace(/\./g, '').replace(',', '.')
  }

  return /^\d{1,3}(?:\.\d{3})+$/.test(valorTotal)
    ? valorTotal.replace(/\./g, '')
    : valorTotal
}

// Repassa só os parâmetros permitidos (redirecionamento /sales-cycles/{id}
// → /leads/{lead}?opportunity={id}).
export function buildCycleClosingQuery(
  searchParams: Record<string, SearchValue>,
): string {
  const request = readCycleClosingRequest((key) => searchParams[key])

  if (!request) {
    return ''
  }

  const params = new URLSearchParams()
  params.set('fechar', request.close)

  for (const key of ALLOWED_KEYS) {
    if (key === 'fechar') continue

    const value = request[key]

    if (value) {
      params.set(key, value)
    }
  }

  return params.toString()
}

export function hasCycleClosingParams(search: string): boolean {
  const params = new URLSearchParams(search)

  return ALLOWED_KEYS.some((key) => params.has(key))
}

// URL sem os parâmetros de fechamento (para um recarregar não reabrir o
// modal).
export function stripCycleClosingParams(search: string): string {
  const params = new URLSearchParams(search)

  for (const key of ALLOWED_KEYS) {
    params.delete(key)
  }

  const query = params.toString()

  return query ? `?${query}` : ''
}

// Escolhe o produto ativo cujo nome bate com o texto da conversa. Só
// preenche quando há exatamente um candidato.
export function matchProductByName<T extends { id: string; name: string }>(
  text: string,
  products: T[],
): T | null {
  const normalize = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()

  const wanted = normalize(text)

  if (!wanted) {
    return null
  }

  const exact = products.filter((product) => normalize(product.name) === wanted)

  if (exact.length === 1) {
    return exact[0]
  }

  const partial = products.filter((product) => {
    const name = normalize(product.name)

    return name.length > 0 && (wanted.includes(name) || name.includes(wanted))
  })

  return partial.length === 1 ? partial[0] : null
}
