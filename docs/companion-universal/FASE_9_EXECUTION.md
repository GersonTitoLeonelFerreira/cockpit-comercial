# FASE 9 — REGISTRO DE EXECUÇÃO (live test funcional no Firefox — ManyChat)

Registro único da FASE 9 do Plano Mestre de Reconstrução do Companion
Multicanal. Nenhuma subfase; nenhuma correção de produto; a FASE 10 não foi
iniciada.

## 1. Auditoria inicial

| Item | Valor |
|---|---|
| Branch | `claude/companion-multichannel-repair` |
| HEAD local = remoto | `9e6a22c08d18bdcd827432a0c9919e775776c15e` |
| `origin/main` | `0c95b7696775dd900ccdbf3eb9cc071155dd277a` |
| Árvore | limpa |
| Diferença da branch fora da extensão/docs | só `scripts/companion-known-failures-gate.mjs` (nenhuma mudança de backend) |

## 2. Reconciliação 53 × 37 (gate de arquitetura)

Comando exato:
`node --test --test-force-exit app/extension/yolen-companion/tests/companion-core-architecture-gates.test.mjs`

- Blob idêntico em `23abdc6e` e `9e6a22c0`:
  `9634d13c820a5ad049bb7c84c3ef278e6e9977e9`.
- O arquivo define estaticamente **53** testes: 4 de fixture/relatório +
  18 por gate (A1–A18) + 15 self-tests + 3 self-tests de migração A3 +
  1 simulação FASE 4 + 12 dinâmicos de migração de owner
  (`OWNER_MIGRATION_CASES` = A3–A8 × {migração, ManyChat paralelo}).
- Execuções repetidas do comando exato (isolamento por processo +
  `--test-force-exit`): 43, 45, 45, 42, 35, 28 — **contagem não
  determinística**, sempre um prefixo da lista, todas com exit 0.
- Sem `--test-force-exit` (3×): **53/53** sempre.
- Com `--test-force-exit` em processo (`--experimental-test-isolation=none`,
  5×; e arquivo executado diretamente com reporter TAP para arquivo, 3×):
  **53/53** sempre.

**Causa:** diferença de reporting, não de execução. Com isolamento por
processo, o processo filho encerra por `--test-force-exit` antes de
terminar de enviar os eventos de teste ao processo pai; o pai conta só o
que recebeu. Todos os 53 testes executam e passam (exit 0 do filho). É a
mesma causa do achado D11 da FASE 8. O "37/37" da FASE 8 foi uma
contagem truncada (o valor correto é 53/53, como na FASE 7).

Confirmado em execução completa:
- A1…A18 executados (18 testes por gate + `# A1: PASS` … `# A18: PASS`);
- baseline vazia (`LEGACY_ARCHITECTURE_BASELINE = Object.freeze([])`);
- `NEW_VIOLATIONS=0`, `STALE_BASELINE=0`, `LEGACY_VIOLATIONS_REMAINING=0`;
- self-tests presentes (31);
- testes dinâmicos de migração de owner presentes (12, A3–A8).

Nenhum arquivo de produção ou de teste alterado para isso.

## 3. Pré-gate automatizado

| Gate | Comando | Exit | Resultado |
|---|---|---|---|
| Arquitetura | comando exato acima; contagem completa em processo | 0 | 53/53; NEW=0, STALE=0, LEGACY=0 |
| Paridade (oficial) | `node --test --test-force-exit …/tests/e3-dom/cross-channel-parity.test.mjs` | 0 | 51/51 |
| Paridade (em processo) | `node --experimental-test-isolation=none --test --test-force-exit …` | 0 | 51/51 |
| Build E2E | `node app/extension/yolen-companion/scripts/build-package.mjs --e2e` | 0 | PASS |
| Validador E2E | `node app/extension/yolen-companion/scripts/validate-release-candidate.mjs --e2e` | 0 | PASS; `MANYCHAT_CAPTURE_ENABLED` true só em e2e (dev/prod false, FASE 8 gates 13–14) |

## 4. Build do live test

| Item | Valor |
|---|---|
| HEAD | `9e6a22c08d18bdcd827432a0c9919e775776c15e` |
| Gerado em | 2026-09-26T05:37:43Z |
| Pacote Firefox | `dist/yolen-companion/e2e/yolen-companion-firefox-e2e-v1.0.0.zip` (69 arquivos) |
| SHA-256 | `a6407b93090067836871e778006b851acf810c5cb4d61a364cb14d06bc0da366` |
| Nome / id | `Yolen Companion [E2E]` 1.0.0 / `yolen-companion-e2e@gerson.local` |
| Flag | `MANYCHAT_CAPTURE_ENABLED = true` no pacote |
| Backend | `https://cockpit-comercial-vocn.vercel.app` — deployment de produção READY do commit `0c95b769` (= `origin/main`), consultado no Vercel sem alterar nada |

## 5. Live test

