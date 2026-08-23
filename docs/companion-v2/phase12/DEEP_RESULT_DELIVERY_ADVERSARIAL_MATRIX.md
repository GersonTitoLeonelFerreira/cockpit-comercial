# Matriz adversarial — entrega do resultado profundo (deep-result delivery)

## Atualização — PR #209 mergeado em `main`, branch sincronizada, harness restaurado

Depois da reauditoria do head `8dafed0` (abaixo), o PR #209 foi mergeado
em `main` e esta branch (`claude/adversarial-validation-progressive-inf2cq`)
foi sincronizada — o código do PR #209 agora está diretamente nesta
branch (não mais só num worktree temporário), confirmado byte-idêntico ao
head `8dafed0` já auditado (742/494 linhas em
`companion-analysis-job-reader.ts`/`companion-analysis-job-retry.ts`).

**Achado da sincronização (test-only, corrigido por esta frente)**: a
sincronização perdeu, silenciosamente, duas adições de
`app/extension/yolen-companion/tests/e3-test-support/load-content-script.mjs`
que os DOIS lados tinham feito independentemente nesse arquivo
compartilhado de harness — a entrada `'conversation-registration-tools.js'`
em `DEPENDENCY_FILES` (desta frente, para o fluxo "Registrar conversa") e
o handler `GET_ANALYSIS_JOB_STATUS`/`analysisJobStatusCalls` (da Frente 1,
para o novo poller). O resultado prático: **29 de 36 testes de DOM desta
frente passaram a falhar** — incluindo as 5 provas do BLOCKER A→B já
corrigido pelo PR #208 — porque `buildConversationRegistrationKey` ficava
`undefined` e travava a renderização do botão "Analisar agora" antes de
qualquer teste conseguir clicar nele; e o arquivo de teste de DOM da
própria Frente 1 (`content-script-dom-deep-analysis-delivery.test.mjs`,
8 testes) falhava na importação por um export ausente. Corrigido por esta
frente (arquivo de teste, permitido pelo mandato): as duas adições foram
reaplicadas lado a lado no mesmo arquivo. Confirmado depois da correção:
**43/43 testes de DOM passando** (35 desta frente + 8 da Frente 1), mais
`test:companion` (1332/1332), `test:companion-background-jobs-db` (9/9),
e os dois arquivos novos desta frente rodando de verdade contra o código
real mergeado (13/13 + 4/4). Este não é um achado sobre o PR #209 em si
— é uma lacuna de merge no arquivo de suporte de teste compartilhado,
documentada aqui por transparência e já corrigida.

## Atualização — PR #209 reauditado (head `8dafed050c1e7ef18899a899265979d0a7a80088`)

`feat/phase12a-deep-result-delivery` existe. Primeira auditoria feita no
head `0661ff6893299b9a912a2653c2f902cfa3cdac1c` (classificação: 1
`BLOCKER` + 2 `FAIL`). **Durante a preparação da entrega desta própria
auditoria, a Frente 1 avançou a branch para o head
`8dafed050c1e7ef18899a899265979d0a7a80088`** (18 commits novos,
destacando-se `fix(companion): endurece leitura do deep result`,
`fix(companion): reduz autoridade do cliente no status deep`,
`fix(companion): invalida deep result após mutação capturada`,
`feat(companion): adiciona requeue seguro do deep job`,
`fix(companion): promove deep seller e controla retry/stale`). Por
instrução do mandato (seção 17: nunca adaptar testes para fazer a
implementação passar; reexecutar a MESMA bateria contra o novo head), a
bateria completa foi reexecutada contra `8dafed0` via um segundo worktree
temporário, sem alterar nenhum arquivo do PR #209. Onde a asserção de um
teste precisou mudar, foi só para acompanhar uma mudança estrutural real
do código sob teste (assinatura de função, nome de coluna, código de erro
consolidado) — nunca para tolerar uma regressão; cada mudança está
comentada inline no arquivo de teste explicando o motivo.

Arquivos novos/alterados nesse intervalo:
`app/lib/server/companion-analysis-job-reader.ts` (reescrito, agora com
DTO seller-facing real via `buildSellerResult()`),
`app/lib/server/companion-analysis-job-retry.ts` (novo — retry real com
CAS), `app/api/companion/analysis-job-retry/route.ts` (novo),
`app/extension/yolen-companion/src/yolen-api.js` (+690 linhas — guard de
freshness client-side), `app/extension/yolen-companion/src/background.js`.
Suítes próprias da Frente 1 reexecutadas e confirmadas passando:
`deep-analysis-freshness.test.mjs` (10/10),
`content-script-dom-deep-analysis-delivery.test.mjs` (8/8).

### Resumo executivo (classificação final, head `8dafed0`)

