// Leitura completa v5 — fixtures sintéticas para os testes.
//
// A v5 não tem analise_markdown e traz campos novos na decisão. Os testes
// antigos montam a saída do modelo no formato v4; toV5Output converte essa
// saída para o formato que o runner aceita hoje.

export function v5DecisionExtras(overrides = {}) {
  return {
    contradicoes_cadastro: [],
    como_conduzir: {
      leitura_do_momento: 'Cliente tranquila, sem pergunta em aberto.',
      passos: [
        { tecnica: 'Esperar o cliente', como: 'Não mandar mensagem agora; responder quando ela escrever.', exemplo: '' },
      ],
      evitar: ['Mandar cobrança de resposta.'],
    },
    mensagem_sugerida: '',
    mensagem_observacao: 'A cliente não deixou pergunta.',
    para_o_gestor: [],
    ...overrides,
  }
}

export function toV5Output(output, extras = {}) {
  const decision =
    output?.decisao ?? {}

  const ajustes =
    Array.isArray(decision.conducao?.ajustes)
      ? decision.conducao.ajustes.map((item) =>
          typeof item === 'string'
            ? { houve: item, melhor: '' }
            : item,
        )
      : []

  return {
    decisao: {
      ...decision,
      conducao: {
        acertos: decision.conducao?.acertos ?? [],
        ajustes,
      },
      ...v5DecisionExtras(extras),
    },
  }
}
