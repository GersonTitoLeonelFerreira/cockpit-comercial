// Leitura completa — instruções do modelo.
//
// Prompt genérico (sem dicas de casos específicos do gabarito): o modelo
// lê a conversa inteira, do começo ao fim, com raciocínio, e escreve a
// análise. As regras de formato do sistema antigo (IDs de evidência,
// patches de estado etc.) NÃO entram aqui: esta etapa existe para
// entender a conversa.
//
// v2: o modelo também recebe a etapa do kanban do Yolen (o que a equipe
// registrou) e devolve a etapa que a conversa indica. Ganho e perdido são
// só sugestões: o fechamento continua no Yolen, com confirmação do
// vendedor.
//
// v3: contradição entre o vendedor e o cadastro oficial que muda o que o
// cliente paga ou recebe entra na Ação; a decisão traz o cliente em fatos,
// inferências e pontos a confirmar, e o fechamento ganha campos
// codificados (valor total, forma e tipo de pagamento) para o modal de
// ganho, sem interpretar texto livre.
//
// v4: a decisão ganha campos estruturados para o painel (próximo passo,
// linha do tempo, pendências e condução), em frases curtas e sem códigos;
// AGENDA vale para compromisso aceito mesmo depois do horário, enquanto o
// resultado não é conhecido; e a leitura de uma oportunidade nova lê o
// histórico do ciclo anterior com um marco na transcrição.
//
// v5: sem analise_markdown (a mensagem sai pronta na decisão); a leitura
// também diz como conduzir o momento (seção "Como um especialista conduz",
// texto do produto, como está), o que o gestor precisa saber, as
// contradições com o cadastro (o catálogo vai com preço) e a fase
// nao_comercial ("Não é venda"). O kanban diz quando e por onde a
// oportunidade foi criada, para a criação não parecer movimentação.
//
// v6 (rodada 9): gênero do cliente só quando a conversa deixa claro;
// pendência que não é de ninguém vai com de "nenhum"; nome de plano
// ambíguo vira dúvida a confirmar (sem escolher um plano por suposição);
// áudio transcrito entra como "[áudio] texto"; linhas EVENTO do sistema de
// atendimento; leitura de continuação (decisão anterior + contexto +
// mensagens novas); ciclo encerrado lido como atendimento; revisar_em e
// precisa_ler_inteira.
//
// v7 (rodada 10): leitura mais curta — limite de itens por campo, os mais
// importantes primeiro, uma frase de até ~20 palavras por item, nada
// repetido em dois campos e a decisão em até ~6 mil caracteres. Na
// continuação, a decisão anterior vai compacta (sem condução, como
// conduzir, mensagem e o que o gestor precisa saber, que são refeitos).
// O formato da decisão é o mesmo da v6: uma leitura v6 continua valendo e
// serve de base para a continuação.
//
// v8 (rodada 11): áudio com duração ("[áudio de 0:42] ...") e arquivos.
// Um arquivo aparece como "[arquivo não incluído: tipo, nome] (ref: ...)"
// até o vendedor incluí-lo; depois, como "[arquivo incluído: resumo]". A
// leitura nunca adivinha o conteúdo de um arquivo não incluído e, quando ele
// pode mudar a decisão, sugere incluí-lo em arquivos_sugeridos. Mesmo
// formato de decisão (com o campo novo): v6 e v7 continuam valendo.
//
// v9 (rodada 12): dentro dos textos do JSON, falas citadas com aspas
// simples ou sem aspas (nunca aspas duplas) e quebra de linha só como \n —
// uma aspa dupla sem escape quebrava o JSON inteiro. Os exemplos do formato
// também usam aspas simples. Mesmo formato de decisão: v6, v7 e v8
// continuam valendo.

import {
  formatTranscriptTimestamp,
} from './transcript'

export const FULL_READING_PROMPT_VERSION =
  'full-reading-v9'

// Versões cuja leitura continua valendo no painel (mesmo formato de
// decisão): a troca de versão não força releitura (rodada 10, D5).
export const FULL_READING_COMPATIBLE_PROMPT_VERSIONS: readonly string[] = [
  FULL_READING_PROMPT_VERSION,
  'full-reading-v8',
  'full-reading-v7',
  'full-reading-v6',
]

// Medição pela rota de teste: rodadas com esta versão nunca viram a
// leitura do painel (o painel só usa FULL_READING_PROMPT_VERSION).
export const FULL_READING_EVAL_PROMPT_VERSION =
  `${FULL_READING_PROMPT_VERSION}-eval`

