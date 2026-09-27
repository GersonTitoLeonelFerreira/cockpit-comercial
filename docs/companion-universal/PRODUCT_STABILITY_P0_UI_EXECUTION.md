# PACOTE DE ESTABILIZAÇÃO P0 DE INTERFACE — REGISTRO DE EXECUÇÃO

Registro do pacote de estabilização de interface do Yolen Companion
(FNC-03, FNC-04, MSG-01). **Não é uma nova FASE.** Nenhuma arquitetura nova,
nenhum redesign, nenhum backend, nenhuma flag/rollout alterados.

**STATUS: GREEN técnico — LIVE ACCEPTANCE PENDENTE (Gerson).**

## 1. Estado inicial (auditoria antes de editar)

| Item | Valor |
|---|---|
| `git fetch origin` | ok |
| Branch local no início | `claude/sleepy-hypatia-fbf8xt` (= `origin/main`, sem commits próprios) |
| HEAD local | `3a76df9cabcd4714fb0fd94cc42c65d08e28d315` |
| `origin/main` | `3a76df9cabcd4714fb0fd94cc42c65d08e28d315` = SHA oficial (merge do PR #340) |
| Working tree | limpa |
| Branches posteriores com Companion | nenhuma à frente da `main` depois do PR #340 (`feature/ux-v2-migration` só toca `app/shell`/`app/ux-v2`/Kanban; `step-2b5-unified-companion-workspace` é anterior e superada) |
| `claude/companion-ui-stability-p0` remota | não existia |
| Documentos lidos | `FASE_10_EXECUTION.md`, `FASE_11_EXECUTION.md` (F11-01 panel stability, scroll, A→B→A, paridade), código de `panel-stability-runtime.js`, `editable-field-stability-runtime.js`, `ux8-interaction-consistency-runtime.js` |
| Branch de trabalho | `claude/companion-ui-stability-p0`, criada de `origin/main` auditado (`3a76df9c`) |

## 2. Mapa evento → estado → render → controller → request

| Evento | Estado alterado | Render | Controller | Request / análise |
|---|---|---|---|---|
| Clique real em minimizar (pointerdown → foco → click) | `panelCollapsed = true` | `renderPanel()` → casca recolhida | Core (`setPanelCollapsed`) | **antes:** foco do botão → `observeRuntimeRecovery` (focus em captura) → recuperação completa (§4.1) |
| Clique real em expandir | `panelCollapsed = false` | `renderPanel()` → troca de layout + regiões | Core | idem |
| Troca de aba | `workspaceState.activeArea` | `renderPanel()` (região do workspace) | Core / workspace runtime | idem (foco da aba) |
| Foco em qualquer campo/botão (MENSAGEM, composer do canal) | nenhum | — | Core `observeRuntimeRecovery` | **antes:** GET_ME + `resolveCurrentLead()` ("Localizando…", resumo em loading, `scheduleAutomaticAnalysis('Lead localizado')`) |
| Mutação do DOM do canal (presença, digitando, relayout, rascunho no composer do canal) | snapshot da conversa | `renderPanel()` | Core `processObservedChannelChange` | `scheduleAutomaticAnalysis('Nova mensagem detectada')` — filtrada só por "impressão digital ≠ última análise **bem-sucedida**" |
| Ticker 60 s | nenhum | `renderPanel()` | client controller | AGORA/ANÁLISE/CLIENTE `force` (stale-while-revalidate) |
| Refresh de sessão 60 s | sessão | `renderPanel()` | Core | GET_ME |
| Captura confirmada (mensagem nova) | cache do resumo invalidado | `renderPanel()` | Core → client controller | refresh debounced: resumo, AGORA, ANÁLISE, CLIENTE |
| Qualquer `renderPanel()` | — | regiões + `messageController.render()` | controller de MENSAGEM | **antes:** composer trocava `box.innerHTML` inteiro quando o HTML (que contém o texto digitado) mudava |

## 3. FNC-03 — minimizar/expandir reconstruía a UI aos pedaços

### 3.1 Reprodução

Reprodução descartável e depois teste focal com clique **real**
(`pointerdown → mousedown → foco → pointerup → mouseup → click`). Os testes
E3 existentes de colapso só despachavam `click`, por isso nunca passavam
pelos locks `pointerdown→click` dos runtimes nem pelo `focus`.

Observado no jsdom (antes da correção): depois de minimizar, a casca
recolhida só aparecia depois do clique e o botão de expandir ficava **sem
listener**; ao expandir, a casca recolhida continuava no painel ao lado das
regiões novas e, na fila seguinte, o painel era esvaziado.

### 3.2 Causa comprovada

1. `panel-stability-runtime.js` e `editable-field-stability-runtime.js`
   substituem o setter de `innerHTML` **do próprio painel** e adiam a escrita
   durante o lock `pointerdown→click` de uma ação (e, no panel-stability,
   durante a proteção de retomada de 2 s). Isso é legado do render de painel
   inteiro, anterior ao render por regiões.
2. O Core só usava `panel.innerHTML` nas trocas de layout: minimizar
   (`panel.innerHTML = <casca>`) e expandir (`panel.innerHTML = ''`) — ambas
   dentro do handler de click do próprio botão, isto é, **dentro** do lock.
3. Minimizar: a casca era retida; o Core procurava o botão de expandir
   antes da casca existir → botão sem listener.
4. Expandir: a limpeza `''` era retida; o Core criava as regiões novas ao
   lado da casca; no `setTimeout(0)` do editable-field a limpeza retida era
   aplicada e **apagava o shell recém-montado**. O cache de regiões dizia
   "já renderizado", então cada região só voltava quando o próprio HTML
   mudava → painel escuro (fundo do `#yolen-companion-panel`), header
   ausente, regiões voltando em etapas.
5. Além disso, o foco do botão disparava a recuperação de runtime (§4.2 C1):
   GET_ME, re-resolução e análise — minimizar/expandir chamava o backend.

### 3.3 Correção (Core, `companion-core.js`)

- `switchPanelLayout(panel, layout)`: troca regiões ↔ casca recolhida de
  forma síncrona e inteira com `panel.replaceChildren()` (nunca pelo setter
  interceptado), limpando o cache de regiões.
- A casca recolhida passa a ser uma **região** (`collapsed-shell`): mesma
  proteção `pointerdown→click` e mesmo HTML retido das demais regiões.
- O botão de expandir é ligado por `wirePanelInteractions()` (`wireOnce`),
  inclusive quando a casca é aplicada depois de retida.
- Os runtimes de estabilidade não foram alterados (contrato de
  `panel-render-stability.test.mjs` preservado).

### 3.4 Testes

`tests/e3-dom/product-stability-p0-expand-collapse.test.mjs` (WhatsApp e
ManyChat, composições reais do manifest):

| Caso | RED (antes) | GREEN (depois) |
|---|---|---|
| minimizar/expandir com clique real: shell inteiro na hora, inteiro depois das filas, aba ativa, marca, empresa, conexão, contato | FAIL ×2 ("minimizar aplica a casca recolhida na hora") | PASS ×2 |
| 5 rodadas minimizar/expandir sem frame vazio e sem chamada de backend (sessão, resolução, resumo, análise) | FAIL ×2 ("casca recolhida não pode continuar no painel expandido") | PASS ×2 |
| durante a proteção de retomada (blur → focus): imediato e estável depois de 2 s | FAIL ×2 | PASS ×2 |

RED: 6 testes, 0 pass, 6 fail. GREEN: 6/6.

## 4. FNC-04 — AGORA e ANÁLISE mudavam sem evento comercial

### 4.1 Reprodução

Reprodução descartável: focar um botão de aba (ou um campo da própria página
do canal) → `GET_ME` e `ANALYZE_CONVERSATION` novos, sem mensagem nova.
Depois de uma análise que falhou, uma mutação do DOM do canal que não é
mensagem (presença/"digitando…") → nova `ANALYZE_CONVERSATION` (1 → 2) nos
dois canais.

### 4.2 Causas comprovadas

- **C1 — foco em captura.** `observeRuntimeRecovery` registrava
  `window.addEventListener('focus', …, true)`. Em captura, a `window`
  recebe o `focus` de **qualquer elemento** (campo de MENSAGEM, abas,
  minimizar/expandir, composer do WhatsApp/ManyChat). Cada clique virava
  recuperação completa: GET_ME, `resolveCurrentLead()` (contato em
  "Localizando este contato na Yolen…" — o mesmo flash registrado na FASE 10
  §8 ao clicar "Transcrever"), resumo em loading e
  `scheduleAutomaticAnalysis`.
- **C2 — reanálise do mesmo conteúdo.** Toda mutação do DOM do canal agenda
  "Nova mensagem detectada"; o único filtro era "impressão digital ≠ última
  análise **bem-sucedida**". Depois de uma falha/timeout (impressão digital
  `null` — frequente com a latência do V2), qualquer presença/"digitando…"/
  relayout/rascunho no composer do canal, a retomada da janela ou a
  re-resolução do mesmo lead reiniciava a análise em loop.
