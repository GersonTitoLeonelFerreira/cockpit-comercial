# FASE 8 — REGISTRO DE EXECUÇÃO (paridade automatizada total WhatsApp × ManyChat)

Registro único da FASE 8 do Plano Mestre de Reconstrução do Companion
Multicanal. Nenhuma subfase foi criada; a FASE 9 não foi iniciada.

## 1. Base efetiva

| Item | Valor |
|---|---|
| Branch | `claude/companion-multichannel-repair` |
| Base histórica da reconstrução | `origin/main` = `0c95b7696775dd900ccdbf3eb9cc071155dd277a` |
| HEAD inicial (= remoto, árvore limpa) | `23abdc6ed290532f12b6f910a2b0e67232db0b71` |
| PR da branch | nenhum (não aberto; PR #152 fora de escopo) |
| GitHub Actions nesta branch | 0 execuções → **NOT RUN**; últimas execuções do repositório (PR #338) terminaram em ~2 s sem passos → **BILLING_BLOCKED** |
| Fontes | `COMPANION_CORE_ARCHITECTURE_CONTRACT.md` (§§5–8, 10.4, 19, 24), `COMPANION_STATE_PARITY_MATRIX.md`, `FASE_5_EXECUTION.md` … `FASE_7_EXECUTION.md` |

**Objetivo oficial:** executar os mesmos estados de domínio nos dois
adapters e provar que o Core gera o mesmo resultado seller-facing.

## 2. Harness

### 2.1 Existente (antes)

- `tests/e3-test-support/load-content-script.mjs` — composição REAL do
  WhatsApp do manifest (WhatsAppAdapter + bootstrap + Core + controllers +
  views) em jsdom + `node:vm`, com background fake.
- `tests/e3-test-support/load-manychat-composition.mjs` — composição REAL
  do ManyChat do manifest, com o módulo real de privacidade do background
  (`prepareRequest` → transporte → `sanitizeResponse`) no caminho.
- A FASE 7 comparava um único domínio (4 áreas) entre canais em
  `manychat-shared-composition.test.mjs`.

### 2.2 Final (FASE 8)

- `tests/e3-test-support/cross-channel-parity.mjs` (novo): executa o MESMO
  objeto de domínio nas duas composições reais; só o fixture FÍSICO muda
  por canal (página, cabeçalho/contato, evidência, mídia de áudio, campo
  do composer).
- `tests/e3-dom/cross-channel-parity.test.mjs` (novo): 51 testes (matriz do §4).
- `tests/companion-enrichment-comparison.test.mjs` (novo, 4) e +1 teste em
  `companion-background-privacy.test.mjs` (comparação privada, CAS, sem
  rede, `UNSUPPORTED_CHANNEL` para o WhatsApp).
- `load-content-script.mjs`: gancho `afterEachFile` (instrumentação
  só-de-teste depois de cada arquivo carregado) e `InputEvent` no sandbox
  (presente em qualquer navegador; sem ele o fallback de inserção do
  composer do WhatsApp falhava só no harness — divergência de categoria A).

### 2.3 Estratégia de fixture

Fonte única de domínio: `leadResolution(status)`, `notFoundResolution()`,
`defaultAgoraDecisionState`, `defaultClientContext`, resumo, preview de
registro, leitura comercial, mensagens e respostas do backend são o MESMO
objeto passado aos dois canais. Mecânica de canal (e só ela):

| Mecânica | WhatsApp | ManyChat |
|---|---|---|
| Evidência de contato | telefone no título do cabeçalho | identidade segura (`GET_MANYCHAT_SAFE_IDENTITY`) + telefone no contato |
| Mensagens | `data-id` + `data-pre-plain-text` | `data-mid` no `chat-messages-list` |
| Composer | `contenteditable` (Lexical) | `textarea` |
| Mídia de áudio | `<audio src>` + `fetch` do blob (mesmos bytes) | `<audio><source>` + `FETCH_MANYCHAT_AUDIO_SOURCE` (mesmos bytes) |
| Troca de conversa | título + mensagens | rota (`pushState`) + identidade + contato + mensagens |

### 2.4 Comparador

Captura em dois níveis, por instrumentação só-de-teste dos módulos
compartilhados (produção inalterada):

- **Nível 1 (canônico):** cada `DomainResolutionViewModel` + Canonical
  Resolution Outcome de `deriveCanonicalResolutionOutcome` (só os
  comprometidos; cenários A→B→A escopam pelo ciclo da conversa atual);
  último argumento entregue a cada render das views compartilhadas
  (AGORA, informação do vendedor/ANÁLISE, CLIENTE, resumo do lead);
  intenções EFETIVAS de backend do Core (no ManyChat, depois do módulo
  real de privacidade) como conjunto normalizado + número de chaves de
  conversa distintas.
- **Nível 2 (view):** DOM das quatro áreas, lista de ações
  (`data-yolen-action`) e painel inteiro.

Além da igualdade, cada cenário tem asserções semânticas do contrato
(status, CTA, nenhuma criação/consulta indevida, um único CREATE, nada de
A em B, nunca envia, valor atual nunca exibido, CAS/lead_id no
transporte etc.).

**Controle positivo** (`comparador: detecta divergência…`): nove
divergências seller-facing sintéticas (status, nome do lead, prioridade,
orientação, ciclo da intenção, conteúdo de área, nº de chaves de
conversa, ações, painel) FALHAM; as diferenças registradas (chave técnica,
nome do canal) PASSAM; nenhuma regra altera status, retry, CTA, orientação,
dono, método ou ciclo; A6 só remove o prefixo do canal (o índice do áudio
continua comparado).

## 3. Normalizações registradas (tudo o que não está aqui é comparado)

| Id | Cat. | Campo | Justificativa | Referência |
|---|---|---|---|---|
| A1-conversation-key | A | chave técnica da conversa (`manychat:…`, `phone:…`, `title:…`) | identificador técnico do canal; a decisão usa a chave só como escopo (guardado pelo nº de chaves distintas) | contrato §7 getConversationKey |
| A2-message-key | A | `message_key`, `evidence_message_ids`, `message_keys`, `audio_target_key`, `messages[].id`, segmento de evidência de `data-yolen-enrichment-key` | id nativo da mensagem (`data-id` × `data-mid`); texto, autoria, direção e horário seguem comparados | contrato §7 getMessages |
| A3-render-clock | A | epoch de 13 dígitos passado à view | relógio da execução; datas de domínio (ISO) seguem comparadas | — |
| A4-idempotent-intent-repetition | A | multiplicidade de intenções idênticas | re-render/refresh idempotente; o CONJUNTO de intenções e o nº de chaves de conversa seguem comparados; contagens críticas (CREATE, APPLY, TRANSCRIBE, REGISTER) têm asserção semântica exata | — |
| A5-derived-fingerprint | A | `message_snapshot_hash`, `data-yolen-render-key` | hash derivado de dados já comparados (ids técnicos) | — |
| A6-audio-file-name-platform | A | prefixo `platform.id` de `file_name` do áudio | metadado técnico do arquivo (`whatsapp-audio-1.webm` × `manychat-audio-1.webm`); índice, mime, bytes, ciclo e alvo comparados | contrato §5 platform.id |
| B1-conversation-display-name | B | texto de `.yolen-lead-name` só quando o ViewModel não tem `lead_display.name` | capability `canProvideDisplayName` (WhatsApp: título; ManyChat: copy canônica "Conversa aberta") | Q4 / contrato §8 (FASE 6) |
| B2-message-sender-display-name | B | `messages[].sender` do payload | rótulo físico de autor fornecido pelo adapter; direção/autoria comparadas | contrato §7 |
| B3-private-enrichment-comparison | B | ação de transporte `COMPARE_LEAD_ENRICHMENT_CANDIDATES` | rota privada do canal sanitizado (mesma regra do WhatsApp); o resultado é comparado pela view e pelo `APPLY_LEAD_ENRICHMENT` efetivo | contrato §19.3/§24 |
| B-transport | B | `GET_MANYCHAT_SAFE_IDENTITY`, `FETCH_MANYCHAT_AUDIO_SOURCE`, `RESOLVE_LEAD` (comparado no nível canônico) | mecânica física de evidência/mídia; a evidência enviada difere por capability (§10.4) | contrato §10.4 |
| C1-platform-display-name | C | `WhatsApp`/`ManyChat` interpolado em copy canônica | único dado de canal permitido em copy do Core | contrato §5 platform.displayName |
| volátil | A | `observed_at`, `idempotency_key`, `interaction_id` | relógio/aleatoriedade da execução | — |

Nada de status comercial, decisão, ação, prioridade, orientação, mensagem
gerada, método, etapa, objeção, informação do cliente, erro canônico,
retry, estado de criação, ownership ou conteúdo de AGORA/MENSAGEM/
ANÁLISE/CLIENTE é normalizado. PARITY KNOWN = 0; nenhuma diferença foi
adicionada a allowlist.

## 4. Matriz nominal

Legenda: CANONICAL = nível 1 (resolução + inputs das views + intenções);
VIEW = nível 2 (áreas, ações, painel). `—` = sem diferença permitida além
de A1–A5/C1.

| # | CENÁRIO | WHATSAPP | MANYCHAT | CANONICAL MATCH | VIEW MATCH | ALLOWED DIFFERENCE | RESULT |
|---|---|---|---|---|---|---|---|
| 1 | Controle positivo do comparador (inclui A6) | — | — | sintético | sintético | — | PASS |
| 2 | BOOT_LOADING → NO_SESSION | carregando → sem sessão | idem | ✔ | ✔ | — | PASS |
| 3 | NO_CONTACT_EVIDENCE | sem consulta, sem criação | idem | ✔ | ✔ | B1 | PASS |
| 4 | RESOLVING → OWNED_BY_ME | loading → dono | idem | ✔ | ✔ | — | PASS |
| 5 | OWNED_BY_ME | workspace + CTA | idem | ✔ | ✔ | — | PASS |
| 6 | IN_POOL | pool + CTA | idem | ✔ | ✔ | — | PASS |
| 7 | OWNED_BY_OTHER | outro dono | idem | ✔ | ✔ | — | PASS |
| 8 | CLOSED_CYCLE | ciclo encerrado | idem | ✔ | ✔ | — | PASS |
| 9 | NETWORK_ERROR (transitório) | RESOLVING, ≥3 tentativas, sem erro final/criação | idem | ✔ | ✔ | — | PASS |
| 10 | BACKEND_ERROR (400 de domínio) | erro canônico + retry, sem fallback/criação/workspace | idem | ✔ | ✔ | — | PASS |
| 11 | NOT_FOUND → CREATING_LEAD → CREATED_RESOLVING → OWNED_BY_ME | mesmo draft; 1 CREATE | idem | ✔ | ✔ | B1 (antes do lead) | PASS |
| 12 | Validação do formulário de criação | nome obrigatório | idem | ✔ | ✔ | B1 | PASS |
| 13 | CREATED_UNRESOLVED → retry → re-resolve | nunca repete CREATE | idem | ✔ | ✔ | B1 | PASS |
| 14 | Conflito de criação | mesmo erro; 1 CREATE | idem | ✔ | ✔ | B1 | PASS |
| 15 | AGORA ready | mesma decisão | idem | ✔ | ✔ | — | PASS |
| 16 | AGORA empty | mesmo vazio | idem | ✔ | ✔ | — | PASS |
| 17 | AGORA error | mesmo erro | idem | ✔ | ✔ | — | PASS |
| 18 | CLIENTE loading → ready; error | mesmo contexto/erro | idem | ✔ | ✔ | — | PASS |
| 19 | Lead summary load → save | mesmo resumo/salvamento | idem | ✔ | ✔ | — | PASS |
| 20 | Lead summary conflict | mesmo aviso de conflito | idem | ✔ | ✔ | — | PASS (após correção D1) |
| 21 | Registration preview → confirm | mesmo preview/confirmação | idem | ✔ | ✔ | — | PASS |
| 22 | Registration stale | mesmo stale | idem | ✔ | ✔ | — | PASS |
| 23 | MENSAGEM eligible → generated | mesma elegibilidade/mensagem/ações | idem | ✔ | ✔ | C1 | PASS |
| 24 | MENSAGEM not eligible | sem composer | idem | ✔ | ✔ | — | PASS |
| 25 | MENSAGEM error | mesma falha + retry | idem | ✔ | ✔ | — | PASS |
| 26 | Composer disponível → inserção confirmada | escrita; nunca envia | idem | ✔ | ✔ | C1 | PASS |
| 27 | Composer indisponível | "Use Copiar" | idem | ✔ | ✔ | C1 | PASS |
| 28 | Inserção não confirmada | nunca "incluída" | idem | ✔ | ✔ | — | PASS |
| 29 | Falha física do adapter | resultado canônico | idem | ✔ | ✔ | — | PASS |
| 30 | ANÁLISE loading → ready | mesma leitura/orientação/sugestão | idem | ✔ | ✔ | B2 | PASS |
| 31 | ANÁLISE failed | mesmo terminal + retry | idem | ✔ | ✔ | B2 | PASS |
| 32 | ANÁLISE superseded | mesmo terminal + retry | idem | ✔ | ✔ | B2 | PASS |
| 33 | ANÁLISE timeout (watchdog) | mesmo estado + retry | idem | ✔ | ✔ | B2 | PASS |
| 34 | Enrichment missing | oferece; APPLY com CAS nulo | idem (lead_id/CAS reinjetados no background) | ✔ | ✔ | B3 | PASS (após correção D2) |
| 35 | Enrichment same | não oferece | idem | ✔ | ✔ | B3 | PASS |
| 36 | Enrichment different | "Diferente do valor já cadastrado"; valor atual nunca exibido; CAS = valor atual | idem | ✔ | ✔ | B3 | PASS (após D2) |
| 37 | Enrichment private phone (telefone cadastrado) | não oferece | idem | ✔ | ✔ | B3 | PASS (após D2) |
| 38 | Enrichment ignore | descartado sem escrita | idem | ✔ | ✔ | B3 | PASS |
| 39 | A→B→A resolução | resposta tardia de A nunca em B | idem | ✔ (escopo de ciclo) | ✔ | — | PASS |
| 40 | A→B→A lead summary | idem | idem | ✔ | ✔ | — | PASS |
| 41 | A→B→A CLIENTE | idem | idem | ✔ | ✔ | — | PASS |
| 42 | A→B→A AGORA | idem | idem | ✔ | ✔ | — | PASS |
| 43 | A→B→A análise + geração de mensagem | nada de A em B; sem inserção | idem | ✔ | ✔ | — | PASS |
| 44 | A→B→A registro da conversa | preview tardio de A nunca confirma em B | idem | ✔ | ✔ | — | PASS |
| 45 | Áudio indisponível (sem áudio) | sem ação, sem busca | idem | ✔ | ✔ | — | PASS |
| 46 | Áudio disponível → pendente → transcrição | mesma fila, mesmos bytes/ciclo, ingestão da transcrição | idem | ✔ | ✔ | A2, A6 | PASS |
| 47 | Áudio: falha de transporte | sem transcrição; segue pendente | idem | ✔ | ✔ | — | PASS |
| 48 | Áudio: erro de transcrição (backend) | mesmo erro; segue pendente | idem | ✔ | ✔ | A6 | PASS |
| 49 | A→B→A inserção e feedback | registro tardio de A não muda B nem A₂; nunca envia | idem | ✔ | ✔ | — | PASS |
| 50 | A→B→A identidade/evidência | B sem evidência nunca vira lead de A nem consulta | idem | — (B sem resolução) / ✔ A₂ | ✔ | B1 | PASS |
| 51 | A→B→A enriquecimento | APPLY tardio de A nunca vira candidato/confirmação em B; 1 escrita do lead de A | idem | ✔ | ✔ | B3 | PASS |

## 5. Divergências encontradas e classificação

| Id | Onde | Sintoma (antes) | Classe | Tratamento |
|---|---|---|---|---|
| D1 | Core — chave de captura | WhatsApp ingeria as mesmas mensagens sob `title:+55…` (captura retida antes da resolução) e depois sob `phone:55…`; ManyChat usava 1 chave. Exposto pelo guarda `conversationKeyCount` (2 × 1); efeito seller-facing: recarga extra do resumo apagava o aviso de conflito (cenário 20) | C | **Corrigido** (Core): derivação única `deriveCaptureConversationKey`; a reposição da captura retida deriva a chave com a resolução (evidência de escopo guardada no snapshot) |
| D2 | Enriquecimento | "different" e "private phone" divergiam e o ManyChat punha `lead.id` no DOM (chave do candidato); antes 2/5 cenários de enrichment passavam | C | **Corrigido**: comparação canônica única `companion-enrichment-comparison.js` usada pelo controller (WhatsApp, local) e pelo background (ManyChat, privado, via `COMPARE_LEAD_ENRICHMENT_CANDIDATES`); chave do candidato só com ciclo canônico; `current_value` nunca vai à view; CAS/`lead_id` reinjetados no background. Depois 5/5 |
| D3 | Harness | inserção do WhatsApp falhava só no jsdom (`InputEvent` ausente no sandbox) | A | `InputEvent` no sandbox |
| D4 | Harness | ManyChat deriva (e descarta, sem comprometer) o outcome de uma resposta de identidade obsoleta em A→B→A | A | captura canônica escopada pelo ciclo da conversa atual + asserção semântica de que os últimos loaders são do ciclo atual |
| D5 | Harness | snapshots tirados antes do fim de trabalho físico/debounced (fallback do player do WhatsApp ≈5 s, ingestão da transcrição, recarga pós-APPLY/A₂) | A | espera semântica (ação habilitada, ingestão com a transcrição, loaders do ciclo atual depois do último `RESOLVE_LEAD`) |
| D6 | Nome da conversa sem lead | título × "Conversa aberta" | E | B1 (Q4) |
| D7 | `file_name` do áudio | `whatsapp-` × `manychat-` | E/A | A6 (só o prefixo) |
| D8 | Status da transcrição/inserção da ANÁLISE | gravado num bloco legado que o layout das quatro áreas não exibe | F | Igual nos dois canais (mesmo Core) → fora de escopo (§8) |
| D9 | 4 testes E3 existentes (live-refresh do contexto; 2 do gate integrado AGORA/ANÁLISE/CLIENTE; `H)` da elegibilidade da MENSAGEM) | falharam com D1 aplicado; verdes na base | A | Os fixtures dependiam do defeito D1: a regravação da captura retida sob a 2ª chave era o que atrasava a primeira carga das áreas / reabria o resumo no refresh. Correção só de sincronização/fixture, mantendo cada invariante: ingestão só confirma depois da 1ª leitura do contexto; Decision State do backend só conhece a objeção depois da análise; reabertura do resumo por mensagem nova (não por refresh). Os 4 passam na base E com D1 (verificado em worktree da base) |
| D10 | `analyzeConversation` envia `source: 'whatsapp'` fixo (controller compartilhado) | igual nos dois canais (ManyChat também envia `whatsapp`) | F | Rótulo técnico para o backend, sem efeito seller-facing comparado; fora de escopo — registrar para a FASE 10 |
| D11 | `companion-known-failures-gate.mjs e3` | com `--test-force-exit` a saída TAP capturada por pipe vem incompleta (sem plano/resumo) | F (ferramenta) | Exit 0 e 0 falhas; evidência autoritativa = execução direta do mesmo comando para arquivo (349/349). Script não alterado |
| D12 | Teste ManyChat da FASE 7 "campo já preenchido nunca é oferecido" | codificava a regra antiga só do ManyChat (divergente do WhatsApp) | C (consequência de D2) | Evoluído para a regra canônica: oferecido como "diferente" só com confirmação; valor atual e `lead_id` nunca no DOM |

Nenhuma correção usou `if (channel === 'manychat')` em decisão
seller-facing. O único ponto por remetente é a camada de privacidade do
background (já existente, `isManyChatSender`), que só decide o transporte
privado; a regra de comparação é a mesma função nos dois canais.

### 5.1 Antes/depois

| Item | Antes | Depois |
|---|---|---|
| D1 — cenário 19 + `conversationKeyCount` | FAIL (WhatsApp 2 chaves, ManyChat 1; conflito sumia no WhatsApp) | PASS |
| D2 — lote de enrichment | 2/5 (`missing`, `different`, `private phone` falhando) | 5/5 |
| D3 — lote MENSAGEM | inserção confirmada falhava só no WhatsApp | 11/11 (MENSAGEM + ANÁLISE) |
| D9 — 4 testes E3 | 0/4 com D1 (4/4 na base) | 4/4 com D1 e 4/4 na base |
| Áudio (novo lote) | falha de transporte: WhatsApp ainda "Transcrevendo…" no snapshot (fallback físico); `file_name` com prefixo do canal | 4/4 (espera semântica; A6) |

### 5.2 Arquivos de produção alterados

| Arquivo | Motivo |
|---|---|
| `src/companion-core.js` | D1 |
| `src/companion-enrichment-comparison.js` (novo, 122 linhas) | D2 — dono único da comparação |
| `src/companion-lead-enrichment-controller.js` | D2 — usa o módulo; comparação privada; chave sem `lead.id` |
| `src/companion-background-privacy.js` | D2 — comparação privada + CAS |
| `src/yolen-api.js` | D2 — `compareLeadEnrichmentCandidates` |
| `src/background-service-worker.js` | wiring D2 (`importScripts`) |
| `manifest.json`, `scripts/build-package.mjs` | wiring D2 (listas de scripts/pacote) |

Total de produção (8 arquivos): +413 / −277 = **+136 líquidas** (inclui
as 122 do módulo novo). Seis arquivos de `src/` (um deles só wiring) +
dois de configuração de empacotamento (`manifest.json`,
`build-package.mjs`).

## 6. Capabilities

| Capability | WhatsApp | ManyChat | Efeito na paridade |
|---|---|---|---|
| `canProvideDisplayName` | conditional | false | B1 |
| `canProvideTrustedPhone` | conditional | via evidência de contato | evidência diferente, mesmo outcome (§10.4) |
| `canInterceptSend` | true | false | "envio" pós-inserção só observável no WhatsApp; nenhum cenário compara envio (inserir nunca envia nos dois) |
| `canReadAudio` | true | true | mesma fila canônica; obtenção física diferente |

Nenhuma capability foi inventada.

## 7. A→B→A

Caminhos cobertos (todos os pedidos pelo prompt): resolução, análise,
geração de mensagem, lead summary, inserção/feedback, identidade/
evidência, enriquecimento, registro, mais AGORA e CLIENTE. Em todos: a
resposta de A é segurada até a troca para B e liberada depois; B nunca
mostra nada de A (texto, sugestão, confirmação, candidato, lead); A₂ só
tem estado válido de A; o estado é igual nos dois canais.

Nos cenários A→B→A a comparação é de nível 1 (resolução canônica escopada
pelo ciclo da conversa atual + inputs das views) e nível 2 (DOM). As
intenções de backend são verificadas por asserção semântica (os últimos
loaders de área são do ciclo atual; uma única escrita APPLY/REGISTER; B
sem evidência nunca consulta), porque a quantidade de idas de identidade
segura no ManyChat durante a troca é mecânica física (B-transport).

## 8. Fora de escopo (compartilhado) e adiado

- **Compartilhado (F):** status da transcrição/inserção da ANÁLISE num
  bloco legado não exibido (D8) — igual nos dois canais; mudar a UX
  aprovada está fora desta fase.
- **DEFERRED TO PHASE 9:** DOM real do ManyChat e do WhatsApp (seletores,
  bridge de identidade no page world, mídia real, layout), só verificável
  em live test.

## 9. Known failures e lint

- Companion: 4 conhecidas, as mesmas de antes (`Final Release autoriza…`,
  `acerto do vendedor…`, `ponto de melhoria…`, `guardrail exige
  recovery…`); 0 novas; 0 resolvidas. E3: 0 conhecidas.
  **PARITY KNOWN = 0 / NEW = 0.** Nenhuma entrada adicionada à lista.
- **GLOBAL LINT: BASELINE FAIL — 56 PREEXISTING ERRORS / NEW ERRORS: 0**
  (exit 1; os 56 erros estão em 25 arquivos fora de
  `app/extension/yolen-companion`, nenhum tocado nesta fase).
- **CHANGED FILES LINT: PASS** (exit 0; 0 erros; 11 avisos, todos
  pré-existentes: 10 em `companion-core.js`, idênticos aos da base, e
  `MARKER_C` não usado, já presente na base).

## 10. Gates

| # | Gate | Comando | Exit | Resultado |
|---|---|---|---|---|
| 1 | Paridade | `node --test --test-force-exit app/extension/yolen-companion/tests/e3-dom/cross-channel-parity.test.mjs` | 0 | 51/51 |
| 2 | Arquitetura | `node --test --test-force-exit …/tests/companion-core-architecture-gates.test.mjs` | 0 | 37/37; NEW_VIOLATIONS=0, STALE_BASELINE=0, LEGACY=0 |
| 3 | ManyChat channel-only | `node --test --test-force-exit …/tests/manychat-channel-only-architecture.test.mjs` | 0 | 6/6 |
| 4 | Adapter neutro | `node --test --test-force-exit …/tests/e3-dom/core-neutral-channel-adapter.test.mjs` | 0 | 14/14 |
| 5 | ManyChat | `node --test --test-force-exit …/tests/manychat-*.test.mjs …/companion-background-privacy.test.mjs …/companion-enrichment-comparison.test.mjs …/e3-dom/manychat-shared-composition.test.mjs` | 0 | 286/286 |
| 6 | WhatsApp | `node --test --test-force-exit …/e3-dom/whatsapp-phase5-regression.test.mjs …/e3-dom/whatsapp-identity-bridge-integration.test.mjs …/e3-dom/suggested-message-insertion-conversation-race.test.mjs …/canonical-conversation-key.test.mjs …/lead-enrichment.test.mjs` | 0 | 61/61 |
| 7a | `npm run test:companion` | idem | 1 | 2273/2277; as 4 falhas são as 4 conhecidas |
| 7b | Known failures (companion) | `node scripts/companion-known-failures-gate.mjs companion` | 0 | 4 conhecidas, 0 novas, 0 resolvidas — PASS |
| 8 | Autorização | `npm run test:companion-authorization` | 0 | 266/266 |
| 9a | E3 completo (modo oficial) | `node --test --test-force-exit app/extension/yolen-companion/tests/e3-dom/*.test.mjs` | 0 | 349/349 (298 anteriores + 51 de paridade) |
| 9b | Known failures (E3) | `node scripts/companion-known-failures-gate.mjs e3` | 0 | 0 falhas, 0 conhecidas, 0 novas — PASS (ver D11) |
| 10 | TypeScript | `./node_modules/.bin/tsc --noEmit` | 0 | limpo |
| 11 | Lint (arquivos alterados) | `./node_modules/.bin/eslint <arquivos .js/.mjs alterados e novos>` | 0 | 0 erros (11 avisos pré-existentes) — PASS |
| 12 | Lint global | `npm run lint` / `eslint .` | 1 | BASELINE FAIL — 56 erros pré-existentes, 0 novos |
| 13 | Build normal | `node app/extension/yolen-companion/scripts/build-package.mjs` | 0 | PASS |
| 14 | Validador normal | `node app/extension/yolen-companion/scripts/validate-release-candidate.mjs` | 0 | PASS; `MANYCHAT_CAPTURE_ENABLED` false em dev e prod |
| 15 | Build e2e | `node …/build-package.mjs --e2e` | 0 | PASS |
| 16 | Validador e2e | `node …/validate-release-candidate.mjs --e2e` | 0 | PASS; `MANYCHAT_CAPTURE_ENABLED` true só em e2e |
| 17 | Whitespace | `git diff --check` (incluindo arquivos novos) | 0 | limpo |

GitHub Actions: **NOT RUN** nesta branch (sem PR) / **BILLING_BLOCKED**
nas últimas execuções do repositório. Nenhum workflow, secret ou billing
alterado. PR/merge/deploy/rollout: nenhum. ManyChat segue OFF em dev/prod.
Nenhum live test; itens de DOM real: DEFERRED TO PHASE 9.

## 11. Commits

| Commit | Conteúdo |
|---|---|
| `fcae61d3` | fix(companion): chave de captura única (D1) + comparação canônica do enriquecimento (D2), wiring e testes evoluídos (D9, D12) |
| `32d05ed3` | test(companion): harness e matriz de paridade WhatsApp × ManyChat (51 testes) |
| (este documento) | docs(companion): registro de execução da FASE 8 |

Staging explícito por arquivo; `supabase/.gitignore` e
`supabase/config.toml` fora dos commits; sem force push, reset, clean,
rebase ou squash. HEAD inicial `23abdc6e`; o HEAD final é o commit deste
documento (confirmado igual ao remoto no relatório final).
