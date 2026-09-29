# Companion — Recuperação integral do especialista comercial

Base: `main@91c967753cfad6cbd0bfa9e26be6175fdd2b4528`. Extensão: `1.5.0`.

Objetivo: o Companion olhar uma venda como um vendedor sênior olharia —
texto + sequência + comportamento + método + contexto + **tempo** — sem criar
um segundo cérebro. A autoridade continua única:

```
Conversation/State → Commercial Reading → Seller Execution Trace
  → Commercial Temporal Context → Sequence/Method → Commercial Reasoning
  → Coaching (+ arbitragem de coerência) → Message Strategy
  → Generator → Critic → Repair determinístico → Reviewer → mensagem
```

## 1. Causas raiz das falhas live

| Falha | Causa raiz comprovada |
| --- | --- |
| A — "Principal acerto" elogiando a oferta que causou a quebra | O trace julgava cada bolha isoladamente e o coaching olhava só o **último** evento de quebra. A oferta real veio em várias bolhas (planos, link, CTA); o elogio do Commercial Reading citava a primeira bolha, a quebra apontava a última (um link/CTA classificado como `factual_response`). Nenhum ID coincidia e o texto da quebra ("saiu do objetivo…") não tinha as palavras que o regex de conflito esperava. O mesmo payload real, rodado contra o motor da `main`, reproduz a tela do fundador palavra por palavra. |
| B — MENSAGEM terminando em "fechamento genérico" | O critic de filler era substring (`fico à disposição`, `para avançarmos` em qualquer lugar), não havia reparo determinístico do que é trivialmente removível, e o **reparo estrito descartava o motivo concreto** da falha anterior (enviava só "a ação precisa ser reengagement"), então o redator repetia o mesmo defeito até a última tentativa. Além disso, perguntas legítimas de retomada ("Como ficou isso desde então?") não eram reconhecidas como retomada. |
| C — conversas com condução avaliável sem ANÁLISE | Relevância `uncertain` neutralizava a leitura inteira e o coaching herdava `status: silent` do reasoning — confiança sobre o cliente e confiança sobre a execução do vendedor não eram separadas no gate. |
| D/E/F — tempo ignorado | Os timestamps existiam (aba CLIENTE), mas nenhuma camada do raciocínio calculava silêncio, latência, frescor de intenção ou momentum. O reasoning era avaliado no instante do snapshot, não no instante em que o vendedor olha a venda. "Esperar" era puramente estrutural: 30 minutos e 18 dias geravam a mesma decisão. |
| G — recorte de mensagens | O lote "data mais recente" da extensão é só gatilho/watermark (o ledger e o DiagnosticInput do servidor são multi-dia). O Commercial Reading (LLM), porém, via só a sessão atual (gap de 4h) + 6 mensagens de ponte — em conversas longas o pedido comercial que originou a oportunidade podia ficar de fora. |
| H — histórico tratado como atual | Intenção demonstrada semanas antes continuava "intenção atual"; lacunas da última tentativa (ex.: dia/horário) apareciam como falta atual. |
| I/J — relatório empilhado e sem arbitragem | Componentes localmente corretos (elogio da leitura, quebra do trace, técnica do reasoning, espera da responsabilidade) chegavam à superfície sem uma etapa de coerência; a mesma quebra aparecia em várias redações. |

### Por que os testes antigos ficavam verdes

- Fixtures com a oferta em **uma** bolha: o elogio e a quebra citavam o mesmo ID, então o conflito era detectado trivialmente.
- Todas as mensagens no mesmo minuto e `reference_time` minutos depois: o tempo nunca era exercitado.
- Os testes de MENSAGEM usavam um provider fake que devolvia a copy ideal na terceira tentativa; o LLM real acrescenta "Fico à disposição!".
- Leituras de fixture eram sempre `commercial`/`buyer`: o gate de incerteza nunca era exercitado.

## 2. Arquitetura nova (sem segundo cérebro)

### Commercial Temporal Context (`commercial-temporal-context.ts`)
Fatos (primeiro contato, última fala de cada lado, última troca bidirecional,
idade da intenção, tentativas sem resposta, maior intervalo), latências
(pedido de alta intenção → primeira resposta → resposta efetiva), ritmo
observado do cliente, **momentum** (`active`, `awaiting_seller`,
`awaiting_customer`, `cooling`, `dormant`, `closed`), **frescor da intenção**
(`current`, `aging`, `stale`, `closed`), janela temporal expirada
("hoje"/"amanhã" que já passou) e o **próximo movimento sustentado pelo
tempo** (`wait`, `respond_now`, `recover_delay`, `light_follow_up`,
`reactivate`, `respect_closure`) com `requalify_before_continuing`.

Sem limiar universal: a janela esperada deriva do ritmo do próprio cliente
(3× mediana, entre 12h e 72h; 36h sem histórico); adiamento explícito
("semana que vem", "mês que vem") estende o horizonte; SLA só é citado
quando configurado pela empresa (passthrough da aba CLIENTE). Atividade mais
nova que o snapshot analisado impede afirmar dormência.

O reasoning é avaliado no instante atual do vendedor (`evaluated_at`) e
carrega `temporal_context`; coaching e message strategy consomem o MESMO
objeto.