- **C3 — resumo em loading a cada recarga.**
  `loadCompanionLeadSummaryForCurrentCycle` sempre punha o resumo em
  `loading` (mesmo com resumo válido e mesmo servindo do cache): o bloco do
  AGORA sumia e o mount de MENSAGEM era desmontado a cada captura/retomada.
- **C4 — início de reanálise apagava o válido.** `analyzeCurrentConversation`
  zerava o AGORA (`agoraDecisionState: idle`) — descartando inclusive o
  AGORA recém-recarregado pela captura da mensagem — e a ANÁLISE trocava a
  leitura persistida válida por um spinner durante toda a tentativa
  (~3 min no V2).

### 4.3 Correção

- C1 (`companion-core.js`): a recuperação só reage ao foco da **própria
  janela** (`event.target === document.defaultView`), mesmo critério já usado
  por `panel-stability-runtime.js`.
- C2 (`companion-analysis-controller.js`): `lastAnalysisAttemptContentKey`
  (empresa + ciclo + conversa + impressão digital) registrado no início de
  qualquer análise; `canScheduleAutomaticAnalysis` não agenda um conteúdo já
  tentado. Conteúdo novo (mensagem nova, editada/apagada, transcrição
  incorporada), clique explícito e **troca real de conversa**
  (`forgetAnalysisAttemptContent()` em `hardResetConversationWorkspace`)
  continuam analisando.
