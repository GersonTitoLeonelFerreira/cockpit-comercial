# Contrato de Produto — Yolen Companion para o Vendedor

**Status:** fonte única de verdade do produto.
**Dono:** Controle Mestre (decide o que entra/sai; qualquer alteração de
escopo passa por este documento).
**Não é:** material de marketing, brainstorm de funcionalidades, ou lista de
tarefas técnicas. É a especificação de comportamento observável que qualquer
frente de desenvolvimento — humana ou IA — deve satisfazer para que uma
capacidade seja considerada parte do produto.

**Como usar este documento:** cada capacidade descrita aqui é avaliada contra
o código real da branch `main` em
[`companion-seller-gap-matrix.md`](./companion-seller-gap-matrix.md). Este
documento diz **o que deve existir**; a matriz diz **o que existe de fato,
com evidência**. Nenhuma capacidade deste contrato deve ser tratada como
concluída só porque está descrita aqui — só a matriz, com evidência de
código e teste, decide isso.

**Revisão FASE 16.1 (rebaseline de contrato):** esta revisão corrige uma
incoerência de arquitetura de produto encontrada no smoke real — AGORA,
ANÁLISE e CLIENTE não estavam se comportando como perspectivas coordenadas
da mesma inteligência comercial. A seção 2 formaliza a fronteira definitiva
entre as quatro áreas do Companion (AGORA, MENSAGEM, ANÁLISE, CLIENTE, na
ordem em que aparecem hoje na extensão) e os conceitos que as alimentam. Os
cenários canônicos que ilustram esta fronteira estão em
[`phase16-seller-information-architecture-scenarios.md`](./phase16-seller-information-architecture-scenarios.md).
Esta revisão é **contrato de produto**, não uma auditoria de implementação —
ver seção 16 para o que permanece deliberadamente fora desta rebaseline.

---

## 1. Princípio central

> "Hoje as pessoas abrem um CRM para trabalhar. No futuro, a Yolen deve
> trabalhar ao lado delas o dia inteiro, aparecendo apenas quando realmente
> puder ajudá-las a tomar uma decisão melhor."

Consequências diretas deste princípio, testáveis em qualquer capacidade nova:

1. **A Yolen não é um formulário.** Ela não existe para o vendedor preencher
   campos de CRM manualmente enquanto ela observa. Ela lê a conversa e
   participa da decisão.
2. **A Yolen não é um gerador de mensagens.** Escrever uma mensagem sugerida
   é a *última* coisa que ela faz, não a primeira. Antes disso, ela precisa
   entender a venda.
3. **A Yolen sabe ficar quieta.** Silêncio é um resultado válido e frequente,
   não uma falha. Uma conversa sem relevância comercial e sem sinal
   operacional relevante deve produzir uma resposta explícita de "nada a
   fazer aqui", nunca uma tentativa forçada de gerar valor.
4. **O objetivo final é vender melhor, não movimentar registros.** CRM e
   Agenda são consequências administrativas de uma leitura comercial
   correta — nunca o objetivo em si. Uma capacidade que move o CRM
   corretamente mas não ajuda o vendedor a entender a venda não cumpre o
   princípio central, mesmo que os campos estejam certos.

**Extensão aprovada na FASE 16.1:** o Companion não deve apenas reagir ao que
o lead acabou de dizer. Ele deve combinar conversa, memória, método e sinais
operacionais da Yolen para perceber quando o vendedor precisa agir — e também
saber quando não deve interferir. Isso é o que torna AGORA capaz de ser
**proativo** (seção 4.5) sem deixar de saber ficar quieto.

Qualquer capacidade avaliada na matriz de completude que viole um destes
pontos deve ser sinalizada como desvio do princípio central, mesmo que
tecnicamente funcione.

---

## 2. As quatro áreas — contrato funcional definitivo

O painel do Companion na extensão possui hoje quatro áreas de navegação —
AGORA, MENSAGEM, ANÁLISE e CLIENTE (esta é a ordem visível na UX8; a ordem de
exibição é decisão de UI e não altera o contrato abaixo). Cada área responde
a **uma pergunta diferente do vendedor**, e nenhuma pergunta é
intercambiável com outra:

| Área | Pergunta que responde | Definição de uma linha |
|---|---|---|
| **AGORA** | O que preciso perceber ou decidir agora? | **AGORA = DECISÃO** |
| **ANÁLISE** | Como está esta venda e como ela foi conduzida? | **ANÁLISE = VENDA** |
| **CLIENTE** | O que sabemos e ainda precisamos descobrir sobre esta pessoa? | **CLIENTE = PESSOA** |
| **MENSAGEM** | Qual comunicação executa melhor a decisão atual? | **MENSAGEM = COMUNICAÇÃO** |

Esta definição **não está aberta para reinterpretar** em nenhuma subfase
seguinte sem passar de novo pelo Controle Mestre.

### 2.1 Uma inteligência comercial, quatro perspectivas

As quatro áreas **não são quatro cérebros independentes**. Elas são quatro
perspectivas sobre a mesma inteligência comercial — o **Commercial Brain**.
Um mesmo fato (ex.: "preço é uma preocupação para este cliente") tem uma
única origem canônica e pode ser consumido por várias perspectivas; ele
nunca deve existir como quatro verdades divergentes, uma por aba. A seção 9
formaliza a regra "um fato, uma origem, vários consumidores".