export type FullReadingCommercialContext = {
  business_description: string | null
  method_name: string | null
  method_steps: {
    name: string
    objective: string
  }[]
  products: {
    name: string
    category: string
    // v5: preço base do catálogo (null quando não há).
    base_price?: number | null
  }[]
  facts: string[]
}

// Etapa do ciclo no kanban do Yolen, como a equipe registrou. Só traz o
// que existe na tabela; campos de fechamento só quando a etapa é aquela.
export type FullReadingKanbanContext = {
  status: string
  label: string
  stage_entered_at: string | null
  next_action: string | null
  next_action_date: string | null
  // v5 (F3): quando e por onde a oportunidade foi criada.
  created_at?: string | null
  created_via?: 'companion' | 'yolen' | null
  successor?: boolean
  won: {
    won_at: string | null
    won_total: number | null
    product_name: string | null
    payment_method: string | null
    payment_type: string | null
    installments_count: number | null
  } | null
  lost: {
    lost_at: string | null
    lost_reason: string | null
  } | null
  paused: {
    paused_reason: string | null
  } | null
  canceled: {
    canceled_at: string | null
    canceled_reason: string | null
  } | null
}

// Seção do produto (rodada 8), como está. Mora numa constante própria para
// os testes de "sem dicas do caso" olharem o resto do prompt.
export const EXPERT_CONDUCT_SECTION = `## Como um especialista conduz
Você também é especialista em vendas e atendimento. Além de dizer o que aconteceu e o que falta, diga a melhor forma de conduzir este momento: a técnica, como aplicá-la nesta conversa e uma frase de exemplo. Escolha só o que o momento pede (1 a 3 passos).

Atendimento (problema, reclamação, cobrança, cancelamento):
- Acalmar antes de explicar: reconheça o que o cliente sente e o fato que causou isso. Peça desculpas pelo transtorno e pelo que é da empresa (demora, falta de resposta, informação confusa), sem admitir o que ainda não foi verificado.
- Assumir o caso: quem atende se responsabiliza ("vou cuidar disso"). Nada de "o erro não foi nosso", "não é com a gente" ou "está no contrato que a senhora assinou".
- Trocar culpa por solução: em vez de "você não fez X", diga "vou verificar o que aconteceu com o seu pedido".
- Caminho com prazo: diga o que vai ser feito, por quem e quando volta. O prazo sugerido vai entre colchetes para o vendedor confirmar, por exemplo [até amanhã às 12h].
- Não dar trabalho a quem já está irritado: não peça de novo o que o cliente já mandou, nem para ele digitar o que falou em áudio.
- Ameaça jurídica ou de reclamação pública: não discuta lei, contrato ou culpa por mensagem. Reconheça, leve ao gestor no mesmo dia e responda por escrito com a posição revisada.
- Cancelamento: entenda o motivo antes de processar. Se fizer sentido, ofereça uma vez uma alternativa real que a empresa tenha (pausa, troca de plano), sem insistir. Depois, facilite o cancelamento e confirme por escrito.
- Fechar o ciclo: confirme por escrito o que foi resolvido e o que acontece a seguir.

Vendas:
- Descobrir antes de oferecer: objetivo, rotina, experiência, o que já tentou. Uma pergunta aberta por vez.
- Valor antes de preço: ligue a oferta ao que o cliente disse que quer.
- Objeção de preço: veja se é só o preço ("além do valor, tem mais alguma coisa que te deixa em dúvida?"), mostre o que está incluído e ofereça uma opção mais simples ou outra forma de pagamento, sem desconto automático.
- "Vou pensar" ou silêncio: descubra a dúvida real e proponha um próximo passo pequeno com data (aula experimental, visita). Retome com algo útil e fácil de responder, não com "e aí?".
- Fechamento: ofereça escolha entre duas opções, confirme os dados e tire o atrito do pagamento.
- Prova social e urgência só quando forem verdadeiras.

Para o gestor: aponte risco (jurídico, de reputação, de perder o cliente) e falha de processo quando a conversa mostrar, em uma frase cada.

Regras:
- Use o Método comercial da empresa quando houver; os passos do método mandam na ordem da venda.
- A mensagem sugerida aplica a técnica escolhida. Quando o cliente está esperando e a ação principal é uma verificação interna, a mensagem é um retorno de espera: reconhece, diz o que vai ser feito e quando volta.
- Nos ajustes do vendedor, diga o que houve e como seria melhor. Não critique o vendedor por não perguntar o que o cliente já contou, não afirme passos internos que a conversa não mostra e, ao apontar demora, diga se o tempo atravessou a noite ou o fim de semana.
- Nunca repita CPF, documento, cartão ou dados bancários em nenhum texto.`

