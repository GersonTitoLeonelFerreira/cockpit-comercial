# Matriz de isolamento — arquitetura progressiva do Companion

## Papel deste documento

Define os cenários obrigatórios de isolamento multiempresa, multi-ciclo e
multi-conversa que a nova arquitetura (captura contínua → debounce → leitura
rápida → relevance gate → V2 profundo em background → resultado seller-facing)
precisa preservar. Não implementa nem corrige nada — é o roteiro que a
Frente Paralela 3 usa para comprovar (ou reprovar) a arquitetura da Frente
Principal quando os PRs A/B/C estiverem disponíveis.

Qualquer vazamento comprovado nas seções abaixo é `BLOCKER` por definição
(seção 14 do mandato desta frente), independentemente de tamanho ou
probabilidade.

## Identidade de escopo confirmada na auditoria

A chave de escopo canônica no runtime atual é a tripla
`(company_id, cycle_id, conversation_key)`:

- `company_id` — isolamento de empresa (tenant).
- `cycle_id` — isolamento de ciclo comercial (um lead pode ter mais de um
  ciclo ao longo do tempo).
- `conversation_key` — identifica a conversa (hoje, telefone normalizado do
  WhatsApp).

A tabela `companion_commercial_states` já impõe
`unique (company_id, cycle_id, conversation_key)` no banco
(`supabase/migrations/20260806193000_create_stateful_copilot_storage.sql`).
`device_key` identifica o navegador/dispositivo que capturou, mas não faz
parte da identidade do estado.