Modelo conceitual desta fase (contrato de produto — a materialização técnica
pertence às subfases seguintes, ver seção 16):

```
                       YOLEN
                         │
       ┌─────────────────┼─────────────────┐
       │                 │                 │
 CRM / Pipeline        Agenda             SLA
       │                 │                 │
    Inbound            Método           Produtos
       │                 │                 │
       └──────────── Memória / Eventos ───┘
                         │
                 Conversas / Ledger
                         │
                         ▼
                COMMERCIAL BRAIN
                         │
      ┌──────────────────┼───────────────────┐
      │                  │                   │
 Current Moment   Opportunity Reading   Customer Memory
      │                  │                   │
      ├────────── Seller Coaching ───────────┤
      ├────────────  Method State ───────────┤
      └───────── Operational Signals ────────┘
                         │
                    Decision State
                         │
       ┌─────────────────┼─────────────────┐
       │                 │                 │
     AGORA            ANÁLISE           CLIENTE
                         │
                         ▼
                Communication Context
                         │
                         ▼
                     MENSAGEM
```

Os blocos internos (`Current Moment`, `Opportunity Reading`, `Customer
Memory`, `Seller Coaching`, `Method State`, `Operational Signals`, `Decision
State`, `Communication Context`) são os conceitos que a seção 5 mapeia para
contratos de dados candidatos. **Nesta subfase eles não geram nenhuma tabela,
migration, ou classe nova em produção** — são o vocabulário normativo que as
seções 4, 6, 7 e 8 usam para descrever AGORA, ANÁLISE, CLIENTE e MENSAGEM sem
ambiguidade.

### 2.2 O que cada área nunca pode se tornar

Estas confusões já ocorreram na prática (ver "Motivo desta fase" no
histórico do roadmap) e são proibidas explicitamente:

- **AGORA não pode virar dashboard.** Ver seção 4.2 — limite rígido de 1
  decisão principal + no máximo 2 cards de intervenção.
- **AGORA não pode ser só "o que o lead acabou de falar".** Ver seção 4.5 —
  AGORA também é alimentado por sinais operacionais sem nova mensagem.
- **ANÁLISE não pode ser reduzida à sessão atual ou ao último burst.** Ver
  seção 6.1 — uma conversa pessoal na sessão atual não apaga a leitura da
  oportunidade.
- **CLIENTE não pode conter avaliação do vendedor, coaching ou método.** Ver
  seção 7.7 — isso pertence a ANÁLISE, mesmo quando os fatos usados vêm do
  cliente.
- **MENSAGEM não pode criar uma interpretação paralela da venda.** Ver seção
  8.2 — ela só executa comunicacionalmente o que já foi decidido pelo
  Decision State; nunca introduz fato próprio.
- **Nenhuma área pode transformar "conversa não comercial" em "sem contexto
  comercial".** Ver seção 3 — esta é a contradição central que motivou esta
  rebaseline.

---

## 3. Sessão não comercial vs. Decision State — a distinção obrigatória

O contrato anterior tratava relevância comercial como um interruptor único:
"se não comercial → silêncio operacional total". Essa regra está incompleta
e foi a causa raiz da incoerência observada no smoke real (a ANÁLISE dizia
"sem evidência comercial relevante" para um cliente com histórico comercial
ativo, enquanto AGORA, em outro momento, expunha um resumo histórico longo
que não deveria pertencer a AGORA).

A partir desta fase, o contrato distingue duas coisas que o texto antigo
tratava como uma só:

```
CURRENT SESSION (sessão atual)
  → é comercial ou não é comercial
  → decide se cabe pitch, preço, avanço de CRM/Agenda NESTA interação

DECISION STATE (estado de decisão)
  → pode conter sinal operacional relevante
  → independe de a sessão atual ser comercial
```

### 3.1 Regra normativa

1. **Sessão não comercial não apaga a oportunidade.** Se existe uma
   oportunidade ativa com histórico comercial (proposta, preço, interesse,
   objeção, compromisso), uma conversa pessoal/administrativa na sessão
   atual **não** faz esse histórico desaparecer de ANÁLISE. Esse histórico
   de negociação (proposta, preço, objeção, pendência) é conteúdo de
   ANÁLISE/Opportunity Reading (seção 6.1) — CLIENTE continua preservando,
   em paralelo, apenas a memória sobre a pessoa que já era semanticamente
   válida (seção 7), nunca uma cópia do estado da venda.
2. **Sessão não comercial não vira venda.** O fato de existir um sinal
   operacional relevante (SLA vencendo, retorno agendado, inbound
   prioritário) **não** transforma a conversa pessoal em comercial, não gera
   pitch, não sugere preço, não avança CRM/Agenda.
3. **AGORA pode apresentar um Card de Intervenção operacional mesmo quando a
   sessão atual é pessoal.** Exemplo: "Existe retorno comercial previsto
   para hoje às 16h" pode aparecer como card mesmo com a conversa atual
   sendo "Oi amor, tudo bem?" — o card é sobre o Decision State, não sobre
   reclassificar a sessão.
4. **A distinção precisa ser visível, não apenas interna.** AGORA mostra o
   momento atual real ("Conversa pessoal.") separado de qualquer card
   operacional; ANÁLISE continua mostrando a leitura da oportunidade
   completa; nenhuma das duas telas mistura os dois conceitos numa frase só.

