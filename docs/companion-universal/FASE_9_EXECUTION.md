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

(pendente — preenchido com o resultado do uso real no Firefox)
