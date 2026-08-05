# Fase 5.1 — Memória Comercial e Copiloto Contextual

## Estado

Este documento define o novo direcionamento funcional do motor comercial da Yolen.

Esta etapa não ativa um novo motor, não altera CRM, não altera Agenda, não cria migration e não substitui o Companion V1.

## Problema identificado

O motor anterior tratava sinais comerciais como ordens concorrentes.

Exemplos do comportamento rejeitado:

- o agendamento dominava toda a orientação;
- uma nova pergunta substituía todo o histórico;
- o método comercial era exibido, mas não comandava a estratégia;
- cada erro exigia uma nova regra específica no prompt;
- um resumo correto podia produzir uma decisão comercial errada.

Uma negociação humana pode possuir simultaneamente:

- interesse ativo;
- compromisso confirmado;
- pergunta pendente;
- objeção;
- restrição financeira;
- necessidade ainda não explorada;
- dúvida sobre a solução;
- mudança de intenção.

Nenhum desses elementos deve apagar automaticamente os demais.

## Objetivo da Fase 5.1

A Yolen deve compreender continuamente o estado da oportunidade e orientar o vendedor considerando:

1. o histórico relevante;
2. o que mudou nas mensagens novas;
3. o que continua válido;
4. o método comercial configurado;
5. as informações oficiais da empresa;
6. as necessidades humanas do cliente;
7. os compromissos já assumidos;
8. as incertezas existentes.

A pergunta central do motor será:

> Considerando tudo que está acontecendo simultaneamente, qual é a melhor condução comercial agora?

## Princípio de atualização contextual

Uma mensagem nova não substitui automaticamente o contexto anterior.

O contexto anterior também não pode apagar uma mudança nova.

Cada mensagem poderá:

- adicionar um fato;
- alterar um fato anterior;
- resolver uma dúvida;
- criar uma pergunta;
- criar ou modificar uma objeção;
- confirmar, alterar ou cancelar um compromisso;
- acrescentar uma restrição;
- mudar a prioridade comercial;
- não produzir mudança comercial relevante.

## Estado comercial acumulado

O futuro motor deverá manter por ciclo:

- objetivo atual do cliente;
- necessidades confirmadas;
- informações relevantes já conhecidas;
- perguntas abertas;
- objeções e restrições;
- compromissos e respectivos estados;
- sinais comerciais;
- fatos oficiais aplicáveis;
- etapa atual do método comercial;
- prioridade atual;
- estratégia recomendada;
- incertezas e nível de confiança.

## Fatos, inferências e estratégia

### Fatos

São informações diretamente sustentadas por mensagens.

Exemplos:

- orçamento máximo de R$ 300 por mês;
- demonstração confirmada para quinta-feira às 15h;
- cliente pediu cancelamento;
- vendedor ainda não respondeu à pergunta de preço.

### Inferências

São interpretações que podem estar erradas.

Exemplos:

- possível sensibilidade a preço;
- possível insegurança sobre implantação;
- possível comparação com concorrente.

Toda inferência deverá possuir evidência e nível de confiança.

### Estratégia

A estratégia deverá integrar fatos, inferências, método comercial, compromissos, riscos e incertezas.

Ela não poderá ser derivada de uma palavra isolada ou de uma regra absoluta.

## Papel do método comercial

O método comercial deixa de ser apenas um bloco do diagnóstico.

Ele passa a comandar a forma de condução.

Por exemplo, diante de uma pergunta de preço, o método poderá determinar:

- informar imediatamente o preço oficial;
- contextualizar primeiro a solução;
- fazer uma pergunta de qualificação;
- preservar uma demonstração;
- explicar por que o investimento depende do formato contratado.

Não haverá uma regra universal de sempre informar ou nunca informar o preço.

## Fluxo futuro

```text
mensagens novas no ledger
↓
estado comercial anterior
↓
identificação das mudanças
↓
novo estado acumulado
↓
aplicação do método comercial
↓
estratégia integrada
↓
orientação ao vendedor
↓
sugestões estruturadas para CRM e Agenda
↓
confirmação humana
```

## Separação de responsabilidades

### Responsabilidade da IA

- compreender linguagem natural;
- identificar mudanças;
- relacionar mensagens;
- reconhecer ambiguidades;
- interpretar necessidades e sinais;
- aplicar o método comercial;
- propor uma estratégia humana;
- explicar a orientação com evidências.

### Responsabilidade determinística da Yolen

- empresa, usuário e ciclo corretos;
- identidade e versão das mensagens;
- permissões;
- referências canônicas;
- timezone;
- consistência da Agenda;
- etapas proibidas;
- idempotência;
- persistência;
- auditoria;
- confirmação humana.

## Experiência esperada no Companion

A interface deverá apresentar nesta ordem:

1. O que mudou agora.
2. Momento atual da negociação.
3. O que o cliente precisa.
4. Estratégia recomendada.
5. Mensagem ou pergunta sugerida, quando fizer sentido.
6. Compromissos preservados.
7. Perguntas, objeções e incertezas abertas.
8. Sugestões de CRM e Agenda no final.

## Critério de qualidade

Um texto bem escrito não é suficiente.

O motor será avaliado pela qualidade da decisão comercial que ajuda o vendedor a tomar.

Serão avaliados:

- preservação do contexto;
- compreensão das mudanças;
- integração de verdades simultâneas;
- coerência com o método;
- qualidade da orientação;
- ausência de fatos inventados;
- reconhecimento de incerteza;
- utilidade prática para o vendedor.

## Garantia possível

Não existe garantia de interpretação correta em cem por cento das conversas.

A arquitetura deverá garantir que:

- a IA declare incerteza quando necessário;
- nenhuma interpretação altere o CRM automaticamente;
- nenhuma interpretação altere a Agenda automaticamente;
- nenhuma informação comercial seja inventada;
- compromissos só mudem com evidência;
- o vendedor possa revisar a orientação;
- toda ação operacional exija validação e confirmação.

## Gate de avanço

O runtime da Fase 5.1 só poderá começar depois que:

- este contrato for revisado;
- existir um corpus com cenários comerciais variados;
- os resultados esperados forem avaliados comercialmente;
- ficar comprovado que nenhum exemplo foi transformado em regra universal.
