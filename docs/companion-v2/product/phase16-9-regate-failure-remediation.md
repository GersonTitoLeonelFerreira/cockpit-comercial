# FASE 16.9 — Remediação do re-gate real

## Estado

**FAIL — FASE 17 continua bloqueada.**

O re-gate real no Firefox mostrou que a suíte automatizada verde não foi suficiente para provar qualidade seller-facing. Esta remediação corrige a arquitetura antes de repetir qualquer smoke.

## Evidência real observada

### Cenário 1 — agendamento em andamento

O vendedor já havia feito a pergunta necessária e aguardava a resposta do cliente. AGORA preservou corretamente a responsabilidade com o cliente, mas ANÁLISE ainda apresentou `insufficient_discovery` como ponto de melhoria do vendedor.

**Falha:** coaching não estava reconciliado com a responsabilidade operacional determinística.

### Cenário 2 — oportunidade de terceiro

A interlocutora informou que já era aluna e que a irmã queria fazer uma aula experimental. O resumo textual distinguiu interlocutora e irmã, porém ANÁLISE classificou a sessão como sem evidência comercial relevante e CLIENTE não materializou de forma confiável os papéis de intermediário e prospect relacionado.

**Falha:** Commercial Truth reconhecia terceiro apenas em um recorte estreito da interação e o Commercial Reasoning podia ser silenciado pelo `commercial_role` legado mesmo com papéis finos persistidos.

### Cenário 3 — objeção de pagamento seguida de saudação

O cliente perguntou explicitamente como proceder sem cartão de crédito. No dia seguinte enviou uma saudação curta. A Yolen perdeu a objeção ainda aberta e tratou a saudação como ausência de próximo passo comercial.

**Falha:** continuidade comercial não resolvida não sobrevivia a uma mensagem neutra curta; o guard de verdade comercial olhava a mensagem corrente/bridge de forma estreita e não usava a memória ativa como autoridade de continuidade.

### Cenário 4 — cirurgia / congelamento

A Yolen preservou fatos de cirurgia, prazo de recuperação e congelamento, mas ainda exibiu orientação seller-facing de pagamento/Pix sem relação com o momento atual.

**Falha:** conhecimento da empresa podia ranquear apenas por escopo, mesmo sem compatibilidade semântica com o momento; além disso, o runtime legado de `lead-method-guidance` continuava produzindo orientação paralela à nova cadeia canônica.

## Causas estruturais confirmadas

1. `commercial-truth.ts` trata continuidade curta com um conjunto estreito de respostas e não usa memória ativa não resolvida como prova estrutural de continuidade.
2. `commercial-reasoning-engine.ts` silencia qualquer papel legado diferente de `buyer`, mesmo quando o estado possui `commercial_party.current_contact.intermediary` + `commercial_party.related.prospect`.
3. `commercial-intelligence-library.ts` concede bônus de escopo a conhecimento de empresa/produto mesmo sem match de sinal, situação ou objetivo; conhecimento irrelevante pode entrar no ranking.
4. `commercial-reasoning-engine.ts` transforma mero `primary_product_interest` em `claim_requires_company_knowledge`, ampliando indevidamente a busca por regras da empresa.
5. ANÁLISE apresenta coaching sem reconciliar `seller_waiting_for_customer`, podendo responsabilizar o vendedor por uma informação que ele já pediu.
6. A extensão mantém `lead-method-guidance-runtime.js` e a orientação legada visível em paralelo ao Commercial Reasoning da R6. Portanto havia duas autoridades seller-facing concorrentes.

## Correção obrigatória

A remediação deve ser estrutural, não por frase específica:

- preservar objeções/open loops/compromissos ativos através de saudações/acknowledgements neutros, sem transformar uma saudação isolada em sinal comercial;
- preservar e usar os papéis finos de terceiro sem colapsar interlocutor e prospect;
- permitir Commercial Reasoning para oportunidade de terceiro comprovada mesmo quando o `commercial_role` legado não descreve o papel fino;
- exigir match semântico real antes de ranquear conhecimento de empresa/produto;
- consultar regras da empresa somente quando o movimento atual exige claim factual/política/preço/pagamento/produto;
- reconciliar coaching com a responsabilidade atual: se o vendedor já perguntou e espera o cliente, falta da resposta não é falha do vendedor;
- eliminar a autoridade seller-facing concorrente do guidance legado. AGORA/ANÁLISE/CLIENTE/MENSAGEM devem convergir para a mesma cadeia canônica.

## Gate de saída

A FASE 16.9 só pode mudar para PASS quando:

1. suíte Companion completa = 100% verde;
2. TypeScript = verde;
3. Vercel = verde;
4. smoke real refeito desde o Cenário 1;
5. os seis cenários passam sem contradição entre AGORA, ANÁLISE, CLIENTE e MENSAGEM;
6. nenhuma orientação legado/paralela contradiz o reasoning canônico;
7. scroll/virtualização não altera a verdade comercial.

Até esse gate, **FASE 17 permanece bloqueada**.