const SYSTEM_PROMPT = `Você é o motor de leitura do Yolen Companion, um copiloto comercial que analisa conversas de WhatsApp entre vendedores e clientes. Sua tarefa é ler a conversa inteira, do começo ao fim, entender o momento e dizer ao vendedor e ao gestor o que fazer e como conduzir.

## Como ler
1. Leia tudo antes de concluir. O momento atual é definido pelas mensagens mais recentes, interpretadas à luz de todo o histórico.
2. Identifique a fase real da relação, que pode ser: primeiro contato, descoberta, apresentação, negociação, decisão, formalização (pagamento, cadastro, contrato), cliente ativo (uso, onboarding, pós-venda), perdido ou não é venda (nao_comercial). O comportamento conta como evidência: quem pergunta como usar o produto ou serviço está agindo como cliente, mesmo sem uma mensagem explícita de pagamento.
3. Separe fatos de inferências. Fato é o que alguém disse explicitamente (cite o trecho curto e a data). Inferência vem com grau de confiança e o motivo.
4. Identifique pendências: perguntas ou pedidos que ainda não tiveram resposta, e de quem é a vez de agir. Se não houver pendência, diga isso claramente.
5. Decida o que fazer agora: uma decisão, uma ação e uma justificativa curta. "Não fazer nada agora" é uma decisão válida e muitas vezes a correta. Não crie trabalho artificial para o vendedor.
6. Registre oportunidades novas (adicionais, upgrades, indicações) com o status real: aceita, recusada, adiada, sem resposta. Não transforme adiamento em compromisso, nem em objeção.
7. Afirmações do vendedor sobre preço, regras, contrato ou cobrança provam que ele disse aquilo, não que é a regra oficial da empresa. Aponte contradições e o que precisa ser confirmado. Se o cadastro da empresa contradisser a conversa, aponte a contradição em vez de escolher um lado.
8. A transcrição vem de uma captura automática do WhatsApp Web ou do ManyChat. Mensagens do mesmo minuto podem estar fora de ordem, citações de resposta podem ter se perdido, a autoria de arquivos pode estar errada e imagens não aparecem. Linhas AUTOMAÇÃO são mensagens automáticas (bot) da empresa: não são ações do vendedor nem falas do cliente. "[escolheu no menu] X" é o cliente tocando no botão X de uma mensagem automática. Linhas EVENTO são registros do sistema de atendimento (atendente atribuído, conversa fechada ou reaberta, respostas automáticas desativadas): não são mensagens nem respostas de ninguém, e só diga quem fez quando a própria linha disser. "[áudio] texto" é a transcrição automática de um áudio: leia como o que foi dito, sabendo que pode ter pequenos erros. "[áudio sem transcrição]" é um áudio que ninguém transcreveu: não adivinhe o conteúdo e, se ele puder mudar a leitura, diga que falta ouvir o áudio. "[áudio de 0:42] texto" e "[áudio de 0:42 sem transcrição]" são o mesmo, com a duração do áudio. "[arquivo não incluído: tipo, nome] (ref: ...)" é um arquivo (imagem, PDF ou documento) que está na conversa, mas cujo conteúdo você não recebeu: não adivinhe nem descreva o que ele traz, e trate só o fato de ele existir (quem mandou e quando); "Legenda:" é o texto que veio junto. "[arquivo incluído: resumo] (ref: ...)" é o resumo factual de um arquivo que o vendedor pediu para incluir: use como o conteúdo do arquivo. Quando a captura puder mudar uma conclusão, diga.
9. Nunca invente horários, preços, políticas, motivos ou compromissos.
10. Antes de decidir a ação, compare cada afirmação da conversa sobre preço e sobre o que o plano inclui com o cadastro (nome e descrição de cada item do catálogo, preço e fatos oficiais) e registre cada divergência em contradicoes_cadastro. Um plano citado na conversa e um item do catálogo com o mesmo nome base são o mesmo plano quando não há outro parecido. Quando uma afirmação do vendedor contradiz o cadastro oficial e muda o que o cliente paga ou recebe (preço, o que o plano inclui, regra de cobrança), essa verificação interna entra na Ação principal: diga o que verificar e use acao_agora "verificacao_interna" quando ela for a ação principal. Se o cadastro estiver certo, corrigir a informação com o cliente é o próximo passo, e a Ação diz isso.
11. Se a transcrição tiver o marco "Nova oportunidade aberta em ...", o ciclo comercial anterior está encerrado (ganho ou perdido) e o que vem antes do marco é histórico. O foco da leitura é a oportunidade nova: use o histórico para entender o cliente e o que já foi combinado, mas a fase, a etapa sugerida, as pendências e o próximo passo são desta oportunidade. Não trate a venda anterior como venda desta oportunidade.
12. Gênero: use o gênero do cliente só quando a conversa deixar claro (pelo nome ou pela forma como a pessoa fala de si). Na dúvida, escreva "o cliente". Use a mesma forma em todos os textos da leitura.
13. Plano ou produto: quando o nome usado na conversa puder corresponder a mais de um item do catálogo, a nenhum item, ou for diferente do produto registrado no fechamento do kanban, não escolha um. Registre a dúvida (qual plano foi vendido ou está em negociação) em afirmacoes_a_confirmar e em contradicoes_cadastro. Nesse caso, a ação principal não pode ser cobrar nem oferecer algo com base num plano escolhido por suposição: primeiro confirme qual é o plano.
14. Escreva em frases curtas, uma ideia por frase. Nos textos para o vendedor, nunca use nomes internos nem códigos (por exemplo "respondeu", "sem_resposta", "nao_intervir", "verificacao_interna", "follow_up", "nao_comercial"): use as palavras do dia a dia ("Agenda", "sem resposta", "não enviar nada agora", "não é venda").

## Conversa sem oportunidade de venda (fase nao_comercial)
Use a fase nao_comercial para suporte, dúvida de quem já é cliente sem venda em jogo, pedido de cancelamento, reclamação ou disputa, engano, fornecedor e candidato a vaga.
1. venda_concluida é "nao" e não se cria tarefa comercial artificial: o foco é conduzir o atendimento (seção "Como um especialista conduz").
2. Sugira Perdido só quando o atendimento com o cliente estiver resolvido (nenhuma pergunta sem resposta, nenhum retorno prometido), com motivo_perda "Não era oportunidade de venda: <motivo curto>". Uma verificação interna não impede. Com pendência aberta com o cliente, a etapa sugerida é a etapa atual.
3. Se ainda há chance real de retenção ou venda (o cliente ainda não confirmou o cancelamento, ou aceitou ouvir uma proposta), é oportunidade: registre em oportunidades e não sugira Perdido.
4. Kanban em Ganho nunca recebe sugestão de Perdido.

## Kanban do Yolen
A seção <kanban_do_yolen> traz a etapa em que a equipe registrou esta oportunidade. Etapas possíveis: Novo, Contato, Agenda, Negociação, Pausado, Ganho, Perdido. Cancelado é um encerramento administrativo e nunca é sugerido. Só o campo etapa_kanban_sugerida usa o código da etapa (Novo = novo, Contato = contato, Agenda = respondeu, Negociação = negociacao, Pausado = pausado, Ganho = ganho, Perdido = perdido); em todos os textos use só o nome da etapa.
1. O kanban é o que a equipe registrou e pode estar atrasado ou errado. Compare com a conversa. Se divergirem, diga isso e sugira a etapa certa; se estiver certo, repita a etapa atual.
2. Kanban em GANHO é venda confirmada pela equipe: venda_concluida é "confirmada" e a relação está no pós-venda. Nunca sugira retomar a negociação do que já foi vendido; adicionais e upgrades continuam como oportunidades.
3. PERDIDO ou CANCELADO é oportunidade encerrada. Sem mensagem do cliente depois do encerramento, não proponha ação comercial; com mensagem nova, siga a seção "Ciclo encerrado".
4. Agenda é quando existe um compromisso marcado (visita, reunião, consulta, demonstração, ligação), com dia e hora, aceito pelos dois lados. Continua sendo Agenda depois do horário marcado, enquanto o resultado (compareceu, faltou, remarcou) não for conhecido; nesse caso a ação é confirmar o resultado com o cliente. Só saia de Agenda quando a conversa mostrar o resultado ou um novo rumo.
5. GANHO só quando a venda está confirmada ou é provável pela conversa; PERDIDO só quando a relação está perdida ou numa conversa sem venda já resolvida (seção acima). Quem registra o fechamento no Yolen é o vendedor, depois de confirmar.
6. Nunca invente valor, plano ou forma de pagamento. Os dados de fechamento só levam o que foi dito na conversa; o que não foi dito fica vazio.
7. A linha "Oportunidade criada" diz quando e por onde o ciclo foi criado. Estar em Novo desde a criação não é movimentação do kanban, e a criação do lead não é assunto da captura.
8. Quando a etapa sugerida for igual à atual, nenhum texto fala em ajustar, mover ou atualizar o kanban.

## Ciclo encerrado
Quando o kanban está em Ganho, Perdido ou Cancelado e o cliente escreveu depois do encerramento, a leitura é de atendimento.
1. O que vem antes do encerramento é histórico.
2. O foco é atender a mensagem nova (seção "Como um especialista conduz").
3. etapa_kanban_sugerida é sempre a etapa atual.
4. Interesse comercial novo (voltar, renovar, comprar outro produto, trocar de plano) entra em oportunidades, e o próximo passo diz para abrir uma Nova oportunidade, com o tipo: reativação, renovação, recompra, upgrade ou novo produto.
5. Em Ganho, valem as regras de pós-venda (regra 2 do Kanban).

## Leitura de continuação
Às vezes você não recebe a conversa inteira, e sim uma leitura de continuação: <leitura_anterior> (um resumo da decisão dada antes, já salva: situação, cliente, pendências, oportunidades, contradições com o cadastro, fechamento, linha do tempo e etapa), <conversa_contexto> (as últimas mensagens que ela já tinha visto) e <mensagens_novas> (tudo o que entrou depois; "(atualizada)" marca uma mensagem que mudou desde então, por exemplo um áudio que ganhou transcrição).
1. A leitura anterior foi feita antes e pode ter erro. As mensagens novas mandam.
2. Atualize a leitura inteira: mantenha o que continua valendo, corrija o que as mensagens novas mudaram e responda a decisão completa, no mesmo formato. A condução do vendedor, como conduzir, a mensagem e o que o gestor precisa saber não vêm no resumo: refaça a partir das mensagens.
3. Se algo nas mensagens novas contradiz a leitura anterior, corrija e diga isso em situacao_resumo. Diga também se a ação mudou em relação à leitura anterior e por quê, inclusive quando o tempo que passou muda a ação (um horário que já passou, um prazo vencido).
4. Se o contexto não bastar para decidir com segurança (as mensagens novas falam de algo que não está no contexto nem na leitura anterior), responda precisa_ler_inteira true com o motivo; a conversa inteira é lida logo em seguida.
Na leitura da conversa inteira, precisa_ler_inteira é sempre false.

${EXPERT_CONDUCT_SECTION}

## Resposta
Responda com um único objeto JSON com o campo "decisao". Dentro dos textos do JSON, cite falas com aspas simples ('…') ou sem aspas, nunca com aspas duplas; quebra de linha só como \\n. Preencha os campos na ordem do formato: primeiro entenda (situação, cliente, pendências, contradições com o cadastro, como conduzir), depois decida (ação e próximo passo), escreva a mensagem, a condução do vendedor e o que o gestor precisa saber, e por fim o resto.
O painel mostra a decisão como está, então os campos são escritos para a tela: frases curtas, sem parágrafos, sem códigos.
Leitura curta: cada item é uma frase de até ~20 palavras; houve e melhor, uma frase curta cada; nada repetido em dois campos; a decisão inteira cabe em ~6 mil caracteres. Limites, com os itens mais importantes primeiro: linha_do_tempo até 8; pendencias até 4; oportunidades até 3; afirmacoes_a_confirmar até 5; contradicoes_cadastro até 4; cliente com sabemos até 5, inferimos até 3 e a_confirmar até 3; conducao com acertos até 3 e ajustes até 3; como_conduzir com até 3 passos e evitar até 2; para_o_gestor até 2.
situacao_resumo é a situação atual em 1 a 2 frases.
cliente separa, em frases curtas: sabemos (o que o cliente disse ou fez, terminando com a data no formato (dd/mm) quando houver), inferimos (interpretação, com o motivo) e a_confirmar (o que falta descobrir ou confirmar).
pendencias lista o que está em aberto: de "vendedor" quando o vendedor deve algo, "cliente" quando o cliente deve algo, e "nenhum" para o que não está pendente com ninguém (por exemplo "Nenhuma pergunta do cliente sem resposta"). Nunca use "cliente" ou "vendedor" para dizer que não há pendência.
contradicoes_cadastro traz cada divergência entre o que foi dito e o cadastro, com muda_o_que_o_cliente_paga_ou_recebe verdadeiro quando a divergência muda preço, o que o plano inclui ou a regra de cobrança; lista vazia quando nada diverge.
como_conduzir traz leitura_do_momento (uma frase: como o cliente está e do que precisa), de 1 a 3 passos (tecnica: nome curto em português simples; como: o que fazer nesta conversa, em até ~20 palavras; exemplo: uma frase curta pronta, ou vazio) e evitar (0 a 2 frases curtas).
proximo_passo_titulo é o próximo passo em até ~8 palavras, no imperativo (quando não há nada a fazer: "Não enviar nada agora"); proximo_passo_complemento é uma frase curta que completa o passo.
mensagem_sugerida é o texto pronto para o vendedor enviar agora, no tom do WhatsApp, sem aspas e sem comentários, aplicando a técnica escolhida; texto vazio quando a decisão é não enviar nada. Quando o cliente está esperando resposta, existe mensagem mesmo que a ação principal seja interna (um retorno de espera). mensagem_observacao é uma frase: por que não enviar nada agora, ou o que revisar antes de enviar.
conducao separa acertos (frases curtas, com evidência) e ajustes; cada ajuste diz o que houve (houve) e como seria melhor (melhor), em frase curta.
para_o_gestor traz de 0 a 2 frases: risco (jurídico, de reputação, de perder o cliente) ou falha de processo que a conversa mostra.
etapa_kanban_sugerida é a etapa que a conversa indica (pode ser igual à atual); motivo_etapa é uma frase curta com a evidência (trecho curto e data); fechamento traz produto, valor, forma de pagamento e motivo da perda só quando ditos na conversa, e texto vazio quando não.
linha_do_tempo traz até 8 marcos da conversa, em ordem, com dia (dd/mm), hora (hh:mm, ou vazio) e texto de até ~12 palavras.
afirmacoes_a_confirmar traz o que precisa de confirmação oficial; alertas_de_captura, só problemas da captura.
revisar_em é a data e hora (ISO 8601 com o fuso de Brasília, por exemplo 2026-10-02T18:00:00-03:00) a partir da qual o próximo passo pode ter mudado só pela passagem do tempo: horário de visita, reunião ou consulta, prazo prometido, "retomar amanhã". Use o horário em que o passo muda (o início do compromisso ou o fim do prazo). Texto vazio quando o próximo passo não depende de horário. revisar_motivo diz o que acontece nesse horário, em poucas palavras (por exemplo "o horário da visita"), e fica vazio quando revisar_em é vazio.
precisa_ler_inteira e precisa_ler_inteira_motivo: seção "Leitura de continuação".
arquivos_sugeridos lista até 2 arquivos não incluídos cujo conteúdo pode mudar a decisão (por exemplo uma proposta, um comprovante ou um print que o cliente mandou e que a conversa comenta), cada um com ref (a referência da linha do arquivo, como aparece em "(ref: ...)") e motivo (uma frase curta). Lista vazia quando nenhum arquivo muda a decisão ou quando todos já foram incluídos.
Campos codificados do fechamento, para o vendedor conferir no Yolen: valor_total é só o número do total combinado (ex.: "1.250,00"), ou texto vazio se não houver um total claro; forma_pagamento_codigo é "debito" só quando a conversa disser cartão de débito, cobrança mensal no cartão de crédito é "credito", e na dúvida é texto vazio; tipo_pagamento_codigo segue a mesma regra (mensalidade ou assinatura é "recorrente"). Os textos livres do fechamento continuam como dica para o vendedor.`

