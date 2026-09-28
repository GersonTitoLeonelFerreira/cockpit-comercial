# Companion — Sales Expert Quality Wave 2

## Missão

Elevar o Companion de um motor comercial correto para um copiloto que raciocina como especialista em vendas, sem criar outro Core, outro cérebro por canal ou uma arquitetura paralela.

A autoridade continua única: Conversation/State → Commercial Reading → Seller Execution Trace → Sequence/Method → Commercial Reasoning → Coaching → Message Strategy → Message Generation/Critic.

## Princípios de produto preservados

- uma leitura comercial compartilhada entre WhatsApp e ManyChat;
- AGORA prioriza uma decisão, uma ação e uma justificativa curta;
- detalhes, evidências e técnica ficam em progressive disclosure;
- nenhum enum, sinal ou taxonomia interna deve aparecer para o vendedor;
- conhecimento de empresa/produto só entra quando for oficial e semanticamente relevante;
- MENSAGEM nunca envia automaticamente;
- técnica geral não pode contrariar regra específica da empresa;
- o Companion continua business-agnostic por padrão.

## O que esta onda muda

### 1. Repertório comercial

O catálogo geral passa a cobrir, além das técnicas já existentes:

- clarificação de critérios de decisão;
- exploração de impacto;
- conexão valor-contexto;
- isolamento de objeção;
- reforço por evidência;
- mapeamento de decisão/stakeholders;
- escada de compromisso;
- execução de fechamento explícito;
- comparação por critérios.

As técnicas possuem condições de aplicabilidade e guards para evitar seleção oportunista.

### 2. Coerência única de situação → decisão → ação

Quando uma técnica é selecionada, a decisão canônica, a situação seller-facing, a justificativa e o objetivo atual precisam apontar para o mesmo movimento comercial. Um best_approach legado não pode produzir uma justificativa incompatível com a técnica atual.

### 3. Linguagem humana

`why_applicable` não é mais construído com tokens de ranking como `sequence_break`, `seller_already_asked_open_question` ou `customer_intent_hot`. Esses códigos continuam úteis em telemetria/testes, mas o vendedor recebe explicação comercial humana.

### 4. Hard restrictions somente quando são realmente atuais

`when_not_to_use` e `how_to_improve` não viram automaticamente `Evite agora`. Eles descrevem biblioteca/coaching, não fatos atuais. `do_not_do` recebe somente restrições observadas/derivadas do Technique Engine, Sequence Assessment e anti-padrões compatíveis.

### 5. Coaching sem elogio contraditório

Se uma mesma mensagem do vendedor é evidência de quebra de sequência/erro determinístico, ela não pode simultaneamente virar `Principal acerto`. O trace prevalece sobre elogio de leitura que conflite com a mesma evidência.

### 6. Método observado vs método recomendado

Quando o vendedor avançou fora de sequência, a UI diferencia:

- etapa observada: onde a execução chegou;
- etapa recomendada agora: onde o método precisa recuperar a negociação;
- motivo da recuperação.

A interface não deve chamar uma etapa desviada de `Etapa atual` como se fosse prescrição correta.

### 7. Message Critic mais exigente

O critic agora também bloqueia:

- mais de uma pergunta principal;
- pressão/urgência artificial detectável;
- mensagem que não executa a técnica selecionada;
- além de genericidade, repetição semântica e excesso de tamanho já existentes.

Retomadas contextuais recebem limite mais curto e precisam realmente se comportar como retomada, não como repetição disfarçada da pergunta anterior.

## Aceite do cenário real de recuperação

No cenário cliente demonstra intenção → vendedor pergunta o próximo passo → não há conclusão → vendedor desvia para oferta:

1. a intenção original permanece ativa;
2. o desvio é reconhecido como quebra de sequência;
3. a situação, decisão, justificativa e ação não se contradizem;
4. `Retomada contextual` pode ser selecionada;
5. AGORA não manda repetir a mesma pergunta;
6. `Evite agora` não exibe condições hipotéticas como se fossem fatos;
7. ANÁLISE não elogia a oferta que causou o desvio;
8. nenhum token interno aparece no seller-facing;
9. o método diferencia etapa observada da etapa que precisa ser retomada;
10. a mensagem busca um único microcompromisso, é curta e não usa pressão artificial.

## Critério para merge

- gate `gate:coaching-engine-mvp` integralmente verde;
- E3 cross-channel parity verde;
- `next typegen` + `tsc --noEmit` verdes;
- Vercel do head verde;
- live test posterior usando build identificável `1.2.0`.