Esta regra substitui e refina a seção 5.1 da versão anterior deste contrato
(ver a formalização completa em AGORA, seção 4, e em ANÁLISE, seção 6).

### 3.2 Regra de interpretação — a ordem ainda importa

O produto ainda precisa **entender a conversa antes de decidir uma ação
comercial concreta** (pitch, preço, avanço de CRM/Agenda). A ordem abaixo é
normativa:

```
CONVERSA + MEMÓRIA + MÉTODO + SINAIS OPERACIONAIS DA YOLEN
  ↓
COMMERCIAL BRAIN
  ↓
DECISION STATE
  ↓
  ├─ AGORA decide: existe algo que o vendedor precisa perceber/decidir agora?
  │    (pode ser "nada" — silêncio operacional é resultado válido)
  │
  ├─ ANÁLISE sempre pode mostrar a leitura completa da oportunidade,
  │    independente de a sessão atual ser comercial
  │
  └─ CLIENTE sempre pode mostrar a memória válida da pessoa,
       independente de a sessão atual ser comercial
                       ↓
              COMMUNICATION CONTEXT
                       ↓
                   MENSAGEM decide:
                   mensagem OU silêncio
```

Uma implementação que decide mudar o CRM ou sugerir preço antes de confirmar
relevância comercial da ação pretendida está fora do contrato, mesmo que o
resultado final pareça correto por coincidência.

### 3.3 Regras de não-inferência (o que NÃO conta como venda)

- **Compromisso não significa compromisso comercial.** Um "combinado" pode
  ser social, familiar, ou logístico.
- **Data não significa Agenda comercial.** Uma data mencionada pode ser
  aniversário, feriado, ou qualquer evento não relacionado à venda.
- **Horário não significa Agenda comercial**, pelo mesmo motivo.
- **A existência da pessoa no CRM não torna toda conversa dela comercial.**
  Um contato cadastrado pode mandar uma mensagem pessoal a qualquer momento;
  isso não reabre ou avança a oportunidade automaticamente.

Qualquer capacidade que gere sugestão de CRM/Agenda, pitch, ou preço a partir
de um desses sinais isolados, sem relevância comercial confirmada **para a
ação pretendida**, viola este contrato. Isto não impede um Card de
Intervenção puramente operacional (seção 4.3 e seção 4.5) baseado no mesmo
sinal.

---

## 4. Contrato de AGORA — DECISÃO

**Pergunta que AGORA responde:** "O que preciso perceber ou decidir agora?"

AGORA **não é** simplesmente "o que o cliente acabou de falar". AGORA é o
centro de decisão rápida do vendedor: ele deve considerar conversa atual,
etapa do método, aderência/desvio, leitura da oportunidade, memória
relevante do cliente, compromissos, SLA, Agenda, inbound, follow-up,
CRM/pipeline, oportunidade parada, riscos, e outros sinais futuros da
Yolen — **mas só quando algum desses sinais mudar a decisão atual**. AGORA
não é um agregador de tudo que existe; é um filtro do que importa agora.

### 4.1 Estrutura

```
AGORA

[MOMENTO ATUAL]
1 a 3 linhas — o que está de fato acontecendo na sessão atual.

[DECISÃO PRINCIPAL]
No máximo uma.

[CARD DE INTERVENÇÃO 1]
Somente se relevante.

[CARD DE INTERVENÇÃO 2]
Somente se realmente necessário.
```

### 4.2 Limite rígido

```
1 decisão principal
+
no máximo 2 atenções secundárias (Cards de Intervenção)
```

Isto é um invariante, não uma sugestão de design. Proibido transformar AGORA
em:

```
7 agendas
4 SLAs
12 inbound
19 follow-ups
```

Uma implementação que renderiza mais de uma decisão principal ou mais de
dois cards de intervenção viola este contrato, independentemente de todos
os itens serem individualmente verdadeiros e relevantes — o Companion deve
converter os sinais da Yolen em **uma** decisão contextual para aquele lead,
não despejar a lista inteira de sinais disponíveis.

### 4.3 Cards de Intervenção

O conceito aprovado é **Cards de Intervenção**, não popups tradicionais que
interrompem o vendedor. Contrato conceitual (produto — a materialização
técnica do motor que gera/resolve cards pertence a subfase futura, ver seção
16):

```
InterventionCard {
  source
  priority
  reason
  evidence_refs
  created_at
  expires_at | resolve_condition
  related_lead
  related_cycle
  recommended_action
}
```

Cada card precisa explicar três coisas, sempre:

```
POR QUE apareceu
+
POR QUE importa agora
+
O QUE fazer
```

E precisa ter **ciclo de vida**: um card não é uma mensagem estática que
fica ali para sempre. Exemplo:

```
SLA vencido
→ vendedor responde
→ condição resolvida
→ card desaparece
```

Um card sem `expires_at` ou `resolve_condition` está incompleto — cards
"eternos" que nunca desaparecem, mesmo depois de o vendedor agir, violam o
contrato tanto quanto cards sem justificativa.

### 4.4 Prioridade

```
CRÍTICA
ALTA
MÉDIA
BAIXA
```

**CRÍTICA** — SLA crítico; promessa comercial importante vencida;
compromisso material não cumprido.

