# Fase 16.9 — gate de qualidade factual da análise

Esta nota registra o estado do gate depois da recuperação seller-facing da aba ANÁLISE.

## PDF/attachment como verdade comercial

O PDF visível no WhatsApp não é um detalhe de UX. Quando o cliente pediu um material e o vendedor o enviou, a existência do envio altera diretamente a leitura comercial: a Yolen não pode continuar tratando esse material como pendente.

Representação canônica adotada:

```text
[Arquivo: nome.ext]
```

A evidência prova somente que o arquivo nomeado foi enviado naquele turno. Ela não autoriza inferir o conteúdo interno do documento.

O caso `attachment-only` do WhatsApp pode não possuir `data-pre-plain-text` nativo. `phase16-9-runtime-guard.js` materializa um nó sintético compatível com o pipeline canônico. O primeiro scan agora é defasado em relação ao bootstrap do `content-script.js`, para que a mutação sintética seja observada pelo pipeline normal e gere capture ingestion em vez de existir apenas no DOM. A leitura de filename também tolera a quebra visual em múltiplos nós/linhas.

O E3 obrigatório deve provar o caminho até o payload de `INGEST_CAPTURE_MESSAGES`, não apenas a criação de um `span` no DOM.

## Responsabilidade comercial

`CompanionClientContext.waiting` continua sendo um sinal operacional determinístico baseado na cronologia das mensagens. Ele não deve ser transformado em um segundo motor semântico.

Por isso, a camada canônica de responsabilidade agora impede que `seller_waiting_for_customer` sobrescreva uma decisão quando a Commercial Reading ainda prova ação pendente do vendedor, por exemplo:

- `customer.open_questions` ativo;
- `unanswered_question`;
- `repetition` provocada por ausência de conclusão;
- `missing_next_commitment`;
- `missed_commitment`.

Uma mensagem outgoing genérica não transfere responsabilidade ao cliente quando um pedido anterior continua aberto.

A mesma regra é aplicada ao Commercial Reasoning e à filtragem de coaching da AnalysisViewModel, para evitar divergência entre AGORA, ANÁLISE e reasoning seller-facing.

## Seller strengths

Permanece obrigatório:

- seller strength exige evidência outgoing real do vendedor;
- mensagem incoming pode contextualizar, mas não provar discovery ou outra ação atribuída ao vendedor;
- `respected_space` não é mérito quando existe pedido/pergunta pendente anterior;
- falha material tem precedência sobre cordialidade superficial.

## Gate da Carla

A Carla é caso de regressão, não regra hardcoded. Uma nova análise deve reconhecer semanticamente:

- grade solicitada e já enviada;
- modalidade, dia, horário e quantidade de pessoas já conhecidos;
- pedido explícito e repetido de agendamento;
- retomada genérica posterior como perda de contexto;
- responsabilidade atual do vendedor por concluir/verificar a próxima etapa.

Não pode recomendar reenviar a grade ou reperguntar dados já fornecidos sem motivo novo.
