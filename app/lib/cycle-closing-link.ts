// Pedido de fechamento vindo do Companion (leitura completa do HML).
//
// O botão "Confirmar venda"/"Confirmar perda" do painel abre a tela do
// ciclo com ?fechar=ganho|perdido e, quando a conversa disse, produto,
// valor, forma de pagamento ou motivo da perda. A tela só ABRE o modal de
// fechamento já existente, pré-preenchido; quem fecha é o vendedor, pelo
// mesmo botão e pela mesma RPC de sempre.

export type CycleClosingRequest = {
  close: 'ganho' | 'perdido'
  produto: string
  valor: string
  pagamento: string
  motivo: string
}

const MAX_VALUE_LENGTH = 200

const ALLOWED_KEYS = ['fechar', 'produto', 'valor', 'pagamento', 'motivo'] as const

type SearchValue = string | string[] | null | undefined

function first(value: SearchValue): string {
  const raw = Array.isArray(value) ? value[0] : value

  return typeof raw === 'string'
    ? raw.replace(/\s+/g, ' ').trim().slice(0, MAX_VALUE_LENGTH)
    : ''
}

export function readCycleClosingRequest(
  read: (key: string) => SearchValue,
): CycleClosingRequest | null {
  const close = first(read('fechar'))

  if (close !== 'ganho' && close !== 'perdido') {
    return null
  }

  return {
    close,
    produto: close === 'ganho' ? first(read('produto')) : '',
    valor: close === 'ganho' ? first(read('valor')) : '',
    pagamento: close === 'ganho' ? first(read('pagamento')) : '',
    motivo: close === 'perdido' ? first(read('motivo')) : '',
  }
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

const PAYMENT_METHOD_HINTS: { value: string; pattern: RegExp }[] = [
  { value: 'pix', pattern: /\bpix\b/i },
  { value: 'credito', pattern: /cr[eé]dito/i },
  { value: 'debito', pattern: /d[eé]bito/i },
  { value: 'boleto', pattern: /boleto/i },
  { value: 'transferencia', pattern: /transfer[eê]ncia|\bted\b|\bdoc\b/i },
  { value: 'dinheiro', pattern: /dinheiro|esp[eé]cie/i },
]

// Só reconhece uma forma de pagamento quando o texto aponta para UMA delas;
// caso contrário o campo fica para o vendedor escolher.
export function matchPaymentMethod(text: string): string | null {
  const matches = PAYMENT_METHOD_HINTS.filter((hint) => hint.pattern.test(text))

  return matches.length === 1 ? matches[0].value : null
}

// "R$ 1.234,56", "1234.56", "199,90" → número; qualquer coisa ambígua → null.
export function parseClosingAmount(text: string): number | null {
  const numbers = text.match(/\d[\d.,]*/g)

  if (!numbers || numbers.length !== 1) {
    return null
  }

  let raw = numbers[0]

  if (/,\d{1,2}$/.test(raw)) {
    raw = raw.replace(/\./g, '').replace(',', '.')
  } else if (/\.\d{3}(\.|$)/.test(raw) && !/\.\d{1,2}$/.test(raw)) {
    raw = raw.replace(/\./g, '')
  } else {
    raw = raw.replace(/,/g, '')
  }

  const value = Number(raw)

  return Number.isFinite(value) && value > 0 ? value : null
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
