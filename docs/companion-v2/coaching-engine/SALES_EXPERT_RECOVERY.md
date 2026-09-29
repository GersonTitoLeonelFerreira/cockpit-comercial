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
(3× mediana, entre 12h e 72h; 36h sem histórico); pedido com urgência do
próprio cliente ("hoje", "amanhã") encurta a janela; SLA só é citado quando
configurado pela empresa (passthrough da aba CLIENTE). Atividade mais nova
que o snapshot analisado impede afirmar dormência.

#### Momentum progressivo (não por baldes)
`progression` preserva o tempo como variável quantitativa: silêncio de quem
deve o movimento, janela esperada (e sua base), razão silêncio/janela,
idade da última manifestação relacionada da intenção, inatividade
bidirecional, tentativas sem resposta, resposta devida pelo vendedor
(`owed_response`: janela de 1h para pedido de alta intenção/urgente, 4h
padrão, razão de atraso e severidade) e pausa combinada.

- `severity` (0..1) é contínua e monótona: cresce devagar dentro do ritmo
  (até 0,08), depois `0,08 + 0,92·(1 − e^−(razão−1)/3)`, agravada por
  tentativas seguidas sem resposta (×0,85 por tentativa extra) e por SLA
  configurado em risco alto.
- `stage` é só a síntese seller-facing da curva: `within_rhythm` →
  `early_loss` → `prolonged_silence` → `strong_gap` → `long_dormancy`.
  2 e 6 dias dentro de "esfriando" continuam diferentes em severidade,
  vitalidade da intenção, técnica e mensagem.
- Modo: dentro do ritmo → `wait`; perda inicial/silêncio prolongado/lacuna
  forte → `light_follow_up`; sem continuidade → `reactivate`.
- Escada de técnicas no Reasoning: perda inicial → retomada contextual;
  silêncio prolongado → retomada com permissão; lacuna forte → mudança de
  estado (reconfirmação); sem continuidade → mudança de estado / quebra de
  padrão. Várias ofertas sem resposta antes da dormência → quebra de padrão
  primeiro.

