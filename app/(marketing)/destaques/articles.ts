export type ArticleCategory = 'gestao-comercial' | 'metodo-yolen' | 'produto'

export type HighlightArticle = {
  slug: string
  category: ArticleCategory
  categoryLabel: string
  title: string
  summary: string
  publishedAt: string
  readingTime: string
  featured?: boolean
  sections: Array<{
    title: string
    paragraphs: string[]
    bullets?: string[]
  }>
}

export const ARTICLE_CATEGORIES: Array<{
  id: ArticleCategory | 'todos'
  label: string
}> = [
  { id: 'todos', label: 'Todos' },
  { id: 'gestao-comercial', label: 'Gestão comercial' },
  { id: 'metodo-yolen', label: 'Método Yolen' },
  { id: 'produto', label: 'Produto e novidades' },
]

export const HIGHLIGHT_ARTICLES: HighlightArticle[] = [
  {
    slug: 'lead-parado-nao-e-falta-de-lead',
    category: 'gestao-comercial',
    categoryLabel: 'Gestão comercial',
    title: 'Lead parado não é falta de lead. É falta de próxima ação.',
    summary:
      'Por que aumentar a entrada não corrige uma operação que ainda perde oportunidades por atraso, esquecimento e ausência de prioridade.',
    publishedAt: '2026-08-15',
    readingTime: '5 min de leitura',
    featured: true,
    sections: [
      {
        title: 'O diagnóstico errado custa caro',
        paragraphs: [
          'Quando o resultado cai, a reação mais comum é buscar mais leads. O problema é que uma operação desorganizada transforma volume adicional em uma fila maior de oportunidades sem resposta.',
          'Antes de discutir aquisição, o gerente precisa enxergar quantos leads estão sem próxima ação, quantos compromissos venceram e onde o funil deixou de avançar.',
        ],
      },
      {
        title: 'Prioridade precisa ser operacional',
        paragraphs: [
          'Uma lista completa informa o que existe. Uma visão de prioridades mostra o que exige decisão agora. Essa diferença muda a forma como o time começa o dia.',
        ],
        bullets: [
          'Oportunidades com compromisso atrasado.',
          'Leads sem próxima ação definida.',
          'Negociações que ultrapassaram o SLA da etapa.',
          'Contatos prometidos para o dia atual.',
        ],
      },
      {
        title: 'A pergunta gerencial correta',
        paragraphs: [
          'Em vez de perguntar apenas quantos leads entraram, pergunte quantos receberam o próximo movimento correto dentro do prazo. Volume abre possibilidade. Execução transforma possibilidade em resultado.',
        ],
      },
    ],
  },
  {
    slug: 'meta-sem-rotina-vira-cobranca',
    category: 'metodo-yolen',
    categoryLabel: 'Método Yolen',
    title: 'Meta sem rotina vira cobrança. Meta traduzida vira gestão.',
    summary:
      'A meta mensal precisa chegar ao cotidiano do time como ritmo, capacidade e prioridade — não apenas como um número no fechamento.',
    publishedAt: '2026-08-12',
    readingTime: '6 min de leitura',
    sections: [
      {
        title: 'O número sozinho não orienta comportamento',
        paragraphs: [
          'Uma meta mensal pode ser perfeitamente definida e ainda assim ter pouco efeito na execução. Isso acontece quando o time recebe o valor final, mas não enxerga o ritmo necessário para chegar até ele.',
          'A gestão começa quando meta, realizado, gap e dias de execução restantes são lidos como uma única decisão operacional.',
        ],
      },
      {
        title: 'Traduza a meta em capacidade',
        paragraphs: [
          'O calendário operacional importa. Feriados, pausas e dias efetivamente trabalhados mudam a capacidade disponível e, portanto, o ritmo diário necessário.',
        ],
        bullets: [
          'Qual é o gap real do período?',
          'Quantos dias de execução ainda existem?',
          'Qual ritmo diário fecha essa distância?',
          'O funil atual sustenta esse ritmo?',
        ],
      },
      {
        title: 'Cobrança tardia não recupera capacidade perdida',
        paragraphs: [
          'Quanto mais cedo o desvio fica visível, maior a variedade de ações disponíveis. No fim do mês, quase toda decisão vira urgência. Durante o período, ela ainda pode ser gestão.',
        ],
      },
    ],
  },
  {
    slug: 'copiloto-comercial-contexto-proxima-abordagem',
    category: 'produto',
    categoryLabel: 'Produto e novidades',
    title: 'Copiloto Comercial: inteligência que trabalha dentro da oportunidade',
    summary:
      'Como a Yolen transforma o contexto de uma conversa em sinais, coaching e uma próxima abordagem que o vendedor pode revisar.',
    publishedAt: '2026-08-10',
    readingTime: '4 min de leitura',
    sections: [
      {
        title: 'Uma conversa contém mais sinais do que parece',
        paragraphs: [
          'Interesse, dúvida, objeção, urgência, necessidade de outro decisor e compromisso aparecem ao longo da interação. Na rotina, parte desse contexto pode se perder entre mensagens, anotações e memória.',
          'O Copiloto Comercial organiza essa leitura dentro da oportunidade para ajudar o vendedor a entender o momento da venda antes de decidir o próximo movimento.',
        ],
      },
      {
        title: 'Da análise à próxima abordagem',
        paragraphs: [
          'A inteligência identifica sinais, interesses, riscos e pontos de melhoria. A partir deles, pode sugerir estágio, próxima ação, mensagem e uma abordagem mais adequada ao contexto do cliente.',
        ],
        bullets: [
          'Resumo comercial do que aconteceu na interação.',
          'Objeções e riscos que exigem atenção.',
          'Pontos bem conduzidos e oportunidades de coaching.',
          'Próximo movimento sugerido para a oportunidade.',
        ],
      },
      {
        title: 'Inteligência ao lado do vendedor',
        paragraphs: [
          'A orientação não retira a autonomia comercial. O vendedor revisa o conteúdo e decide o que será aplicado. O objetivo é ampliar sua capacidade de interpretar e conduzir cada venda com mais contexto.',
        ],
      },
    ],
  },
]

export function getArticleBySlug(slug: string) {
  return HIGHLIGHT_ARTICLES.find((article) => article.slug === slug)
}

export function formatArticleDate(date: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(`${date}T12:00:00-03:00`))
}
