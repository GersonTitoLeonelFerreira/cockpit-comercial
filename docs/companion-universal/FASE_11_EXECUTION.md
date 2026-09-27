# FASE 11 — REGISTRO DE EXECUÇÃO (gate final, PR e decisão de merge)

Registro único da FASE 11. A FASE 11 é um gate. A 1ª rodada falhou por
F11-01 (§8). A correção de F11-01 foi autorizada pelo Controle Mestre
dentro da própria FASE 11 (sem nova fase): opção B, §8.8. Depois dela, os
gates foram repetidos por inteiro (§8.9) e um live focal de scroll foi
pedido (§8.10). Nenhuma outra alteração de produto, latência ou UX.
PR: só depois do live focal. Merge: NO. Rollout: NO.

## 1. Baseline

| Item | Valor |
|---|---|
| Worktree | único (`/home/user/cockpit-comercial`), limpo, sem `MERGE_HEAD` |
| Branch | `claude/companion-multichannel-repair` |
| HEAD antes da reconciliação | `5c9312e2` |
| `origin/main` | `7e1f6d0b` (merge do PR #339 — hotfix LIVE-03) |
| HEAD de código da FASE 11 | `96b6b7e5` (= remoto) |

## 2. Reconciliação com a `main`

- `git merge origin/main`, merge normal (sem rebase, reset ou force push)
  → `c768ea52` (pais `5c9312e2` e `7e1f6d0b`).
- Sem conflito. Diff de conteúdo trazido pelo merge: **vazio** — o hotfix
  `cf52bf97` (PR #339) tem o mesmo conteúdo de `5a8afe9c`, já presente na
  branch. O PR #339 não foi misturado ao PR final: ele já está na `main`.
- `origin/main` é ancestral do HEAD.

## 3. Fechamento formal da FASE 10

`FASE_10_EXECUTION.md` §9.7 (retest LIVE-03 PASS: job `succeeded`,
`attempt_count` 1), §9.8 (PERFORMANCE OBSERVATION — NON-BLOCKING: ~3m18s
no total, ~2m58s de espera na fila, ~20s de worker; não corrigido) e §10
(FASE 10 PASS). Commit `96b6b7e5`.

## 4. Gates — 1ª rodada (HEAD `96b6b7e5`, antes da correção)

`T=app/extension/yolen-companion/tests`

| # | Gate | Comando | Resultado |
|---|---|---|---|
| 1 | test:companion (falhas conhecidas) | `node scripts/companion-known-failures-gate.mjs companion` | 2282 testes, 2278 pass, 4 fail — **4 known, 0 new** → PASS |
| 2 | Autorização | `npm run test:companion-authorization` | 266/266 → PASS |
| 3 | **E3 oficial** | `node --test --test-force-exit --test-reporter=tap $T/e3-dom/*.test.mjs` | **352 testes, 351 pass, 1 fail** → **FAIL** (F11-01) |
| 4 | E3 falhas conhecidas | `node scripts/companion-known-failures-gate.mjs e3` | 0 falhas nesta execução (mesma suíte do #3; a falha é intermitente) |
| 5 | E3 em processo (diagnóstico) | `node --experimental-test-isolation=none --test --test-force-exit $T/e3-dom/*.test.mjs` | 1ª: 352 testes, 348 pass, 4 fail; 2ª: 352, 351, 1 fail (§8.6) |
| 6 | Arquitetura | sem `--test-force-exit` e em processo | 53/53 ×2; A1–A18 PASS; `NEW_VIOLATIONS=0`, `STALE_BASELINE=0`, `LEGACY_VIOLATIONS_REMAINING=0` |
| 7 | Composição só-canal ManyChat | `node --test --test-force-exit $T/manychat-channel-only-architecture.test.mjs` | 6/6 → PASS |
| 8 | Paridade entre canais | oficial e em processo | 51/51 ×2 → PASS |
| 9 | TypeScript | `npx tsc --noEmit` | PASS |
| 10 | Lint dos arquivos alterados (vs `main`) | `npx eslint <129 arquivos .js/.mjs/.ts/.tsx do diff>` | 0 errors; 14 warnings, todas já existentes na `main` (código movido de `content-script.js`; a `main` tinha 17) → PASS |
| 11 | Lint global | `npx eslint .` | 56 errors / 123 warnings — baseline global; nenhum error em arquivo alterado |
| 12 | Build normal + validador | `build-package.mjs` + `validate-release-candidate.mjs` | PASS; `MANYCHAT_CAPTURE_ENABLED` false em dev e prod |
| 13 | Build E2E + validador | idem com `--e2e` | PASS; `MANYCHAT_CAPTURE_ENABLED` true só em e2e |
| 14 | Whitespace | `git diff --check` | PASS |

Contagem E3 confiável: o #3 relatou **352** testes (sem truncamento). O #5
confirma o mesmo total (352) em processo.

## 5. Falhas conhecidas

| Suíte | Conhecidas | Novas |
|---|---|---|
| test:companion | 4 (`Final Release autoriza somente produção e desenvolvimento local`; `acerto do vendedor exige ação concreta e evidência da conversa`; `ponto de melhoria exige problema comprovado em mensagem`; `guardrail exige recovery completo quando a conversa sai do método`) | 0 |
| E3 | 0 (lista vazia; a allowlist não foi aumentada) | F11-01 (§8) |

## 6. Auditoria do diff (`origin/main...HEAD`)

| Responsabilidade | Arquivos |
|---|---|
| `app/extension/yolen-companion` (extensão: Core, adapters, controllers, views, runtimes, testes, build) | 155 |
| `docs/` | 8 |
| `scripts/companion-known-failures-gate.mjs` (só remove entradas corrigidas na FASE 5) | 1 |
| Backend (`app/lib`, `app/api`) | 0 (LIVE-03 já está na `main` pelo PR #339) |
| `supabase/` (incl. `.gitignore`, `config.toml`) | 0 |
| Login / marketing / middleware | 0 |

PR #152 (`agent/yolen-public-marketing-clean`): intocado (draft, aberto,
última atualização 2026-08-15).

## 7. Auditoria estrutural do produto

- WhatsApp: `whatsapp-adapter.js` → Core compartilhado
  (`companion-core.js`, controllers, views, `companion-bootstrap.js`).
- ManyChat: `manychat-channel-adapter.js` (+ leitores de DOM, composer,
  evidência de telefone e fonte de áudio) → o mesmo Core, controllers,
  views e bootstrap (manifest).
- Nenhum arquivo `manychat-*` cria o painel, renderiza HTML seller-facing,
  deriva `NOT_FOUND`, chama `RESOLVE_LEAD`/`ANALYZE_CONVERSATION` ou
  contém raciocínio: só referências defensivas ao painel (ignorar a
  própria UI). Confirmado pelos gates #6 (A1–A18) e #7 (Q, com controle
  positivo).
- Os dois canais carregam o mesmo `panel-stability-runtime.js` e o mesmo
  `editable-field-stability-runtime.js` — relevante para F11-01.

## 8. F11-01 — BLOCKER: regressão de scroll ao abrir a primeira conversa

### 8.1 Sintoma no gate

E3 oficial (#3): `5+6) rerender de região em segundo plano (mesma
conversa) preserva o scroll do workspace-body via panel-stability-runtime`
— esperado `850`, obtido **`2400`** (= fim do conteúdo:
`scrollHeight 3000 − clientHeight 600`). Intermitente: o mesmo teste passa
isolado (6/6) e em 20 cópias paralelas (0/20). Mas "flaky" não é causa, e
o valor 2400 não é aleatório. Investigado.

### 8.2 Reprodução determinística

Cópia do teste 5+6 (fora do repo) variando só a espera fixa entre "aba
AGORA visível" e o scroll simulado do vendedor (o teste usa 80 ms):

| Espera | HEAD `96b6b7e5` | `main` `7e1f6d0b` |
|---|---|---|
| 80 ms | 850 | 850 |
| 20 ms | 850 | 850 |
| 10 / 5 / 0 ms | **2400** | 850 |

Os dois arquivos ux8 de scroll inteiros (10 testes, inalterados em relação
à `main`), com a mesma espera trocada por 0 ms: HEAD tem **3 falhas, todas
com 2400** (`1)` campo editável 300 → 2400; `2)` digitação 540 → 2400;
`5+6)` 850 → 2400). A `main` passa 10/10. Com 80 ms, os dois passam 10/10.

Sob carga de CPU (E3 oficial roda vários arquivos em paralelo), os frames
de animação do jsdom atrasam e a janela de 80 ms deixa de cobrir a
restauração pendente — daí a intermitência. Com espera curta, a falha é
100% reprodutível e só acontece no HEAD.

### 8.3 Mecanismo (trace instrumentado de `panel-stability-runtime.js`)

1. Na montagem, antes de existir conversa, o runtime captura o snapshot de
   scroll do workspace-body. O conteúdo cabe na viewport (`maxScroll 0`),
   então `distanceFromBottom 0` → `nearBottom: true`.
2. **HEAD:** desde a FASE 5 (`ba620ee0`), a identidade de conversa do
   runtime é `data-yolen-conversation-key`. Antes da primeira conversa ela
   é `''`. A passagem `'' → chave` não conta como troca de conversa (a
   condição exige um rótulo anterior não vazio), então o snapshot da
   montagem continua valendo. Cada rerender da mesma conversa agenda
   `restorePanelInteraction()` (dois frames, com `restoring = true`,
   durante os quais `captureScroll()` ignora scroll). Quando o workspace
   com as áreas cresce, a restauração aplica `nearBottom` →
   `maxScroll − 0` → **fim do conteúdo**.
3. **`main`:** o rótulo era o texto `.yolen-lead-name`
   ("Nenhuma conversa detectada" → telefone → nome do lead). O mesmo render
   que monta o workspace troca telefone → nome. O runtime lê isso como
   troca de conversa (o falso positivo que a FASE 5 removeu de propósito)
   e zera o snapshot (`nearBottom: false`, `scrollTop 0`), sem
   restauração pendente.

### 8.4 Impacto fora do jsdom (simulação com métricas realistas)

Mesmo Core e mesmos runtimes, métricas de layout simuladas:
workspace-body com `clientHeight 600`; `scrollHeight` 600 antes das áreas
e 3000 depois; **nenhum scroll do vendedor**.

| Versão | `scrollTop` final da primeira conversa |
|---|---|
| `main` `7e1f6d0b` | 0 (topo) |
| `ba620ee0^` (`dac28357`) | 0 (topo) |
| **`ba620ee0`** | **2400 (fim)** |
| **HEAD `96b6b7e5`** | **2400 (fim)** |

Leitura: na primeira conversa após carregar a página, quando o conteúdo
das áreas passa da altura do painel, o workspace abre rolado até o fim em
vez do topo. Isso vale nos dois canais (runtime compartilhado), inclusive
no WhatsApp de produção se a branch for mergeada. Trocas de conversa
seguintes (A → B) resetam corretamente (a chave muda).

Não observado nem verificado no live: o live test das FASES 9/10 não
checou posição de scroll. A prova acima é por simulação (jsdom com
métricas injetadas) e bisect, não por navegador real.

### 8.5 Introdução

Bisect: `dac28357` OK → `ba620ee0`
("refactor(companion): complete explicit message, summary and transport
composition", FASE 5) introduz. O mesmo commit tornou os testes ux8 de
scroll dependentes da espera fixa de 80 ms: na `main`, espera 0 passa.

### 8.6 Falhas do E3 em processo (#5)

| Teste | Esperado → obtido | Relação |
|---|---|---|
| `1+2) trocar de aba preserva o scroll do workspace-body…` | 420 → **2400** | mesma assinatura de F11-01 (restauração com o snapshot `nearBottom` da montagem); não reproduzido isolado com espera 0 |
| `1) foco em campo editável usa workspaceBody.scrollTop…` | 300 → **2400** | F11-01 — reproduzido com espera 0 só no HEAD (§8.2) |
| `A → B → A (análise e geração de mensagem)` | divergência de view em `areas.analysis` de B | ver abaixo |
| `A → B → A (enriquecimento)` | divergência de view em `areas.analysis` de B | ver abaixo |
| `8) … não brigam pelo elemento dono do scroll` (2ª execução) | 260 → **2400** | assinatura de F11-01 |

Segunda execução em processo (18m15s), com cópia instrumentada do arquivo
de paridade que despeja o conteúdo de ANÁLISE e as últimas chamadas por
canal quando há divergência: **352 testes, 351 pass, 1 fail**. As duas
falhas de paridade **não se repetiram** (passaram; nenhum dump). A única
falha foi `8) panel-stability-runtime e editable-field-stability-runtime
não brigam pelo elemento dono do scroll`: 260 → **2400**, de novo a
assinatura de F11-01.

Paridade (A → B → A análise/mensagem e enriquecimento):
- só falharam uma vez, no modo "todos os arquivos E3 num único processo";
- o arquivo passa 51/51 no modo oficial e em processo quando roda sozinho
  (#8); o E3 oficial (#3) não falhou nelas nesta fase; a segunda execução em
  processo também passou;
- **causa NÃO DETERMINADA** (não reproduzida com instrumentação). Não é
  classificada como flake: fica como item aberto a verificar nos gates da
  correção de F11-01 (repetir o E3 em processo).
- Histórico: na FASE 10, `A → B → A (decisão AGORA)` falhou uma vez no E3
  oficial sob carga. A causa foi a espera do harness em A₂, corrigida em
  `0f1c7fe7` (`areasLoadedFor`).

### 8.7 Correções candidatas (avaliadas antes da autorização)

Validadas só em cópia descartável fora do repo:

| Opção | Mudança (1 linha em `panel-stability-runtime.js`) | Primeira abertura (métricas realistas) | Teste 5+6 com espera ≤10 ms |
|---|---|---|---|
| A — identidade | tratar a primeira chave (`'' → chave`) como início de conversa (remover `conversationLabel &&` da condição) | 0 (topo) | 0 (≠ 850) |
| B — semântica do snapshot | `nearBottom` só com overflow real (`maxScroll > 0 && distanceFromBottom <= 80`) | 0 (topo) | 0 (≠ 850) |

- As duas corrigem a regressão de produto. A opção B também cobre o caso em
  que o runtime inicializa com a chave já definida.
- Nenhuma das duas remove a dependência dos testes ux8 da espera fixa de
  80 ms. Depois de um rerender da mesma conversa, o runtime ignora scroll
  por dois frames (comportamento intencional de restauração). Os testes
  precisam esperar o fim dessa janela (silêncio de mutações + dois
  frames), em vez de dormir 80 ms.
- Escopo de uma correção autorizada: teste vermelho com métricas
  realistas → micro-fix (opção B, ou A+B) → endurecer a espera dos 3
  testes ux8 → gates completos → novo build E2E. Não iniciado: a FASE 11
  não muda produto nem abre fase nova.

### 8.8 Correção autorizada (opção B) — red, fix, green

**Regra:** o runtime só considera o workspace "no fim" com overflow real
de conteúdo. Painel sem overflow nunca está "no fim".

**Commit:** `96d4bf69`. 1 arquivo de produção
(`panel-stability-runtime.js`) + 3 de teste. Nenhum outro arquivo de
produção (Core, adapters, backend, áudio, análise, fila, manifest, build,
UI comercial, copy: intocados).

Mudança de produção:

| Trecho | Antes | Depois |
|---|---|---|
| `captureScroll()` | `nearBottom: distanceFromBottom <= BOTTOM_THRESHOLD_PX` | `nearBottom: maxScroll > 0 && distanceFromBottom <= BOTTOM_THRESHOLD_PX` |
| API pública do runtime | — | `isRestoring()` somente leitura (`restoring`), para testes esperarem a restauração terminar por condição |

`BOTTOM_THRESHOLD_PX` (80) inalterado.

**Teste focal novo:** `tests/e3-dom/panel-stability-first-open-scroll.test.mjs`.
Métricas de layout realistas desde o primeiro render (instaladas em
`beforeLoad`): viewport do workspace-body 600; conteúdo 600 antes das áreas
seller-facing; 3000 depois. Todas as esperas são por condição.

| Caso | Antes da correção | Depois |
|---|---|---|
| Primeira conversa abre no topo (painel sem overflow → workspace cresce) | **FAIL: 2400** (esperado 0) | PASS |
| Scroll manual do vendedor (850) sobrevive a 3 rerenders da mesma conversa | PASS | PASS |
| A → B abre B no topo; B → A abre A no topo; sem salto para o fim | PASS | PASS |
| Com overflow real, vendedor no fim continua ancorado no fim quando o conteúdo cresce (2900) | PASS | PASS |

O red falhou só no caso da regressão, pelo motivo certo (2400 = fim do
conteúdo). Os outros três casos são controles de preservação.

**Testes com espera fixa:** as 7 esperas `sleep(80)` dos dois arquivos
ux8 de scroll (`1+2)`, `3)`, `5+6)`; campo editável `1)`, `2)`, `4)`,
`8)`) viraram `scrollAsSellerWhenSettled()`. O helper espera
`isRestoring() === false` e, no mesmo passo síncrono, aplica o scroll do
vendedor. Nenhuma espera foi aumentada. As asserções continuam as mesmas.

**Provas focais:**

| Prova | Resultado |
|---|---|
| A. Teste focal F11-01 | 4/4 PASS |
| B + C. Focal + ux8 scroll + campo editável (3 arquivos) | 14/14 PASS |
| D. Focal repetido em sequência | 30/30 execuções PASS |
| D. Estresse: 3 arquivos × 6 processos paralelos × 3 rodadas, com 8 loops de CPU ocupando os 4 núcleos | 18 execuções, 252 testes: todas as asserções de scroll PASS. 1 falha: `9)` (ver abaixo) |
| E. Paridade `A → B → A (análise e geração de mensagem)` e `(enriquecimento)`, 5× oficial + 5× em processo | 20/20 PASS |

Falha sob estresse — `9) mesmo depois de recolher/expandir,
header/contato/abas/rodapé continuam fora do workspace-body` (teste
inalterado, sem asserção de scroll):
- **Causa:** o `waitFor` da montagem inicial (primeiro passo do teste,
  antes de qualquer colapso ou scroll) estourou o teto fixo de 8 s do
  harness.
- **Por quê:** com ~14 processos disputando 4 núcleos, todos os testes
  ficaram 3–10× mais lentos. O próprio `9)` levou 3,6–4,9 s nas outras 17
  execuções e 8,7 s nesta.
- **Classificação:** limite de tempo do harness sob sobrecarga
  artificial. Não é regressão de scroll.

### 8.9 Gates completos depois da correção (2ª rodada)

Código `96d4bf69`; execução sequencial nova (nenhum resultado antigo
reaproveitado), de 2026-09-26T22:24Z a 23:14Z. `T=app/extension/yolen-companion/tests`

| # | Gate | Comando | Resultado |
|---|---|---|---|
| 1 | test:companion (falhas conhecidas) | `node scripts/companion-known-failures-gate.mjs companion` | 2282 testes, 2278 pass, 4 fail — **4 known, 0 new** → PASS |
| 2 | Autorização | `npm run test:companion-authorization` | 266/266 → PASS |
| 3 | **E3 oficial** | `node --test --test-force-exit --test-reporter=tap $T/e3-dom/*.test.mjs` | **356/356** → PASS (352 + 4 testes focais; contagem completa, sem truncamento) |
| 4 | E3 falhas conhecidas | `node scripts/companion-known-failures-gate.mjs e3` | 0 falhas; 0 known; 0 new → PASS |
| 5 | E3 em processo (diagnóstico) | `node --experimental-test-isolation=none --test --test-force-exit $T/e3-dom/*.test.mjs` | 356 testes, 355 pass, 1 fail: paridade `A → B → A (enriquecimento)` — causa determinada abaixo; nenhuma falha de scroll |
| 6 | Arquitetura | sem force-exit e em processo | 53/53 ×2; A1–A18 PASS; `NEW_VIOLATIONS=0`, `STALE_BASELINE=0`, `LEGACY_VIOLATIONS_REMAINING=0` |
| 7 | Composição só-canal ManyChat | `node --test --test-force-exit $T/manychat-channel-only-architecture.test.mjs` | 6/6 |
| 8 | Adapter neutro | `… $T/e3-dom/core-neutral-channel-adapter.test.mjs` (em processo) | 14/14 |
| 9 | ManyChat | `… $T/manychat-*.test.mjs $T/companion-background-privacy.test.mjs $T/companion-enrichment-comparison.test.mjs $T/e3-dom/manychat-shared-composition.test.mjs` (em processo) | 286/286 |
| 10 | WhatsApp | `… whatsapp-phase5-regression, whatsapp-identity-bridge-integration, suggested-message-insertion-conversation-race, canonical-conversation-key, lead-enrichment` (em processo) | 61/61 |
| 11 | Paridade | oficial e em processo | 51/51 ×2 |
| 12 | TypeScript | `npx tsc --noEmit` | PASS |
| 13 | Lint dos arquivos alterados | `npx eslint <132 arquivos do diff>` | 0 errors; 15 warnings, todas já existentes na `main` (a 15ª, `defaultLeadSummary` em `ux8-scroll-owner-dom.test.mjs`, existe igual na `main`; o arquivo entrou no diff agora) |
| 14 | Lint global (baseline separado) | `npx eslint .` | 56 errors / 123 warnings — idêntico ao baseline; nenhum error em arquivo alterado |
| 15 | Build normal + validador | `build-package.mjs` + `validate-release-candidate.mjs` | PASS; `MANYCHAT_CAPTURE_ENABLED` false em dev e prod |
| 16 | Build E2E + validador | idem com `--e2e` | PASS; true só em e2e; o pacote contém `maxScroll > 0 &&` e `isRestoring` |
| 17 | Whitespace | `git diff --check origin/main...HEAD` | PASS |
| 18 | Auditoria do diff | `origin/main...HEAD` | 158 extensão, 9 docs, 1 script; backend 0; `supabase/` 0; login/marketing/middleware 0 |
| 19 | PR #152 | GitHub | intocado (draft, aberto, última atualização 2026-08-15) |

**Paridade no E3 em processo (#5) — causa determinada (não é flake):**
- **Mecanismo:** os testes A → B → A de paridade não fixam o temporizador
  real da análise automática (`AUTOMATIC_ANALYSIS_DELAY_MS = 8000`, Core
  compartilhado). Com todos os arquivos E3 num único processo, a fase B do
  teste passa de 8 s de relógio (o teste levou 13,8 s). Aí a análise
  automática de B dispara num canal antes do snapshot e no outro ainda
  não.
- **Consequência:** o harness de paridade não configura resultado de
  análise nesse cenário. O canal que disparou mostra o cartão de erro
  ("Análise não configurada neste cenário de teste. Tentar novamente",
  `yolen-status-warning`) ou o de loading ("Analisando sua condução
  comercial…"). O outro mostra o estado vazio.
- **Prova determinística** (cópia descartável do teste, override de teste
  já existente `__yolenCompanionAutomaticAnalysisMsForTests`):

| Override | Resultado |
|---|---|
| 0 ms nos dois canais | a análise automática roda nos dois; paridade **PASS** |
| só no ManyChat, 0 ms (teste de enriquecimento) | divergência **idêntica** à falha do #5 (mesmos caminhos e mesmo HTML) |
| só no ManyChat, 2500 ms (teste de análise e mensagem) | divergência **idêntica** à 1ª falha de paridade em processo (§8.6, cartão "Analisando…") |
| padrão (8 s), fora de carga | nenhuma análise automática dentro da janela do teste; PASS (10/10 oficial + 10/10 em processo, §8.8 E) |

- **Classificação:** dependência de tempo real no teste de paridade,
  presente desde a FASE 8. Não é divergência de produto: os dois canais
  executam a mesma análise automática. Não tem relação com F11-01.
- **Correção possível (NÃO aplicada; fora da autorização atual, que é
  somente F11-01):** fixar o override da análise automática nos testes
  A → B → A de paridade, só no teste.

### 8.9.1 Hardening test-only da paridade A → B → A (autorizado)

**Commit:** `16b4cf44`. Só `tests/e3-dom/cross-channel-parity.test.mjs`.
Nenhum arquivo de produção; `AUTOMATIC_ANALYSIS_DELAY_MS` de produção
inalterado; asserções inalteradas.

**Mudança:** os cenários A → B → A (todos via `startAba` e o de
enriquecimento) fixam, no `beforeLoad`, o override de teste já existente
`__yolenCompanionAutomaticAnalysisMsForTests = 2^31 - 1`, nos dois canais.
Esse é o maior atraso aceito por `setTimeout` sem estourar para disparo
imediato. Efeito: a análise automática nunca dispara dentro da janela do
teste. Nenhum desses cenários testa análise automática. Sem sleep extra,
sem timeout aumentado.

**Provas:**

| Prova | Resultado |
|---|---|
| Neutralização: fase B esticada além de 8 s (cópia descartável com pausa de 9 s antes do snapshot), chamadas automáticas de `ANALYZE_CONVERSATION` | sem o pino: 1 por canal; com o pino: 0 nos dois |
| A. `A → B → A (análise e geração de mensagem)`, 12 oficial + 12 em processo | 24/24 |
| A. `A → B → A (enriquecimento)`, 12 oficial + 12 em processo | 24/24 |

### 8.9.2 Gates no HEAD de código final (`16b4cf44`)

Execução nova em 2026-09-26T23:41Z → 2026-09-27T00:46Z. Nenhum resultado
de `96d4bf69` foi reaproveitado.

| Gate | Resultado |
|---|---|
| test:companion (falhas conhecidas) | 2282 testes, 2278 pass — **4 known, 0 new** → PASS |
| Autorização | 266/266 |
| E3 oficial | **356/356** |
| E3 falhas conhecidas | 0 falhas → PASS |
| E3 em processo (1 execução completa) | **356/356** |
| Arquitetura (sem force-exit e em processo) | 53/53 ×2; A1–A18 PASS; NEW 0, STALE 0, LEGACY 0 |
| Composição só-canal ManyChat | 6/6 |
| Adapter neutro | 14/14 |
| ManyChat | 286/286 |
| WhatsApp | 61/61 |
| Paridade oficial | 51/51 |
| Paridade em processo | 51/51 |
| TypeScript | PASS |
| Lint dos arquivos alterados (132) | 0 errors; 15 warnings, todas já existentes na `main` |
| Lint global (baseline separado) | 56 errors / 123 warnings — idêntico ao baseline |
| Build normal + validador | PASS; `MANYCHAT_CAPTURE_ENABLED` false em dev e prod |
| Build E2E + validador | PASS; true só em e2e |
| `git diff --check origin/main...HEAD` | PASS |
| Auditoria do diff | 158 extensão, 9 docs, 1 script; backend 0; `supabase/` 0; login/marketing/middleware 0 |

Execuções do E3 em processo: por decisão do Controle Mestre, só **uma**
execução completa. Duas repetições extras já agendadas foram
interrompidas (processo encerrado) antes de concluir. Não contam como
resultado, nem PASS nem FAIL.

### 8.10 Live focal de scroll (Firefox real) — pendente

Pacote: build E2E da branch no HEAD publicado
(`node app/extension/yolen-companion/scripts/build-package.mjs --e2e`).
Nome esperado: `Yolen Companion [E2E] <sha8 do HEAD>`. Roteiro:

1. carregar o E2E novo;
2. abrir/recarregar o ManyChat;
3. abrir a PRIMEIRA conversa;
4. confirmar que o Companion abre no TOPO;
5. rolar manualmente;
6. trocar A → B;
7. voltar B → A;
8. confirmar que não há salto incorreto para o fim.

Resultado: aguardando execução.

## 9. Live acceptance (herdado)

| Item | Resultado |
|---|---|
| LIVE-01 | PASS (FASE 10) |
| LIVE-02 | PASS (FASE 10) |
| LIVE-03 | PASS (FASE 10; hotfix PR #339 na `main`, deploy READY) |
| LIVE ACCEPTANCE | PASS — não cobriu posição de scroll (F11-01) |

## 10. Performance (follow-up, não bloqueante)

Latência da análise profunda: ~3m18s no total (~2m58s de espera na fila,
~20s de worker). Não corrigida. Métrica futura: `requested_at →
started_at`.

## 11. PR, Actions, merge, rollout

| Item | Estado |
|---|---|
| PR `claude/companion-multichannel-repair` → `main` | **NÃO ABERTO** (gate #3 falhou; F11-01) |
| GitHub Actions na branch | nenhuma execução (os workflows rodam em PR). Padrão conhecido nos PRs: BILLING_BLOCKED (job de ~2 s, `runner_id: 0`, sem steps) — não é falha de teste |
| Merge | NO |
| Auto-merge / squash / rebase | NO |
| Deploy | NO |
| ManyChat | OFF em builds normais (dev/prod); ON só no E2E |
| Rollout ManyChat | NO |

## 12. Status

| Item | Resultado |
|---|---|
| Reconciliação com a `main` | PASS (sem conflito) |
| 1ª rodada de gates | FAIL — F11-01 (gate 3) |
| F11-01 | corrigido (`96d4bf69`, §8.8): red → fix → green |
| Paridade A → B → A (timing de teste) | corrigida só no teste (`16b4cf44`, §8.9.1) |
| Gates no HEAD de código final `16b4cf44` | **PASS** (§8.9.2) |
| Live focal de scroll | **pendente** (§8.10) |
| **STATUS FASE 11** | **BLOCKED** (até o live focal) |
| PR | não aberto |
