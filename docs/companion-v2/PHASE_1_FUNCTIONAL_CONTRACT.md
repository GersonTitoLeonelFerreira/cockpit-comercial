# Fase 1 — Contrato funcional da inteligência comercial

## Estado do contrato

| Campo | Valor |
|---|---|
| Produto | Yolen Companion V2 |
| Versão do contrato | `phase-1-v1` |
| Aprovação funcional | `APROVADO CONTRATO FUNCIONAL FASE 1` |
| Data da aprovação | 2026-07-30 |
| Motor ativo em produção | `v1` |
| Efeito no CRM | Nenhum; este contrato apenas define análise e recomendação |

Este documento congela o comportamento comercial esperado da inteligência antes
da criação do motor V2. Ele não é um prompt, não executa IA e não autoriza
mudança em etapa, agenda, ciclo ou qualquer outro dado do CRM.

## Papel da Yolen

A Yolen deve agir como um gerente comercial acompanhando a conversa. Sua função
não é procurar palavras isoladas para classificar o lead. A ordem obrigatória da
análise é:

1. entender o que está acontecendo;
2. identificar o que o cliente quer;
3. avaliar o que o vendedor descobriu e respondeu;
4. identificar lacunas, objeções e erros comprovados;
5. avaliar o avanço no método comercial configurado pela empresa;
6. avaliar se a solução apresentada combina com a necessidade;
7. recomendar o próximo movimento;
8. somente depois avaliar se existem evidências para sugerir CRM.

Uma sugestão de CRM nunca é uma ordem de aplicação.

## Entradas obrigatórias

| Entrada | Finalidade | Regra quando ausente |
|---|---|---|
| Empresa | Selecionar método, produtos e regras corretos | Análise bloqueada se a empresa não puder ser determinada |
| Conversa | Fornecer mensagens atuais e contexto histórico | Análise bloqueada quando não houver conteúdo utilizável |
| Identidade da mensagem | Diferenciar mensagens, versões, edição e exclusão | Mensagem sem identidade confiável não sustenta conclusão |
| Ordem da mensagem | Preservar o desfecho, inclusive no mesmo minuto | Empate não pode ser resolvido por suposição |
| Versão e estado | Usar somente a fotografia mais recente | Versão superada ou apagada não sustenta diagnóstico |
| Direção | Separar fala do cliente e fala do vendedor | Conteúdo sem direção não prova aceite do cliente |
| Tipo e transcrição | Permitir texto e áudio | Áudio sem transcrição limita ou bloqueia a análise |
| Etapa atual do CRM | Comparar estado atual e eventual sugestão | Sem etapa atual, pode haver diagnóstico, mas não sugestão de mudança |
| Horário de referência | Resolver datas e impedir agenda vencida | Agenda não pode ser sugerida sem referência temporal confiável |
| Método comercial da empresa | Avaliar etapa, avanço e saltos do método | Registrar `method_not_configured`; não inventar etapas |
| Produtos e condições | Avaliar adequação da solução | Registrar `product_information_missing`; adequação fica `unknown` |

As configurações comerciais serão fornecidas pela Fase 2 e administradas pela
tela da Fase 3. O motor não poderá gravar método ou produto fixo em código.

## Saída funcional

O oráculo de cada conversa contém os blocos abaixo.

### 1. Estado da análise

#### `analysis_status`

Valores:

- `complete`: as conclusões apresentadas possuem contexto suficiente;
- `limited`: parte da análise é possível, mas existem limitações declaradas;
- `blocked`: não há base segura para diagnosticar intenção ou sugerir CRM.

#### `analysis_limitations`

Lista explícita das limitações. Deve ser vazia em uma análise `complete` e
obrigatoriamente preenchida em análise `limited` ou `blocked`.

Exemplos:

- `audio_without_transcription`;
- `method_not_configured`;
- `product_information_missing`;
- `conversation_context_insufficient`.

Falta de informação nunca pode ser transformada em fato.

### 2. Relevância comercial

#### `commercial_relevance`

Valores:

- `commercial`: existe assunto comercial comprovado;
- `non_commercial`: o assunto é pessoal ou alheio à operação de venda;
- `uncertain`: o conteúdo disponível não permite decidir com segurança.

Conversa `non_commercial` exige:

- `guidance.intervention_required=false`;
- `recommended_question=null`;
- `suggested_message=null`;
- `crm_suggestion.should_change_crm_stage=false`;
- `crm_suggestion.recommended_status=null`.

### 3. Confiança

#### `confidence`

Valores `high`, `medium` ou `low`. A confiança mede a força das evidências, não
a importância da oportunidade.

Uma conversa limitada por método ausente, produto ausente ou contexto
insuficiente não pode receber confiança alta.

### 4. Intenção do cliente

#### `customer_intent`

Objeto com:

- `summary`: o que o cliente está tentando entender, resolver ou conseguir;
- `evidence_message_ids`: falas atuais que sustentam a conclusão.

Use `null` quando não existir fala suficiente do cliente ou quando o conteúdo
estiver bloqueado, como em um áudio sem transcrição.