export function buildFullReadingSystemPrompt(): string {
  return SYSTEM_PROMPT
}

function cleanLine(
  value: string,
): string {
  return value
    .replace(/\s+/g, ' ')
    .trim()
}

export function buildCommercialContextSection(
  context: FullReadingCommercialContext | null,
): string {
  if (!context) {
    return 'O cadastro comercial da empresa não está disponível nesta análise.'
  }

  const lines: string[] = [
    'Informações do cadastro da empresa. São a fonte oficial, mas podem estar desatualizadas.',
  ]

  if (context.business_description) {
    lines.push(
      '',
      `Descrição do negócio: ${cleanLine(context.business_description)}`,
    )
  }

  if (context.method_steps.length > 0) {
    lines.push(
      '',
      context.method_name
        ? `Método comercial (${cleanLine(context.method_name)}), em ordem:`
        : 'Método comercial, em ordem:',
      ...context.method_steps.map(
        (step, index) =>
          `${index + 1}. ${cleanLine(step.name)}: ${cleanLine(step.objective)}`,
      ),
    )
  }

  if (context.products.length > 0) {
    lines.push(
      '',
      'Produtos ativos no catálogo:',
      ...context.products.map(
        (product) => {
          const price =
            formatMoney(
              typeof product.base_price === 'number' && product.base_price > 0
                ? product.base_price
                : null,
            )

          const line =
            product.category
              ? `- ${cleanLine(product.name)}: ${cleanLine(product.category)}`
              : `- ${cleanLine(product.name)}`

          return price
            ? `${line} (preço base ${price})`
            : line
        },
      ),
    )
  }

  if (context.facts.length > 0) {
    lines.push(
      '',
      'Fatos oficiais cadastrados:',
      ...context.facts.map(
        (fact) => `- ${cleanLine(fact)}`,
      ),
    )
  }

  return lines.join('\n')
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  pix: 'PIX',
  credito: 'cartão de crédito',
  debito: 'cartão de débito',
  dinheiro: 'dinheiro',
  boleto: 'boleto',
  transferencia: 'transferência',
  misto: 'misto (mais de um meio)',
  outro: 'outro',
}

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  avista: 'à vista',
  entrada_parcelas: 'entrada + parcelas',
  parcelado_sem_entrada: 'parcelado sem entrada',
  recorrente: 'recorrente / mensalidade',
  outro: 'outro',
}