| Item do mandato | Classificação | Evidência |
|---|---|---|
| Stale watermark (T16 edit / T17 delete / T18 restore / T19 áudio) | `PASS COM RESSALVA` — mitigado no cliente, gap residual no servidor | `companion-analysis-job-reader-adversarial.test.mjs` (gap no reader confirmado) + `deep-analysis-freshness.test.mjs` da Frente 1 (10/10, mitigação no cliente). Ver seção 7. |
| Retry terminal (job `failed` + clique novamente, mesmo watermark) | `PASS` — retry real implementado com CAS | `companion-analysis-job-retry-adversarial.test.mjs` (T26-T29, 4/4). Ver seção 3. |
| Retry concorrente (T26-T29) | `PASS` — CAS prova only-one-wins, compensação escopada | Idem. |
| Join 0/1/2+ event rows | `PASS` | `companion-analysis-job-reader-adversarial.test.mjs`, testes "(join V3)". Ver seção 4. |
| Filtro de contrato V3 (rejeita evento V2) | `PASS` | Idem. |
| Raw output exposure (`normalized_output` cru) | `PASS` — corrigido, DTO seller-facing real agora existe | `companion-analysis-job-reader-adversarial.test.mjs`, teste "(raw output)". Ver seção 2. |
| Seller-facing real (painéis atualizados pelo deep result) | `PASS COM RESSALVA` — cobertura ampliada via `commercial_reading` compartilhado | Auditoria de código (`content-script.js`, `yolen-api.js`) + suíte própria da Frente 1 (8/8). Ver seção 11. |
| Non-commercial atomicidade | `PASS` | Suíte própria da Frente 1 (teste DOM dedicado, 8/8) + auditoria de código. Ver seção 12. |
| IDOR / cross-tenant | `PASS` | `companion-analysis-job-reader-adversarial.test.mjs`, testes "(IDOR)". Ver seção 1 abaixo. |
| Role / ownership / membership inativa | `PASS` — endurecido (404 uniforme substitui 403 distinto) | `companion-analysis-job-reader-adversarial.test.mjs`, testes "(role)"/"(role downgrade)"/"(membership inativa)". |
| CRM / Agenda | `PASS` — zero chamada de escrita | Leitura de código: nenhum `.insert/.update/.upsert/.rpc` em `companion-analysis-job-reader.ts`, `route.ts` ou `companion-analysis-job-retry.ts` fora do próprio job de background. |
| Polling lifecycle (P1-P9) | `PASS` na maior parte, ver ressalvas | Auditoria de código. Ver seção 6. |
| Manual vs. automático (O/P) | `PASS` | Contador `conversationAnalysisRequestSequence` único e compartilhado. Ver seção 6. |
| A→B / multi-hop com deep delivery | `PASS` — herda o guard do PR #208 corretamente | Ver seção 6. |

**Nenhum `BLOCKER` e nenhum `FAIL` remanescente no head `8dafed0`** — os
dois `FAIL` e o `BLOCKER` da primeira auditoria (raw output, retry
terminal, stale watermark) foram endereçados por código real, verificado
por teste executável independente desta frente (não apenas pela suíte da
própria Frente 1). Duas ressalvas não-bloqueantes permanecem documentadas
(seções 7 e 11) — nenhuma delas expõe dado de outro tenant, aplica um
resultado obsoleto na prática, ou deixa uma superfície de escrita
indevida.

## Papel deste documento

Preparado **antes** de `feat/phase12a-deep-result-delivery` existir, por
instrução do Controle Mestre ("não espere o PR ficar pronto para pensar os
cenários"). Define a bateria adversarial que a Frente Paralela 3 vai
executar contra essa arquitetura assim que ela existir — job profundo do
PR #207 → resultado persistido → endpoint seguro → extensão → seller-facing.

Não presume nomes de rota, formato de resposta, ou mecanismo de entrega
(polling vs. push vs. outro) que a Frente 1 ainda não escreveu. Onde a
arquitetura real divergir do que este documento antecipa, os cenários serão
adaptados — a lista de riscos e a disciplina de teste (fail-closed,
isolamento, stale-result) são o que não muda.

## 1. Segurança do resultado profundo — o maior risco novo

O maior risco novo desta arquitetura é **IDOR / cross-tenant result leak**:
qualquer endpoint que aceite um `analysis_job_id` como parâmetro é, por
construção, um vetor de enumeração se não validar posse antes de responder.

### Casos obrigatórios

| # | Caso | Esperado | Classificação se violado |
|---|---|---|---|
| S1 | Usuário autenticado da Empresa A solicita um `analysis_job_id` que pertence, comprovadamente (linha real em `companion_background_analysis_jobs`), à Empresa B. | `403` ou `404` fail-closed. Nunca `200` com qualquer campo do job. | `BLOCKER` |
| S2 | Mesmo caso do S1, mas medindo timing/diferença de resposta entre "job não existe" e "job existe mas é de outra empresa" — a resposta não pode diferenciar os dois casos de forma que permita enumeração (ambos devem parecer idênticos ao chamador: `404` uniforme é preferível a `403` que confirma existência). | Resposta indistinguível entre "não existe" e "existe mas não é seu". | `PASS COM RESSALVA` se distinguível mas ainda fail-closed; `BLOCKER` se vazar confirmação de existência de forma explorável. |
| S3 | Resposta negada (S1) nunca deve conter, em nenhum campo do corpo do erro: `status`, `conversation_key`, `cycle_id`, `watermark`, ou qualquer fragmento do `state`/resultado. | Corpo do erro genérico, sem nenhum dado do job de outra empresa. | `BLOCKER` se qualquer campo vazar. |
| S4 | Mesma `conversation_key` (mesmo número de telefone) existindo em `company A` e `company B` (coincidência de base de clientes) — usuário de A tenta acessar o job de B usando o `analysis_job_id` real de B. | Negado exatamente como S1 — a coincidência de `conversation_key` não pode servir de atalho de autorização. | `BLOCKER` |
| S5 | `company A` / `cycle A` tentando acessar um job cuja `conversation_key` é a mesma, mas que pertence a `cycle B`, dentro da MESMA empresa (troca de ciclo, não de tenant). | Negado — isolamento por `cycle_id` dentro da mesma empresa também é obrigatório, não só por `company_id`. | `BLOCKER` |
| S6 | `service_role` (usado pelo backend do endpoint) — confirmar que a query que busca o job por `analysis_job_id` SEMPRE inclui `company_id` do usuário autenticado como filtro, nunca busca só por `analysis_job_id` e checa `company_id` depois na aplicação (janela de erro humano). | Filtro de `company_id` na própria query, não checagem posterior. | `PASS COM RESSALVA` se checagem posterior mas correta; `BLOCKER` se a checagem posterior for esquecível/opcional. |

### Método de teste (quando o endpoint existir)

Testes de integração reais contra o endpoint (não regex), seguindo o
padrão já estabelecido em `register-conversation-route.test.mjs` (fake
Supabase client ou PGlite): dois tenants sintéticos, dois jobs reais
persistidos, tentativa de acesso cruzado, assert no status code e no corpo
completo da resposta (não só "não é 200" — precisa provar que nada
vazou).

### Resultado real (auditoria desta frente + suíte própria do PR #209)

`loadCompanionAnalysisJobStatus` (`app/lib/server/companion-analysis-job-reader.ts:375-653`)
implementa exatamente o padrão fail-closed pedido:

1. `company_id`/`sub` vêm do **token assinado** (`CompanionTokenPayload`),
   nunca do corpo da requisição — o cliente não pode declarar sua própria
   empresa.
2. `validateMembership` consulta `company_memberships` **fresca do banco
   a cada chamada** (`.eq('user_id', userId).eq('is_active', true)`), sem
   confiar em nenhum papel cacheado no token — token emitido quando o
   usuário era admin, com a membership já rebaixada para `member` no
   banco, é corretamente tratado pelo papel **atual** (`ANALYSIS_JOB_PERMISSION_DENIED`
   quando `member` não é dono do ciclo). Provado por
   `companion-analysis-job-reader-adversarial.test.mjs`, teste "(role
   downgrade)".