### Seller Execution Trace
- **Turnos** (rajadas): bolhas contíguas do vendedor formam uma ação.
- Saudação pura → `rapport_opening`; reconhecimento curto → `confirmation`;
  nenhum dos dois é "quebra de sequência" — quando é tudo o que o vendedor
  respondeu a um pedido, o sinal é `request_not_addressed` (por turno).
- Latência por evento/turno, sinais do cliente com referência temporal e
  entusiasmo **escrito pelo cliente**.
- Novos tipos de intenção: `disengaged` (resolveu/comprou em outro lugar) e
  `deferral`; pedidos com tempo explícito ("consigo trazer amanhã cedo?") são
  pedidos de agenda em qualquer vertical.
- Follow-up duplicado exige outra rajada ou conteúdo praticamente igual —
  partes de uma mesma oferta não são "repetição".

### Reativação como competência comercial (Intelligence Library)
`state_change_reactivation`, `permission_based_reengagement`,
`pattern_interrupt_reengagement`, `delayed_response_recovery`,
`respectful_closure` — selecionadas pelo contexto temporal, nunca por
vertical. Técnicas que executam o compromisso operacional (escolha guiada,
fechamento, escada de compromisso, descoberta, comparação) ficam bloqueadas
enquanto o interesse atual precisa ser reconfirmado; espera disciplinada fica
bloqueada quando o tempo já expirou a espera.

### Coerência (`commercial-intelligence-coherence.ts` + arbitragem no coaching)
- Unidades negativas por turno (quebra, oferta prematura, pedido ignorado,
  resposta lenta a alta intenção, follow-up duplicado, insistência pós
  encerramento, pressão).
- Um elogio é rejeitado quando cita a ação negativa, outra bolha do mesmo
  turno negativo com a mesma família de ação, ou elogia exatamente a família
  que causou a quebra. Todos os acertos da leitura são avaliados (não só o
  primeiro) antes do fallback do trace.
- Decisão de espera ⇔ técnica de espera; espera nunca quando o cliente
  aguarda o vendedor; intenção que exige reconfirmação nunca aparece como
  atual; a mesma ação do principal ajuste não reaparece como "outro
  aprendizado".
- `synthesis` entrega à ANÁLISE: diagnóstico principal, principal melhoria e
  próximo aprendizado.

### Coaching sob incerteza
`scope: 'seller_execution_only'`: com relevância `uncertain` (ou
`non_commercial` com memória comercial ativa no ciclo) e evidência
determinística suficiente (pedido comercial do cliente e/ou turnos
comerciais do vendedor), o coaching da execução é mostrado com aviso
explícito de contexto incerto. Conversa realmente pessoal permanece neutra.

### Message Strategy + MENSAGEM
- Âncora de contexto = pedido comercial do cliente (não a última fala solta).
- `temporal_frame` + `reactivation_tactics` (recuperação de contexto,
  pergunta de mudança de estado, permissão, quebra de padrão; curiosidade só
  com fato oficial; recuperação emocional só com entusiasmo evidenciado).
- Critic: filler por **frase**; `assumes_current_intent`,
  `fabricated_enthusiasm`, urgência/escassez sem fato oficial; retomada
  reconhece perguntas de mudança de estado.
- Reparo determinístico (remove frase de disponibilidade vazia e "tudo bem?"
  concorrente) revalidado pelo MESMO critic; correções específicas por
  violação; reparo estrito carrega o motivo concreto da falha.

### Janela do Commercial Reading
Até 3 pedidos comerciais explícitos do cliente anteriores à ponte entram
como âncora (com a resposta imediata do vendedor), preservando causalidade.

### Superfícies
- ANÁLISE: "Diagnóstico da condução" + "Momento da oportunidade" no topo;
  intenção histórica rotulada como histórico; lacuna antiga do método vira
  "o que ficou em aberto na última tentativa" + reconfirmar antes de
  retomar.
- AGORA: linha "Momento" quando o tempo mudou a decisão; mensagem pronta da
  leitura persistida é suprimida quando o tempo exige novo movimento.
- MENSAGEM: assinatura de revisão do coaching ignora durações que só
  envelhecem ("há 18 dias" → "há 19 dias").

### Release rastreável
`src/build-identity.js` (versão, commit, alterações locais, fingerprint,
build id) é carimbado no staging pelo build e exibido no cabeçalho do painel;
`npm run verify:companion-firefox-prod` falha quando o staging carregado pelo
Firefox não corresponde ao checkout atual.

## 3. Evidência

- `sales-expert-recovery-golden.test.mjs` + `docs/companion-v2/corpus/sales-expert-recovery-golden.json`:
  casos A–R multissetoriais, trio temporal (mesmo texto, 30 min / 2 dias /
  18 dias), cinco casos de momentum com próximos movimentos distintos,
  janela multi-dia, e o pipeline de MENSAGEM com um redator que insiste em
  "Fico à disposição".
- `commercial-temporal-context.test.mjs`, `commercial-message-critic-repair.test.mjs`,
  `tests/sales-expert-recovery-surfaces.test.mjs`.