**ALTA** — inbound prioritário; retorno vencendo; objeção bloqueadora;
desvio relevante do método; cliente aguardando.

**MÉDIA** — descoberta incompleta; oportunidade esfriando; memória do
cliente útil para a decisão atual.

**BAIXA** — não ocupa AGORA. Permanece disponível em ANÁLISE ou CLIENTE.

Quando há mais de dois candidatos a card, a prioridade decide quais dois (no
máximo) chegam a AGORA — os demais continuam existindo como informação em
ANÁLISE/CLIENTE, não são descartados, apenas não competem por espaço em
AGORA.

### 4.5 Regra proativa

O Companion **não depende de uma nova mensagem do lead** para ajudar. Dois
exemplos formalizados como comportamento esperado:

```
lead inbound
+
17 minutos sem atendimento
↓
AGORA
"Lead prioritário sem primeiro contato."
```

```
retorno comercial hoje às 16h
+
conversa atual pessoal
↓
AGORA
"Existe retorno comercial previsto para hoje."
```

Em nenhum dos dois casos a conversa pessoal é transformada em comercial —
essa diferença é obrigatória (ver seção 3.1). O gatilho para um Card de
Intervenção proativo é sempre um evento/estado da Yolen (tempo decorrido,
agenda, SLA, pipeline), nunca uma inferência sobre o conteúdo pessoal da
conversa atual.

### 4.6 Estado de silêncio

Quando não há decisão principal nem card de intervenção relevante, AGORA
deve mostrar um estado equivalente a "nada a fazer aqui agora" — visualmente
distinto de "carregando" ou "erro". Isto é um resultado positivo e esperado
(ver princípio central, seção 1, item 3), não ausência de dados. Isto vale
tanto quando a sessão é comercial sem risco quanto quando a sessão não é
comercial e não há sinal operacional algum (cenário canônico 10).

---

## 5. Vocabulário canônico — como isto se traduz em contratos de dados

Este documento é escrito em linguagem de produto. A matriz de completude
mapeia cada conceito abaixo para o tipo TypeScript real que deveria
implementá-lo (ou deveria vir a implementá-lo — ver seção 16 sobre o que
ainda não foi materializado). Referência rápida (nomes completos de arquivo
em `app/lib/companion/`, salvo indicação contrária):

| Conceito de produto | Tipo/contrato candidato no código | Camada conceitual (seção 2.1) |
|---|---|---|
| Relevância comercial da sessão atual | `CompanionDiagnostic.commercial_relevance` (`diagnostic-contract.ts`), `CommercialReading.commercial_relevance` (`commercial-reading-contract.ts`) | Current Moment |
| Leitura completa da oportunidade | `CommercialReading` (`commercial-reading-contract.ts`) | Opportunity Reading |
| Memória persistente entre ciclos/sessões | `StatefulCommercialState` (`stateful-commercial-state.ts`) — já usa `memory_status: active/resolved/superseded` e `evidence_message_ids`/`confidence` como provenança | Customer Memory (parte) + Opportunity Reading (parte) |
| Método comercial e aderência | `CommercialReadingMethod` / `CommercialReadingMethodStage` | Method State |
| Inteligência do cliente (pessoa) | `CommercialReadingCustomer` | Customer Memory |
| Coaching do vendedor | `CommercialReadingSellerStrength[]` / `CommercialReadingImprovementPoint[]` (V2) e `AICoaching` (V1, `app/types/ai-coaching.ts`) | Seller Coaching |
| Melhor condução | `CommercialReadingBestApproach` | Decision State (entrada) |
| Decisão de AGORA (momento + prioridade + cards) | ainda sem contrato de dados dedicado — hoje é derivado no cliente por `resolveSellerAttentionSnapshot`/`renderNowAttentionSnapshot` (`companion-seller-information-view.js`) a partir de `CommercialReading` + contexto de cliente | Decision State |
| Mensagem sugerida / comunicação | `CommercialReadingCommunication.recommended_message` (V2) / `AICoaching.suggested_message` (V1) | Communication Context |
| Sugestão de CRM | `CommercialReadingCrmSuggestion` | Decision State (consequência administrativa) |
| Sugestão de Agenda | `CommercialReadingAgendaSuggestion` | Decision State (consequência administrativa) |
| Sinal operacional (SLA, agenda, inbound) | parcialmente presente (`sla` em contexto de cliente, ver `companion-lead-summary-view.js`/`companion-seller-information-view.js:getLiveSlaRisk`); sem contrato unificado de `OperationalSignal` | Operational Signals |
| Card de Intervenção | sem contrato de dados ainda — ver seção 4.3 (conceitual nesta fase) | Decision State → AGORA |
| Telemetria de ação do vendedor | `CompanionActionType` (`action-events-contract.ts`) | (transversal) |

Nenhum destes tipos, por si só, prova que a capacidade chega ao vendedor —
isso depende de estar realmente ligado ao runtime ativo e de a extensão
renderizar o campo. Ver matriz de completude para o veredito por capacidade.

---

## 6. Contrato de ANÁLISE — VENDA

**Pergunta que ANÁLISE responde:** "Como está esta venda e como ela foi
conduzida?"

ANÁLISE é **oportunidade/ciclo**, não a sessão atual. Ela não é apenas o
último burst, não é apenas a última mensagem, e não é apenas a memória da
pessoa isoladamente (isso pertence a CLIENTE — ver seção 7). ANÁLISE deve
conseguir representar, sempre com proveniência (evidência da conversa **e/ou**
estado persistido **e/ou** memória válida **e/ou** histórico da
oportunidade):

