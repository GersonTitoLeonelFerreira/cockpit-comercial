# YOLEN — Motor de Coaching Comercial

## FASE 1 — Seller Execution Trace

Base: `main@fdd4d86a6c168e6960d53e93f25c3e584d76fe27`.

Branch: `chatgpt/coaching-engine-phase-1-seller-execution-trace`.

## 1. Missão

Criar uma camada canônica que descreva o que o vendedor realmente fez na conversa antes de qualquer julgamento de método, técnica ou coaching.

A Fase 1 não tenta ainda decidir toda a sequência comercial. Ela transforma mensagens humanas outgoing em eventos estruturados e observáveis.

Princípio:

> Pouca fala do cliente não pode significar pouca análise do vendedor.

## 2. Fonte de verdade

O trace consome exclusivamente `CompanionDiagnosticInput.conversation.messages`.

Ele não lê:

- DOM;
- viewport;
- texto renderizado da extensão;
- ManyChat diretamente;
- WhatsApp diretamente.

Somente mensagens `outgoing` com `author_kind=human_agent` entram como ações do vendedor.

Automação nunca é atribuída ao vendedor humano.

## 3. Contrato

Cada `SellerExecutionEvent` registra:

- `message_id`;
- `occurred_at`;
- `action_type`;
- `commercial_objective`;
- `method_stage=null` nesta fase;
- `target_commitment`;
- `content_summary`;
- intenção conhecida do cliente antes da ação;
- qualidade observável;
- sequência;
- outcome observado;
- sinais estruturais;
- IDs de evidência.

### 3.1 Por que method_stage permanece null

A etapa do método não deve ser inferida apenas por keyword.

A Fase 2 será responsável por cruzar Seller Execution Trace + método publicado + estado comercial e decidir sequência/método.

Isso evita criar uma segunda interpretação prematura.

## 4. Ações reconhecidas

O contrato já comporta a taxonomia final de ações:

- rapport/opening;
- discovery;
- qualification;
- clarification;
- factual response;
- value explanation;
- product presentation;
- price presentation;
- objection probe/response;
- factual proof;
- commitment request;
- scheduling open question;
- scheduling guided choice;
- follow-up;
- reengagement;
- close request;
- confirmation;
- stage jump/unrelated offer;
- pressure/false urgency;
- unknown.

Nesta fase, o classificador deliberadamente só afirma as categorias que consegue sustentar de forma determinística.

## 5. Qualidade observável

A camada registra separadamente:

- relevância ao último intent conhecido;
- especificidade;
- qualidade da pergunta;
- fricção;
- risco de pressão.

`persuasion_quality` permanece `unknown` porque não deve ser inferida por regex.

## 6. Sequência

A Fase 1 já detecta sinais estruturais que não exigem julgamento metodológico:

- pergunta aberta de agendamento já feita;
- escolha guiada usada;
- silêncio do cliente antes da próxima ação do vendedor;
- repetição da mesma ação sem resposta do cliente;
- abandono de um objetivo explícito;
- oferta prematura de produto/preço após interesse genérico;
- cliente com contexto curto e ação rica do vendedor;
- descoberta depois de intenção explícita de fechamento;
- resposta genérica candidata ao transplant test.

`skips_required_step` permanece `null`.

A Fase 2 será dona desse julgamento.

## 7. Outcome

A ação do vendedor não é avaliada isoladamente.

O trace liga a ação ao primeiro resultado observável antes da próxima ação humana:

- `customer_replied`;
- `customer_rejected_options`;
- `customer_accepted`;
- `customer_silent_before_next_seller_action`;
- `no_outcome_observed`.

Isso permite diferenciar:

- vendedor executou e precisa esperar;
- vendedor executou e recebeu fato novo;
- vendedor executou e abandonou o objetivo antes de obter resposta.

## 8. C01-C10

A implementação é testada sobre o corpus da Fase 0.

Cobertura focal:

- C01: pergunta aberta + silêncio + quebra por envio de planos;
- C02: confiança do cliente baixa, confiança de execução alta;
- C03: escolha guiada;
- C04: opções rejeitadas como fato novo;
- C05: preço prematuro;
- C06: descoberta tardia depois de intenção de fechamento;
- C07: objection probe;
- C08/C10: sem ação do vendedor = baixa confiança de execução;
- C09: resposta genérica candidata ao transplant test.

## 9. Invariantes preservadas

A Fase 1 não altera:

- Core;
- adapters;
- UI;
- Commercial Reading;
- Commercial Reasoning;
- Decision State;
- mensagem gerada;
- CRM;
- Agenda;
- rollout ManyChat.

O novo módulo ainda não é consumido por presenter ou gerador.

Isso é intencional: primeiro o trace precisa ser provado isoladamente.

## 10. Gate de saída

A Fase 1 está pronta para encerramento quando:

1. trace ignora automação;
2. C01 reconstrói pergunta aberta, silêncio e quebra;
3. C02 separa confiança do cliente da execução;
4. C03 não inventa repetição;
5. C04 reconhece fato novo;
6. C05/C06 identificam avanço inadequado observável;
7. C07 reconhece ação positiva concreta;
8. C09 produz sinal para genericness;
9. C08/C10 não inventam análise do vendedor inexistente;
10. testes focais passam em Node 22 + UTC.

Próximo passo: Fase 2 — Situações + Sequência + Método, conectando o trace ao método publicado e aos signals/situations da Intelligence Library.