- C3 (`companion-lead-summary-controller.js`): recarga do **mesmo**
  ciclo/conversa mantém o resumo válido até o novo chegar; falha da recarga
  mantém o dado bom (mesmo padrão de AGORA/ANÁLISE/CLIENTE).
- C4: o AGORA não é mais zerado no início de uma tentativa (continua sob o
  guard de ciclo/conversa/empresa) e mostra uma linha discreta
  `data-yolen-agora-updating` ("Analisando sua condução comercial…")
  enquanto a análise está em voo — a decisão exibida nunca é apresentada como
  resultado da tentativa nova (mandato §24). Na ANÁLISE, com leitura
  persistida válida do contexto, loading/erro/"conversa mudou" viram uma
  linha acima da leitura (mesmos textos e atributos dos cards existentes).

### 4.4 Matriz dos gatilhos de análise / invalidação

| Gatilho | Origem | Antes | Depois | Permitido? | Teste que prova |
|---|---|---|---|---|---|
| Foco em campo/botão (MENSAGEM, abas, minimizar/expandir, composer do canal) | `observeRuntimeRecovery` focus em captura | GET_ME + re-resolução + resumo em loading + análise se ≠ último sucesso | nada | NÃO | FNC-04 "trocar de aba, focar campo/botão e minimizar/expandir…" ×2; FNC-03 "repetidos…" ×2 |
| Troca visual de aba | `setActiveSellerArea` → `renderPanel` | render + (foco → linha acima) | só render | NÃO | idem |
| Minimizar / expandir | `setPanelCollapsed` → `renderPanel` | render + (foco → linha acima) | só render, atômico | NÃO | FNC-03 ×6 |
| Rerender | qualquer `renderPanel` | sem análise | sem análise | NÃO | FNC-04 ×2 (tab/expand), MSG-01 ×8 |
| Resize | sem listener; relayout do canal vira mutação do DOM | análise se a última falhou | bloqueado (mesmo conteúdo) | NÃO | FNC-04 "mutação do DOM … resize" ×2 |
| Mutação do DOM do canal sem mensagem (presença, digitando, rascunho, relayout) | `processObservedChannelChange` | análise se a última falhou/timeout | bloqueado (mesmo conteúdo) | NÃO | FNC-04 "mutação do DOM …" ×2 |
| Polling sem dado novo (ticker 60 s, sessão 60 s) | client controller / Core | render; loaders `force` já mantinham o dado | idem; mesmo dado → mesmo DOM; sem análise | NÃO invalida | FNC-04 "polling sem dado novo…" ×2 (GREEN antes e depois — controle) |
| Loader intermediário (resumo recarregando) | `loadCompanionLeadSummaryForCurrentCycle` | resumo → "carregando" (AGORA sem o bloco, MENSAGEM desmontada) | resumo válido mantido até o novo | NÃO invalida | FNC-04 "recarga do resumo…" ×2; `seller-message-context-eligibility` H |
| Montagem/re-resolução do mesmo contexto | `resolveCurrentLead` (retomada, "↻ Atualizar") | análise se ≠ último sucesso; resumo em loading | revalida sessão/lead; análise só com conteúdo não tentado; resumo mantido | NÃO (análise) | FNC-04 "retomada real da janela…" ×2 |
| Retomada real da janela (focus após blur, visibilitychange, pageshow, online) | `recoverCompanionRuntime` | idem linha acima | idem linha acima | só revalidação; análise só com conteúdo novo | FNC-04 "retomada real…" ×2 |
| Nova mensagem confirmada do cliente | `processObservedChannelChange` + captura | análise em 8 s; AGORA zerado; ANÁLISE spinner | análise em 8 s; AGORA e ANÁLISE válidos visíveis + linha "Analisando…" | SIM | FNC-04 "evento comercial legítimo…" ×2; "reanálise legítima mantém…" ×2 |
| Nova mensagem confirmada do vendedor | mesmo caminho (impressão digital nova; direção não muda o gate) | idem | idem | SIM | mesmo caminho do anterior |
| Mensagem editada/apagada | `processObservedChannelChange` (mutação) | análise | análise (impressão digital nova) | SIM | E3 existentes (mutações) |
| Transcrição de áudio concluída e incorporada | `transcribeNextVisibleAudio` | análise | análise (impressão digital inclui a transcrição) | SIM | E3/paridade de áudio existentes |
| Clique "Analisar agora" / "Atualizar análise" / "Tentar novamente" | `handleAnalyzeActionClick` (manual) | análise | análise (manual nunca é filtrada) | SIM | FNC-04 "evento comercial legítimo…" ×2 |
| Troca real de conversa | `hardResetConversationWorkspace` → resolução | análise | análise (tentativa anterior esquecida na fronteira) | SIM | FNC-04 "A → B → A — troca real…" ×2 (contraprova: sem o esquecimento, FAIL ×2) |
| "A conversa mudou durante a análise" | fim de `analyzeCurrentConversation` | reagenda se a impressão digital mudou | idem | SIM (conteúdo novo) | E3 existentes |
| Troca de empresa ativa | `loadYolenSession` (`companyChanged`) | zera contexto | idem (chave inclui a empresa) | SIM | E3 existentes |
| Conclusão da análise | polling do job → AGORA/ANÁLISE/CLIENTE `force` | substitui | substitui | SIM | paridade "ANÁLISE loading → ready" |

