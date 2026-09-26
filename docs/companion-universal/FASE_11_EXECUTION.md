# FASE 11 — REGISTRO DE EXECUÇÃO (gate final, PR e decisão de merge)

Registro único da FASE 11. A FASE 11 é um gate: nenhuma alteração de
produto, de teste, de latência ou de UX foi feita nesta fase. Resultado:
**GATE FAIL — PR NÃO ABERTO** (achado F11-01, §8). Merge: NO. Rollout: NO.

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

## 4. Gates (HEAD `96b6b7e5`)

`T=app/extension/yolen-companion/tests`

| # | Gate | Comando | Resultado |
|---|---|---|---|
| 1 | test:companion (falhas conhecidas) | `node scripts/companion-known-failures-gate.mjs companion` | 2282 testes, 2278 pass, 4 fail — **4 known, 0 new** → PASS |
| 2 | Autorização | `npm run test:companion-authorization` | 266/266 → PASS |
| 3 | **E3 oficial** | `node --test --test-force-exit --test-reporter=tap $T/e3-dom/*.test.mjs` | **352 testes, 351 pass, 1 fail** → **FAIL** (F11-01) |
| 4 | E3 falhas conhecidas | `node scripts/companion-known-failures-gate.mjs e3` | 0 falhas nesta execução (mesma suíte do #3; a falha é intermitente) |
| 5 | E3 em processo (diagnóstico) | `node --experimental-test-isolation=none --test --test-force-exit $T/e3-dom/*.test.mjs` | 352 testes, 348 pass, 4 fail (§8.6) |
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

As duas falhas de paridade só apareceram no modo "todos os arquivos E3 num
único processo" (#5). O arquivo de paridade passa 51/51 no modo oficial e
51/51 em processo quando roda sozinho (#8). O E3 oficial (#3) não falhou
nelas nesta fase. Diagnóstico com dump do conteúdo de ANÁLISE por canal:
em andamento (registro a seguir).

### 8.7 Correções candidatas (NÃO aplicadas — decisão do Controle Mestre)

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
| Gates 1, 2, 4, 6–14 | PASS |
| Gate 3 (E3 oficial) | **FAIL — F11-01** |
| **FASE 11 (gate final)** | **FAIL — 1 blocker (F11-01)** |
| PR | não aberto |
| Próximo passo | decisão do Controle Mestre sobre a correção de F11-01 (§8.7) |