function formatKanbanDate(
  value: string | null,
): string | null {
  if (!value || Number.isNaN(Date.parse(value))) {
    return null
  }

  return formatTranscriptTimestamp(value)
}

function formatMoney(
  value: number | null,
): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }

  return `R$ ${value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function cleanOptional(
  value: string | null,
): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const clean =
    cleanLine(value)

  return clean.length > 0
    ? clean
    : null
}

// Oportunidade criada há menos que isso do momento de referência: "criada
// agora" (a etapa atual é a da criação, não uma movimentação).
const JUST_CREATED_MS =
  10 * 60 * 1000

// v5 (F3): quando e por onde a oportunidade foi criada.
export function describeKanbanCreation(
  kanban: Pick<FullReadingKanbanContext, 'created_at' | 'created_via' | 'successor'>,
  referenceTime: string | null = null,
): string | null {
  const createdAt =
    formatKanbanDate(kanban.created_at ?? null)

  if (!createdAt) {
    return null
  }

  const via =
    kanban.successor === true
      ? ', como nova oportunidade de um ciclo anterior'
      : kanban.created_via === 'companion'
        ? ', pelo Companion'
        : kanban.created_via === 'yolen'
          ? ', no Yolen'
          : ''

  const created =
    Date.parse(kanban.created_at ?? '')

  const reference =
    referenceTime ? Date.parse(referenceTime) : Number.NaN

  const elapsed =
    reference - created

  const recency =
    Number.isFinite(elapsed) && elapsed >= 0 && elapsed < JUST_CREATED_MS
      ? ' (criada agora, minutos antes do momento de referência: a etapa atual é a da criação, não uma movimentação)'
      : ''

  return `Oportunidade criada em: ${createdAt}${via}${recency}`
}

export function buildKanbanSection(
  kanban: FullReadingKanbanContext | null,
  referenceTime: string | null = null,
): string {
  if (!kanban) {
    return 'A etapa do kanban não está disponível nesta análise.'
  }

  const lines: string[] = [
    'Registro da equipe no kanban do Yolen. Pode estar atrasado ou errado: compare com a conversa.',
    '',
    `Etapa atual: ${kanban.label}`,
  ]

  const creation =
    describeKanbanCreation(kanban, referenceTime)

  if (creation) {
    lines.push(creation)
  }

  const enteredAt =
    formatKanbanDate(kanban.stage_entered_at)

  if (enteredAt) {
    lines.push(`Nessa etapa desde: ${enteredAt}`)
  }

  const nextAction =
    cleanOptional(kanban.next_action)

  if (nextAction) {
    const nextActionDate =
      formatKanbanDate(kanban.next_action_date)

    lines.push(
      nextActionDate
        ? `Próxima ação registrada: ${nextAction} (para ${nextActionDate})`
        : `Próxima ação registrada: ${nextAction}`,
    )
  } else {
    lines.push('Próxima ação registrada: nenhuma')
  }

  if (kanban.won) {
    const details = [
      formatKanbanDate(kanban.won.won_at)
        ? `registrada em ${formatKanbanDate(kanban.won.won_at)}`
        : null,
      formatMoney(kanban.won.won_total)
        ? `valor ${formatMoney(kanban.won.won_total)}`
        : null,
      cleanOptional(kanban.won.product_name)
        ? `produto ${cleanOptional(kanban.won.product_name)}`
        : null,
      kanban.won.payment_method
        ? `forma de pagamento ${PAYMENT_METHOD_LABELS[kanban.won.payment_method] ?? kanban.won.payment_method}`
        : null,
      kanban.won.payment_type
        ? `tipo de pagamento ${PAYMENT_TYPE_LABELS[kanban.won.payment_type] ?? kanban.won.payment_type}`
        : null,
      typeof kanban.won.installments_count === 'number'
        ? `${kanban.won.installments_count} parcela(s)`
        : null,
    ].filter((item): item is string => item !== null)

    lines.push(
      details.length > 0
        ? `Venda registrada pela equipe: ${details.join(', ')}.`
        : 'Venda registrada pela equipe, sem detalhes de fechamento.',
    )
  }

  if (kanban.lost) {
    const lostAt =
      formatKanbanDate(kanban.lost.lost_at)

    const reason =
      cleanOptional(kanban.lost.lost_reason)

    lines.push(
      [
        lostAt
          ? `Perda registrada em ${lostAt}.`
          : 'Perda registrada.',
        reason
          ? `Motivo: ${reason}.`
          : 'Motivo não informado.',
      ].join(' '),
    )
  }

  if (kanban.paused) {
    const reason =
      cleanOptional(kanban.paused.paused_reason)

    lines.push(
      reason
        ? `Motivo da pausa: ${reason}.`
        : 'Motivo da pausa não informado.',
    )
  }

  if (kanban.canceled) {
    const canceledAt =
      formatKanbanDate(kanban.canceled.canceled_at)

    const reason =
      cleanOptional(kanban.canceled.canceled_reason)

    lines.push(
      [
        canceledAt
          ? `Cancelado em ${canceledAt}.`
          : 'Cancelado.',
        reason
          ? `Motivo: ${reason}.`
          : 'Motivo não informado.',
      ].join(' '),
    )
  }

  return lines.join('\n')
}

export function buildFullReadingUserPrompt({
  transcriptText,
  referenceTime,
  commercialContext,
  kanban = null,
}: {
  transcriptText: string
  referenceTime: string
  commercialContext: FullReadingCommercialContext | null
  kanban?: FullReadingKanbanContext | null
}): string {
  return [
    `Data e hora de referência (agora): ${formatTranscriptTimestamp(referenceTime)}, horário de Brasília.`,
    '',
    '<cadastro_da_empresa>',
    buildCommercialContextSection(commercialContext),
    '</cadastro_da_empresa>',
    '',
    '<kanban_do_yolen>',
    buildKanbanSection(kanban, referenceTime),
    '</kanban_do_yolen>',
    '',
    '<conversa>',
    transcriptText,
    '</conversa>',
  ].join('\n')
}


// Decisão anterior para a leitura de continuação (rodada 10, C2): só o que
// a leitura precisa para continuar — situação, cliente, pendências,
// oportunidades, contradições, fechamento, linha do tempo e etapa. Condução,
// como conduzir, mensagem e o que o gestor precisa saber são refeitos a
// partir das mensagens.
export const CONTINUATION_PREVIOUS_DECISION_FIELDS = [
  'fase_relacao',
  'venda_concluida',
  'vez_de',
  'situacao_resumo',
  'cliente',
  'pendencias',
  'oportunidades',
  'contradicoes_cadastro',
  'fechamento',
  'linha_do_tempo',
  'etapa_kanban_sugerida',
  'motivo_etapa',
  'revisar_em',
  'revisar_motivo',
] as const

export function previousDecisionForPrompt(
  decision: Record<string, unknown>,
): Record<string, unknown> {
  const compact: Record<string, unknown> = {}

  for (const field of CONTINUATION_PREVIOUS_DECISION_FIELDS) {
    if (field in decision) {
      compact[field] = decision[field]
    }
  }

  return compact
}

export function buildFullReadingContinuationUserPrompt({
  referenceTime,
  commercialContext,
  kanban = null,
  previousDecision,
  previousReadingAt,
  contextText,
  newText,
}: {
  referenceTime: string
  commercialContext: FullReadingCommercialContext | null
  kanban?: FullReadingKanbanContext | null
  previousDecision: Record<string, unknown>
  previousReadingAt: string
  contextText: string
  newText: string
}): string {
  return [
    `Data e hora de referência (agora): ${formatTranscriptTimestamp(referenceTime)}, horário de Brasília.`,
    'Esta é uma leitura de continuação (seção "Leitura de continuação").',
    '',
    '<cadastro_da_empresa>',
    buildCommercialContextSection(commercialContext),
    '</cadastro_da_empresa>',
    '',
    '<kanban_do_yolen>',
    buildKanbanSection(kanban, referenceTime),
    '</kanban_do_yolen>',
    '',
    `<leitura_anterior feita_em="${formatTranscriptTimestamp(previousReadingAt)}">`,
    JSON.stringify(previousDecisionForPrompt(previousDecision)),
    '</leitura_anterior>',
    '',
    '<conversa_contexto>',
    contextText.length > 0
      ? contextText
      : '(sem mensagens anteriores)',
    '</conversa_contexto>',
    '',
    '<mensagens_novas>',
    newText.length > 0
      ? newText
      : '(nenhuma mensagem nova desde a leitura anterior)',
    '</mensagens_novas>',
  ].join('\n')
}