Executado por Gerson no Firefox com o pacote E2E do §4 (manifest
`dist/yolen-companion/e2e/firefox/staging/manifest.json`, "Yolen Companion
[E2E]"), sessão Yolen autenticada, ManyChat real. HEAD de código testado
`9e6a22c0`; HEAD documental `72c6279a`. Grep por runtime ManyChat legado no
pacote: ausente.

| Cenário | Expected | Actual | Resultado |
|---|---|---|---|
| T1 conversa real qualquer | painel compartilhado monta e resolve o contato sozinho | monta só uma superfície/status lateral simplificada | **FAIL** (LIVE-01) |
| T2 lead existente → AGORA/MENSAGEM/ANÁLISE/CLIENTE | workspace das quatro áreas | áreas não aparecem | **FAIL** (LIVE-01) |
| T3 NOT_FOUND → Novo contato → CREATE → re-resolve → workspace | fluxo completo | não exercitável: o workspace compartilhado não é alcançado | BLOCKED por LIVE-01 |
| T4 A→B→A | sem vazamento | não exercitável sem workspace | BLOCKED por LIVE-01 |
| T5/T7 MENSAGEM → composer ManyChat | inserção sem envio | não exercitável (MENSAGEM ausente) | BLOCKED por LIVE-01 |
| T6 identidade real | resolução automática | não confirmada (ver hipóteses de LIVE-01) | NOT CONFIRMED |
| T8 áudio real | fluxo real ou ausência registrada | não exercitado | NOT EXERCISED |

Evidências mínimas A (create), B (quatro áreas), C (A→B→A) e D (composer):
**não obtidas** — todas dependem do workspace bloqueado por LIVE-01.

### LIVE-01 — BLOCKER

- **Expected:** no ManyChat monta o mesmo Companion seller-facing do
  WhatsApp, com o workspace AGORA / MENSAGEM / ANÁLISE / CLIENTE.
- **Actual:** o build E2E correto monta apenas uma superfície/status lateral
  simplificada; o workspace compartilhado não aparece.
- **Reproducer:** 1) carregar o manifest E2E correto no Firefox; 2) abrir
  nova aba do ManyChat; 3) manter a sessão Yolen autenticada; 4) abrir uma
  conversa; 5) o workspace compartilhado não monta — só a superfície
  simplificada.
- **Evidência:** relato do live test (Gerson); build/validador E2E PASS;
  pacote verificado (§4).
- **Frequência:** reproduzido no live test; repetição e texto exibido não
  registrados.
- **Fatos de código (sem live):** a composição ManyChat do pacote é a
  compartilhada (mesmos Core, controllers, views e bootstrap do WhatsApp +
  ManyChatAdapter); nenhum runtime seller-facing paralelo. As quatro áreas
  só existem com `WORKSPACE_READY` (Q2); antes disso o Core renderiza apenas
  o cartão compacto de contato/status. A superfície observada é compatível
  com o painel compartilhado parado num estado pré-workspace.
- **Camada provável:** NÃO DETERMINADA com a evidência disponível. O texto
  do cartão separa as hipóteses para a FASE 10:

| Texto no cartão | Estado | Camada provável |
|---|---|---|
| "Identificando o contato automaticamente…" persistente | identidade/evidência nunca concluída | adapter/bridge (identidade segura no page world ou leitura do contato no DOM real) |
| "Telefone ainda não disponível para identificação automática…" | `NO_CONTACT_EVIDENCE` (identidade segura não adquirida, sem telefone) | adapter/bridge — mecânica real de identidade (§14 do prompt) |
| contato "não vinculado" / busca de vínculo | `CONTACT_NOT_LINKED` | backend/dados (identidade externa sem vínculo) ou fluxo de vínculo |
| erro / "Tentar novamente" | erro de resolução | backend/transporte (background) |
| status de lead (dono/pool/encerrado) sem abas | resolução OK sem `WORKSPACE_READY` | Core (derivação do outcome) |

  Para fechar a camada na FASE 10: o texto exato do cartão, e as mensagens
  `GET_MANYCHAT_SAFE_IDENTITY` / `RESOLVE_LEAD` no console do background
  da extensão (about:debugging → Inspecionar).
- **Status:** registrado, não corrigido (FASE 10: CORRECTION REQUIRED).

### Observações herdadas

- D8: NOT EXERCISED (ANÁLISE não alcançada).
- D10 (`source: 'whatsapp'`): NOT OBSERVED.
- D11 / contagem truncada com `--test-force-exit`: ver §2 (preservado para o
  Gate Final; script não alterado).

## 6. Status

| Item | Valor |
|---|---|
| PHASE 9 EXECUTION | COMPLETE |
| LIVE ACCEPTANCE | **FAIL** — 1 blocker (LIVE-01) |
| Arquivos de produção alterados | 0 |
| PR / merge / deploy / rollout | NO / NO / NO / NO |
| ManyChat | OFF em dev/prod; ON só no E2E |
| FASE 10 | NOT STARTED |
