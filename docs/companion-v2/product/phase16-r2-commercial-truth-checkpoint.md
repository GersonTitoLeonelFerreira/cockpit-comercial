# FASE 16-R2 — Checkpoint de produto

## Comportamento que muda

A Yolen deixa de aceitar silenciosamente uma leitura comercial incompatível com evidência forte da conversa e passa a separar, no mesmo fluxo, relevância comercial, papel do interlocutor, prospect real, estágio mínimo e responsabilidade do próximo movimento.

## Caso 1 — plano + valor + pagamento + objeção

**Antes (falha observada no smoke):** uma conversa podia conter plano, preço, link/pagamento e objeção e ainda chegar seller-facing como `non_commercial`, neutralizando memória, CRM, agenda e orientação.

**Depois (expected):** múltiplos sinais independentes geram `requires_commercial_relevance=true`. Se o modelo responder `non_commercial` ou `uncertain`, o `COMMERCIAL_TRUTH_GUARD` rejeita a saída e força uma segunda tentativa com reparo explícito. Sinais de etapa avançada impõem piso `negociacao` quando o CRM ainda está abaixo disso.

## Caso 2 — "minha irmã quer..."

**Antes (falha observada no smoke):** interlocutor e prospect podiam ser tratados como a mesma pessoa.

**Depois (expected):** a oportunidade continua comercial, mas o estado precisa registrar simultaneamente:

- `commercial_party.current_contact.intermediary`;
- `commercial_party.related.prospect`.

A ausência desses dois papéis torna a saída inválida e dispara reparo. O campo legado `commercial_role=buyer` continua representando apenas o lado comprador da relação; os fatos `commercial_party.*` preservam o papel fino sem quebrar contratos antigos.

## Caso 3 — vendedor já perguntou e agora espera

**Antes (risco de produto):** fato ainda pendente podia ser confundido com ação ainda não feita pelo vendedor, gerando repetição artificial de pergunta/follow-up.

**Depois (expected):** a fotografia determinística de responsabilidade separa:

- `pending_fact`;
- `seller_action_already_performed`;
- `waiting_on`.

Exemplo: se a última mensagem outgoing do vendedor contém uma pergunta, `pending_fact=customer_response`, `seller_action_already_performed=true` e `waiting_on=customer`. O modelo recebe essa fotografia como guard e não deve recomendar repetir a ação.

## Caso 4 — cliente diz "vou verificar o cartão e te aviso"

**Expected:** a fala não conclui pagamento, não resolve objeção automaticamente e não transfere a próxima ação para o vendedor. A fotografia fica `pending_fact=customer_commitment` e `waiting_on=customer`.

## Caso negativo — "o preço do almoço aumentou"

**Expected:** uma palavra comercial isolada não basta. Sem combinação de sinais, a camada determinística não força `commercial_relevance=commercial` e o fail-closed original permanece válido.

## Critério de saída da R2

A R2 só pode ser considerada encerrada quando build e testes estiverem verdes e estes invariantes forem preservados:

1. evidência comercial forte não pode virar falso `non_commercial`;
2. continuidade direta de negociação não pode ser perdida por uma resposta curta;
3. interlocutor e prospect não podem ser colapsados em oportunidade de terceiro;
4. estágio não pode ficar artificialmente abaixo dos eventos de negócio já comprovados;
5. pendência da venda não pode ser confundida com ação do vendedor já executada;
6. conversas pessoais com palavras isoladas de preço/plano continuam protegidas contra falso positivo.