### 4.5 Testes

`tests/e3-dom/product-stability-p0-analysis-triggers.test.mjs` (dois canais):

| Caso | RED | GREEN |
|---|---|---|
| aba / foco em campo e botão / minimizar-expandir não chamam backend | FAIL ×2 | PASS ×2 |
| mutação do DOM do canal sem mensagem (presença, relayout, resize) | FAIL ×2 | PASS ×2 |
| retomada real da janela sem mensagem nova | FAIL ×2 (`2 !== 1`) | PASS ×2 |
| evento legítimo recalcula (mensagem nova, clique explícito) — controle | PASS ×2 | PASS ×2 |
| polling sem dado novo não reanalisa nem apaga — controle | PASS ×2 | PASS ×2 |
| recarga do resumo mantém o resumo do AGORA e a MENSAGEM | FAIL ×2 | PASS ×2 |
| reanálise legítima mantém AGORA e ANÁLISE + indicação discreta | FAIL ×2 | PASS ×2 |
| A → B → A: troca real continua podendo reanalisar A (adicionado depois da revisão adversarial; contraprova sem `forgetAnalysisAttemptContent()`: FAIL ×2) | — | PASS ×2 |

RED: 14 testes, 4 pass (controles), 10 fail. GREEN: 16/16.

## 5. MSG-01 — campo MENSAGEM disputava com rerenders

