// Yolen — ONDA 8 / HOTFIX
//
// Catálogo dos princípios que a arquitetura de decisão do comprador deriva
// (ver buyer-decision-architecture.ts) e uma sanitização defensiva para
// method_definition materializado por versões anteriores da síntese, onde
// dois princípios do catálogo podem ter sido persistidos concatenados em um
// único item de lista (em vez de dois itens separados). A sanitização nunca
// altera o significado de um princípio: ela apenas separa duas sentenças do
// próprio catálogo que foram indevidamente unidas, e remove duplicatas
// exatas.

export const METHOD_PRINCIPLE_PROPORTIONAL_DEPTH =
  'A profundidade da conversa deve ser proporcional à complexidade real da decisão.'

export const METHOD_PRINCIPLE_BUYER_EVIDENCE =
  'Avanço real exige evidência do comprador; atividade do vendedor, sozinha, não prova progresso.'

export const METHOD_PRINCIPLE_DECISION_VS_FORMALIZATION =
  'A decisão de compra deve ser tratada separadamente das ações usadas para formalizar a contratação.'

export const METHOD_PRINCIPLE_DECISION_CRITERIA =
  'Os fatores que pesam na escolha precisam estar claros antes de uma oportunidade complexa avançar.'

export const METHOD_PRINCIPLE_APPROVAL_MAPPING =
  'Quando houver outras pessoas na decisão, a equipe precisa saber quem participa, aprova ou pode impedir o avanço.'

export const METHOD_PRINCIPLE_FORMAL_PROCESS =
  'Processos internos do cliente devem ser acompanhados sem transformar cada área envolvida em uma etapa automática do método.'

export const METHOD_PRINCIPLE_REAL_URGENCY =
  'Urgência só deve ser considerada quando houver data, evento ou consequência real confirmada pelo cliente.'

export const METHOD_PRINCIPLE_PRESENTATION_EVIDENCE =
  'Demonstração, tour, teste ou reunião devem ter um resultado esperado; realizar a atividade não é suficiente para avançar.'

export const METHOD_PRINCIPLE_CUSTOMIZATION_EVIDENCE =
  'A personalização da solução precisa ser sustentada por informações confirmadas na descoberta.'

export const KNOWN_METHOD_PRINCIPLE_CATALOG: readonly string[] = [
  METHOD_PRINCIPLE_PROPORTIONAL_DEPTH,
  METHOD_PRINCIPLE_BUYER_EVIDENCE,
  METHOD_PRINCIPLE_DECISION_VS_FORMALIZATION,
  METHOD_PRINCIPLE_DECISION_CRITERIA,
  METHOD_PRINCIPLE_APPROVAL_MAPPING,
  METHOD_PRINCIPLE_FORMAL_PROCESS,
  METHOD_PRINCIPLE_REAL_URGENCY,
  METHOD_PRINCIPLE_PRESENTATION_EVIDENCE,
  METHOD_PRINCIPLE_CUSTOMIZATION_EVIDENCE,
]

function normalizeSpacing(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

/**
 * Corrige, sem adivinhar nem reescrever texto, o único padrão de
 * concatenação indevida já observado: dois princípios do catálogo unidos em
 * um único item de lista por um único espaço, na ordem "A B". Separa em
 * ["A", "B"] preservando o texto original de cada um. Qualquer outra string
 * (incluindo princípios escritos livremente pelo gestor) passa inalterada.
 * Também remove duplicatas exatas após a normalização de espaços.
 */
export function sanitizeMethodPrinciples(principles: string[]): string[] {
  const expanded: string[] = []

  for (const raw of principles) {
    const trimmed = normalizeSpacing(raw)
    if (!trimmed) continue

    const first = KNOWN_METHOD_PRINCIPLE_CATALOG.find((candidate) =>
      trimmed.startsWith(`${candidate} `),
    )
    const second = first
      ? KNOWN_METHOD_PRINCIPLE_CATALOG.find(
          (candidate) => trimmed === `${first} ${candidate}`,
        )
      : undefined

    if (first && second) {
      expanded.push(first, second)
      continue
    }

    expanded.push(trimmed)
  }

  return Array.from(new Set(expanded))
}
