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

### Execução e apresentação (R7)
O cérebro não mudou; mudou o que o vendedor recebe dele.

- **MENSAGEM sem dead-end.** Antes, quando o redator repetia a mesma
  violação substantiva (repetir a pergunta sem resposta, presumir o
  interesse atual, empurrar oferta), `composeSellerMessage` terminava em
  `status: error` com o texto técnico do critic. Agora, depois das três
  tentativas do modelo, `composeStrategyGroundedMessage` monta a retomada a
  partir da própria estratégia canônica: primeiro nome, o assunto real do
  pedido do cliente (`context_reference`, sem o horizonte antigo e na voz do
  vendedor) e uma única pergunta de estado atual conforme a técnica
  escolhida. A copy passa pelo MESMO `validateMessage` + critic e pelo MESMO
  gate customer-facing; se não passar, não há copy. Orçamento fixo: no
  máximo 7 chamadas. O critic ficou mais rígido, não mais frouxo: "vi que
  você ainda quer…" + pedido operacional passou a ser `assumes_current_intent`.
- **Erro seller-facing.** `error` é sempre uma frase simples
  (`SELLER_FACING_UNSAFE_MESSAGE` / `SELLER_FACING_UNAVAILABLE_MESSAGE`); o
  motivo técnico fica em `diagnostics` (stage, source, failures), que a rota
  `method-guidance` loga e remove da resposta. `no_message` (opt-out)
  continua distinto de erro.
- **CLIENTE.** Quando o reasoning exige requalificação, a lacuna principal é
  "o interesse atual ainda não foi reconfirmado"; lacunas da etapa antiga
  (dia e horário, data da visita, escopo) continuam registradas, com
  evidência, como "Se o interesse continuar". O presenter só aplica a
  prioridade do reasoning — nunca decide sozinho. "Situação" virou
  "Pendência de resposta" (quem deve a próxima mensagem), para não competir
  com o estado comercial.
- **AGORA: 1 decisão → 1 ação → 1 por quê.** O "por quê" é a única frase que
  acrescenta informação à situação e à ação (o fato temporal que a situação
  trazia, ou a oração nova do `why_now`); a situação perde a frase que virou
  "por quê". Momento, fatos restantes, raciocínio, técnica e cuidados ficam
  em "Ver técnica e cuidados".
- **ANÁLISE por ganho informacional.** Deduplicação por função semântica
  (radicais de conteúdo, não igualdade de string): o diagnóstico perde as
  frases que o principal ajuste e os aprendizados abertos já explicam; o
  momento fica subordinado ao diagnóstico; a explicação da técnica desce
  para "Como aplicar" quando só repete a ação. O diagnóstico completo, o
  rótulo do momento e os fatos excedentes continuam em "Ver raciocínio".
- **Rótulos.** Um acerto sobre a mesma mensagem que um aprendizado aberto
  critica é "Acerto parcial", com a ressalva nomeada. "Outro acerto" e
  "Qualidade da proposta" não existem no código atual.
- **Tempo de resposta.** Já separava primeira resposta de primeira resposta
  que tratou o pedido (`first_response_addressed`); o golden trava "a
  primeira resposta veio 3 horas depois e não tratou o pedido; o pedido só
  foi efetivamente tratado 9 dias depois" e proíbe "demorou".

### Firewall de proveniência factual (R8)

**Princípio: saída derivada não é evidência primária.** Resumo, Commercial
Reading, memória, reasoning, coaching e a própria mensagem gerada podem
interpretar, mas nunca promovem a si mesmos a fato.

**Origem de "marido" (Lorena).** O modelo não inventou a palavra do nada.