### 5.1 Reprodução

Reprodução descartável: digitar no campo, disparar um render de fundo (sem
mexer no foco) → nó da textarea substituído, foco perdido, cursor em 0.
Somado a C1, cada clique de volta no campo disparava outro render ~350 ms
depois ("digitar trava", "apagar fica difícil").

### 5.2 Causas comprovadas

- **M1.** `renderPanel()` sempre termina com `messageController.render()`;
  `renderComposer()` trocava `box.innerHTML` inteiro sempre que o HTML
  calculado mudava — e o HTML inclui o próprio texto digitado. Depois da
  primeira tecla, **todo** render de fundo (polling, AGORA/ANÁLISE/CLIENTE,
  sessão, mensagem nova) recriava a textarea.
- **M2.** O estado da MENSAGEM era indexado por `ciclo::conversa::hash(resumo)`.
  Um resumo recarregado da **mesma** conversa (mensagem nova) criava um
  estado novo com intenção vazia: rascunho perdido e "Gerar mensagem" sem o
  texto digitado antes da recarga. Contraprova: voltando só a chave antiga,
  o teste "resumo recarregado…" falha nos dois canais.

### 5.3 Política de rascunho adotada (a canônica já existente, preservada)

- Mesma conversa: navegar entre abas, minimizar/expandir e atualizações em
  segundo plano (incluindo resumo recarregado) **preservam** o rascunho.
- Troca de conversa: o rascunho é **descartado** (`messageController.clear()`
  na fronteira) — nunca vai de A para B e **não** é restaurado ao voltar
  para A.
- "Gerar mensagem" envia exatamente o texto do campo no momento do clique
  (o evento `input` mantém o estado igual ao campo).

### 5.4 Correção (`companion-message-controller.js`)

- Estado por conversa (`stateByConversation`, chave `ciclo::conversa`): o
  resumo novo da mesma conversa só invalida a mensagem gerada a partir do
  resumo anterior; a intenção continua. Respostas tardias continuam
  descartadas (`isStateCurrent` confere conversa + contexto do resumo).
- `applyComposerHtml`: o campo de intenção é criado uma vez por conversa e
  nunca recriado por render; o resto do composer (atalhos, contador, botão,
  resultado) é reconciliado no lugar quando o HTML muda. O valor do campo só
  é escrito quando a própria MENSAGEM o mudou (atalho).

### 5.5 Testes

`tests/e3-dom/product-stability-p0-message-draft.test.mjs` (dois canais):

| Caso | RED | GREEN |
|---|---|---|
| ~20 / ~100 / ~300 / ~800 caracteres: digitação em rajadas com polling entre elas, Backspace e Delete no meio, inserção no meio, seleção; foco, nó, texto, cursor e seleção intactos; "Gerar" envia o texto do clique | FAIL ×8 ("o campo não pode ser recriado" já no 1º render) | PASS ×8 |
| resumo recarregado por mensagem nova durante a digitação | FAIL ×2 | PASS ×2 |
| abas + minimizar/expandir preservam o rascunho | FAIL ×2 (campo não voltava depois de expandir — efeito do FNC-03) | PASS ×2 |
| A → B → A: rascunho de A nunca em B; volta a A sem rascunho (política) | PASS ×2 | PASS ×2 |

RED: 14 testes, 2 pass, 12 fail. GREEN: 14/14.

## 6. Testes existentes alterados (contrato atualizado, não afrouxado)

| Teste | Antes | Depois | Por quê |
|---|---|---|---|
| `b5-minimized-intelligence.test.mjs` "B5.3 não abre o Companion automaticamente" | exigia o `addEventListener('click' … setPanelCollapsed(false))` literalmente dentro de `renderPanel()` | exige o único `setPanelCollapsed(false)` no `wireOnce` de click do botão de expandir em `wirePanelInteractions()`, chamada pelo render recolhido | a ligação mudou de lugar (FNC-03); o contrato "só abre por clique" é o mesmo |
| `content-script-dom-integrated-seller-gate.test.mjs` "reanálise em voo…" | AGORA vazio durante a reanálise | AGORA mantém a última decisão confirmada **e** mostra `data-yolen-agora-updating` | política canônica do FNC-04 ("manter válido + indicação discreta"); o mandato §24 (loading não parece decisão) continua coberto pela indicação |
| `seller-message-context-eligibility.test.mjs` H | o mount de MENSAGEM sumia enquanto o resumo da mesma conversa recarregava | o mount continua; a intenção sobrevive | C3 — recarga em segundo plano não desmonta MENSAGEM; o objetivo do teste (nenhum clear global apaga a intenção) continua |