### 6.1 Regra central — "não comercial agora" não significa "sem contexto comercial"

Esta é a regra mais importante desta rebaseline. Exemplo formal:

```
sessão atual = conversa pessoal
opportunity  = ativa
histórico    = proposta + preço + interesse + objeção
```

Resultado correto:

```
AGORA
  "Conversa pessoal. Nenhuma ação comercial nesta mensagem."

ANÁLISE (continua apresentando)
  - oportunidade ativa
  - problema
  - necessidades
  - proposta
  - objeções
  - pendências
  - condução
  - método
```

A sessão pessoal **não apaga a venda**. Uma implementação que, ao detectar
sessão não comercial, esvazia ANÁLISE inteira (em vez de apenas neutralizar
o que dependeria da sessão atual, como pitch ou próxima ação imediata) viola
este contrato. O que ANÁLISE não pode fazer numa sessão não comercial é
tratar a conversa atual como evidência nova de avanço comercial — mas ela
continua obrigada a mostrar o que já era verdade sobre a oportunidade antes
desta sessão.

O texto "quando houver evidência real na conversa" da versão anterior deste
contrato era restritivo demais se lido como "somente a sessão atual". A
formulação correta é: **evidência real, com proveniência**, que pode vir de
qualquer uma destas fontes — conversa atual, estado persistido (Opportunity
Reading), memória válida (Customer Memory), ou histórico da oportunidade —
nunca invenção, e nunca a fonte errada apresentada como se fosse outra (ver
seção 11, "conflito de informação").

### 6.2 Situação da oportunidade

- Resumo comercial.
- Evolução.
- Pendência central.

### 6.3 Cliente dentro da venda

Diferente de CLIENTE (seção 7), esta seção é sobre a leitura da pessoa **no
contexto desta oportunidade específica**: problema, necessidade, impacto,
prioridade, interesses, produto/serviço, critérios, orçamento/valor, prazo,
decisores, processo de decisão, objeções, incertezas, concorrentes,
perguntas abertas, gaps de descoberta.

### 6.4 Seller Coaching

Acertos, erros, impacto, como corrigir, perguntas ignoradas, descoberta
insuficiente, apresentação prematura, preço prematuro, pressão, repetição,
promessa arriscada, informação incorreta, avanço sem confirmação,
compromisso perdido.

**Regra de qualidade da avaliação (mantida sem alteração desta rebaseline):**
nunca aceitar elogio genérico como "bom atendimento" sem evidência concreta.
Toda afirmação sobre o vendedor (esta seção) e sobre o cliente (seção 6.3)
precisa apontar para uma ação, frase, ou evento específico — não uma
impressão geral. Este requisito já existe como invariante de código no
contrato V2 (`normalizeSellerStrengths` em `commercial-reading-contract.ts`
rejeita explicitamente variações de "bom atendimento"/"ótimo atendimento"
sem evidência) — a matriz de completude verifica se essa disciplina se
aplica em todos os caminhos, não só no V2.

### 6.5 Método

Etapa; etapas concluídas; parcial; pendente; aderência; desvio; onde saiu; o
que faltou; impacto; recovery. Não basta relatar a etapa atual sem avaliar
aderência — ver seção 6.1 da versão anterior, mantida: "dentro do método" /
"a conversa saiu do método" (com onde, o que aconteceu, o que faltou, o
impacto, e como voltar) são os dois estados possíveis.

### 6.6 Riscos

Momentum; follow-up; promessa; pressão; compromisso; oportunidade parada.

### 6.7 Melhor condução

A direção comercial recomendada. Isso **não significa necessariamente uma
mensagem** — mensagem é decisão de MENSAGEM (seção 8), não de ANÁLISE.

### 6.8 Regra de qualidade da avaliação (evidência)

(Ver seção 6.4 acima — regra unificada, sem duplicação com a seção
específica de coaching.)

---

## 7. Contrato de CLIENTE — PESSOA

**Pergunta que CLIENTE responde:** "O que sabemos e ainda precisamos
descobrir sobre esta pessoa?"

CLIENTE é **memória comercial persistente**, com horizonte que vai além da
sessão atual: entre sessões, e, quando semanticamente válido, **entre
ciclos**. Isto é uma extensão explícita da versão anterior deste contrato,
que acoplava CLIENTE demais a "daquela oportunidade" — parte da inteligência
sobre a pessoa (ex.: como ela se comunica, quem são os decisores do lado
dela) pode sobreviver entre ciclos quando a semântica permitir (ver seção
11, item 8, sobre até onde um fato atravessa ciclo).

### 7.1 Objetivo / contexto

Objetivo, necessidades, problemas, impactos.

### 7.2 Interesse

Interesses, produtos discutidos, funcionalidades valorizadas.

### 7.3 Decisão

Critérios, orçamento, timing, decisores, influenciadores, processo de
decisão.

### 7.4 Objeções / dúvidas

Objeções históricas, dúvidas, concorrentes.

### 7.5 Comunicação observada

Somente com evidência direta na conversa:

- "Responde de forma objetiva."
- "Costuma perguntar diretamente."
- "Prefere dados concretos."
- "Responde melhor a mensagens curtas."
- "Não respondeu bem a pressão."