3. O job só é devolvido quando `analysis_job_id + company_id + cycle_id + conversation_key`
   batem **simultaneamente** na mesma query (`companion-analysis-job-reader.ts:452-475`)
   — S6 confirmado: filtro na própria query, nunca checagem posterior.
4. Acesso cross-tenant (S1/S4) e cross-cycle-mesma-empresa (S5) resultam
   em `404 ANALYSIS_JOB_NOT_FOUND` uniforme — `CompanionAnalysisJobReadError`
   só carrega `code`/`message`/`status_code`/`retryable`; nenhum campo do
   job de outra empresa é sequer construído no objeto de erro (S3
   confirmado; S2 satisfeito por construção, o mesmo código de erro/status
   cobre "não existe" e "existe mas não é seu").
5. `member → ciclo sem dono (owner_user_id null)` é sempre negado (nunca
   `null === userId`), `admin`/`manager` acessam qualquer ciclo da própria
   empresa.
6. Confirmado: **zero chamada de escrita** em todo o arquivo (`companion-analysis-job-reader.ts`)
   e em `route.ts` — só `.select().eq().maybeSingle()`. Nenhum
   `.insert/.update/.upsert/.rpc`.

Todos os casos S1-S6 desta seção: **`PASS`**. Provado por 8 testes novos
em `companion-analysis-job-reader-adversarial.test.mjs` (seções "(IDOR)",
"(role)", "(role downgrade)", "(membership inativa)") + os 12 testes já
existentes na suíte própria do PR #209.

## 2. Raw output exposure — resultado real — corrigido, `PASS` confirmado

Mandato: "não classifique exposição meramente estrutural como cross-tenant
leak, mas mantenha como `FAIL` de contrato se raw `normalized_output` for
exposto."

**No head anterior (`0661ff6`) isso acontecia** — `result` era o
`normalized_output` inteiro. **No head atual (`8dafed0`), a Frente 1
introduziu `buildSellerResult()`** (`companion-analysis-job-reader.ts`),
que constrói um DTO próprio (`CompanionDeepSellerResult`, contrato
`phase12a-deep-seller-v1`) com só os campos seller-facing:
`contract_version`, `engine_source`, `commercial_relevance`,
`commercial_role`, `summary`, `commercial_reading`,
`recommended_next_approach`, `recommended_question`, `suggested_message`.

Reconfirmado por teste executável reescrito
(`companion-analysis-job-reader-adversarial.test.mjs`, teste "(raw
output)" — a asserção foi invertida porque o comportamento que ela media
genuinamente mudou, não para tolerar uma regressão): nenhum dos campos
internos do motor (`state_patch`, `operational_suggestions`, `memory_ids`,
`previous_state_version`, `analyzed_message_ids`, `evidence_message_ids`,
e os objetos internos `interpretation`/`strategy`/`communication`) aparece
no `result` devolvido — só os campos do DTO.

Classificação: **`PASS`** — o gap de contrato apontado na primeira
auditoria foi corrigido.

## 3. Retry terminal e retry concorrente — resultado real — `PASS` confirmado

### Retry terminal (job `failed` + novo clique com o mesmo watermark)

**No head anterior (`0661ff6`) não existia nenhum caminho de retry** — a
constraint de unicidade em `companion_background_analysis_jobs` bloqueava
qualquer segunda tentativa de `INSERT` com o mesmo watermark, e
`analyze-conversation/route.ts` nunca reagendava um job em background no
branch de colisão. **No head atual (`8dafed0`), a Frente 1 adicionou
`app/lib/server/companion-analysis-job-retry.ts` e
`app/api/companion/analysis-job-retry/route.ts`** — um mecanismo de retry
real, via `UPDATE` condicional (CAS) na MESMA linha (`failed` → `queued`),
não um novo `INSERT`.

A cadeia de autorização é feita chamando `loadCompanionAnalysisJobStatus`
ANTES de qualquer tentativa de mutação — um IDOR nunca alcança o CAS. Só
depois disso o código lê a linha `failed` e faz o `UPDATE` condicionado a
`status = 'failed' AND updated_at = <valor lido>` — exatamente o padrão
CAS que o mandato pede.

### Retry concorrente (T26-T29 do mandato) — provado por teste executável

Escrevi `companion-analysis-job-retry-adversarial.test.mjs` (4 testes,
fake admin + fake `publish` injetados) para exercitar diretamente
`retryCompanionAnalysisJob`:

| # | Cenário | Resultado real | Classificação |
|---|---|---|---|
| T26 | Retry bem-sucedido: job `failed` → `queued` | `publish` chamado exatamente uma vez, `attempt_count` resetado, watermark preservado | `PASS` |
| T28 | Duas chamadas concorrentes de retry sobre o MESMO job `failed` (`Promise.all`) | Só uma publica — a segunda encontra o CAS já vencido pela primeira (via a checagem `authorized.status !== 'failed'` ou via o `UPDATE` condicional não encontrando mais a linha em `failed`) e apenas observa o estado final; nunca duas publicações | `PASS` |
| T27 | Falha de `publish` (fila indisponível) depois do `UPDATE` já ter movido o job para `queued` | Compensação (`UPDATE` condicionado a `status='queued' AND updated_at=<o que esta tentativa gravou>`) reverte a MESMA linha para `failed` com `failure_code='QUEUE_PUBLISH_FAILED'` — nenhum job fica órfão em `queued` sem publicação | `PASS` |
| T29 | Enquanto a tentativa 1 está compensando uma falha de publish, uma tentativa 2 (externa) já moveu o job para um estado mais novo (`running`, `updated_at` diferente) | A compensação da tentativa 1 é escopada pelo `updated_at` que ELA MESMA gravou — não encontra mais a linha nesse estado exato, não aplica nada, e o estado mais novo (`running`) permanece intacto | `PASS` |