Nenhuma allowlist aumentada. Nenhuma falha marcada como conhecida.

## 7. Regressões

- **A→B→A:** paridade A→B→A (resolução, resumo, CLIENTE, AGORA, análise e
  mensagem, registro, enriquecimento) PASS; MSG-01 A→B→A PASS; FNC-04
  A→B→A PASS.
- **Paridade entre canais:** `cross-channel-parity.test.mjs` 51/51.
- **Scroll (F11-01):** `panel-stability-first-open-scroll`,
  `ux8-scroll-owner-dom`, `ux8-editable-field-scroll-owner-dom` PASS.
- **WhatsApp / ManyChat:** mesmo Core; todos os testes focais rodam nas
  composições reais dos dois manifests.

## 8. Gates

`T=app/extension/yolen-companion/tests`. Ordem seguida: focal RED →
correção → focal GREEN → suítes focais relacionadas → E3 relevante →
paridade → arquitetura → **uma** rodada completa no HEAD de código final →
lint/build.

### 8.1 Antes da rodada final

| Gate | Comando | Resultado |
|---|---|---|
| Focal FNC-03 | `node --test --test-force-exit $T/e3-dom/product-stability-p0-expand-collapse.test.mjs` | RED 0/6 → GREEN 6/6 |
| Focal FNC-04 | `… $T/e3-dom/product-stability-p0-analysis-triggers.test.mjs` | RED 4/14 (4 controles) → GREEN 16/16 |
| Focal MSG-01 | `… $T/e3-dom/product-stability-p0-message-draft.test.mjs` | RED 2/14 (A→B→A já conforme) → GREEN 14/14 |
| Unitárias relacionadas (22 arquivos: contratos de MENSAGEM, colapso, B5, B7, análise automática, arquitetura, UX8, resumo) | `node --conditions=react-server --import ./scripts/register-typescript-test-loader.mjs --test …` | 274/275 → B5.3 atualizado (§6) → 275/275 |
| E3 relevante (20 arquivos: scroll/estabilidade, MENSAGEM, shell, ANÁLISE, resumo, troca de conversa, hard reset) | `node --test --test-force-exit …` | 118/120 → 2 contratos atualizados (§6) → focais + atualizados 52/52 |
| Paridade oficial | `node --test --test-force-exit $T/e3-dom/cross-channel-parity.test.mjs` | 51/51 |
| Arquitetura / só-canal | `node --test $T/companion-core-architecture-gates.test.mjs`; `… manychat-channel-only-architecture.test.mjs` | 53/53 (NEW 0, STALE 0, LEGACY 0); 6/6 |

### 8.2 Rodada completa no HEAD de código `54499c6b` (2026-09-27, 03:30Z → 03:39Z, sequencial)