**Proibido, sem exceção:**
- DISC inventado.
- Perfil psicológico.
- Personalidade inventada.
- Inferência baseada em uma única frase sem sustentação.

### 7.6 Ainda não sabemos (obrigatória)

Toda instância de CLIENTE precisa ser capaz de expor o que ainda não se
sabe, não apenas o que já se sabe. Exemplos: orçamento ainda desconhecido;
decisor não confirmado; timing incerto; impacto não quantificado; prioridade
não confirmada; processo de decisão desconhecido. **CLIENTE não é uma ficha
estática. É memória + descoberta pendente.** Uma implementação de CLIENTE
que só mostra o que já foi descoberto, sem nunca expor gaps, está incompleta
mesmo que tudo que ela mostre esteja correto.

### 7.7 O que NÃO pertence a CLIENTE

CLIENTE não deve virar:

- Análise do vendedor.
- Coaching.
- Avaliação de método.
- Resumo do momento atual.
- Lista de alertas operacionais.
- Dashboard de SLA.

Estas informações podem **usar fatos sobre o cliente** (ex.: uma objeção do
cliente pode alimentar um ponto de coaching em ANÁLISE), mas a avaliação em
si — o julgamento sobre a condução do vendedor, ou sobre o momento — não
pertence conceitualmente à aba CLIENTE. Um card de SLA sobre este cliente
aparece em AGORA (como Card de Intervenção) ou no histórico de
relacionamento dentro de CLIENTE como fato temporal, nunca como avaliação.

### 7.8 Histórico da relação e ações da Yolen

CLIENTE deve conseguir mostrar, quando a informação existir:

- Primeiro contato conhecido.
- Há quanto tempo a oportunidade existe.
- Tempo total em conversa.
- Última mensagem do cliente e última mensagem do vendedor.
- Quantidade de interações, quando mensurável.

Quando a telemetria permitir, CLIENTE também deve poder mostrar as ações que
a própria Yolen tomou nesta relação e como o vendedor reagiu a elas:

- Sugestão mostrada.
- Sugestão copiada.
- Sugestão inserida no campo de mensagem.
- Sugestão ignorada.
- Sugestão editada antes de enviar.
- Sugestão enviada como está.
- CRM aceito / CRM rejeitado.
- Agenda aceita / Agenda rejeitada.

Estes fatos são temporais e factuais (linha do tempo), não avaliação — uma
lista de sugestões copiadas não é um julgamento sobre o vendedor, apenas um
registro do que aconteceu. Isso os distingue do que a seção 7.7 proíbe.

---

## 8. Contrato de MENSAGEM — COMUNICAÇÃO

**Pergunta que MENSAGEM responde:** "Qual comunicação executa melhor a
decisão atual?"

MENSAGEM é a **última camada**. Ela não cria uma interpretação paralela da
venda — ela consome o que as camadas anteriores já decidiram.

### 8.1 Entradas

MENSAGEM deve, quando materializada tecnicamente (ver seção 16), consumir:

```
Current Moment
+
Opportunity Reading
+
Customer Memory
+
Seller Coaching
+
Method State
+
Commercial Facts
+
Operational Signals relevantes
+
Decision State
```

para gerar uma **Communication Decision**.

### 8.2 Regra central — MENSAGEM não introduz fato próprio

MENSAGEM nunca deve conter uma afirmação sobre a venda, o cliente, ou a
condução que não tenha sido produzida por Opportunity Reading, Customer
Memory, Seller Coaching, Method State ou Operational Signals e refletida no
Decision State. Se MENSAGEM "sabe" algo que ANÁLISE e CLIENTE não sabem,
isso é uma violação do contrato — é exatamente o cenário de "quatro cérebros
independentes" que a seção 2.1 proíbe.

### 8.3 Silêncio é saída válida

O resultado de MENSAGEM pode ser:

```
mensagem
```

OU:

```
silêncio
```

Silêncio é uma saída válida e esperada, não uma falha — mesma lógica do
princípio central (seção 1) e do estado de silêncio de AGORA (seção 4.6).

---

## 9. Um fato, uma origem, vários consumidores

```
UM FATO
→ UMA ORIGEM CANÔNICA
→ VÁRIOS CONSUMIDORES
```

Exemplo: "preço é uma preocupação" não pode existir como quatro verdades
independentes — uma para AGORA, outra para ANÁLISE, outra para CLIENTE,
outra para MENSAGEM. O futuro modelo de fato (contrato conceitual nesta
subfase — **nenhuma tabela ou schema novo é criado agora**) deve permitir
representar, no mínimo:

```
fact
evidence_refs
observed_at
updated_at
status
confidence
scope
```

`StatefulCommercialState` (`stateful-commercial-state.ts`) já implementa uma
aproximação real deste modelo hoje — `memory_status`
(`active`/`resolved`/`superseded`), `evidence_message_ids`, `confidence`,
`created_in_state_version`/`updated_in_state_version` — o que confirma que a
direção do contrato já tem precedente técnico; a extensão desse modelo para
cobrir todas as camadas do Commercial Brain (não só a memória de
oportunidade) é trabalho de subfase futura.

---

## 10. Temporalidade

