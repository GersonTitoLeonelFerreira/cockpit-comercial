# Matriz de condição de corrida — arquitetura progressiva do Companion

## Papel deste documento

Cenários obrigatórios (A–I, conforme mandato da Frente Paralela 3) para
provar que a arquitetura progressiva (captura contínua → debounce → leitura
rápida → relevance gate → V2 profundo em background → resultado
seller-facing) não deixa um job obsoleto vencer, vazar entre conversas, ou
duplicar efeito. Cada cenário indica se já é executável hoje (contra o
comportamento real do V1/pré-background) ou se depende dos PRs A/B/C da
Frente Principal.

Convenção de classificação (mandato, seção 14): `PASS`, `PASS COM RESSALVA`,
`FAIL`, `BLOCKER`. Vazamento cross-conversa/cross-tenant/cross-cycle e
resultado obsoleto sobrescrevendo estado atual são `BLOCKER` por definição.

## Achado que atravessa toda a matriz

A auditoria desta frente (sem alterar runtime) confirmou que **o gap central
dos cenários B, D, E, F e I já existe hoje, antes de qualquer arquitetura de
background** — porque o único guard de "resposta ainda é válida para a
conversa atual" que existe no código é `isStillCurrentContext()`, usado
somente por `loadCompanionClientContextForCurrentCycle()`
(content-script.js:8608-8618). `analyzeCurrentConversation()`
(content-script.js:11340-11527) não tem esse guard: ela captura `cycleId` no
início e aplica `conversationAnalysis: result.payload.data`
incondicionalmente quando a resposta chega, sem verificar se a conversa
ainda é a mesma.

Isso significa que a nova arquitetura progressiva não está introduzindo um
risco novo — ela está tornando um risco **já existente e já comprovado**
muito mais provável de se manifestar, porque troca uma chamada síncrona
curta por um job de segundo plano genuinamente longo.

**Prova executável desta afirmação**, sem alterar nenhum arquivo de runtime:

```text
app/extension/yolen-companion/tests/e3-dom/content-script-dom-stale-analysis-cross-conversation-race.test.mjs
```

Rodar com:

```bash
npm run test:companion-extension-dom
```

Este teste carrega o `content-script.js` real (não modificado) e falha hoje
— a falha é a evidência do gap, não um teste quebrado. O sintoma real não é
"o texto da conversa A aparece na tela da B": é mais sutil — o resultado
válido de B é silenciosamente revertido para o banner genérico "A conversa
mudou desde a última leitura", porque o fingerprint de A contamina o estado
interno usado para decidir se a leitura de B está desatualizada. Ele deve
virar verde quando um guard equivalente a `isStillCurrentContext()` for
aplicado a `analyzeCurrentConversation` — fora do escopo desta frente.

## Triagem do Controle Mestre (registrada sobre o PR #206)

O Controle Mestre confirmou o cenário B como **BLOCKER estrutural da Fase
12A** e decidiu:

1. A correção pertence à **Frente Principal**, preferencialmente no primeiro
   PR que tocar o ciclo de vida de um resultado assíncrono (PR A — background
   foundation) — nunca nesta frente.
2. **Regra obrigatória** (vinculante para a arquitetura progressiva): todo
   resultado assíncrono deve continuar vinculado ao contexto que iniciou a
   operação (`company_id`, `cycle_id`, `conversation_key`,
   watermark/fingerprint apropriado). Quando o resultado chegar, se a
   conversa atualmente exibida for diferente, **não aplicar esse resultado à
   UI atual**. Na arquitetura de background futura, o resultado pode
   continuar pertencendo/persistindo para a conversa original (A) — o que é
   proibido é `resultado A → estado/UI de B`.
3. **Cenário bidirecional obrigatório**, explicitamente detalhado pelo
   Controle Mestre: "A inicia → B abre → B analisa → A termina depois". O
   resultado de A não pode: substituir a análise de B; substituir o
   fingerprint de B; marcar B falsamente como desatualizada; alterar
   loading/error de B; alterar as áreas AGORA/ANÁLISE/CLIENTE de B.
4. **Regressão obrigatória**: depois da correção, o mesmo cenário deve ser
   trazido ou replicado na branch principal e provar `PASS`, sem depender do
   PR #206 estar mergeado. Quando a correção entrar na `main`, esta frente
   atualiza sua branch e o teste original deve passar.

O teste `content-script-dom-stale-analysis-cross-conversation-race.test.mjs`
foi expandido para servir exatamente como esse checklist de regressão — cada
um dos cinco pontos do item 3 acima é um `test()` independente no arquivo,
para que a correção possa ser validada ponto a ponto, não só como um
resultado agregado. Estado atual (antes da correção):