| # | Gate | Comando | Resultado |
|---|---|---|---|
| 1 | test:companion (falhas conhecidas) | `node scripts/companion-known-failures-gate.mjs companion` | 2282 testes, 2278 pass, 4 fail — **4 known, 0 new** |
| 2 | Autorização | `npm run test:companion-authorization` | 266/266 |
| 3 | E3 oficial (gate de falhas conhecidas) | `node scripts/companion-known-failures-gate.mjs e3` | **392/392** (356 anteriores + 36 focais novos); 0 known, 0 new — inclui paridade 51/51, A→B→A, scroll F11-01, ManyChat e WhatsApp |
| 4 | Arquitetura (sem force-exit) | `node --test $T/companion-core-architecture-gates.test.mjs` | 53/53; A1–A18; `NEW_VIOLATIONS=0`, `STALE_BASELINE=0`, `LEGACY_VIOLATIONS_REMAINING=0` |
| 5 | Composição só-canal ManyChat | `node --test --test-force-exit $T/manychat-channel-only-architecture.test.mjs` | 6/6 |
| 6 | TypeScript | `./node_modules/.bin/tsc --noEmit` | PASS |
| 7 | Lint dos arquivos alterados | `npx eslint <7 arquivos alterados>` | 0 errors; 12 warnings — as mesmas 12 nos mesmos arquivos da `main` |
| 8 | Lint dos arquivos novos | `npx eslint <4 arquivos novos>` | 0 errors, 0 warnings |
| 9 | Lint global | `npx eslint . --ignore-pattern "dist/**"` (HEAD) × `npx eslint .` (worktree limpo da `main`) | 56 errors / 51 warnings nos dois — idêntico; nenhum error em arquivo alterado. Com `dist/` presente (gerado pelos testes de build, ignorado pelo git) aparecem +48 warnings, todas das cópias geradas dos mesmos fontes |
| 10 | Build normal + validador | `node app/extension/yolen-companion/scripts/build-package.mjs` + `validate-release-candidate.mjs` | PASS; `MANYCHAT_CAPTURE_ENABLED` **false** em dev e prod |
| 11 | Build E2E + validador | `build-package.mjs --e2e` + `validate-release-candidate.mjs --e2e` | PASS; `MANYCHAT_CAPTURE_ENABLED` true só no e2e; `e2e_manifest_identification` com o commit |
| 12 | Whitespace | `git diff --check origin/main...HEAD` | PASS |

Nenhuma suíte completa foi repetida. Nenhum timeout, watchdog, sleep ou
allowlist aumentado.

## 9. Falhas conhecidas

`test:companion`: as mesmas 4 conhecidas (`Final Release autoriza somente
produção e desenvolvimento local`; `acerto do vendedor exige ação concreta e
evidência da conversa`; `ponto de melhoria exige problema comprovado em
mensagem`; `guardrail exige recovery completo quando a conversa sai do
método`). E3: nenhuma. **Novas falhas: 0.**

## 10. Build E2E

| Item | Valor |
|---|---|
| Comando | `node app/extension/yolen-companion/scripts/build-package.mjs --e2e` e `node app/extension/yolen-companion/scripts/validate-release-candidate.mjs --e2e` |
| Pacote validado no HEAD de código | `Yolen Companion [E2E] 54499c6b` (validador PASS) |
| Pacote para o live | gerado a partir do HEAD final da branch (este commit; diferença só de documentação em relação a `54499c6b`); nome exibido `Yolen Companion [E2E] <sha8 do HEAD da branch>` — nome exato no relatório final |
| Manifest (about:debugging → Carregar extensão temporária) | `dist/yolen-companion/e2e/firefox/staging/manifest.json` |
| ID | `yolen-companion-e2e@gerson.local`, versão `1.0.0` |
| ManyChat | ON só no E2E; OFF em dev/prod |

## 11. Pendente de live (Gerson)

Live **pendente** — somente Gerson declara PASS. Roteiro mínimo:

- **LIVE-A — minimizar/expandir:** conversa com lead resolvido, aba
  ANÁLISE aberta → minimizar e expandir 5 vezes seguidas. Depois trocar de
  janela, voltar e minimizar/expandir mais 2 vezes. Esperado: ao expandir o
  painel volta inteiro na hora (marca, empresa, conexão, contato, abas,
  conteúdo), na mesma aba; nunca painel escuro vazio, header faltando ou
  blocos voltando aos poucos; AGORA/ANÁLISE não recarregam.
- **LIVE-B — AGORA/ANÁLISE estáveis:** mesma conversa, ~2 min sem mensagem
  nova: clicar nas abas, no campo de mensagem do canal (sem enviar), rolar,
  redimensionar a janela, minimizar/expandir. Esperado: AGORA não muda,
  "Responder agora"/blocos não somem nem voltam, ANÁLISE não volta a
  "Analisando…". Depois, uma mensagem nova do cliente: em ~8 s a linha
  "Analisando sua condução comercial…" aparece **acima** da leitura
  anterior (que continua visível) e no AGORA; ao terminar, os dois
  atualizam. Se a análise falhar, o erro fica até mensagem nova ou clique
  em "Analisar agora" — sem reiniciar sozinha.
