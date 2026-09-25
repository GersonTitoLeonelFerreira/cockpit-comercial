# FASE 5 — REGISTRO DE EXECUÇÃO (inclui regularização da FASE 4)

Registro único de execução da FASE 5 do Plano Mestre de Reconstrução do
Companion Multicanal ("WhatsApp consumindo exclusivamente o Core"), com a
regularização das pendências reais da FASE 4. Se houver compactação de
contexto, a execução é retomada a partir deste arquivo.

## 1. Base efetiva

| Item | Valor |
|---|---|
| Repositório | `GersonTitoLeonelFerreira/cockpit-comercial` |
| `origin/main` no início | `0c95b7696775dd900ccdbf3eb9cc071155dd277a` (merge do PR #338) |
| PR #338 | mergeado; head `7a0717ec796b5f48bfedb525a178ace1e871e1ff`; base `cf50fac3ef85e4faa0f8ae4a0e2a5f4ac5780814` |
| Referência histórica | `b5d877a18843b5653c79adc2c5396447d2a99310` |
| Referência congelada | `claude/step-2b5-unified-companion-workspace @ 24f25c713b561cea977b16a0b0961b5642575ab2` (só comparação) |
| Branch de execução | `claude/companion-multichannel-repair`, criada a partir de `origin/main` |

## 2. Correção da declaração de conclusão da FASE 4

O PR #338 ("Phase 4: close Companion canonical core reconstruction") foi
mergeado declarando a FASE 4 concluída. Isso não correspondia ao objetivo
do Plano Mestre: o PR entregou peças úteis e aprovadas (fronteira de
conversa/empresa, `DomainResolutionViewModel`, `leadResolutionOutcome`,
gate Q2 do workspace, capabilities canônicas de ação, navegação canônica),
mas **não** extraiu o Core. No HEAD mergeado:

- `content-script.js` (17.027 linhas) continuava sendo o monólito
  plataforma + produto (A11 `monolithic-core-platform-runtime`):
  criação de lead, re-resolve, reset de conversa, elegibilidade de
  análise, renderização e orquestração de produto moravam ali;
- `companion-workspace-runtime.js` compartilha áreas/HTML do shell — por si
  só não constitui Core;
- controllers comerciais eram compostos por monkey-patch de
  `window.YolenCompanionApi` e de protótipos DOM (ver §4).

O histórico do PR é preservado. A regularização da FASE 4 é executada
neste mesmo trabalho, antes do aceite da FASE 5, sem criar fase nova.

## 3. Baseline na base efetiva (`0c95b769`)

Preenchido com os resultados reais (comando → exit code → resultado):

| Gate | Resultado na base |
|---|---|
| architecture gates | exit 0 — 53/53; NEW=0, STALE=0, LEGACY=26 (14 removalPhase 5, 12 removalPhase 7) |
| `node scripts/companion-known-failures-gate.mjs companion` | exit 0 — 9 falhas, todas conhecidas |
| `npm run test:companion-authorization` | exit 0 — 266/266 |
| E3 (`companion-known-failures-gate.mjs e3`) | exit 0 — 3 falhas, todas conhecidas (harness divergente do manifest, ver §4.1) |
| `tsc --noEmit` | exit 0 |
| `npm run lint` | exit 1 — 56 erros / 103 avisos pré-existentes no repositório (fora de `dist/`: 54 erros / 51 avisos) |

## 4. Auditoria focal (antes das edições)

### 4.1 Composição real do WhatsApp (manifest `content_scripts[1]`)

`yolen-api → lead-resolution-runtime-cache → lead-summary-runtime-cache →
seller-message-runtime → ux8-interaction-consistency-runtime →
lead-summary-expand-state → message-mutations →
conversation-registration-tools → capture-batch → capture-resilience →
capture-resilience-null-base → lead-enrichment → views →
companion-reasoning-view → phase16-9-runtime-guard →
companion-conversation-boundary → companion-lead-resolution-controller →
companion-workspace-runtime → content-script → panel-stability-runtime →
editable-field-stability-runtime → lead-automation`

O harness E3 (`load-content-script.mjs`) **não** reproduzia essa composição:
omitia `lead-summary-runtime-cache`, `seller-message-runtime` (opcional),
`ux8-interaction-consistency-runtime`, `lead-summary-expand-state`,
`phase16-9-runtime-guard`, `panel-stability-runtime`,
`editable-field-stability-runtime`, `lead-automation` e carregava
`lead-method-guidance-runtime` (ausente de qualquer manifest). Além disso,
no vm do harness `globalThis !== window`, então os runtimes que
monkey-patcham `root.YolenCompanionApi` não se instalavam — o E3 testava
uma composição diferente de produção.

### 4.2 Composição por monkey-patch encontrada

| Mecanismo | Arquivo | Efeito |
|---|---|---|
| `api.resolveLead =` | `lead-resolution-runtime-cache`, `capture-resilience`, `panel-stability-runtime` | cache por identidade; retry; "resume cache" (este último nunca armazena: exige `payload.data`, que resolve-lead não devolve) |
| `api.analyzeConversation =` | `ux8-interaction-consistency-runtime`, `capture-resilience-null-base`, `phase16-9-runtime-guard` | três cópias do mesmo retry `RETRY_ANALYSIS_JOB` + promoção de resultado profundo |
| `api.getAnalysisJobStatus =` | `capture-resilience-null-base` | reconsulta autoritativa de `superseded` sintético |
| `api.loadLeadSummary =` | `lead-summary-runtime-cache`, `lead-method-guidance-runtime`, `seller-message-runtime` | cache + composição de método + sync do composer de mensagem |
| `api.saveLeadSummary/confirm.../preview.../ingestCapturedMessages =` | `lead-summary-runtime-cache`, `capture-resilience`, `capture-resilience-null-base` | invalidação de cache; rebase de captura |
| `Element.prototype.getAttribute` | `capture-resilience` | normaliza timestamp de `data-pre-plain-text` globalmente |
| `EventTarget.prototype.addEventListener` | `ux8-interaction-consistency-runtime` | captura o handler de "Analisar" para sobreviver a substituição de `innerHTML` |
| `innerHTML` do painel | `panel-stability-runtime`, `editable-field-stability-runtime` | intercepta renders para preservar scroll/foco |
| global `YolenCompanionSellerInformationView` sobrescrito | `companion-reasoning-view` | acrescenta raciocínio às views |
| nós sintéticos no DOM do WhatsApp | `phase16-9-runtime-guard`, `companion-reasoning-view` | materializam mensagens de anexo (Q6) |

### 4.3 Matriz de requisitos (FASE 4 + FASE 5)

| Requisito | Implementação no HEAD | Chamada real | Lacuna | Correção |
|---|---|---|---|---|
| Shell/lifecycle/área/sessão/composição | `content-script` + `companion-workspace-runtime` | `renderPanel` no monólito | dono é o monólito | Core (`companion-core`) + workspace |
| Resolução e ações de lead | `companion-lead-resolution-controller` (VM/outcome) + monólito | `resolveCurrentLead` no monólito | orquestração no monólito | controller de resolução no Core |
| Criação de lead | monólito (`createLeadForCurrentConversation`, `resolveAfterLeadCreation`) + `lead-automation` | monólito | sem controller | `companion-lead-creation-controller` |
| MENSAGEM | monólito + `seller-message-runtime` (mistura plataforma, A11) | monólito/runtime | composer + decisão misturados | `companion-message-controller` + composer no adapter |
| AGORA/ANÁLISE | monólito + 3 wrappers de API (A5) | monólito | política espalhada | `companion-analysis-controller` |
| CLIENTE/summary/registration/enrichment | monólito + wrappers (A6) | monólito | sem controllers | controllers dedicados |
| Adapter WhatsApp | inexistente | — | plataforma dentro do monólito | `whatsapp-adapter` |
| Q6 | nós sintéticos (2 mecanismos) | observers | escrita no DOM da plataforma | normalização em memória no adapter |

## 5. Regra operacional autorizada

Uma instrução autoriza iniciar e terminar a fase. Checkpoints técnicos de
~6 arquivos de produção ou ~500 linhas líquidas são pontos internos de
teste/revisão/commit, não fases nem entregas parciais.

## 6. Avanço interno (checkpoints = commits)

Checkpoints são pontos internos de teste/revisão/commit (§5), não fases.

| Commit | Conteúdo |
|---|---|
| `e773b3c3` | Monólito `content-script.js` (17.027 linhas) dividido em `whatsapp-adapter.js` (plataforma), `companion-core.js` (produto) e bootstrap (`content-script.js`, ~200 linhas); `companion-analysis-controller.js` (A5). Manifest, allowlist de build e harness passam a carregar os módulos novos; testes estáticos leem a composição (`tests/support/whatsapp-composition-source.mjs`). Remove A11 `content-script` |
| `d2534277` | Dono único de retry/status da análise (`yolen-api.js`); removidos os 3 wrappers A5 (ux8, null-base, phase16-9) e a reinstalação da reasoning-view; testes dos wrappers convertidos para `analysis-retry-status-owner.test.mjs`. Remove 3× A5 |
| `73d9577a` | Controllers `companion-lead-creation-controller` (A4), `-conversation-registration-controller` (A7), `-lead-enrichment-controller` (A8), `-lead-summary-controller` (A6) |
| `dac28357` + `ba620ee0` | MENSAGEM vira `companion-message-controller.js` (Core); cache do resumo no controller de resumo (chave = ledger do Core); `companion-core-api-composition.js` (retry + cache de resolução por empresa/identidade/geração; coordenação + rebase da captura); normalização de `data-pre-plain-text` no adapter; harness E3 = manifest; removidos `lead-summary-runtime-cache.js`, `lead-resolution-runtime-cache.js`, `lead-method-guidance-runtime.js` e o "resume cache". Remove 3× A6, 5× A9, A11 `seller-message-runtime`. `dac28357` saiu só com renomeações/remoções (o `git add` explícito falhou num caminho já removido); `ba620ee0` completa o conteúdo, sem reescrever histórico |
| `bbfb1619` | Q6: anexos normalizados em memória no adapter; `phase16-9-runtime-guard.js` removido; reasoning-view sem fallback de DOM e composta explicitamente. Remove A11 `companion-reasoning-view` (última entrada da fase 5) |
| `a906c608` | `companion-client-controller.js` (CLIENTE); loader do AGORA no controller de análise; dependências entre controllers lidas via `ctx` na chamada; ação "Analisar" do Core com delegação explícita (sem interceptar `EventTarget.prototype.addEventListener`) |
| `a813c067` | Captura de áudio e contextos do identity bridge ficam no adapter (métodos explícitos; o Core não escreve variáveis do adapter) |
| `6291c6a0` | O adapter emite eventos de canal (`observeHostChanges`, `onComposerDraftInput`, `onSendAttempt`); o Core não escuta mais o documento do WhatsApp; contrato atualizado |
| `7922809a` | Fechamento declarado antes da auditoria (ver §8: o STATUS CONCLUIDO deste ponto **não** foi aceito) |
| `5154d74f` | Pós-auditoria: aquisição de evidência de contato no adapter (`readConversationSnapshot`, `acquireContactEvidence`, `revalidateConversationIdentity`, `hasOpenContactDetails`, `hasAuthorizedContactDetails`, `forgetContactEvidence`, `getCurrentConversationKey`); o Core decide e mapeia resultado técnico → copy |
| `69b0eab7` | Pós-auditoria: composer/envio pelo contrato §7 (`getComposerState`, `applyMessage`, `focusComposer`, `hasSendControl`, `triggerSend`); o Core não recebe mais o composer nem o botão Enviar |
| `324f14b9` | Pós-auditoria: handles de áudio opacos + motivos técnicos; `getMountPoint()`; `getCapabilities()` consumido pelo Core; copy do Core/MENSAGEM/preview interpolando `platformDisplayName`; teste focal `channel-adapter-contract` |
| `6f7596ae` | Pós-auditoria: formas literais do §7 (`busy`, `true`/`'conditional'`, `getAudioSource` → `{ok,…}`, mount `null` fail-closed) e identificadores do Core neutros de canal (`observeChannelChanges`, `processObservedChannelChange`, `observeManualChannelSend`, `listenToChannelAudio`, `insertSuggestedMessageInChannel[WithOptions]`) |

### 6.1 Composição final do WhatsApp (manifest `content_scripts[1]`)

`yolen-api → ux8-interaction-consistency-runtime → lead-summary-expand-state
→ message-mutations → conversation-registration-tools → capture-batch →
capture-resilience → capture-resilience-null-base → lead-enrichment →
companion-client-context-view → companion-lead-summary-view →
companion-seller-information-view → companion-reasoning-view →
companion-conversation-boundary → companion-lead-resolution-controller →
companion-workspace-runtime → whatsapp-adapter →
companion-analysis-controller → companion-lead-creation-controller →
companion-conversation-registration-controller →
companion-lead-enrichment-controller → companion-lead-summary-controller →
companion-client-controller → companion-message-controller →
companion-core-api-composition → companion-core → content-script →
panel-stability-runtime → editable-field-stability-runtime → lead-automation`

Fluxo: `content-script.js` (bootstrap) cria `WhatsAppAdapter` e o passa ao
`companion-core.js` por `ctx.channelAdapter`, junto com as ferramentas
(views, fronteira, resolução, resiliência). O Core cria os controllers e a
composição de transporte com dependências explícitas e renderiza a View
compartilhada (`companion-workspace-runtime` + views).

### 6.2 Matriz de requisitos — estado final

| Requisito | Dono no HEAD final | Evidência |
|---|---|---|
| Shell/lifecycle/sessão/composição | `companion-core.js` + `companion-workspace-runtime.js` | A3/A11 sem violação; bootstrap só compõe |
| Resolução e ações de lead | `companion-lead-resolution-controller.js` (VM/outcome) + `companion-core-api-composition.js` (cache/retry) + `companion-lead-creation-controller.js` (região de ações) | `companion-core-api-composition.test.mjs`; E3 `lead-resolution-boundary` (A→B→A) |
| Criação de lead (form/draft/validação/re-resolve/retry/dedupe) | `companion-lead-creation-controller.js` (máquina de estados, limite de re-resolve, retry, dedupe em voo); formulário/rascunho/validação em `lead-automation.js` (view) | A4 com dono Core; E3 `lead-create-conversation-isolation` |
| MENSAGEM | `companion-message-controller.js`; escrita no campo: `whatsapp-adapter.insertTextIntoEmptyComposer` | `message-controller-contract.test.mjs`; E3 `ux8-message-tab-dom` |
| AGORA/ANÁLISE (debounce, polling, watchdog, timeout, outdated) | `companion-analysis-controller.js`; retry/status no transporte `yolen-api.js` | A5 com dono Core; `analysis-retry-status-owner.test.mjs`; E3 de análise |
| CLIENTE, resumo, registro, enriquecimento | `companion-client-controller.js`, `companion-lead-summary-controller.js`, `companion-conversation-registration-controller.js`, `companion-lead-enrichment-controller.js` | A6/A7/A8 com dono Core |
| Quatro áreas na ordem now/message/analysis/client | `companion-workspace-runtime.js` (autoridade única de áreas) | A3; E3 `ux8-message-tab-dom` (teclado) |
| Adapter WhatsApp (conversa/identidade, telefone, mensagens normalizadas, eventos, composer, áudio, mount) | `whatsapp-adapter.js` | A1/A12/A13/A14 sem violação |
| Q6 | `message-mutations.js` (descrição pura) + `whatsapp-adapter.readVisibleMessageEntries` | E3 `attachment-capture` 6/6 (inclusive o antigo conhecido) |
| Harness = manifest | `load-content-script.mjs` (`WHATSAPP_MANIFEST_FILES` + verificação) | A9 sem entradas |

### 6.3 Correções comprovadas (comportamento que a composição antiga escondia)

1. **Retry explícito da análise:** a composição efetiva de produção já
   reabria o job em todo clique explícito, independentemente de revisões
   locais, e reconsultava o superseded sintético. O dono único adota esse
   comportamento, com payload `{analysis_job_id}` (+ `allow_succeeded:
   true` só para job succeeded). Resolveu a falha histórica
   `yolen-api-failed-job-first-retry` e a E3 "failed: mostra falha…". O
   job reaberto passa a ser promovido pelo watermark devolvido no retry.
2. **A → B → A com cache de resolução:** o cache por identidade compartilhava
   a requisição em voo entre gerações de fronteira (A₂ herdaria a promise
   presa de A₁). A composição explícita só compartilha dentro da mesma
   geração e inclui a empresa ativa na chave; perda de sessão e troca de
   vendedor invalidam o cache.
3. **Refresh da mesma conversa:** a invalidação do resumo a cada captura
   limpava a intenção digitada na MENSAGEM. A captura agora invalida só o
   cache do resumo (a mensagem muda sozinha se o resumo mudar).
4. **Troca de conversa no runtime de estabilidade:** era detectada pelo
   nome exibido do lead, que muda durante a reconsulta da mesma conversa
   (scroll zerado). O Core publica `data-yolen-conversation-key` no painel.
5. **Anexo sem cabeçalho (Q6):** a leitura do cartão dependia de `innerText`
   com layout; a descrição em memória usa segmentos de texto. O teste E3
   passa a comparar o instante em horário local (o valor fixo `13:31Z` só
   valia num runner em UTC−3).

### 6.4 Testes convertidos (mesmas asserções no novo dono) e removidos

- Convertidos: `analysis-scroll-freshness-*`, `phase16-9-runtime-guard`,
  `ux8-analysis-retry-fallback` → `analysis-retry-status-owner`;
  `lead-resolution-runtime-cache` → `companion-core-api-composition`;
  `lead-summary-runtime-cache` → `lead-summary-controller-cache`;
  `seller-message-runtime-contract` → `message-controller-contract`;
  `ux8-analysis-action-resilience` → E3 `core-analyze-action-delegation`;
  testes de `materializeAttachmentEvidence`/`installAttachmentEvidenceAdapter`
  → descrição em memória; `deep-analysis-freshness` "stale" → status
  autoritativo + requeue implícito bloqueado por snapshot novo.
- Removidos com o módulo (sem produção desde a 16.9):
  `lead-method-guidance-runtime.test.mjs` e os testes de
  `lead-method-guidance-runtime.js` em `seller-message-contextual-presets`
  e `lead-method-not-applicable`.
- Delimitadores de blocos estáticos que cruzavam arquivos novos passaram a
  terminar na própria função/controller (asserções inalteradas).

### 6.5 Pendências remanescentes (fora de gate, registradas)

- ~~Nomes herdados com "WhatsApp" no Core e orquestração do lookup de
  contato no Core~~ — **resolvido na correção pós-auditoria (§8)**.
- Rótulo `WhatsApp` do campo de telefone no formulário de criação de lead
  (`lead-automation.js`): é o rótulo do dado comercial (número WhatsApp do
  lead no CRM), não o nome do canal de origem; mantido.
- Rótulos de proveniência do telefone (`source` em
  `acquireContactEvidence`, ex.: "JID da conversa selecionada") ficam no
  adapter como metadado técnico; não são renderizados ao vendedor.
- Interceptação de `innerHTML` na instância do próprio painel
  (`panel-stability-runtime.js`, `editable-field-stability-runtime.js`) e
  hook de `HTMLMediaElement.prototype.play` no page world
  (`whatsapp-audio-bridge.js`, captura de áudio do adapter): fora do Core e
  sem papel de composição (contrato §26).

## 7. Evidências finais

Ver §6.2–§6.5 e o relatório final da execução. Baseline de arquitetura:
26 → 12 entradas (0 da fase 5; 12 ManyChat da fase 7, sem aumento).
Falhas conhecidas: companion 9 → 8; E3 3 → 1. Backend: nenhum arquivo de
`app/api`, `app/lib` ou `supabase` alterado nesta branch; a alteração
histórica do PR #338 em `app/api/companion/resolve-lead/route.ts` foi
validada contra `cf50fac3` (aditiva: objeto `capabilities`; `actions`
com as mesmas expressões; 34/34 em `route.test.mjs`) e permanece como
exceção histórica documentada.

## 8. Correção pós-auditoria (mesma FASE 5)

A auditoria do código em `7922809a` não aceitou o STATUS CONCLUIDO. A
mensagem da auditoria chegou truncada (sem a lista de achados); a
correção foi conduzida por autoauditoria contra o contrato (§§5–8, 11–26,
30–32), na mesma branch, preservando os 10 commits, sem force push, sem
rollback e sem fase nova. Base efetiva da correção: `7922809a` (local =
remoto no início).

Requisitos que não estavam cumpridos em `7922809a` e foram corrigidos:

| Requisito do contrato | Situação em `7922809a` | Correção |
|---|---|---|
| §5 Core sem conhecimento de painel/identidade da plataforma | Core orquestrava leitura do painel "Dados do contato", JID, epoch e identity bridge (`tryResolveViaIdentityBridge`, `findContactInfoPanel`) | Aquisição no adapter com resultados técnicos (`phone`/`phone_unavailable`/`group`/`stale`/…); Core só decide (`5154d74f`) |
| §5/§7 Core não recebe elementos da plataforma | Core recebia o composer e o botão Enviar e fazia `textContent`, `writeTextInComposer`, `.click()` | `getComposerState`/`applyMessage`/`triggerSend` com motivos técnicos (`69b0eab7`) |
| §7.2 `getAudioSource` | Alvos de áudio levavam `element`/`container` do WhatsApp ao Core; adapter escrevia copy de erro | Handles opacos `{index,key,durationSeconds}`; `{ok, blob, reason}`; copy no Core |
| §7 `getMountPoint` | Core montava em `document.body` | `channelAdapter.getMountPoint()`; `null` → não renderiza |
| §7/§8 `getCapabilities` | Inexistente | Matriz §8 no adapter; Core consulta antes de interceptar envio, ouvir áudio, inserir mensagem, buscar telefone e montar |
| §5 copy canônica com `platformDisplayName` | Copy do Core, da MENSAGEM e do preview citava "WhatsApp" literal | Interpolação de `platform.displayName` (texto exibido no WhatsApp inalterado) |
| §5 Core sem identificadores de plataforma | 6 funções do Core com "WhatsApp" no nome | Renomeadas para nomes de canal |

Testes estáticos que citavam nomes antigos passaram a citar o novo dono
com as mesmas invariantes (ex.: bypass desarmado sem botão agora é
`!channelAdapter.hasSendControl()` / `!sendResult.sent`, e o
`triggerSend` do adapter é verificado); nenhum critério foi afrouxado.
Teste focal novo: `tests/channel-adapter-contract.test.mjs` (comportamento
do adapter em jsdom + ausência de elementos/copy/identificadores de
plataforma no Core + consulta de capabilities).

Gates após a correção: arquitetura 53/53 (baseline 12, 0 da fase 5);
`test:companion` 8 falhas, 8 conhecidas, 0 novas; E3 1 falha, 1 conhecida,
0 nova; `test:companion-authorization` 266/266; `tsc` 0; lint sem erro nos
arquivos alterados (56 erros pré-existentes em páginas/API não tocadas);
release candidate dev/prod e `--e2e` OK; `git diff --check` limpo.