- **Onde nasceu.** Veio da mensagem 2559 do ledger ("Quando eu e meu marido
  podemos fazer uma aula experimental?"): `incoming`, não apagada, capturada
  uma única vez em 12/09 por outro dispositivo. Esse dispositivo viu só 2 das
  16 mensagens da conversa.
- **Por que não é evidência.** A captura atual (29/09) re-observou mensagens
  de 01/09 anteriores e posteriores a 2559, e as de 10/09, mas não ela. Logo,
  2559 não está na conversa que o vendedor vê hoje. Ela foi apagada no
  WhatsApp ou atribuída à conversa errada na captura; não é possível provar
  qual das duas. A mensagem "Mayara", registrada como do cliente 9 dias antes
  de a vendedora se apresentar, é um indício de atribuição errada.
- **Primeira camada derivada.** O Commercial Reading v2 (26/09 22:07) citou
  `["2559"]`. As versões v3 a v6 herdaram o fato, e a `recommended_message`
  também. O resumo de trabalho e a memória (`state_snapshot`) nunca
  continham "marido".
- **Por que passou pelo validador antigo.** O `allowedContext` da MENSAGEM
  era resumo + interação (incluindo 2559) + intenção + texto do reasoning +
  `context_reference`. Além disso, o conceito "relação familiar" aceitava
  qualquer palavra de família presente em qualquer lugar desse contexto
  (lavagem factual).

**Arquitetura** (`app/lib/companion/commercial-fact-grounding.ts`, uma política
para todas as superfícies):

- **Taxonomia de fontes:**
  - primária do cliente: mensagem, áudio transcrito, perfil declarado;
  - primária do vendedor: mensagem, instrução atual;
  - oficial da empresa: produto, fato, configuração vigentes da mesma
    `company_id`;
  - derivada: resumo, leitura, reasoning, coaching, memória, mensagem gerada;
  - sistema.
  Foto/avatar tem autoridade `none`.
- **Autoridade por tipo de afirmação** (`CLAIM_SOURCE_AUTHORITY`):

  | Tipo de afirmação | Fonte com autoridade |
  | --- | --- |
  | Relação pessoal, objeção, preferência, compromisso, o que o cliente disse | Só a fala do cliente |
  | Preço, percentual, promoção, benefício, urgência, condição | Só a configuração vigente da empresa |
  | Valor antigo | Só com enquadramento histórico explícito ("naquela conversa foi informado…") |
  | Conclusão tirada da foto | Nenhuma fonte |

- **Integridade do ledger** (`classifyLedgerObservation`). A mensagem é
  `absent_from_later_view` quando uma captura posterior (mais de 1h depois)
  re-observou, no MESMO instante (≤ 2 min, mesmo dispositivo), os vizinhos
  imediatos dela (a anterior e a posterior mais próximas), mas não ela. O
  DOM do chat é contíguo, então ela estaria entre os dois. No caso Lorena,
  as 14 mensagens foram vistas às 21:47:25.365; 2559 e 2560, não.
  Vizinhos vistos em instantes diferentes (rolagem rápida, virtualização)
  ou sem dado de observação não provam nada. Mensagem apagada, ausente ou
  de outra empresa sai da evidência primária e da entrada do Commercial
  Reasoning. O dado fica no banco; nada é reescrito.
- **Afirmações.** Detectores determinísticos por tipo, sem dicionário
  fechado:
  - relação com possessivo, e "vocês dois"/"o casal";
  - valores e percentuais;
  - promoção e gratuidade com os termos vizinhos;
  - urgência;
  - objeção de preço;
  - preferência e compromisso;
  - atribuição genérica ao cliente (os termos específicos precisam ter vindo
    dele);
  - atribuição à empresa;
  - `forbidden_claims`.

  Pergunta não é afirmação.
- **Gate de superfície, aplicado na leitura.**
  - `loadCanonicalSellerCommercialContext` monta o registro de evidências:
    ledger + observação + conhecimento publicado da empresa.
  - O Reading e a memória passam por `gateCommercialReadingProvenance` e
    `gateCommercialStateProvenance`. A Cycle Memory de ANÁLISE e AGORA passa
    por `gateCycleMemoryProvenance`.
  - Cada item recebe um de três destinos:
    - `verified`: evidência primária válida, com o conteúdo presente nela;
    - `derived`: interpretação, mostrada como inferência;
    - removido: fato específico sem fonte, ou citação apenas de evidência
      inválida. Memória removida não sustenta a leitura que a cita.
  - O reparo tira só o trecho sem suporte ("para ele e seu marido").
  - O resultado profundo que a extensão usa como fallback local
    (`analysis-job-status`: leitura, resumo, pergunta e mensagem sugerida)
    passa pelo mesmo gate (`gateDeepSellerResult`).
  - Uma leitura que o gate não consegue julgar não chega às superfícies
    (falha fechada).
  - Resíduo conhecido: o Commercial Reading persistido não é recalculado.
    O banco continua com a versão antiga, e o gate é aplicado em toda
    leitura.
- **AGORA.** A projeção seller-facing não afirma fato sem fonte; inferência
  sem fato específico passa. Tempo, momentum e reativação não mudam.
- **CLIENTE.** Mostra "O que sabemos" (verified), "O que inferimos"
  (derived, com o aviso de que o cliente não disse isso literalmente) e "O
  que falta descobrir". Os itens não se repetem.
- **MENSAGEM.**
  - Resumo, leitura e reasoning chegam ao redator marcados como DERIVADOS.
  - A validação checa cada afirmação da copy contra o registro. A afirmação
    sem fonte é removida (trecho ou frase), a copy revalidada e entregue.
    Com `contact_allowed=true` e pedido do vendedor, a Yolen entrega
    mensagem.
  - A instrução do vendedor controla estilo e objetivo, mas não cria fato.
    Valor, percentual ou condição sem fonte geram um aviso ("Não usei R$
    79,90 porque não encontrei esse valor confirmado na configuração da
    empresa.").
- **Trace factual.** Só no preview, quando `VERCEL_ENV=preview`, e só no
  pacote HML. Mostra claim → fontes → status, afirmações removidas e
  evidências excluídas. Nunca aparece em produção.

### Pipeline de análise para qualquer conversa (R9)

**Sintoma live.** Lorena concluía, e Júlia (e outros contatos) ficava em "A análise está na fila da Yolen…" / "Analisando…".

**Causa comprovada** com dados de `companion_background_analysis_jobs`, `companion_runtime_path_diagnostics` e os erros agrupados da rota da fila:

- **Não é a fila do Preview.** O Preview publica e consome: `consumer_start` aparece com `vercel_env=preview` e o sha do preview.
- **A 1ª análise costuma falhar a validação do contrato.** Em conversas sem leitura anterior, 43% dos jobs em 14 dias (9/21) falharam a 1ª entrega e 4 falharam de vez; com leitura anterior, 5% (3/58).
  - Os erros são `INVALID_MODEL_OUTPUT`/`INVALID_COMMUNICATION_OUTPUT`, com `CUSTOMER_EVIDENCE_REQUIRED`, `MISSING_GLOBAL_EVIDENCE` etc.
  - A 2ª tentativa in-process do motor repetia o mesmo prompt às cegas: o reparo só existia para o Commercial Truth Guard.
- **Cada nova tentativa esperava 3 minutos.** O consumer usava `handleCallback` sem diretiva `retry`, então a nova entrega só vinha quando a visibilidade de 180 s expirava.
  - Júlia teve 5 entregas: 22:36:18 → 22:40:19 → 22:43:24 → 22:46:29 → 22:49:35 (13 min).
- **A extensão desistia antes.** Ela para de acompanhar em 240 s.
- **Lorena "funcionava" por ter leitura anterior.** A reanálise dela passou na 1ª entrega (23 s).
- **Órfãos.** Um worker morto deixava o job `running` para sempre (ex.: desde 14/09). Pelo índice `one_running_per_conversation`, isso bloqueava todo job novo daquela conversa. Um job `queued` sem entrega viva era reaproveitado para sempre (23505), e o "Tentar novamente" só reabria `failed`.

**Correção** (sem timeout maior e sem caso especial por conversa):

- **Reparo de contrato.** A 2ª tentativa in-process recebe `contract_error_code` + `contract_error_path` e como corrigir: citar a evidência real exigida ou retirar o item, nunca inventar.
- **Diretiva de retry da fila.** Esperas de 3/10/20/30 s; disputa pela conversa, 15 s; mensagem inválida recebe ack.
- **Worker.**
  - Um `running` com lease vencido (o dono morreu: `maxDuration` 180 s < lease 210 s) é encerrado (`BACKGROUND_WORKER_LEASE_EXPIRED`) e o claim é refeito.
  - Uma disputa que chega à última entrega vira `failed` recuperável (`BACKGROUND_CONVERSATION_BUSY`), nunca `queued` eterno.
- **Recuperação de órfão** (`recoverStaleCompanionAnalysisJob`).
  - É órfão um job `queued` sem sinal de execução por 5 min, ou `running` com lease vencido.
  - A recuperação reabre o job (CAS em status + `updated_at`, mesma identidade e `requested_at`) e publica uma entrega nova, uma única vez.
  - É acionada pela rota de análise ao reaproveitar o job, pelo "Tentar novamente" e pelo polling quando o status vem com `stale: true`.
  - Nunca há dois workers no mesmo job: o claim é CAS em `queued` e existe um único `running` por conversa.
- **Status.** Expõe `updated_at` e `stale`.
- **HML.** O painel "Analysis debug" mostra job, conversa, watermark, status, `queued_for`, `worker_started`, entregas, `poll_attempt`, órfão/recuperação e `failure_code`. Nunca aparece em PROD.
- **Performance.**
  - O firewall R8 reaproveita a configuração comercial já lida (o snapshot do raciocínio não relê 1+5 consultas).
  - A observação do ledger é 1 consulta em lote.
  - Os derivados por fonte ficam em cache. O gate da leitura caiu de 444 ms para ~75 ms com 1000 mensagens e 150 itens (~34 ms com 150 mensagens).

### Isolamento real entre HOMOLOG e PRODUÇÃO (R10)

**Problema comprovado.** Preview (HML) e produção usam o MESMO banco. As filas da Vercel já são por deployment, mas o job e todos os resultados derivados eram compartilhados:

- Identidade do job era `sha256(versão, empresa, ciclo, conversa, watermark)`: o HML e a produção geravam o MESMO `analysis_job_id` e disputavam o mesmo índice `one_running_per_conversation`.
- O worker do Preview gravava `companion_commercial_states`/`companion_commercial_state_events` que a produção lê. Os estados atuais de Lorena (v6), Júlia (v1), três contatos de WhatsApp e duas conversas do ManyChat tinham sido produzidos pelo worker do Preview (`consumer_start` com `vercel_env=preview`).
- A memória do ciclo lê todos os estados do ciclo sem filtro de conversa: qualquer namespacing só na chave da conversa vazaria.

**Escopo explícito** (`companion-execution-scope.ts`): `production` | `homolog`, resolvido do ambiente do deployment (`VERCEL_ENV`), nunca do commit. `preview` é sempre homolog (override não vale na Vercel); `next dev` local é homolog; testes e scripts, produção.

**Armazenamento derivado por escopo** (migration `20260930020000_create_companion_homolog_derived_storage.sql`):

- Produção continua exatamente nas tabelas canônicas (o que a `main` já lê). Elas ganham `execution_scope text not null default 'production'` com CHECK `= 'production'`: todo registro legado é explicitamente produção.
- O HOMOLOG tem `*_homolog` para jobs, estados, eventos (Reading) e etapa do método, criadas `LIKE ... INCLUDING ALL` (mesmos CHECKs, incluindo `no_auto_write_check`, mesmos índices únicos e o parcial one-running), CHECK `= 'homolog'`, FKs para `sales_cycles`/configuração, RLS negando cliente e os mesmos grants do service role.
- A RPC `rpc_persist_stateful_copilot_state_homolog` é gerada da RPC canônica (mesma lógica de CAS, idempotência, auditoria e recusa de escrita em CRM/Agenda), gravando só no armazenamento homolog e com locks consultivos em outro espaço de chaves.

**Identidade do job.** `sha256(versão, escopo, empresa, ciclo, conversa, watermark)`: o mesmo contexto gera jobs diferentes por ambiente. O id legado (sem escopo) é aceito só como produção; homolog nunca o reivindica. Mensagem de fila sem escopo é produção; escopo adulterado é recusado.

**Cadeia escopada.**

- A rota de análise insere no armazenamento do escopo e reaproveita por campos do escopo. Isso inclui o job legado de produção, mas nunca uma linha de outro escopo.
- O worker rejeita (ack, zero banco, zero IA) mensagem de outro escopo. Todas as consultas de job (claim, lease vencido, "job mais novo", supersede, retry, falha) usam a tabela do escopo, e o runtime recebe o escopo para ler o estado anterior e a semente de memória e persistir pela RPC do escopo.
- Recuperação de órfão e "Tentar novamente" operam só na tabela do escopo, com identidade do escopo.
- Polling (`analysis-job-status`) lê job e eventos só do escopo e devolve `execution_scope`.
- Loaders seller-facing (contexto canônico, Reading, memória do ciclo, coaching do método, etapa do método, Message Intelligence) resolvem a tabela pelo escopo do deployment.
- A extensão confere o escopo com o canal (PROD ↔ `production`, HOMOLOG ↔ `homolog`; sem escopo = legado = produção) e descarta job/resultado de outro ambiente. O "Analysis debug" do HML mostra `execution_scope`.

**Dado-fonte continua compartilhado e só lido** (membership, perfil, ciclo, lead, eventos do ciclo, mensagens, configuração comercial): o HML analisa a conversa real sem mudar nada que a produção mostra depois.

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
- R7: `message-semantic-recovery.test.mjs` (redator adversarial, orçamento de
  chamadas, erro seller-facing, `no_message`) e
  `seller-facing-end-to-end-golden.test.mjs` (Lorena ponta a ponta até o HTML
  de AGORA/ANÁLISE/CLIENTE + SaaS 5 dias, imobiliária 8 dias, clínica 3 dias,
  B2B 10 dias com preço antes do escopo).
- `commercial-temporal-context.test.mjs`, `commercial-message-critic-repair.test.mjs`,
  `tests/sales-expert-recovery-surfaces.test.mjs`.
- R8: `commercial-fact-grounding.test.mjs`:
  - integridade do ledger (2559 emoldurada; sem moldura nada é concluído);
  - contaminação A–E (Reading, memória, resumo, AGORA, fala da própria
    empresa);
  - autoridade A–E (relação, preço atual vs histórico, benefício e forbidden,
    objeção/preferência, foto);
  - multiempresa, conhecimento vigente, memória do ciclo, instrução do
    vendedor com aviso, reparo;
  - golden Lorena da leitura contaminada até CLIENTE/AGORA.

  Também `companion-client-intelligence-ui.test.mjs` (sabemos/inferimos/falta)
  e `message-controller-contract.test.mjs` (aviso; trace só no HML).
- R9:
  - `analysis-job-lifecycle.test.mjs`: diretiva da fila, órfãos, worker morto liberado, disputa terminal, corpus A–I até estado terminal em ≤ 5 entregas e ≤ 63 s de espera;
  - `companion-analysis-job-retry.test.mjs`: órfão `queued`/`running` reaberto uma vez, vencedor único;
  - `stateful-copilot-orchestrator.test.mjs`: o reparo de contrato chega à 2ª tentativa;
  - `analysis-multi-conversation-sequence.test.mjs`: Lorena → Júlia → C → voltas, sem vazamento, e diagnóstico só no HML.
- R10:
  - `execution-scope-isolation.test.mjs`: A (identidade por escopo, legado só produção), B/C (running e "mais novo" não cruzam), D/E (lease e recuperação de órfão no próprio escopo), F (polling), G/H (eventos, estado anterior, etapa do método), J (multiempresa), worker de outro escopo, CRM/Agenda nunca escritos, guarda estrutural sem acesso direto às tabelas derivadas;
  - `route-execution-scope.test.mjs`: I (HML lê os mesmos dados-fonte e grava só o próprio job) e idempotência por escopo;
  - `stateful-copilot-supabase-writer.test.mjs`: RPC do escopo;
  - `tests/execution-scope-channel.test.mjs` e `analysis-multi-conversation-sequence.test.mjs`: canal ↔ escopo, descarte de job de outro ambiente, `execution_scope` no debug HML.
