# YOLEN — Motor de Coaching Comercial

## FASE 2 — Situações, Sequência e Método

Base: `main@69a7bf4bbe80ffd7347707cf26c7f333fa97148b`.

Branch: `chatgpt/coaching-engine-phase-2-sequence-method`.

## 1. Missão

Conectar o Seller Execution Trace da Fase 1 ao Commercial Reasoning sem criar uma segunda fonte de verdade para método, estágio ou contexto comercial.

A Fase 2 traduz execução observada em:

- situations;
- signals;
- restrições determinísticas;
- estado de sequência;
- referência ao método canônico já produzido pelo Commercial Reading.

## 2. Regra de ownership

O novo `SellerSequenceMethodAssessment` não recalcula o método.

Para método, a fonte permanece:

- `CommercialReading.method.current_stage`;
- `CommercialReading.method.adherence`;
- `CommercialReading.method.recovery_guidance`;
- configuração publicada em `diagnostic_input.commercial_context.sales_method`.

O trace adiciona evidência sobre sequência observável, não substitui a leitura canônica.

## 3. Conexão com a Intelligence Library

A auditoria da Fase 0 mostrou que a biblioteca já conhecia sinais que o reasoning não emitia.

A Fase 2 passa a conectar, quando sustentado pelo trace:

- `scheduling_choice`;
- `seller_already_asked_open_question`;
- `waiting_for_customer`;
- `seller_action_already_performed`;
- `waiting_on_customer`;
- `duplicate_followup`;
- `sequence_break`;
- `premature_product_offer`;
- `missing_context`;
- `customer_intent_hot`;
- `microcommitment_available`;
- `seller_message_overloaded`;
- `client_sparse_seller_rich`;
- `late_discovery_after_close_intent`;
- `generic_response_candidate`;
- `customer_rejected_options`.

## 4. Disponibilidade real continua protegida

A Fase 2 não emite `multiple_valid_options` apenas porque encontrou horários escritos em uma mensagem.

Isso é intencional.

Mensagem do vendedor prova que opções foram mencionadas; não prova que a disponibilidade atual continua válida.

Assim, a Fase 2 pode reconhecer que escolha guiada é uma técnica potencial, mas a validação de aplicabilidade e facts required fica para a Fase 3.

## 5. Espera versus fato novo

A camada diferencia:

- ação final com target commitment + nenhum outcome: `waiting_for_customer`;
- cliente respondeu/rejeitou/aceitou: `customer_fact_after_action=true`.

Isso evita congelar `wait` depois que apareceu fato novo.

## 6. Restrições determinísticas

O reasoning recebe limites derivados da sequência antes de produzir orientação seller-facing, por exemplo:

- não repetir ação sem resposta;
- não abandonar objetivo ativo;
- não repetir opções rejeitadas;
- não prescrever produto/preço no lugar da descoberta;
- não prolongar descoberta quando já existe intenção explícita de fechamento.

Essas restrições entram em `do_not_do`, sem substituir coaching, método ou mensagem.

## 7. Integração

`commercial-reasoning-engine.ts` agora:

1. constrói o Seller Execution Trace;
2. constrói Seller Sequence + Method Assessment;
3. combina seus signals/situations com os signals já existentes;
4. usa o conjunto combinado no ranking da Intelligence Library;
5. incorpora as restrições determinísticas em `do_not_do`.

Nenhum presenter, Core, adapter ou gerador de mensagem foi alterado.

## 8. Casos focais

### C01

Pergunta aberta + silêncio + envio de planos:

- reconhece `scheduling_choice`;
- reconhece `seller_already_asked_open_question`;
- detecta `sequence_break`;
- libera `technique.guided_choice` para o ranking;
- não cria `multiple_valid_options`.

### C03

Escolha guiada final sem resposta:

- `waiting_for_customer`;
- `seller_action_already_performed`;
- `waiting_on_customer`;
- `technique.commitment_wait`.

### C04

Cliente rejeita as opções:

- fato novo;
- espera não fica congelada;
- opções rejeitadas não devem ser repetidas.

### C05

Preço antes da necessidade:

- `discovery_gap`;
- `missing_context`;
- `technique.discovery_before_prescription`.

### C06

Cliente quer fechar e vendedor continua descobrindo:

- `late_discovery_after_close_intent`;
- `customer_intent_hot`;
- restrição contra descoberta tardia.

## 9. Gate de saída

A Fase 2 está pronta para merge quando:

1. testes da Fase 0 continuam verdes;
2. Seller Execution Trace continua verde;
3. assessment de sequência/método passa;
4. integração com Commercial Reasoning passa;
5. nenhum Core/adapter/UI foi alterado;
6. nenhum fato de disponibilidade é inventado.

Próxima fase: Fase 3 — Commercial Techniques Engine, com applicability gates e ranking contextual obrigatório antes da escolha de técnica.