**Gap original (pré-PR #207):** o guard de escopo existente
(`createLoadedStateReader` → `STATEFUL_RUNTIME_SCOPE_MISMATCH`) verificava
consistência interna de uma única chamada (o contexto carregado bate com o
que foi pedido), não impedia que um resultado calculado para
`(company A, cycle X, conversation Y)` fosse aplicado à tela de
`(company B, cycle X, conversation Y)` num fluxo assíncrono de background —
porque não existia fluxo assíncrono de background nesse sentido (a
"execução em segundo plano" era `after()` dentro da mesma invocação
serverless, sempre atrelada à mesma requisição/escopo).

**Atualização pós-PR #207**: jobs assíncronos reais agora existem
(`companion_background_analysis_jobs`). O isolamento por
`company_id`/`cycle_id`/`conversation_key` é reforçado por: FK composta
`(company_id, cycle_id) references sales_cycles(company_id, id)`
(impede um job apontar `cycle_id` de uma empresa com `company_id` de
outra — provado por teste real desta frente, ver abaixo) e filtros
explícitos `.eq('company_id', ...)` em toda query do worker (confirmado
por leitura de código, não estruturalmente pelo banco — ver ressalva de
RLS abaixo). **Novo achado**: a tabela tem RLS habilitada e forçada, mas a
role `service_role` (usada pelo worker) tem o atributo `bypassrls` — ou
seja, **a RLS desta tabela não é uma segunda barreira contra vazamento
cross-tenant para o worker**; a proteção real está inteiramente nos
filtros de aplicação. Um `.eq('company_id', ...)` esquecido em uma query
futura do worker não seria pego pelo banco. Isso não é um `BLOCKER` hoje
(a auditoria confirmou que os filtros existem em todas as queries lidas),
mas é uma lacuna estrutural real, sem rede de segurança, que vale
registrar para qualquer PR futuro que adicione novas queries ao worker.

Prova executável nova (sem alterar runtime):
`supabase/phase-tests/phase-12a-background-jobs-database-contract.test.mjs`,
teste `'(isolamento) company_id isola corretamente quando a query filtra
por ele; RLS não é uma segunda barreira para service_role'` (`npm run
test:companion-background-jobs-db`) e teste `'(L) job não pode ser criado
para um ciclo inexistente, nem para a combinação errada de
company_id/cycle_id entre empresas'` (prova a FK composta com dado real
contra Postgres via PGlite, não regex).

## I1 — Isolamento entre empresas (cross-tenant)

| Cenário | Setup | Esperado | Classificação se violado |
|---|---|---|---|
| I1.1 | Job profundo em andamento para `company A / cycle X`. Extensão logada em `company B` abre uma conversa com o mesmo `conversation_key` (mesmo número de telefone, empresas diferentes). | Resultado de A nunca aparece para B. B não recebe nem um sinal de "job em andamento" de A. | BLOCKER |
| I1.2 | Telemetria de um job de `company A` é consultada/filtrada por `company B` (ex.: painel de diagnóstico, relatório de telemetria). | Nenhum registro de A é retornado para B. | BLOCKER |
| I1.3 | Dois jobs concorrentes, `company A` e `company B`, mesmo `conversation_key` (mesmo número, ex. um número de telefone compartilhado por coincidência entre bases de clientes distintas de cada empresa). | Persistência, leitura e resultado seller-facing permanecem particionados por `company_id`; nenhum estado cruza a fronteira. | BLOCKER |
| I1.4 | Job de `company A` falha e cai em fallback V1. Fallback não deve carregar contexto de `company B` por engano (ex. cache mal-particionado, chave de cache sem `company_id`). | Fallback V1 de A permanece escopado a A. | BLOCKER |

Todos os cenários I1.* já têm precedente parcial de teste (feature-flag
scoping em `stateful-copilot-activation-gate.test.mjs`), mas **nenhum teste
hoje cobre vazamento de dado real entre empresas** — ver auditoria (§6 do
relatório desta frente). Isso é explicitamente listado como requisito
pendente em `SECURITY_AND_DATA_BASELINE.md` ("proibição de conteúdo de uma
empresa em contexto de outra").

## I2 — Isolamento entre ciclos do mesmo lead (cross-cycle)

| Cenário | Setup | Esperado | Classificação se violado |
|---|---|---|---|
| I2.1 | Lead tem `cycle_id=1` (perdido/encerrado) e `cycle_id=2` (novo, reaberto). Job profundo iniciado ainda em `cycle_id=1` termina depois que o ciclo já virou `cycle_id=2`. | Resultado de `cycle_id=1` não é aplicado ao estado de `cycle_id=2`; `state_patch` de um ciclo nunca contamina o outro (CAS já impõe isso na escrita — falta cobrir o caminho de exibição). | BLOCKER |
| I2.2 | Vendedor alterna entre dois ciclos diferentes do mesmo lead na mesma sessão da extensão. | UI mostra somente o estado do ciclo atualmente selecionado; nenhum resíduo do ciclo anterior aparece após a troca. | BLOCKER |
| I2.3 | Reanálise controlada (edição/exclusão de mensagem) dispara um novo job para `cycle_id=2` enquanto um job antigo de `cycle_id=1` ainda está em voo. | Job antigo, ao terminar, não sobrescreve nem é confundido com o job novo — `expected_previous_state_version`/CAS já cobre a escrita; falta cobrir a camada de entrega ao vendedor. | BLOCKER |

## I3 — Isolamento entre conversas do mesmo usuário (cross-client)

| Cenário | Setup | Esperado | Classificação se violado |
|---|---|---|---|
| I3.1 | Vendedor troca de conversa A → B enquanto job de A está em background. | Resultado de A nunca aparece renderizado em B. | BLOCKER |
| I3.2 | Vendedor troca A → B → C → A rapidamente. Múltiplos jobs podem estar em voo simultaneamente. | Ao voltar para A, só o estado pertencente a A pode aparecer (o mais recente válido de A, nunca de B ou C). | BLOCKER |
| I3.3 | Duas abas/janelas do mesmo navegador abertas na mesma conversa A. | Resultado aplicado em uma aba não deveria contaminar a outra com dado de escopo diferente (mesma conversa é OK; escopo diferente não). | FAIL se contaminar com escopo diferente; PASS COM RESSALVA se houver apenas duplicação de UI dentro do mesmo escopo. |

**I3.1/I3.2 executados de verdade, com dois resultados opostos**:

- **"Analisar agora" (`analyzeCurrentConversation`)**: `BLOCKER` confirmado
  — `content-script-dom-stale-analysis-cross-conversation-race.test.mjs`
  (`npm run test:companion-extension-dom`), triado pelo Controle Mestre,
  atribuído à Frente Principal. Ver `RACE_CONDITIONS_MATRIX.md`.
- **"Registrar conversa" (`registerCurrentConversation`/PR #205)**: `PASS`
  confirmado — `content-script-dom-register-conversation-cross-conversation-race.test.mjs`
  (mesma suíte). O guard `shouldApplyConversationRegistrationResult`
  (`conversation-registration-tools.js`, introduzido pelo PR #207) já
  resolve I3.1 de ponta a ponta para esse fluxo, e é a evidência de que o
  padrão certo já existe no repositório — só não foi aplicado ao caminho
  de análise.

## I4 — Persistência entre reload/refresh

| Cenário | Setup | Esperado | Classificação se violado |
|---|---|---|---|
| I4.1 | Job A em andamento. Página é recarregada (F5) antes do job terminar. | Após reload, nenhum estado de outra conversa aparece; o resultado de A, se ainda chegar, só é aplicado se A ainda for a conversa ativa e o resultado ainda for válido (ver stale-result policy). | BLOCKER se aparecer estado de outra conversa; FAIL se aplicar resultado obsoleto de A mesmo sendo do escopo certo. |
| I4.2 | Extensão é recarregada (reinstalação/atualização) com job em voo. | Nenhum estado incorreto herdado de execução anterior. | BLOCKER se cross-scope; FAIL se apenas o job "se perde" sem re-sincronizar (comportamento aceitável se documentado, não crítico). |

Nota: a auditoria de extensão desta frente ainda vai confirmar exatamente o
que persiste hoje entre reloads (`chrome.storage` vs. memória) — os cenários
acima ficam com **PENDENTE PR A/B/C** até que a arquitetura de estado
persistido do lado da extensão exista de fato para background jobs. A tabela
final de rastreamento está em `PROGRESSIVE_BACKGROUND_VALIDATION_CONTRACT.md`.

## Critério de aprovação desta seção

Uma release da arquitetura progressiva não pode ser promovida além do piloto
enquanto qualquer cenário I1–I4 permanecer sem cobertura executável e sem
evidência de PASS. Isso está alinhado com a "Regra de promoção" já registrada
em `ROADMAP.md` ("isolamento multiempresa... são gates obrigatórios").