### 5. Necessidades

#### `needs`

Lista de necessidades comprovadas. Cada item contém `summary` e
`evidence_message_ids`.

Necessidade não é uma hipótese genérica. “Quero ganhar força treinando três
vezes por semana” permite registrar força e disponibilidade. “Quero
informações” não permite inventar objetivo, orçamento ou urgência.

### 6. Informações ausentes

#### `missing_information`

Lista do que ainda precisa ser descoberto. Cada item contém:

- `summary`: informação que falta;
- `reason`: por que ela é necessária ou por que ainda não está disponível.

Esse bloco registra ausência. Por isso, não exige evidência positiva de algo que
não foi dito.

### 7. Perguntas ignoradas

#### `unanswered_questions`

Lista somente de perguntas do cliente que continuam sem resposta adequada no
desfecho atual.

Uma pergunta:

- sai da lista quando é respondida;
- permanece quando o vendedor desvia, responde parcialmente ou muda de assunto;
- não pode ser confundida com uma informação que o vendedor ainda precisa
  descobrir.

### 8. Objeções ativas

#### `active_objections`

Lista somente das objeções ainda abertas no final da conversa. Cada item contém
resumo e evidência.

Uma objeção resolvida não permanece ativa. “Vou pensar” pode indicar uma trava,
mas não revela automaticamente qual é a objeção real; nesse caso, a informação
ausente também deve ser registrada.

### 9. Avaliação do vendedor

#### `seller_assessment.strengths`

Acertos comprovados, como:

- diagnóstico pertinente;
- resposta direta;
- acolhimento da objeção;
- conexão entre necessidade e solução;
- avanço comercial coerente.

#### `seller_assessment.risks`

Riscos comprovados. Tipos iniciais:

- `ignored_question`;
- `partial_answer`;
- `repeated_answered_question`;
- `contradiction`;
- `excessive_pressure`;
- `premature_presentation`.

Toda crítica exige `evidence_message_ids`. Se o vendedor fez um bom trabalho, a
Yolen deve reconhecer o acerto e pode manter `risks=[]`.

### 10. Método comercial

#### `sales_method`

Campos:

- `configured`: informa se a empresa forneceu um método;
- `current_step`: etapa atual do método ou `null`;
- `completed_steps`: etapas comprovadamente concluídas;
- `skipped_steps`: etapas puladas;
- `evidence_message_ids`: falas que sustentam a avaliação.

Método comercial e etapa do CRM são conceitos separados. Um vendedor pode estar
em `diagnosticar` no método e o lead continuar na mesma etapa do CRM.

Quando não existir método configurado:

- `configured=false`;
- `current_step=null`;
- etapas concluídas e puladas ficam vazias;
- a limitação `method_not_configured` é declarada;
- nenhuma etapa de método é inventada.

### 11. Adequação da solução

#### `solution_fit`

Valores:

- `fit`: necessidade e solução apresentam correspondência comprovada;
- `partial_fit`: existe correspondência parcial ou condicionada;
- `misfit`: a solução contradiz uma necessidade comprovada;
- `unknown`: faltam informações para avaliar.

O bloco também contém `rationale` e `evidence_message_ids`.

Preço apresentado não prova adequação. O vendedor precisa conectar atributos
reais do produto às necessidades comprovadas do cliente.

### 12. Orientação

#### `guidance.intervention_required`

Indica se a Yolen realmente precisa orientar o vendedor. A inteligência pode e
deve concluir que nenhuma intervenção é necessária.

#### `guidance.next_move`

Objetivo comercial recomendado. Pode ser `null` em conversa não comercial ou
quando nenhum movimento for necessário.

#### `guidance.recommended_question`

Melhor pergunta para avançar. Deve ser `null` quando:

- nenhuma intervenção é necessária;
- o vendedor precisa primeiro responder a uma pergunta do cliente;
- não existe base segura para formular uma pergunta.

Pergunta já respondida nunca pode ser recomendada novamente.

#### `guidance.suggested_message`

Mensagem curta, contextual e específica. Pode ser `null`, inclusive em
conversa comercial, quando uma mensagem pronta não agrega valor ou a análise
está bloqueada.

### 13. Sugestão de CRM

#### `crm_suggestion.should_change_crm_stage`

Booleano que responde somente se existem evidências para recomendar uma etapa
diferente da atual.

Ele substitui o antigo `apply_crm_change`. O campo anterior foi removido do
contrato porque confundia recomendação e execução.

#### `crm_suggestion.recommended_status`

Etapa sugerida ou `null`.

Deve ser `null` quando:

- a conversa é não comercial;
- a análise está bloqueada;
- o contexto não permite recomendar etapa;
- não existe mudança a sugerir e registrar uma etapa seria mera repetição sem
  valor.

Uma etapa pode aparecer com `should_change_crm_stage=false` somente para
explicar que o estado atual continua coerente. Isso não autoriza escrita.

#### `crm_suggestion.next_action_required`

Indica se a análise encontrou necessidade de próxima ação. Não cria agenda
sozinha.