| Camada | Horizonte |
|---|---|
| **Current Moment** | Curto. Sensível à sessão atual. |
| **Opportunity Reading** | Vida do ciclo/oportunidade. |
| **Customer Memory** | Persistente enquanto válida — pode atravessar ciclos quando a semântica permitir (ver seção 7 e seção 11, item 8). |
| **Operational Signal** | Vive até `resolve_condition`. |
| **Message** | Válida apenas para a decisão/comunicação atual. |

Esta tabela é a mesma distinção de horizonte que fundamenta a seção 3
(sessão não comercial vs. Decision State): Current Moment pode mudar a cada
mensagem; Opportunity Reading e Customer Memory não desaparecem só porque o
Current Moment mudou.

---

## 11. Conflito de informação

1. Evidência nova e explícita pode atualizar memória antiga.
2. Contradição não pode ser resolvida silenciosamente.
3. Conflito pode gerar incerteza / necessidade de confirmação.
4. Memória antiga não domina Current Moment.
5. Resumo derivado não substitui evidência primária.
6. Dado derivado deve possuir origem/data.
7. Fato da oportunidade não atravessa ciclo automaticamente.
8. Fato sobre a pessoa pode atravessar ciclos somente quando sua semântica
   permitir (ex.: "prefere mensagens curtas" tende a atravessar; "vai
   decidir sexta" é específico do ciclo e não deveria).

Estas 8 regras normativas se aplicam a qualquer camada de memória do
Commercial Brain (Opportunity Reading e Customer Memory), inclusive à
implementação real hoje em `StatefulCommercialState`.

---

## 12. Segurança — invariantes permanentes

As invariantes abaixo não são negociáveis e não podem ser revertidas por
nenhuma capacidade nova, por mais valiosa que pareça:

1. CRM nunca é alterado automaticamente — sempre requer confirmação humana
   explícita.
2. Agenda nunca é alterada automaticamente — sempre requer confirmação
   humana explícita.
3. Toda sugestão operacional (CRM/Agenda) exige confirmação humana antes de
   se tornar realidade no sistema.
4. Isolamento por `company_id` em toda leitura e escrita — nenhum dado
   cruza empresas. Isto se estende explicitamente a AGORA, ANÁLISE, CLIENTE,
   MENSAGEM e a qualquer Card de Intervenção: trocar de lead (A → B) não
   pode deixar vestígio do Decision State, da memória, ou de cards de A
   visível em B (ver cenário canônico 8).
5. Toda afirmação sobre a conversa precisa de evidência (mensagem ou memória
   persistida referenciável) — nunca invenção.
6. Estado stateful (V2) só é exposto ao vendedor depois de confirmada a
   persistência — nunca antes.
7. Existe fallback seguro (V1) para quando o motor mais avançado falha,
   trava, ou estoura o orçamento de tempo do ciclo (ver
   `docs/companion-v2/PHASE_5_1_STATEFUL_COPILOT.md` e o deadline de ciclo
   descrito em `stateful-copilot-cycle-deadline.ts`).
8. Proibido inventar preço.
9. Proibido inventar desconto.
10. Proibido inventar promessa que o vendedor/empresa não fez.
11. Proibido inventar produto que não foi discutido.
12. Proibido inverter o papel comercial — nunca tratar o cliente comprador
    como se fosse fornecedor, ou vice-versa, sem evidência clara do papel
    real na conversa.
13. **Proibido inventar percentual de risco** (ex.: "72% de chance de
    perder") sem base estatística real calibrada com dados da própria
    operação. Probabilidade futura só pode ser apresentada quando existirem
    dados suficientes para calibração — caso contrário, o produto deve usar
    classificações qualitativas (baixo/médio/alto), nunca um número que
    sugere precisão que não existe. Esta invariante se aplica a qualquer
    área que apresente risco — AGORA (prioridade de Cards de Intervenção),
    ANÁLISE (riscos da oportunidade) e CLIENTE.
14. **Uma conversa de grupo nunca herda o Commercial Brain de um
    participante individual.** Nenhuma das quatro áreas, nem um Card de
    Intervenção, pode renderizar Decision State ou memória de um indivíduo
    dentro do contexto de um grupo (ver cenário canônico 9). Isto preserva
    todos os gates de identidade N→AM já existentes.
15. Um Card de Intervenção sem `resolve_condition`/`expires_at` explícito
    não satisfaz o contrato da seção 4.3 — cards não podem ser permanentes
    por omissão.

---

## 13. Fora de escopo deste contrato

- **Inteligência Gerencial** (`app/lib/companion/managerial-intelligence-contract.ts`
  e arquivos `managerial-*`): é uma camada de agregação sobre múltiplos
  vendedores/ciclos, destinada a um gestor, com escopo definido por
  `company_id` + período + time/vendedor. Consome sinais que se originam do
  Companion (ex.: eventos de ação, leitura comercial), mas seu contrato de
  produto é separado — não faz parte da experiência de UM vendedor dentro de
  UMA conversa. Uma futura auditoria de "Yolen para Gestores" deve tratar
  isso à parte.
- **Message Intelligence Engine (MIE)** seller-facing: permanece
  desativado. Este contrato descreve o comportamento correto de MENSAGEM
  (seção 8) para orientar a materialização técnica futura do MIE, mas não
  autoriza nenhuma ativação, variável de ambiente, allowlist de empresa, ou
  prompt novo nesta fase.
- **P1-03 (`INVALID_COMMUNICATION_OUTPUT`)** e **P1-04 (relevância
  comercial na produção)**: são bugs/lacunas conhecidos, tratados em ondas
  próprias pela Frente 1. Este contrato descreve o comportamento correto
  (seção 3, "relevância comercial" antes de qualquer ação comercial); a
  matriz de completude registra o estado real desses itens sem alterá-los.
- Extensão de captura (mecanismos de leitura do WhatsApp Web, resiliência de
  captura, transcrição de áudio): são infraestrutura que alimenta este
  contrato, não capacidades de produto descritas aqui — auditados na matriz
  apenas como evidência de que os dados chegam à análise.

---

## 14. Critério de "pronto"

O Yolen Companion só pode ser chamado de pronto para uma capacidade quando,
simultaneamente:

1. Existe um contrato de dados validado (tipo TypeScript com normalização e
   invariantes).
2. Existe um runtime que produz esse dado a partir de conversas reais.
3. O runtime está de fato ligado ao caminho de produção usado pela maioria
   das empresas (não apenas um piloto de uma empresa, nem um endpoint de
   preview).
4. A extensão renderiza esse dado para o vendedor de forma que ele consiga
   agir sobre ele.
5. Existe teste determinístico cobrindo o comportamento (incluindo os casos
   de ausência/silêncio, não só o caminho feliz).
6. As invariantes de segurança da seção 12 estão verificadas para essa
   capacidade especificamente.

A falta de qualquer um destes seis pontos classifica a capacidade como não
concluída na matriz de completude, mesmo que os outros cinco estejam
satisfeitos.

---

## 15. As perguntas que o vendedor precisa conseguir responder

Ao abrir uma conversa no WhatsApp, a Yolen precisa ser capaz de ajudar o
vendedor a responder às perguntas abaixo. Cada grupo corresponde
predominantemente a uma das quatro áreas (seção 2), embora o Commercial
Brain que as alimenta seja único (seção 2.1).

### 15.1 O que está acontecendo (AGORA + ANÁLISE)
- O que está acontecendo nesta venda?
- O cliente realmente está falando de uma venda agora, ou é uma conversa
  pessoal/administrativa sem relevância comercial nesta sessão?
- O que ele quer? Qual problema ele possui?
- O que ainda não descobri sobre ele?
- O que ele valoriza? O que influencia a decisão dele?
- Quais objeções estão abertas? O que já foi resolvido?
- Em que ponto da venda estamos?

### 15.2 Método e condução (ANÁLISE)
- Em que ponto do método comercial estamos?
- Eu estou conduzindo conforme o método? Eu saí do método? Onde saí? Como
  volto?
- O que fiz corretamente? Onde errei? Por que isso foi um erro? Como
  corrijo?

### 15.3 Tempo e risco (AGORA)
- O cliente está esperando por mim? Há quanto tempo?
- Estou demorando demais?
- Essa oportunidade está parada?

### 15.4 Histórico e relação (CLIENTE)
- O que já aconteceu com esse cliente?
- Há quanto tempo estamos conversando?
- Como esse cliente costuma se comunicar?

### 15.5 Decisão de ação (AGORA → MENSAGEM)
- Qual deve ser minha melhor condução agora?
- Eu realmente preciso responder? O que eu poderia responder?
- CRM precisa mudar? Agenda precisa mudar? Ou a Yolen deve simplesmente
  ficar quieta?

Uma capacidade que não ajuda a responder a nenhuma destas perguntas não
pertence a este contrato de produto — deve ser avaliada como pertencente a
outro produto (ex.: inteligência gerencial, ver seção 13).

---

## 16. O que esta rebaseline formaliza vs. o que fica para as subfases seguintes

**Formalizado nesta fase (contrato de produto):**
- Fronteira definitiva AGORA/ANÁLISE/CLIENTE/MENSAGEM (seção 2).
- Distinção sessão não comercial vs. Decision State (seção 3).
- Estrutura, limite de cards, prioridade e regra proativa de AGORA (seção
  4).
- Regra central de ANÁLISE preservar a oportunidade além da sessão atual
  (seção 6.1).
- Horizonte de CLIENTE entre sessões/ciclos e "Ainda não sabemos" como
  seção obrigatória (seção 7).
- MENSAGEM como consumidora, nunca originadora de fato (seção 8).
- Regra "um fato, uma origem, vários consumidores" (seção 9).
- Temporalidade por camada (seção 10) e regras de conflito de informação
  (seção 11).

**Explicitamente fora de escopo — pertence a FASE 16.2 ou posterior:**
- Reauditoria completa das fontes atuais de implementação (isso é o
  propósito declarado da FASE 16.2 — ver
  [`companion-seller-gap-matrix.md`](./companion-seller-gap-matrix.md)).
- Qualquer novo `CommercialBrain` em produção, tabela nova, migration,
  motor de Cards de Intervenção real, integração real de SLA/Agenda/inbound/
  follow-up.
- Qualquer ativação, configuração ou prompt do MIE seller-facing.
- Redesign visual ou UI nova.

Esta seção existe para que nenhum engenheiro futuro confunda "o contrato
agora descreve Decision State e Cards de Intervenção" com "Decision State e
Cards de Intervenção já existem em produção". Eles não existem ainda como
motor de produção — só como contrato normativo, validado pelos cenários
canônicos e pela validação determinística desta fase.