- **LIVE-C — MENSAGEM:** aba MENSAGEM, digitar ~300 caracteres sem pausa;
  Backspace e Delete no meio; selecionar trecho com mouse e com Shift+setas;
  cursor no meio e digitar. Deixar passar ≥ 1 min (polling) digitando.
  Ir para AGORA e voltar; minimizar/expandir. Clicar "Gerar mensagem".
  Esperado: nada trava, nenhum caractere some/duplica, cursor e seleção não
  pulam, o texto nunca volta a um valor anterior, o rascunho continua, a
  sugestão responde ao texto digitado.
- **A→B→A (focal, porque rascunho e gatilho de análise tocam a
  fronteira):** rascunho em A → abrir B: campo vazio, nada de A → voltar a
  A: campo vazio (política: troca de conversa descarta) e nada de B.

## 12. Observações residuais (não corrigidas — fora do escopo ou sem prova)

- Retomada real da janela ainda revalida sessão e re-resolve o lead (B7):
  o cartão do contato pode piscar "Localizando este contato na Yolen…"
  (identidade/resolução — fora do escopo). AGORA, ANÁLISE, resumo e
  MENSAGEM não piscam mais nesse caminho.
- O AGORA é uma fotografia do servidor (FASE 16.5): o ticker de 60 s pode
  trazer uma decisão diferente puramente por tempo/SLA (dado novo do
  servidor). Não foi alterado (backend/UX-02).
- Se o WhatsApp/ManyChat remontar a conversa aberta sem troca real, o canal
  sinaliza troca de instância e o Core faz o hard reset (comportamento
  físico do canal; não reproduzível por código/teste). Observar no LIVE-B.
- Os runtimes de estabilidade continuam interceptando `panel.innerHTML`
  (legado do render de painel inteiro); o Core não usa mais esse setter.
  A remoção desse legado não foi necessária para a correção.

## 13. Arquivos alterados

| Arquivo | Tipo | Motivo |
|---|---|---|
| `app/extension/yolen-companion/src/companion-core.js` | produção (Core) | FNC-03 (`switchPanelLayout`, casca como região, expandir em `wirePanelInteractions`); FNC-04 C1 (focus só da janela), C4 (AGORA com linha de atualização, ANÁLISE com leitura válida + linha de estado), `forgetAnalysisAttemptContent()` no hard reset |
| `app/extension/yolen-companion/src/companion-analysis-controller.js` | produção (controller compartilhado) | FNC-04 C2 (conteúdo já tentado), C4 (AGORA não é zerado no início da tentativa) |
| `app/extension/yolen-companion/src/companion-lead-summary-controller.js` | produção (controller compartilhado) | FNC-04 C3 (resumo stale-while-revalidate) |
| `app/extension/yolen-companion/src/companion-message-controller.js` | produção (controller compartilhado) | MSG-01 M1 (reconciliação no lugar), M2 (rascunho por conversa) |
| `app/extension/yolen-companion/tests/e3-test-support/product-stability.mjs` | suporte de teste (novo) | clique real, polling controlado, mensagem nova / mutação não-mensagem nos dois canais |
| `app/extension/yolen-companion/tests/e3-dom/product-stability-p0-expand-collapse.test.mjs` | teste focal (novo) | FNC-03 |
| `app/extension/yolen-companion/tests/e3-dom/product-stability-p0-analysis-triggers.test.mjs` | teste focal (novo) | FNC-04 |
| `app/extension/yolen-companion/tests/e3-dom/product-stability-p0-message-draft.test.mjs` | teste focal (novo) | MSG-01 |
| `app/extension/yolen-companion/tests/b5-minimized-intelligence.test.mjs` | teste existente | B5.3 (§6) |
| `app/extension/yolen-companion/tests/e3-dom/content-script-dom-integrated-seller-gate.test.mjs` | teste existente | reanálise em voo (§6) |
| `app/extension/yolen-companion/tests/e3-dom/seller-message-context-eligibility.test.mjs` | teste existente | H (§6) |
| `docs/companion-universal/PRODUCT_STABILITY_P0_UI_EXECUTION.md` | documentação (novo) | este registro |

Não alterados: adapters (WhatsApp/ManyChat), bootstrap, views, runtimes de
estabilidade, backend (`app/lib`, `app/api`), `supabase/`, manifest, build,
feature flags, ledger, transcrição, identidade, envio. Commits:
`54499c6b` (código + testes) e o commit deste registro.