#### `crm_suggestion.expected_next_action_at`

Data e horário resolvidos. Só existe quando:

- o cliente aceitou ou pediu o compromisso;
- há data, horário ou período concreto;
- o horário resolvido é futuro em relação ao horário de referência.

#### `crm_suggestion.prohibited_statuses`

Etapas que seriam falsos positivos naquele caso.

#### `crm_suggestion.requires_human_confirmation`

É sempre `true`. Ganho, perda, agenda ou qualquer outra etapa dependem de
confirmação humana fora da inteligência.

### 14. Evidências

#### `evidence_message_ids`

Lista das mensagens que sustentam a conclusão geral.

Toda evidência deve:

- existir na conversa;
- apontar para a versão atual;
- estar ativa;
- nunca usar uma mensagem apagada ou superada;
- distinguir fala do cliente e fala do vendedor;
- respeitar a ordem da conversa.

## Regras temporais e de versão

1. A versão mais recente substitui as versões anteriores da mesma mensagem.
2. Mensagem apagada não sustenta intenção, objeção, ganho, perda ou agenda.
3. Mensagens no mesmo minuto são ordenadas por sequência estável.
4. O histórico pode contextualizar a análise.
5. O desfecho recente possui maior peso para o estado atual.
6. Uma afirmação antiga de fechamento não prevalece sobre uma correção atual.
7. Conteúdo carregado por rolagem não pode ser tratado automaticamente como
   mensagem nova.

## Regras invioláveis de decisão

- Conversa pessoal não gera orientação comercial.
- Palavra isolada como “sexta”, “horário” ou “retorno” não cria Agenda.
- Convite feito somente pelo vendedor não é agendamento.
- “Vou pensar” não é Agenda, Ganho ou Perdido.
- “Eu retorno” sem data não é Agenda.
- Proposta enviada não prova resposta, negociação concluída ou venda.
- Pergunta de preço não classifica automaticamente Negociação.
- Pergunta já respondida não pode ser sugerida novamente.
- Pergunta do cliente ignorada deve ser respondida antes da retomada da venda.
- Objeção resolvida não continua ativa.
- Crítica ao vendedor exige evidência.
- Bom diagnóstico não recebe crítica inventada.
- Produto apresentado sem diagnóstico não recebe adequação presumida.
- Informações insuficientes não autorizam conclusão.
- Áudio sem transcrição não autoriza interpretação do conteúdo.
- Ganho exige evidência explícita de compra ou pagamento.
- Perda exige recusa ou encerramento explícito.
- Sugestão de CRM exige confirmação humana.
- Nenhum campo deste contrato executa alteração no sistema.

## Exemplos de referência

| Conversa | Diagnóstico esperado |
|---|---|
| Cliente conversa sobre pizza | Não comercial; sem orientação; sem mensagem; CRM `null` |
| Cliente pergunta preço | Interesse em preço; diagnóstico ainda ausente; não vira Negociação automaticamente |
| Cliente pergunta horário e recebe resposta correta | Reconhecer resposta; intervenção desnecessária; sem Agenda |
| Cliente pergunta sobre multa e o vendedor oferece desconto | Pergunta ignorada; risco de pressão; responder o contrato primeiro |
| Vendedor repete o objetivo já informado | Registrar repetição; aprofundar a necessidade em vez de perguntar novamente |
| Vendedor diagnostica e conecta solução | Reconhecer acertos; adequação `fit`; não inventar crítica |
| Cliente diz “vou pensar” | Trava ainda desconhecida; sem Agenda, Ganho ou Perda |
| Cliente diz “eu retorno” sem data | Retorno vago; não criar Agenda |
| Cliente aceita quinta-feira às 14h | Evidência para sugerir Agenda futura, sempre com confirmação |
| Cliente confirma pagamento | Evidência para sugerir Ganho, sempre com confirmação |
| Cliente pede encerramento por falta de interesse | Evidência para sugerir Perdido, sempre com confirmação |
| Áudio sem transcrição | Análise bloqueada; intenção e CRM `null` |

## Corpus vinculante

O arquivo `docs/companion-v2/corpus/cases.json` materializa este contrato em 30
conversas sintéticas:

- 14 casos anteriores preservados;
- 16 casos comerciais e comportamentais adicionados;
- 28 coberturas obrigatórias;
- nenhuma conversa ou dado real.

O teste `app/lib/companion/regression-corpus.test.mjs` impede regressões no
contrato, nas evidências, nas regras de `null` e na confirmação humana.

## Critério de encerramento da Fase 1

A Fase 1 é considerada funcionalmente aprovada quando:

- este contrato estiver integrado à `main`;
- o corpus V2 contiver as 30 conversas;
- os testes do contrato passarem;
- `apply_crm_change` não existir no contrato;
- runtime, extensão, prompt e banco permanecerem intactos;
- a aprovação funcional de 2026-07-30 estiver registrada.

Essa conclusão autoriza iniciar a modelagem da Fase 2. Ela não autoriza construir
ou ativar o motor V2.