#### Frescor por engajamento relacionado
RECÊNCIA DA CONVERSA != RECÊNCIA DA INTENÇÃO. A intenção histórica só é
renovada por: nova declaração equivalente, reconfirmação afirmativa ("sim,
quero seguir"), resposta com conteúdo à ação do vendedor que deu sequência à
intenção, fala sobre o mesmo assunto, adiamento combinado sobre ela ou reação
entusiasmada à ação do vendedor. Saudação, agradecimento, "ok" e emoji nunca
renovam. `intent.vitality` = base de confiança × `e^−(idade relacionada /
3·janela)` × (0,6 se a janela temporal do pedido expirou) × tentativas sem
resposta; `current` ≥ 0,7, `aging` ≥ 0,35, reconfirmação obrigatória < 0,5
(ou < 0,7 com janela expirada). "Bom dia" no dia 6 depois de "Quero
contratar" no dia 1 → responder já (`respond_now`) reconfirmando o interesse
(`state_change_reactivation`), nunca tratando a intenção como atual.

#### Pausa combinada
"Me chama semana que vem" / "te aviso mês que vem" viram um prazo no
calendário comercial (America/Sao_Paulo): a semana seguinte começa na
segunda. Dentro do combinado ninguém deve movimento imediato
(`responsible: agreed_pause`, espera disciplinada, técnicas operacionais e de
retomada bloqueadas) e a intenção envelhece a ¼ da velocidade. Quando o
cliente pediu para ser chamado, o momento combinado passa a ser do vendedor
(retomada contextual lembrando o combinado); depois do prazo a curva volta a
piorar normalmente. Logo após o pedido de prazo, cabe ao vendedor confirmar
o combinado.

### Rejeição da oportunidade vs mudança dentro dela
`assessCustomerOpportunityStance` separa o NÚCLEO de negação ("não quero
mais", "não preciso mais", "desisti") do seu ESCOPO: negar uma opção ("o
plano básico, quero o premium") ou um processo ("esperar, quero fechar
agora") mantém a oportunidade viva e a intenção da continuação vale; só
negar a própria oportunidade/conversa ("não tenho mais interesse", "não
quero mais falar sobre isso") ou resolver por outro caminho ("já fechei com
outra") encerra.

**Opt-out ≠ encerramento comum.** Pedido explícito para não receber mais
contato ("pode me tirar da lista", "não quero mais receber mensagens",
"para de me mandar mensagem", "stop"; "tirar" só com alvo de contato —
"pode tirar uma dúvida?" continua pedido ativo) marca o sinal com
`no_contact_requested`; o contexto temporal expõe
`reactivation.contact_allowed = false`, o Reasoning troca o objetivo por
"não enviar nenhuma mensagem", a Message Strategy sai com
`outbound_allowed = false` (sem objetivo nem microcompromisso),
`composeSellerMessage` devolve `no_message` sem chamar o redator e a
extensão bloqueia a geração. Um encerramento comum ainda permite um
agradecimento respeitoso.

**Adiamento com horizonte explícito.** "Me chama amanhã", "me liga daqui a
10 dias", "me procura ano que vem" (pedido para o vendedor retomar num
momento indicado) são adiamentos combinados — inclusive quando mencionam o
próximo passo ("me chama amanhã pra agendar"); intenção explícita de
fechamento na mesma frase continua vencendo. Todo horizonte aceito vira data
real no calendário comercial: N dias/semanas/meses, dia da semana (no
próprio dia = semana seguinte; "sexta da semana que vem" = sexta da próxima
semana-calendário), depois de amanhã, mais tarde/daqui a pouco (mesmo dia),
início/fim do mês, semana/mês/ano que vem; meses de calendário sem
transbordar ("em um mês" em 31/01 = último dia de fevereiro). Só o
genuinamente vago ("outro dia", "depois") usa o horizonte curto padrão.
Horizonte futuro sozinho não é adiamento: "O preço muda no mês que vem?" é
pergunta de preço e "Tem vaga na próxima semana?" é pedido de agenda; só com
linguagem de adiar/retomar ("deixa pra semana que vem", "agora não, só mês
que vem") vira pausa combinada.

**Reconfirmação com horizonte próprio.** Uma reconfirmação fraca renova a
intenção forte que reconfirma (tipo e confiança), mas o momento e o
horizonte passam a ser os dela: "quero contratar amanhã" + dois dias depois
"ainda tenho interesse, quero ir hoje" é intenção de hoje, não um "amanhã"
vencido.

**Janela "esta semana".** Termina no calendário comercial: "esta semana"
até o fim do domingo da semana em que foi dita; um dia da semana ("segunda")
até o fim da próxima ocorrência desse dia ("próxima sexta"/"sexta que vem"
dita numa sexta = a sexta seguinte); "fim de semana" até o fim do domingo.

**Âncoras da janela multi-dia.** A âncora só é pareada com a resposta do
vendedor quando o trecho entre as duas é contíguo e curto (a rajada do
próprio cliente); o trecho entra completo. Caso contrário a âncora entra
sozinha — nunca pareada com a resposta a outra fala.

O reasoning é avaliado no instante atual do vendedor (`evaluated_at`) e
carrega `temporal_context`; coaching e message strategy consomem o MESMO
objeto.

### Opt-out de contato ≠ preferência de comunicação

`classifyCommunicationRestriction` (trace) decide pelo OBJETO recusado, não
por palavras:
- o **contato em si** ("não me mande mais mensagem", "não quero mais receber
  contato", "pare de me chamar", "me tira da lista") é opt-out
  (`no_contact_requested`, `contact_allowed=false`, nenhuma mensagem);
- **canal, formato, quantidade ou conteúdo** ("mensagem de áudio", "não me
  liga", "mais detalhes", "informações", "tantas mensagens") é preferência:
  a oportunidade continua ativa e a intenção vem do resto da mensagem, nunca
  da restrição ("não me mande mais detalhes, quero contratar o básico" é
  fechamento);
- canal alternativo ("prefiro texto", "fala comigo pelo WhatsApp") ou
  continuação comercial na mesma mensagem desmente qualquer opt-out.

### Horizonte de tempo que governa a ação

`resolveGoverningTimeReference` (trace) só considera horizontes AFIRMADOS:
"não consigo hoje", "hoje não dá" e "nem amanhã" nunca governam. Com mais
de um horizonte afirmado, vence o da cláusula que carrega a intenção da
mensagem ("quero fechar amanhã, mas hoje só consigo mandar os documentos" é
fechar amanhã), depois o da ação de compromisso, nunca uma prioridade fixa
entre tokens. A janela "esta semana"/dia da semana e o prazo combinado
(`deferralPlan`) usam o mesmo horizonte afirmado ("não consigo amanhã, pode
ser sexta?" → sexta; "sexta não consigo, me chama segunda" → segunda).

### Seller Execution Trace
- **Turnos** (rajadas): bolhas contíguas do vendedor formam uma ação.
- Saudação pura → `rapport_opening` (saudação + fórmula fática + até três
  vocativos plausíveis). Saudação seguida de verbo comercial, oferta,
  disponibilidade, proposta, agenda ou pergunta não fática ("Oi, temos
  horários", "Olá, segue proposta", "Oi, posso agendar?") é resposta com
  conteúdo; reconhecimento curto → `confirmation`;
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
Firefox não corresponde ao checkout atual. O verificador usa as MESMAS
funções canônicas do build para calcular o conteúdo esperado de cada arquivo
gerado (manifest transformado para o alvo/ambiente, feature flag efetiva,
ícones redimensionados, identidade) e compara todos os arquivos do staging —
inclusive os gerados — com o que as fontes atuais produziriam.

## 3. Evidência

- `sales-expert-recovery-golden.test.mjs` + `docs/companion-v2/corpus/sales-expert-recovery-golden.json`:
  casos A–R multissetoriais, trio temporal (mesmo texto, 30 min / 2 dias /
  18 dias), cinco casos de momentum com próximos movimentos distintos,
  janela multi-dia, e o pipeline de MENSAGEM com um redator que insiste em
  "Fico à disposição".
- Rodada de fechamento (mesmo arquivo de goldens): rejeição vs mudança dentro
  da oportunidade (7 casos multissetoriais), saudação vs conteúdo, intenção
  antiga vs "Bom dia"/reconfirmação, progressão em 9 instantes (30 min → 18
  dias), ritmo observado (2 vs 6 dias com janela de 1 dia), pausa combinada
  vs silêncio não combinado, urgência do cliente e auditoria transversal de
  invariantes sobre todos os resultados.
- Revisão sobre `14c4803`: `PREFERÊNCIA DE COMUNICAÇÃO ≠ OPT-OUT` (9 preferências
  × 4 verticais, decisão dentro da venda, 5 opt-outs reais) e `HORIZONTE NEGADO
  NUNCA GOVERNA` (5 frases do fundador, janela do dia seguinte, sexta e prazo
  combinado).
- `commercial-temporal-context.test.mjs`, `commercial-message-critic-repair.test.mjs`,
  `tests/sales-expert-recovery-surfaces.test.mjs`.