| # | Verificação | Resultado hoje |
|---|---|---|
| 1/5 | Análise de B não é substituída pela de A | `FAIL` |
| 2/5 | Fingerprint de B não é contaminado pelo de A | `FAIL` |
| 3/5 | Loading/error de B não é alterado pela chegada tardia de A | `PASS` |
| 4/5 | Área ANÁLISE de B não é contaminada | `FAIL` |
| 5/5 | Área CLIENTE de B não é afetada (controle) | `PASS` |

Os itens 3/5 e 5/5 já passam hoje porque usam estados internos separados
(`conversationAnalysisLoading`/`conversationAnalysisError` não são tocados
pela resposta bem-sucedida de A; `companionClientContext` já tem seu próprio
guard `isStillCurrentContext()`). Os itens 1/5, 2/5 e 4/5 são exatamente o
que a correção da Frente Principal precisa fazer virar `PASS`, sem regredir
os dois que já passam.

## Validação independente do PR #208 — 5/5 PASS confirmado

O PR #208 (`fix(companion): isola resposta de análise por contexto de
conversa (A->B)`, head `8599d0a8c3b88917327556e789e2b32c9bca73dd`, ainda
**aberto, não mergeado** em `main` no momento desta validação) implementa
exatamente o guard pedido: um contador monotônico
`conversationAnalysisRequestSequence` incrementado a cada início de análise
(automática ou manual), mais uma função
`isAnalysisResponseStillCurrent()` que só libera a aplicação de uma
resposta se (a) nenhuma requisição mais nova já começou (`requestSequence
=== conversationAnalysisRequestSequence`) **e** (b) o contexto atual
(`cycle_id`+`conversation_key`, via `getCaptureConversationKey()`) ainda é
o mesmo que pediu a análise — reaproveitando a mesma função pura
`shouldApplyConversationRegistrationResult` que já protegia "Registrar
conversa" (`conversation-registration-tools.js`, PR #207), agora chamada
via `globalThis.X` em vez de `window.X` em todos os pontos (o que também
resolve, na origem, o gap de sandbox de teste que esta frente havia
contornado no harness — ver commit `4a3a6fa`). O guard é checado tanto no
caminho de sucesso quanto no bloco `catch` — uma resposta de erro atrasada
também é descartada, não só um sucesso atrasado.

**Validação foi feita sem esperar o merge administrativo**, via worktree
temporário (`git worktree add /tmp/pr208-validate 8599d0a8...`, removido ao
final — nunca mergeado nem tocado na branch persistente do PR #206), usando
três baterias independentes contra o head exato do PR #208:

1. **Meu próprio teste original** (`content-script-dom-stale-analysis-cross-conversation-race.test.mjs`,
   não modificado) rodado contra o código do PR #208:

   | # | Verificação | Antes (`ba21b8f`) | Depois (PR #208, `8599d0a`) |
   |---|---|---|---|
   | 1/5 | Análise de B não é substituída pela de A | `FAIL` | **`PASS`** |
   | 2/5 | Fingerprint de B não é contaminado pelo de A | `FAIL` | **`PASS`** |
   | 3/5 | Loading/error de B não é alterado pela chegada tardia de A | `PASS` | **`PASS`** |
   | 4/5 | Área ANÁLISE de B não é contaminada | `FAIL` | **`PASS`** |
   | 5/5 | Área CLIENTE de B não é afetada (controle) | `PASS` | **`PASS`** |

   **5/5 PASS, confirmado de forma independente.** Nenhum dos dois itens
   que já passavam antes regrediu.

2. **A própria suíte nova do PR #208**
   (`content-script-dom-analysis-context-guard.test.mjs`, 5 testes: resposta
   atrasada cross-conversa, fingerprint, A→B→C→volta A, duplo-clique
   same-conversation, non-commercial cross-conversa) rodada como
   contraprova — **5/5 PASS**, incluindo verificação de que a telemetria
   `suggestion_shown` (`REGISTER_ACTION_EVENT`) não é emitida para o ciclo
   de origem quando a resposta é descartada por estar obsoleta (fecha a
   exigência da seção 7 do mandato sobre telemetria stale, para o caso
   cross-conversa).

3. **Dois novos testes desta frente**, escritos e validados de forma
   totalmente independente da suíte do PR #208, cobrindo dois sub-cenários
   do sequence guard que nem meu teste original nem a suíte do PR #208
   exercitavam:

   - `content-script-dom-analysis-sequence-guard-adversarial.test.mjs`
     (2 testes): (1) um **erro** de uma tentativa antiga chegando depois de
     um **sucesso** mais novo já aplicado (mesma conversa) — prova que o
     guard no bloco `catch` funciona de verdade, não só por leitura de
     código; (2) um resultado **comercial** antigo chegando depois de um
     resultado mais novo **sem evidência comercial** (mesma conversa) —
     prova que o guard é agnóstico ao conteúdo (sequência + identidade,
     não semântica de negócio), fechando a exigência da seção 5 do mandato
     sobre "erro antigo não deve substituir sucesso novo" e "resultado
     antigo não deve reintroduzir CTA".
   - `content-script-dom-analysis-multihop-guard-adversarial.test.mjs`
     (1 teste): três conversas (A/B/C) com análise disparada em cada uma
     antes de qualquer resposta chegar, respostas resolvidas fora de ordem
     (C, depois A, depois B) enquanto o vendedor permanece em C, e depois
     confirma que voltar para A e para B mostra o estado inicial (nunca
     analisado) — não um "resultado fantasma" reaparecendo. Prova mais
     forte do que "não aparece agora": prova que uma resposta descartada
     nunca é aplicada a `state` em lugar nenhum, nem fica "esperando"
     silenciosamente para reaparecer depois.

   **Ambos os arquivos falham hoje (2/2 e 1/1) contra a branch atual do
   PR #206** (esperado — o guard ainda não existe aqui) **e passam 100%
   contra o head do PR #208** (2/2 e 1/1). Ficam commitados nesta branch
   documentando o gap remanescente, exatamente como o teste original já
   fazia, e devem virar verdes junto com ele quando `origin/main` (com o
   PR #208 já mergeado) for trazido para esta branch.

**Conclusão desta seção**: a correção do PR #208 é estruturalmente sólida e
passou em toda bateria adversarial aplicada até agora, incluindo dois
sub-cenários e um cenário multi-hop que a própria suíte do PR #208 não
cobria. **Nenhum `BLOCKER` novo encontrado.** A branch do PR #206
permanece, por instrução do Controle Mestre, sem o merge de `origin/main`
até o PR #208 ser integrado administrativamente — os três arquivos de teste
citados acima já estão prontos e só aguardam esse merge para virarem verdes
nesta branch.

## PR #207 mergeado — nova matriz real (A–N) substitui a numeração histórica abaixo

O PR #207 (`ba21b8f`, "move análise profunda stateful para background
durável") mergeou em `main` depois que a matriz original (seção seguinte,
cenários A–I) foi escrita. Ele entrega jobs duráveis reais: Vercel Queue,
consumer separado, `companion_background_analysis_jobs`, watermark
canônico, snapshot congelado, serialização por conversa, leases,
redelivery guards e persistência V3. Isso torna vários cenários antes
teóricos executáveis contra implementação real.

**Atenção a uma diferença estrutural importante**: a numeração de letras do
Controle Mestre mudou entre o mandato original (A–I, sobre a arquitetura
síncrona V1) e o mandato pós-PR#207 (A–N, sobre os jobs de background
reais) — **as letras não correspondem ao mesmo cenário nas duas listas**.
A seção "Matriz histórica" abaixo (cenários A–I originais) é mantida como
está, sem renumerar, para não quebrar as referências já registradas na
Triagem do Controle Mestre acima (que cita "cenário B" no sentido
histórico). A nova matriz A–N desta seção é a referência atual para tudo
relacionado a jobs de background.

### Identificadores reais confirmados (auditoria desta frente, sem alterar runtime)

- **Job id**: `analysis_job_id` — não é aleatório. É
  `sha256(JOB_VERSION, company_id, cycle_id, conversation_key, message_watermark)`,
  hex de 64 caracteres (`stateful-copilot-background-job.ts`,
  `buildStatefulCopilotBackgroundJobDescriptor`). Determinístico: o mesmo
  escopo+watermark sempre produz o mesmo id.
- **Watermark canônico**: `message_watermark` (texto opaco, sem formato
  exigido pela migration além de `not null`) — na prática é o
  `message_snapshot_hash` enviado pelo cliente ou o hash do texto da
  conversa calculado no servidor. É o único watermark que participa da
  identidade do job; os outros dois sinais já documentados nesta pasta
  (versão de estado, conjunto de ids de mensagem) continuam existindo só na
  camada de persistência do estado comercial, não no job em si.
- **Serialização por conversa**: dupla trava real no banco —
  `companion_background_analysis_jobs_scope_unique` em
  `(company_id, cycle_id, conversation_key, message_watermark)` (dedup de
  enqueue) e um **índice único parcial**
  `companion_background_analysis_jobs_one_running_per_conversation_idx` em
  `(company_id, cycle_id, conversation_key) where status = 'running'`
  (só um job pode estar `running` por conversa a qualquer momento — isto
  serializa a execução de jobs concorrentes da mesma conversa de verdade,
  não só por convenção de aplicação).
- **Lease**: `STATEFUL_COPILOT_BACKGROUND_RUNNING_LEASE_MS = 210_000` (210s).
  Reclamação por concorrência otimista: se `running` e o lease não expirou,
  lança `BACKGROUND_JOB_ALREADY_RUNNING`; se expirou, um worker pode
  reclamar comparando o `started_at` exato da tentativa anterior.
- **Superseded**: `status = 'superseded'`, decidido **uma única vez**, antes
  do claim, por `select ... where (company_id,cycle_id,conversation_key) = ...
  and requested_at > job.requested_at` — se existir linha mais nova, o job
  atual vira `superseded` e nunca chega a rodar o runtime. Não há uma
  segunda checagem entre "runtime terminou" e "grava succeeded" — mas,
  como o índice único parcial serializa execução (só um `running` por
  conversa), um job mais novo não consegue começar a rodar enquanto o mais
  velho ainda está com o lease, e ao ser liberado o mais novo sempre roda
  sua própria checagem de superseded antes de reivindicar — na leitura do
  código, isso fecha a janela de corrida entre dois jobs realmente
  concorrentes. **Não confirmado por execução real** (ver "O que continua
  sem verificação" abaixo).
- **Redelivery**: `idempotencyKey: analysis_job_id` no publish da fila +
  status terminal (`succeeded`/`failed`/`superseded`) como curto-circuito +
  toda escrita de transição condicionada a
  `.eq('status','running').eq('started_at', startedAt)` (uma redelivery
  atrasada não pode sobrescrever um resultado já commitado por outra
  execução do mesmo job).
- **Retry**: nível de fila (`retryAfterSeconds: 15`, `vercel.json`) +
  aplicação (`shouldRetryStatefulCopilotBackgroundFailure`, máximo 5
  tentativas via `delivery_count` da própria fila — não há um contador de
  tentativa separado no banco além do espelho `attempt_count`).
- **Achado estrutural mais importante desta auditoria**: **não existe
  nenhum caminho, nesta PR, que devolva o resultado profundo (`succeeded`)
  ao vendedor.** A resposta síncrona de `POST /api/companion/analyze-conversation`
  no modo `active` inclui só um envelope de identidade/status
  (`deep_analysis: {analysis_job_id, status, message_watermark}`), nunca o
  conteúdo do resultado profundo. Não há endpoint de polling nem qualquer
  código na extensão que leia de volta um job `succeeded`. Isso significa
  que **vários cenários abaixo ainda não têm como se manifestar como bug
  visível ao vendedor hoje** — mas o guard que os preveniria também não
  existe ainda, então quem construir o caminho de entrega (PR B/C) herda a
  obrigação de aplicá-lo desde o primeiro commit que ligar isso à UI, não
  depois.

### Matriz A–N (mandato pós-PR #207)

| # | Cenário | Esperado | Estado real (evidência) | Classificação | Executável agora? |
|---|---|---|---|---|---|
| A | Job A inicia → termina normalmente | Resultado profundo é computado e persistido para A | Caminho feliz. Constraints de banco provadas por `phase-12a-background-jobs-database-contract.test.mjs` (novo, 7/7 `PASS`, `npm run test:companion-background-jobs-db`). Execução real do worker (claim → runtime → persist) só tem cobertura por regex (`phase12a-background-analysis-foundation.test.mjs`), não por execução. | `PASS COM RESSALVA` — contrato de dados provado; orquestração ponta a ponta não exercitada por nenhum teste (nem os já existentes, nem o novo desta frente). | Parcial (DB sim, worker completo não — `createAdminClient()` cria o client Supabase real internamente, sem seam de injeção; testar o worker de ponta a ponta exigiria mock de módulo (`node:test` `mock.module`, experimental) ou um Supabase real/local, fora do escopo desta passada). |
| B | Job A inicia → usuário abre B → A termina | Resultado de A nunca aparece em B | **Ainda não aplicável ao resultado profundo** — não existe caminho de entrega (ver achado estrutural acima). Aplicável hoje só à resposta rápida/síncrona (`suggestion`/`coaching` de V1), que é exatamente o mesmo `analyzeCurrentConversation` já provado `BLOCKER` na seção "Triagem do Controle Mestre". | `BLOCKER` já registrado (caminho rápido) / `N/A` (caminho profundo, ainda sem entrega) | Caminho rápido: sim (já executado). Caminho profundo: não aplicável ainda — **fica registrado como requisito obrigatório para quando o caminho de entrega for construído**, não como pendência nova. |
| C | Watermark 1 → nova mensagem → watermark 2 → job 2. Resultado antigo nunca degrada estado novo | Job de watermark 1 não sobrescreve a interpretação da versão 2 | Dupla proteção: (1) CAS na persistência do estado comercial (inalterado pela V3, confirmado pela auditoria — `expected_previous_state_version` continua rejeitando escrita desatualizada); (2) supersede-check do job antes do claim (ver acima). | `PASS COM RESSALVA` — as duas camadas de proteção existem e têm evidência (CAS já testado; supersede-check provado por SQL direto nesta frente), mas nenhum teste faz as DUAS mensagens correrem de fato em paralelo contra o worker real. | Parcial — ver DB contract test (`(E/I)` no arquivo novo) para a query de supersede; CAS já coberto por testes pré-existentes. |
| D | Dois triggers equivalentes para o mesmo snapshot → idempotência/coalescing | Dois enqueues idênticos não geram dois jobs efetivos | **Provado.** `companion_background_analysis_jobs_scope_unique (company_id, cycle_id, conversation_key, message_watermark)` — segundo enqueue idêntico colide na constraint; o route trata o erro `23505` como "job já existe, reusar". | `PASS` | **Sim — novo teste `(D)` em `phase-12a-background-jobs-database-contract.test.mjs`, execução real contra Postgres (PGlite), não regex.** |
| E | Job antigo demora → job mais novo termina antes | Antigo é superseded/neutralizado e nunca vence | Provado ao nível de query (a mesma consulta que o worker usa) e ao nível de design (índice único parcial impede os dois de rodarem `running` ao mesmo tempo — ver "Achado" acima). | `PASS COM RESSALVA` | **Sim, ao nível de contrato de dados — novo teste `(E/I)`.** Execução real de dois jobs concorrentes contra o worker de verdade: não feita. |
| F | Redelivery da Queue | Não produz intervenção duplicada | `idempotencyKey` no publish + status terminal como curto-circuito + escrita condicionada ao lease (`started_at` exato). Toda essa lógica só tem cobertura por regex hoje (`phase12a-background-concurrency.test.mjs`, teste "failed é terminal para redelivery duplicada" — string matching, não executa o worker duas vezes de verdade). | `PASS COM RESSALVA` | Não — exigiria simular uma redelivery real da fila contra o worker, não feito nesta passada. |
| G | Lease concorrente | Um worker efetivo por job/conversa | **Provado ao nível de constraint**: índice único parcial `one_running_per_conversation_idx` rejeita um segundo `running` para a mesma conversa mesmo com watermark diferente; depois que o primeiro termina, um novo `running` é aceito normalmente. | `PASS` | **Sim — novo teste `(G)` em `phase-12a-background-jobs-database-contract.test.mjs`.** A reclamação de lease expirado (`runningLeaseExpired`, comparação de `started_at` exato) só tem cobertura por regex — não testado com tempo real/mockado. |
| H | Job falha → retry | Retry controlado e sem duplicar estado válido | `shouldRetryStatefulCopilotBackgroundFailure` (máx. 5 tentativas via `delivery_count` da fila) só tem teste de unidade para a função pura (`stateful-copilot-background-job.test.mjs` — este sim executa a função real, não é regex). O caminho completo (falha → reset para `queued` → throw → fila redeleta → reclaim) não é exercitado ponta a ponta. | `PASS COM RESSALVA` | Parcial — a função de decisão de retry é testada de verdade; o fluxo completo, não. |
| I | Reload da extensão durante job | Job continua pertencendo à conversa correta | Sem caminho de entrega do resultado profundo (achado estrutural acima), não há "estado errado" possível de aparecer na extensão hoje — o job continua existindo no banco, isolado por escopo, independentemente de reload do cliente. | `N/A` hoje / requisito futuro | Não aplicável até existir consumo client-side do resultado profundo. |
| J | Usuário troca B → C → A enquanto job A roda | Ao voltar para A, só estado de A pode aparecer | Mesma situação do item B — aplicável hoje só ao caminho rápido (herdando o mesmo `BLOCKER`); não aplicável ao resultado profundo por falta de entrega. | `BLOCKER` (caminho rápido, herdado) / `N/A` (profundo) | Caminho rápido: extensão trivial do teste já existente, não duplicada aqui para não fragmentar o mesmo achado. Caminho profundo: pendente de entrega. |
| K | Ciclo fechado enquanto job está em voo | — | FK `(company_id, cycle_id) references sales_cycles(company_id, id) on delete restrict` impede que o ciclo seja **excluído** enquanto há jobs referenciando-o (`on delete restrict`, provado indiretamente pelo teste `(L)` desta frente, que usa a mesma FK). Não encontrada nenhuma lógica que trate especificamente um ciclo **fechado/perdido/ganho** (mudança de `status`, não exclusão) enquanto um job está em voo — o worker não consulta `sales_cycles.status` em nenhum momento do trecho lido. | `PASS COM RESSALVA` (proteção contra exclusão) / **gap não coberto** (mudança de status durante o job) | Parcial — a proteção de FK contra exclusão é coberta pelo teste `(L)`; o comportamento com ciclo fechado por mudança de status não tem teste nem evidência de tratamento no código lido. |
| L | Lead/cycle alterado validamente depois do snapshot | — | O job está ligado a `cycle_id` fixo, não a `lead_id` — uma alteração no lead (nome, telefone) depois do snapshot não afeta a identidade do job. Reatribuição de dono (`owner_user_id`) do ciclo durante o job: não verificada nesta auditoria. | `PASS COM RESSALVA` | Não testado nesta passada — cenário de menor prioridade dado que o job não referencia dados mutáveis do lead diretamente. |
| M | Job superseded antes de terminar | — | Ver cenário E — a única checagem de supersede acontece antes do claim; não há segunda checagem entre "runtime terminou" e "grava succeeded". Pela análise de design (índice único parcial serializando `running`), a janela de corrida onde isso importaria não deveria se abrir na prática — mas isso é uma inferência de leitura de código, não uma prova por execução. | `PASS COM RESSALVA` — **maior prioridade de investigação adicional recomendada ao Controle Mestre antes de qualquer promoção além do piloto.** | Não — exigiria forçar deliberadamente a janela de corrida (dois workers reais, ou mock de timing) contra o worker de verdade. |
| N | Resultado chega depois de uma análise manual mais nova | Resultado antigo não sobrescreve uma análise manual mais recente | "Análise manual" (clique em "Analisar agora") hoje usa o mesmo caminho síncrono de sempre (`analyzeCurrentConversation`), sem nenhuma relação com `message_watermark`/jobs de background. Se um job de background antigo algum dia for entregue à UI (quando o caminho de entrega existir), ele precisará checar contra o estado exibido no momento, exatamente a mesma lacuna do cenário B/J. | `BLOCKER` (herdado, mesma causa raiz) / `N/A` (sem entrega ainda) | Não — depende do caminho de entrega existir primeiro. |

### O que continua sem verificação (declarado ao Controle Mestre)

Nenhum teste — nem os pré-existentes (`phase12a-background-analysis-foundation.test.mjs`,
`phase12a-background-concurrency.test.mjs`, ambos regex sobre texto-fonte)
nem os novos desta frente (`phase-12a-background-jobs-database-contract.test.mjs`,
que exercita constraints de banco reais mas não a função TypeScript do
worker) — **invoca `processStatefulCopilotBackgroundMessage` de verdade**.
`createAdminClient()` cria o client Supabase real internamente
(`app/lib/server/stateful-copilot-background-worker.ts:74-105`), sem
nenhum ponto de injeção — testar essa função exigiria `node:test`
`mock.module` (experimental, precisaria de flag dedicada) ou um ambiente
Supabase real/local. Isso foi avaliado e considerado fora do orçamento
desta passada, dado o risco de um mock manual da cadeia de chamadas
encadeadas (`.eq().eq().gt().maybeSingle()`, updates condicionais) produzir
falsa confiança se a simulação não replicar exatamente a semântica do
Postgres real — os testes de contrato de banco (SQL direto contra Postgres
real via PGlite) foram priorizados por serem mais confiáveis com o mesmo
esforço. Registrado como gap explícito, não escondido.

## Matriz histórica (pré-PR #207 — cenários A–I originais, mantida para rastreabilidade)

## Cenário A — Conversa A inicia análise, usuário permanece em A, resultado chega

| Campo | Conteúdo |
|---|---|
| Setup | Job (hoje: chamada síncrona) iniciado para A; usuário não sai de A. |
| Esperado | Resultado de A é aplicado normalmente à tela de A. |
| Estado hoje | Caminho feliz, já funciona (é o único caminho que o V1 exercita hoje). |
| Executável agora? | Sim — coberto implicitamente por qualquer teste de análise básica (`content-script-dom-seller-information-architecture.test.mjs`). |
| Pendente PR A/B/C | Reexecutar contra leitura rápida + resultado profundo quando existirem dois estágios. |

## Cenário B — A inicia, usuário troca para B, resultado de A chega depois

| Campo | Conteúdo |
|---|---|
| Esperado | Resultado de A nunca aparece em B. |
| Classificação se violado | `BLOCKER`. |
| Estado hoje | **BLOCKER confirmado e triado pelo Controle Mestre** — ver "Achado que atravessa toda a matriz" e "Triagem do Controle Mestre" acima. Correção atribuída à Frente Principal (PR A), não a esta frente. |
| Executável agora? | **Sim, já executado — 2/5 PASS, 3/5 FAIL** — `content-script-dom-stale-analysis-cross-conversation-race.test.mjs` (`npm run test:companion-extension-dom`). |
| Pendente PR A/B/C | Depois da correção: reexecutar este mesmo arquivo (os 5 `test()`) contra a `main` corrigida e provar os 5/5 `PASS`, sem depender do PR #206 estar mergeado; depois reexecutar contra a leitura rápida e o resultado profundo em background quando esses dois estágios existirem — o guard precisa cobrir ambos, não só a chamada única de hoje. |

## Cenário C — A dispara com watermark 1, nova mensagem eleva para watermark 2, resultado de watermark 1 chega depois

| Campo | Conteúdo |
|---|---|
| Esperado | Resultado de watermark 1 não sobrescreve a interpretação da versão 2. |
| Classificação se violado | `BLOCKER`. |
| Estado hoje (servidor) | **Parcialmente coberto** na escrita: a persistência (`stateful-copilot-persistence-executor.ts`/`stateful-copilot-supabase-writer.ts`) já faz compare-and-swap por `expected_previous_state_version` — uma escrita de versão desatualizada recebe `mode: 'conflict'` e não substitui o estado persistido (`stateful-copilot-supabase-writer.test.mjs`). |
| Estado hoje (extensão) | **Não coberto.** Mesmo gap do cenário B: se o watermark 1 (fingerprint antigo) responder depois do watermark 2 já estar em tela, `analyzeCurrentConversation` aplica o payload incondicionalmente. |
| Executável agora? | Parcialmente — a parte de persistência já tem teste (reaproveitável, não é novo). A parte de exibição (extensão) é o mesmo mecanismo do cenário B; uma variante same-conversation (troca de watermark sem trocar de conversa) pode ser adicionada reaproveitando o harness do cenário B. |
| Pendente PR A/B/C | Definir qual watermark único a arquitetura progressiva vai usar (ver `PROGRESSIVE_BACKGROUND_VALIDATION_CONTRACT.md`, "watermark canônico") e verificar que o job em segundo plano carrega esse watermark do início ao fim. |

## Cenário D — Watermark 1 dispara dois jobs por corrida (double-submit)

| Campo | Conteúdo |
|---|---|
| Esperado | Idempotência/coalescing impede dois resultados válidos concorrentes. |
| Classificação se violado | `FAIL` (duplicação de efeito) ou `BLOCKER` (se ambos persistirem estados divergentes). |
| Estado hoje | A escrita final é arbitrada pelo CAS (um dos dois recebe `conflict` e cai em fallback V1) — mas **nada impede as duas computações completas de rodarem em paralelo** antes disso; não existe single-flight/coalescing por `(company_id, cycle_id, conversation_key)` no servidor. Identificado como gap na auditoria (§5 do relatório desta frente). |
| Executável agora? | O comportamento de CAS-conflict já tem teste de forma (`stateful-copilot-supabase-writer.test.mjs`); **não existe teste de que duas requisições concorrentes de fato disparam dois pipelines completos** — seria um teste novo de integração no orquestrador, hoje sem harness de concorrência real pronto. |
| Pendente PR A/B/C | Quando existir uma fila/worker real, testar diretamente que um segundo `enqueue` para a mesma chave de escopo enquanto o primeiro está em voo não cria um segundo job (ou cria, mas o resultado duplicado é descartado/coalescido antes de chegar ao vendedor). |

## Cenário E — A inicia, usuário troca B → C → A

| Campo | Conteúdo |
|---|---|
| Esperado | Ao voltar para A, só aparece estado pertencente a A. |
| Classificação se violado | `BLOCKER`. |
| Estado hoje | Mesma causa raiz do cenário B, agravada: múltiplos jobs podem estar em voo ao mesmo tempo (A, B e C). Sem guard de identidade, qualquer um dos três pode "vencer" por ordem de chegada, não por relevância. |
| Executável agora? | Extensão do harness do cenário B — trivial de estender (mais uma troca de conversa e mais um `analysisResult` condicional por `cycle_id`), mas registrado aqui como **pendente** desta frente para não duplicar esforço até o resultado do cenário B ser triado pelo Controle Mestre. |
| Pendente PR A/B/C | Reexecutar contra jobs de background reais assim que existirem. |

## Cenário F — Refresh da página enquanto job A existe

| Campo | Conteúdo |
|---|---|
| Esperado | Nenhum estado de outra conversa aparece após o reload. |
| Classificação se violado | `BLOCKER` se cross-scope; `FAIL` se só reaplicar resultado obsoleto do mesmo escopo. |
| Estado hoje | Auditoria confirmou que **nada persiste** hoje entre reload além de sessão/`device_key`/preferência de painel colapsado (`chrome.storage.local`); `state.conversationAnalysis` e o ledger de mensagens são só memória do content script. Um reload reinicia do zero — não há "estado velho" para reaparecer no V1 de hoje. |
| Executável agora? | Não aplicável ao V1 (não há nada para vazar). Vira aplicável apenas quando a arquitetura progressiva introduzir algum estado persistido do lado do cliente (ex.: cache local de "job em andamento" para sobreviver a um refresh). |
| Pendente PR A/B/C | Assim que qualquer persistência client-side de job for introduzida, criar teste de reload equivalente ao harness `tests/e3-dom` (recarregar o sandbox `loadContentScript` e inspecionar o que resta). |

## Cenário G — Extensão recarregada

| Campo | Conteúdo |
|---|---|
| Esperado | Nenhum estado incorreto herdado de execução anterior. |
| Estado hoje | Mesma análise do cenário F — sem persistência client-side de análise hoje, o risco só existe a partir do momento em que a Frente Principal introduzir alguma forma de retomar/poll de job após reload da extensão. |
| Executável agora? | Não aplicável ao V1 pela mesma razão do cenário F. |
| Pendente PR A/B/C | Sim — depende de como PR A representa o estado de job (se sobrevive a reload via `chrome.storage`, precisa de teste de reidratação; se não sobrevive, o comportamento esperado — "job perdido, sem re-sincronizar automaticamente" — precisa estar documentado e testado como aceitável). |

## Cenário H — Falha temporária + retry

| Campo | Conteúdo |
|---|---|
| Esperado | Retry não produz efeito duplicado nem aplica resultado de tentativa anterior já superada. |
| Estado hoje | Existe precedente direto e **já testado** para o padrão "falha transitória não apaga dado bom já exibido, e a tentativa seguinte recupera", no card de relacionamento (`content-script-dom-client-relationship-live-refresh.test.mjs`, cenário 13). O caminho de análise (`analyzeCurrentConversation`) não tem o mesmo teste. P1-03 (`INVALID_COMMUNICATION_OUTPUT`) é o caso de retry conhecido no motor profundo — ver `P1_03_REVALIDATION_ROADMAP.md`. |
| Executável agora? | Parcial — o padrão já provado no card de relacionamento pode servir de modelo para um teste equivalente no card de análise, mas isso exige simular uma falha + retry na própria chamada `ANALYZE_CONVERSATION`, hoje sem lógica de retry client-side dedicada (o retry que existe é o do provedor de IA no servidor, dentro do motor stateful). |
| Pendente PR A/B/C | Quando o job em background tiver sua própria política de retry, testar que um retry após falha não reabre uma segunda intervenção seller-facing para o mesmo job lógico (ver seção "Duplicação" do contrato de validação). |

## Cenário I — Job demora muito e um job mais recente termina primeiro

| Campo | Conteúdo |
|---|---|
| Esperado | Resultado velho não vence resultado novo. |
| Classificação se violado | `BLOCKER`. |
| Estado hoje | Achado direto da auditoria: `stateful-copilot-cycle-deadline.ts` documenta explicitamente que, quando o deadline agregado do ciclo vence, "a chamada real ao provedor é abandonada (ela pode continuar em segundo plano até seu próprio timeout individual)" — ou seja, **o próprio runtime atual já reconhece que uma chamada abandonada pode terminar depois** de o ciclo já ter caído em fallback V1. Não há evidência de um guard que impeça essa chamada tardia de ainda tentar persistir/expor um resultado após o abandono. |
| Executável agora? | O comportamento de deadline/abandono em si tem testes (`stateful-copilot-cycle-deadline.test.mjs`, se existente, mais os testes de orquestrador). **Não confirmado**: se a chamada abandonada, ao terminar sozinha, tenta gravar e é rejeitada pelo CAS (proteção indireta via `expected_previous_state_version`) ou se existe um caminho onde ela ainda teria efeito. Este é o item de maior prioridade de investigação adicional recomendado ao Controle Mestre antes do PR A. |
| Pendente PR A/B/C | Teste direto: mock de provedor que resolve a chamada "abandonada" depois do fallback já ter ocorrido, e assert de que nenhuma escrita nem exposição seller-facing resulta dela. |

## Resumo de rastreamento

| Cenário | Executável agora | Resultado atual | Bloqueia promoção da arquitetura progressiva? |
|---|---|---|---|
| A | Sim | PASS (caminho feliz já exercitado) | Não |
| B | **Sim** | **BLOCKER triado** — 2/5 PASS, 3/5 FAIL (teste novo, ver "Triagem do Controle Mestre" acima) | **Sim — atribuído à Frente Principal, correção exigida no PR A** |
| C | Parcial (persistência sim, exibição não) | PASS (persistência) / gap não testado (exibição) | Sim, na parte de exibição |
| D | Não (falta harness de concorrência real) | Gap documentado, não testado | Sim, quando jobs assíncronos existirem |
| E | Não (extensão trivial do teste B, propositalmente não duplicado ainda) | Gap por herança do cenário B | Sim |
| F | Não aplicável hoje | N/A | Só se PR A/B/C introduzir persistência client-side |
| G | Não aplicável hoje | N/A | Só se PR A/B/C introduzir persistência client-side |
| H | Parcial (padrão provado em outro componente) | Gap não testado no caminho de análise | Recomendado, não bloqueante por si só |
| I | Não (falta reproduzir chamada "abandonada" terminando tarde) | Gap documentado, prioridade alta de investigação | Sim |

O cenário B já está provado como `BLOCKER` hoje, antes mesmo do PR A — é uma
falha de isolamento de conversa que já existe em produção no V1, independente
da missão de background. **Triado pelo Controle Mestre**: correção exigida na
Frente Principal, preferencialmente no PR A (background foundation), seguindo
a regra obrigatória e o checklist de 5 pontos descritos em "Triagem do
Controle Mestre" acima. Esta frente não corrige — só mede e reporta.