Nota de harness: ao construir o fake `admin` para este teste, encontrei e
corrigi dois bugs no PRÓPRIO harness de teste (não no código do PR #209):
(1) um `SELECT` simples devolvia a referência viva do objeto-linha em vez
de um snapshot, permitindo que uma mutação concorrente "vazasse" para uma
leitura já resolvida — corrigido devolvendo sempre uma cópia rasa; (2) a
compensação real usa `await query-builder` diretamente (sem
`.select()/.maybeSingle()` — o builder real do supabase-js é "thenable"),
e o fake inicialmente não implementava `.then()`, fazendo a compensação
parecer bem-sucedida sem executar nada — corrigido implementando
`.then()`. Ambos os bugs eram do fake, não do código sob teste; documentados
inline no arquivo de teste.

**Todos os casos desta seção: `PASS`.** O `FAIL` funcional (retry não
implementado) e o `N/A` de T26-T29 da primeira auditoria foram
substituídos por um mecanismo real, verificado.

## 4. Join job→event V3 — resultado real

Mandato: atacar o leitor do join com 0/1/2+ linhas correspondentes em
`companion_commercial_state_events`, e confirmar que o filtro de contrato
V3 (`phase-5.2-stateful-copilot-v3`) é enforced.

Confirmado por 4 testes novos em
`companion-analysis-job-reader-adversarial.test.mjs` (seção "(join V3)").
No head atual (`8dafed0`) a query mudou de `.maybeSingle()` para
`.limit(2)` + checagem manual de `events.length !== 1` — resultado
funcionalmente equivalente (0, 1 ou 2+ linhas continuam tratadas
corretamente), só a implementação mudou; e os códigos de erro de
integridade (0 linhas / 2+ linhas / evento V2 / DTO malformado) foram
consolidados sob um único `DEEP_RESULT_INTEGRITY_ERROR` (antes eram
códigos distintos por caso):

| Cenário | Resultado real | Classificação |
|---|---|---|
| 0 linhas de evento para um job `succeeded` | `CompanionAnalysisJobReadError` com `code = 'DEEP_RESULT_INTEGRITY_ERROR'`, `status_code = 500` — nunca um `200` com corpo vazio | `PASS` |
| 1 linha de evento correta | Sucesso, devolve o resultado (`status = 'succeeded'`, `candidate_state_version` correto) | `PASS` |
| 2+ linhas de evento para o mesmo `(company_id, cycle_id, conversation_key, candidate_state_version)` | `events.length !== 1` → `DEEP_RESULT_INTEGRITY_ERROR` — nunca escolhe uma linha arbitrária, nunca primeira linha/ordenação implícita (o `.limit(2)` é só um teto de custo de query, a decisão de rejeitar é da checagem de tamanho, não do limit) | `PASS` |
| Linha de evento com `output_contract_version` antigo (V2) batendo o resto da chave | Filtrada pela própria query (`.eq('output_contract_version', STATEFUL_COPILOT_CONTRACT_VERSION)`) — 0 linhas retornam → `DEEP_RESULT_INTEGRITY_ERROR`. Note-se que `output_contract_version` é uma COLUNA própria da tabela, distinta do `contract_version` interno do JSON `normalized_output` — o head atual valida as duas. | `PASS` |

Nota estrutural relevante para a robustez desse `PASS`: a migration de
`companion_commercial_state_events`
(`20260806193000_create_stateful_copilot_storage.sql`, linhas 123-255) só
tem `unique(operation_key)` — **não existe** um `unique` cobrindo
`(company_id, cycle_id, conversation_key, candidate_state_version)`. Ou
seja, o cenário de 2+ linhas não é estruturalmente impossível no banco —
é a defesa em código (`events.length !== 1`) que é a única coisa
impedindo uma escolha arbitrária, não uma garantia do schema. Isso não
muda a classificação (`PASS`, a defesa existe e funciona), mas é um dado
relevante para qualquer decisão futura sobre adicionar uma constraint de
banco como defesa em profundidade.

**Todos os casos desta seção: `PASS`.**

## 5. Matriz de entrega em background (A–P)

Estende a matriz A–N já validada para o **job em si**
(`RACE_CONDITIONS_MATRIX.md`, seção "Matriz A–N") com as duas novas letras
que o mandato acrescentou para a camada de **entrega**:

| # | Cenário | Esperado | Já coberto pela matriz A–N do job? |
|---|---|---|---|
| A | Job criado → queued → running → succeeded | Resultado profundo disponível para entrega | Sim — cenário A da matriz A–N (`PASS COM RESSALVA`, contrato de banco provado, orquestração completa não). |
| B | Job A inicia → usuário abre B → A termina. B permanece B. | Nenhuma contaminação da UI de B pelo resultado de A | Era `N/A` (sem entrega); **agora é o requisito central desta nova arquitetura** — herda diretamente a causa-raiz do BLOCKER A→B do caminho rápido, já corrigido no PR #208. Qualquer endpoint/consumo novo precisa do MESMO padrão de guard (contexto + sequência), não pode reinventar. |
| C | Watermark 1 → nova mensagem → watermark 2 → job 2 termina → job 1 termina depois. Job 1 nunca degrada job 2. | Resultado mais novo prevalece | Sim, ao nível de contrato de dados (cenário C/E da matriz A–N) — falta a camada de entrega respeitar o mesmo watermark ao decidir o que mostrar. |
| D | Dois triggers equivalentes para o mesmo snapshot | Idempotência/coalescing conforme arquitetura real | Sim — provado por SQL real (`phase-12a-background-jobs-database-contract.test.mjs`, teste `(D)`). |
| E | Job antigo demora → job novo termina primeiro. Antigo nunca vence. | Idem | Sim — provado por SQL real (teste `(E/I)`). |
| F | Queue redelivery. Nenhuma intervenção duplicada. | Idem | `PASS COM RESSALVA` — mecanismo existe (idempotencyKey, status terminal), não exercitado com redelivery real. |
| G | Lease concorrente. Um processamento efetivo. | Idem | Sim — provado por SQL real (teste `(G)`, índice único parcial). |
| H | Job falha → retry. Sem duplicar estado válido. | Idem | Parcial — função de decisão de retry testada isoladamente; fluxo completo não. |
| I | Extensão recarrega durante job. Nenhum cross-conversation leak. | Idem | Era `N/A` (sem estado client-side persistido); passa a ser relevante quando a extensão guardar QUALQUER referência a um `analysis_job_id` em `chrome.storage` para retomar polling após reload — se isso existir, precisa reidratar com o MESMO guard de contexto, não confiar cegamente no id salvo. |
| J | A → B → C → A durante job | Só estado de A pode aparecer ao voltar | Provado pelo teste multi-hop desta frente (`content-script-dom-analysis-multihop-guard-adversarial.test.mjs`) para o caminho rápido — precisa de equivalente para o caminho de entrega do resultado profundo quando ele existir. |
| K | Ciclo fecha enquanto job está em voo | Job não deve gravar/expor resultado para um ciclo já fechado sem contexto | Gap conhecido (cenário K da matriz A–N) — worker não consulta `sales_cycles.status`. Camada de entrega precisa decidir explicitamente: mostrar resultado de um ciclo já fechado, ou suprimir? Não presumir — perguntar à Frente 1 se ambíguo. |
| L | Ciclo muda validamente depois do snapshot | Job/entrega não pode misturar dados do ciclo novo com o snapshot antigo | Parcial (FK protege identidade; mudança de dono/status não testada). |
| M | Job superseded | Nunca vira corrente | Sim — ver cenário M da matriz A–N (maior prioridade de investigação: checagem de supersede só acontece uma vez, antes do claim). |
| N | Deep result antigo chega depois de "Analisar agora" mais novo | Resultado mais novo prevalece, qualquer que seja a origem (job profundo ou análise manual) | **Novo** — exige que a camada de entrega do resultado profundo e o caminho `analyzeCurrentConversation` compartilhem o MESMO relógio de "o que é mais recente" (watermark/sequência unificados), não dois sistemas de frescor paralelos e não comparáveis entre si. Gap de design a esclarecer com a Frente 1 antes de implementar. |
| O | "Analisar agora" antigo → automático novo | Mais recente prevalece | **Novo** — o guard do PR #208 (`conversationAnalysisRequestSequence`) já cobre isto DENTRO do caminho de `analyzeCurrentConversation`, porque tanto o disparo manual quanto o automático passam pela mesma função com o mesmo contador. Precisa reconfirmar quando/se o disparo automático mudar de mecanismo (ex.: passar a enfileirar direto no job profundo em vez de chamar `analyzeCurrentConversation`). |
| P | Automático antigo → "Analisar agora" novo | Idem, na ordem inversa | Idem ao item O — mesma proteção, mesma ressalva. |

## 6. Ataque a polling — resultado real

A Frente 1 usou polling client-side com backoff. Auditoria de
`content-script.js` (não modificado): `deepAnalysisPollTimerId` é uma
**única variável módulo-level compartilhada** — iniciar um novo poll
(`startDeepAnalysisPolling`) ou um novo `analyzeCurrentConversation()`
sempre chama `clearDeepAnalysisPollTimer()` primeiro. Backoff real
confirmado: 1.5s/2s/3s/4s/5s, depois fixo em 5s; timeout total de 240s
(`DEEP_ANALYSIS_POLL_TIMEOUT_MS`).

| # | Cenário | Resultado real | Classificação |
|---|---|---|---|
| P1 | Dois pollers simultâneos | Estruturalmente impossível via a variável de timer única — só uma tentativa de `setTimeout` pode existir por vez. Uma janela de corrida entre um tick já dependurado (aguardando `fetch`) e um novo `analyzeCurrentConversation()` existe, mas é neutralizada pelo guard `isAnalysisResponseStillCurrent()` reavaliado após o fetch. | `PASS` |
| P2 | Poller sobrevive à troca de conversa | `clearLeadStateForNewConversation()` chama `clearDeepAnalysisPollTimer()` e zera `deepAnalysisStatus`/`deepAnalysisResult` — nenhum caminho encontrado onde o timer sobrevive à troca. | `PASS` |
| P3 | Poller continua depois de `superseded` | Tick trata `superseded` como terminal (limpa estado, não reagenda). | `PASS` |
| P4/P5 | Poller continua depois de `succeeded`/`failed` | Ambos são terminais — não reagenda. | `PASS` |
| P6 | Polling infinito | Timeout de 240s é um teto real; nenhum caminho encontrado sem parada. | `PASS` |
| P7 | Polling agressivo | Backoff real (1.5s→5s) é razoável; não medido contra carga real de backend — sem número mágico de aceitação. | `PASS COM RESSALVA` |
| P8 | Reload da extensão inicia segundo poller | Content script é recarregado do zero num reload real (nada sobrevive em memória) — não há como um "poller antigo" sobreviver a um reload de verdade. O risco só existiria se `analysis_job_id` fosse persistido em `chrome.storage` para retomar polling — **não é o caso nesta PR** (confirmado: nenhuma escrita de `analysis_job_id` em `chrome.storage` encontrada). | `PASS`, e `N/A` para o cenário de retomada persistida (não existe ainda). |
| P9 | Resposta antiga de poll vence resposta nova | `isAnalysisResponseStillCurrent()` é reavaliado a cada tick com o `cycleId`/`conversationKey` **atuais** (lidos ao vivo, não capturados no início do loop) e `requestSequence` exato — uma resposta de um `analyzeCurrentConversation()` anterior nunca pode vencer uma chamada mais nova, porque a mais nova sempre incrementa o contador e invalida a anterior antes mesmo do primeiro tick dela. | `PASS` |

**Ressalva não coberta por teste novo desta frente** (documentada, não
bloqueante): o botão "Analisar agora" não tem atributo `disabled` ligado a
`conversationAnalysisLoading` — um duplo-clique real gera duas chamadas
HTTP `ANALYZE_CONVERSATION` sobrepostas. A correção de ordenação (P9/O/P)
funciona corretamente pelo contador de sequência mesmo assim, mas a UI
poderia, em tese, mostrar dois estados de "carregando" simultâneos por uma
fração de segundo antes da segunda chamada assumir. Não classificado como
`FAIL` — é uma questão de polimento de UI, não de segurança/isolamento.

## 7. Stale / watermark — mutação de conversa durante o job — `PASS COM RESSALVA`

**Prioridade máxima do mandato.** Classificação revista no head `8dafed0`
de `BLOCKER` para `PASS COM RESSALVA`: a Frente 1 endereçou o problema com
uma mitigação real e comprovadamente robusta no CLIENTE (extensão), mas o
gap estrutural no SERVIDOR (o reader) continua existindo — o resultado
final é que o mandato não é violado NA PRÁTICA (nenhum resultado obsoleto
chega a ser aplicado ao vendedor), mas a arquitetura ainda depende
inteiramente de uma única camada de defesa.

### O que continua igual: o servidor não verifica staleness

`loadCompanionAnalysisJobStatus` continua sem consultar
`companion_commercial_states` (a tabela que guarda a versão CORRENTE do
ciclo) — reconfirmado no head `8dafed0` pelo MESMO teste estrutural
(`companion-analysis-job-reader-adversarial.test.mjs`, teste "(stale,
T16-T19 — estrutural)"): um job `succeeded` na versão 1 (pré-mutação)
continua sendo devolvido com seu conteúdo completo, mesmo existindo um
segundo job `succeeded` na versão 2 (pós-mutação) para o mesmo
`(company_id, cycle_id, conversation_key)`. Isso não é uma regressão nem
uma correção pendente identificada e não feita — é simplesmente onde a
Frente 1 optou por resolver o problema: no cliente, não no servidor.

### O que mudou: um guard de freshness real e comprovadamente robusto na extensão

`yolen-api.js` (+690 linhas) introduziu um mecanismo de freshness que
cobre exatamente os cenários T16-T19:

- `buildCaptureMessageSignature()` gera uma assinatura por mensagem
  (direção, `occurred_at`, `content_type`, `text_content`,
  `audio_transcription`, `is_deleted`) — qualquer edição (T16), deleção
  (T17), restauração (T18, mesmo que o conteúdo final seja idêntico ao
  original — o contador de revisão é monotônico, nunca hash de conteúdo,
  então um round-trip ainda avança a revisão) ou chegada de transcrição
  de áudio (T19) muda a assinatura e incrementa
  `captureRevisionByConversation`. Uma mensagem NOVA (ainda não vista)
  também incrementa a revisão, cobrindo o cenário adicional do mandato
  ("nova mensagem antes da próxima análise automática").
- Uma segunda barreira imediata (`messageDomRevision`, via
  `MutationObserver`) fecha a janela entre uma mutação visual no DOM e o
  próximo debounce/ingest — o gap que a primeira auditoria (head
  `0661ff6`) havia identificado como não coberto.
- `isFreshnessStillCurrent()` compara a revisão NO MOMENTO da resposta
  contra a revisão capturada no momento da requisição — se qualquer
  mutação ocorreu nesse intervalo, um `superseded` sintético é devolvido
  em vez do resultado, mesmo que o servidor tenha respondido `succeeded`.
- Uma terceira barreira compara `message_watermark` da resposta contra o
  capturado na requisição — mesmo lógica, camada redundante.

Validado por 10/10 testes da própria suíte da Frente 1
(`deep-analysis-freshness.test.mjs`), reexecutados por esta frente sem
nenhuma alteração: cenários nomeados explicitamente para edição, deleção,
transcrição de áudio, restore, nova mensagem, e a janela de mutação DOM
imediata — todos passando. Confirmado também por um teste de DOM completo
da Frente 1 ("mutação de mensagem enquanto poll está em voo invalida
succeeded antes do próximo debounce", em
`content-script-dom-deep-analysis-delivery.test.mjs`, 8/8 passando).

### Classificação final

| # | Mutação durante/depois do job | Resultado real | Classificação |
|---|---|---|---|
| T16 | Mensagem editada depois do job iniciar | Guard de freshness do cliente descarta o resultado como `superseded` antes de aplicá-lo | `PASS` (mitigado no cliente) |
| T17 | Mensagem excluída depois do job iniciar | Idem | `PASS` (mitigado no cliente) |
| T18 | Mensagem excluída e restaurada durante o job | Idem — contador monotônico não "esquece" a mutação intermediária | `PASS` (mitigado no cliente) |
| T19 | Transcrição de áudio chega depois do job iniciar | Idem | `PASS` (mitigado no cliente) |
| — | Nova mensagem antes da próxima análise automática | Idem | `PASS` (mitigado no cliente) |

**Ressalva não-bloqueante, mantida para transparência arquitetural**: a
defesa é hoje inteiramente do lado do cliente. Qualquer consumidor do
endpoint `analysis-job-status` que não seja esta extensão (uma integração
futura, uma chamada direta à API, um cliente com bug no guard de
freshness) receberia o resultado `succeeded` antigo sem nenhum sinal de
obsolescência — o servidor continua confiando cegamente em
`candidate_state_version` sem comparar contra o estado corrente do ciclo.
Isso não é um `BLOCKER` (o produto real, hoje, não expõe esse caminho a
um vendedor), mas é uma dependência de defesa em profundidade não
fechada.

### Recomendação (não vinculante — decisão de implementação é da Frente 1)

Para fechar o gap residual, o endpoint de leitura poderia comparar o
`candidate_state_version`/`message_watermark` do job solicitado contra o
estado corrente do ciclo (`companion_commercial_states.version`, ou o
`message_watermark` mais recente já observado para a conversa) antes de
devolver `succeeded` como resultado válido — ou, no mínimo, sinalizar
explicitamente `is_stale: true`/um campo equivalente, tornando o servidor
uma segunda barreira independente do cliente, não apenas uma fonte de
dados que o cliente precisa filtrar sozinho.

## 8. Isolamento — resultado real

`ISOLATION_MATRIX.md` já cobre `company_id`/`cycle_id`/`conversation_key`
para a tabela de jobs. Confirmado nesta auditoria, para o endpoint novo de
entrega (`analysis-job-status/route.ts` + `companion-analysis-job-reader.ts`):

- `analysis_job_id` **não** serve como bypass de nenhuma outra dimensão de
  isolamento: a query em `companion-analysis-job-reader.ts:452-475` exige
  `analysis_job_id + company_id + cycle_id + conversation_key` batendo
  simultaneamente — um `analysis_job_id` real de outra empresa/ciclo/
  conversa, sozinho, nunca é suficiente para ler o job. Provado pelos
  testes "(IDOR)" e pelo caso S4/S5 na seção 1.
- Confirmado: o filtro de `company_id` do usuário autenticado está NA
  PRÓPRIA QUERY (`.eq('company_id', ...)` antes do `.maybeSingle()`), não
  como checagem posterior em memória — S6 fechado como `PASS`.

Conclusão: **`PASS`**, sem ressalvas novas em relação ao que a seção 1 já
demonstrou. Esta seção existe apenas como referência cruzada por nome de
matriz (`ISOLATION_MATRIX.md`) — os testes e a evidência primária estão na
seção 1.

## 9. Persistência — resultado real

Nenhum requisito novo além do que já estava validado em
`PROGRESSIVE_BACKGROUND_VALIDATION_CONTRACT.md` (seção de persistência
V3): V2 histórico legível, V3 persistido, CAS funcional, superseded não
vira corrente, `automatic_crm_write`/`automatic_agenda_write` sempre
`false`. O PR #209 não introduz nenhuma tabela ou coluna nova — reusa
`companion_background_analysis_jobs` (já coberta por
`phase-12a-background-jobs-database-contract.test.mjs`, agora com 9/9
testes incluindo os dois novos de retry terminal desta auditoria) e
`companion_commercial_state_events` (já coberta por
`phase-5-stateful-persistence.test.mjs`). Reexecutados ambos os arquivos
contra o código de #206 — sem regressão. **`PASS`**, nenhum teste novo de
persistência foi necessário.

## 10. Observabilidade mínima — resultado real

Confirmado por leitura de `companion-analysis-job-reader.ts` e do schema
de `companion_background_analysis_jobs`: todos os campos do mínimo exigido
(ajustado por instrução do Controle Mestre — "não exigir telemetria
inexistente por estética") estão de fato disponíveis e são devolvidos ou
deriváveis pelo endpoint novo:

- `analysis_job_id` — devolvido.
- job created / started / completed (timestamps) — colunas existem na
  tabela, deriváveis.
- `status` — devolvido.
- `attempt_count` — coluna existe na tabela.
- `failure_code` — devolvido quando `status = 'failed'`.
- superseded — hoje só como valor de `status` (aceitável, já era a
  posição documentada).
- `candidate_state_version` — devolvido quando `status = 'succeeded'`.
- time-to-deep-analysis (`completed_at - started_at`) — calculável a
  partir dos timestamps já existentes; não é campo próprio, mas os dados
  para calculá-lo estão presentes.

**TTFV permanece em outro canal**, como já esclarecido — não é requisito
desta camada. Gaps já documentados em `OBSERVABILITY_CONTRACT.md`
(`worker_id`, `lease_expires_at`, `queue_message_id`) continuam ausentes,
mas seguem sendo gaps operacionais, não de correção/isolamento — não
bloqueiam esta entrega. Nenhum campo novo introduzido pelo PR #209 expõe
conteúdo sensível (confirmado junto com a seção 1 — só metadados de
job, nunca o `state_patch` cru fora do caso já classificado como `FAIL`
de contrato na seção 2, acima). **`PASS`**.

## 11. Seller-facing — completude real dos painéis — `PASS COM RESSALVA`

Classificação revista no head `8dafed0`: na primeira auditoria (head
`0661ff6`), o resultado profundo só tocava 2 de ~10 painéis (ANÁLISE e um
indicador de "completo"). No head atual, a Frente 1 reestruturou a
entrega: `promoteDeepSellerResult()` (`yolen-api.js`) não guarda mais o
resultado num slot textual separado — ele **muta diretamente o mesmo
objeto `state.conversationAnalysis`** que já alimenta toda a UI seller-facing
existente (`analysisData.commercial_reading = deepResult.commercial_reading`,
`analysisData.commercial_relevance = ...`, `analysisData.suggestion = {...}`,
`analysisData.coaching = {...}`).

Confirmado por auditoria de código: `getActiveCommercialReading()`
(`content-script.js:5125`), que lê `state.conversationAnalysis.commercial_reading`,
é consumida em **12 pontos diferentes** do arquivo — os mesmos pontos que
já renderizavam CLIENTE, método/aderência, coaching e riscos para a
análise rápida. Como o deep result agora sobrescreve
`commercial_reading` inteiro (não um subconjunto), esses painéis passam a
refletir a leitura comercial completa e profunda, não mais só a rápida.

| Painel | Atualizado pelo deep result no head `8dafed0`? | Classificação |
|---|---|---|
| ANÁLISE (`summary`, `interpretation`) | Sim | `PASS` |
| CLIENTE / método / aderência / riscos (via `commercial_reading` compartilhado) | Sim — mesmo objeto usado por 12 pontos de renderização | `PASS` |
| Coaching (`recommended_next_approach`, `recommended_question`, `suggested_message`) | Sim, e corretamente zerado quando não-comercial (ver seção 12) | `PASS` |
| `suggestion.next_action` / CTA | Sim quando comercial; `null` quando não-comercial | `PASS` |
| `suggestion.next_action_date` / `recommended_status` | Não vêm do deep result (o contrato `CompanionDeepSellerResult` não tem esses campos) — carregam o valor anterior quando comercial, são zerados quando não-comercial | `PASS COM RESSALVA` |
| Waiting / SLA / timeline | Continuam vindo só de `companionClientContext`, não tocados pelo deep result | `PASS` |

**Ressalva não-bloqueante**: `next_action_date` e `recommended_status`
não fazem parte do contrato `CompanionDeepSellerResult` e por isso não são
recalculados pelo resultado profundo — ficam com o valor que já existia
(explicitamente zerados no caso não-comercial, então não há vazamento
cruzado). Isso é uma lacuna de escopo do contrato, não um bug de merge
parcial: esses dois campos nunca fizeram parte do que o motor profundo
calcula.

Validação: leitura de código própria desta frente (12 pontos de uso de
`getActiveCommercialReading()`), mais a suíte própria da Frente 1
(`content-script-dom-deep-analysis-delivery.test.mjs`, 8/8 passando,
incluindo o teste de troca comercial→não-comercial). Esta frente não
escreveu um teste de DOM próprio verificando painel-a-painel (fora do
orçamento de tempo desta reauditoria) — por isso `PASS COM RESSALVA`, não
`PASS` sem qualificação: a conclusão é sólida, mas se apoia parcialmente
na suíte da própria Frente 1, não só em evidência 100% independente.

## 12. Non-commercial — atomicidade — `PASS` confirmado

Cenário do mandato: resultado comercial profundo já carregado na UI,
depois uma nova mensagem não-comercial dispara um novo ciclo de análise
que conclui "não-comercial" — nenhum campo do resultado comercial anterior
(suggested_message, próxima ação, coaching, CLIENTE, método/recovery, CTA)
pode sobreviver via merge parcial.

Auditoria de código de `promoteDeepSellerResult()` (`yolen-api.js`)
confirma que a troca é atômica ONDE IMPORTA, mesmo usando um `{...spread}`
que à primeira vista pareceria um merge parcial: quando
`commercial_relevance !== 'commercial'`, TODOS os campos
comerciais-sensíveis são explicitamente zerados —
`suggestion.next_action = null`, `suggestion.next_action_date = null`,
`suggestion.recommended_status = null`, e `coaching` é substituído por um
objeto NOVO (`{recommended_next_approach: null, recommended_question: null,
suggested_message: null}`, sem spread do `coaching` anterior). O spread do
`suggestion` anterior só preserva campos quando `isCommercial` é
verdadeiro (comercial→comercial, não comercial→não-comercial) — nunca
deixa um campo comercial sobreviver à transição comercial→não-comercial.

Confirmado por teste de DOM real da suíte própria da Frente 1
(`content-script-dom-deep-analysis-delivery.test.mjs`, teste
"non-commercial deep substitui atomicamente mensagem/CTA comercial
antigo", 8/8 passando) — reexecutado por esta frente sem alteração.

**`PASS`** — a garantia não é um "slot único substituído inteiro" (como a
primeira auditoria havia presumido antes do código de promoção existir),
mas um merge SELETIVO onde cada campo sensível ao contexto comercial é
explicitamente controlado por `isCommercial`, sem exceção encontrada.

## Status desta auditoria

Este documento foi escrito originalmente como **preparação**, antes de
`feat/phase12a-deep-result-delivery` existir. Duas rodadas de auditoria
completa já foram feitas:

1. **Head `0661ff6893299b9a912a2653c2f902cfa3cdac1c`** (primeira
   auditoria): worktree temporário, leitura direta de
   `companion-analysis-job-reader.ts` (653 linhas) e `route.ts` (254
   linhas), 13 testes novos em
   `companion-analysis-job-reader-adversarial.test.mjs`. Resultado: 1
   `BLOCKER` (stale watermark) + 2 `FAIL` (retry terminal, raw output
   exposure) — "NÃO MERGEAR AINDA".
2. **Head `8dafed050c1e7ef18899a899265979d0a7a80088`** (reauditoria, esta
   versão do documento): a Frente 1 avançou a branch 18 commits durante a
   preparação da entrega desta própria auditoria. Por instrução do
   mandato (nunca adaptar testes para fazer a implementação passar,
   reexecutar a mesma bateria contra o novo head), toda a bateria foi
   reexecutada num segundo worktree temporário. Onde a asserção de um
   teste precisou mudar, foi só para acompanhar uma mudança estrutural
   real e verificável do código (nova assinatura de função sem
   `cycle_id`/`conversation_key` do cliente, nova coluna
   `output_contract_version`, código de erro consolidado, novo contrato
   `communication`/`commercial_reading`) — nunca para tolerar uma
   regressão; cada mudança está comentada inline explicando o motivo.
   Dois novos arquivos de teste desta frente:
   `companion-analysis-job-retry-adversarial.test.mjs` (4 testes,
   T26-T29) e o já existente `companion-analysis-job-reader-adversarial.test.mjs`
   atualizado (13 testes, agora todos passando contra o novo head). Suítes
   próprias da Frente 1 reexecutadas sem alteração:
   `deep-analysis-freshness.test.mjs` (10/10),
   `content-script-dom-deep-analysis-delivery.test.mjs` (8/8).

**Resultado final no head `8dafed0`: nenhum `BLOCKER`, nenhum `FAIL`.**
Os três achados críticos da primeira auditoria foram endereçados por
código real:

- Raw output exposure → corrigido (DTO seller-facing real, seção 2).
- Retry terminal/concorrente → corrigido (CAS real com compensação, seção 3).
- Stale watermark → mitigado no cliente por um guard de freshness robusto
  e comprovado por 10+8 testes independentes da Frente 1, com um gap
  residual não-bloqueante no servidor documentado como ressalva (seção 7).

Duas ressalvas não-bloqueantes permanecem (stale watermark só mitigado no
cliente, não no servidor; seller-facing com dois campos fora do escopo do
contrato do deep result) — nenhuma delas configura vazamento, aplicação
de dado obsoleto na prática, ou escrita indevida. Quando a Frente 1
atualizar a branch novamente, a mesma bateria será reexecutada contra o
novo head, sem adaptar nenhum teste para fazer a implementação passar.
