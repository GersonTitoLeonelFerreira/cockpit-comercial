# FASE 10 — REGISTRO DE EXECUÇÃO (correções finais comprovadas)

Registro único da FASE 10. Um bug live reproduzido: LIVE-01. Nenhuma
subfase; a FASE 11 não foi iniciada.

## 1. Auditoria inicial

| Item | Valor |
|---|---|
| Branch | `claude/companion-multichannel-repair` |
| HEAD local = remoto (início) | `305167c2d5930caa9f22ea512c4e6090fbc81fa5` (documental) |
| Código testado na FASE 9 | `9e6a22c08d18bdcd827432a0c9919e775776c15e` |
| `origin/main` | `0c95b7696775dd900ccdbf3eb9cc071155dd277a` |
| Árvore | limpa |
| Diretório principal com `MERGE_HEAD` (`24f25c71`) | não usado nem tocado; trabalho feito no checkout limpo da branch |

## 2. LIVE-01 — evidência

- **Expected:** conversa real no ManyChat → mesma experiência seller-facing
  do WhatsApp (workspace AGORA/MENSAGEM/ANÁLISE/CLIENTE; ou "Novo contato"
  → CREATE → re-resolve → workspace).
- **Actual (Firefox real):** painel compacto com o texto exato
  **"Yolen · lead não encontrado nesta empresa"**; o workspace não abre.
- **Reproducer:** build E2E → validador PASS → carregar
  `dist/yolen-companion/e2e/firefox/staging/manifest.json` ("Yolen
  Companion [E2E]") → sessão Yolen autenticada → nova aba do ManyChat →
  abrir conversa real → superfície compacta com o texto acima.
- **Frequência:** repetida após limpeza do ambiente.
- **Grep do diretório `staging` verificado:** texto ausente.

## 3. Diagnóstico (antes de qualquer alteração)

1. **O texto não pode ser produzido pelo código testado.** A string
   "Yolen · lead não encontrado nesta empresa" não existe em nenhum arquivo
   de `9e6a22c0` nem do pacote E2E gerado dele (grep do fonte e do
   `staging`). A copy do Core compartilhado para os estados pré-workspace é
   outra ("Identificando o contato automaticamente…", "Telefone ainda não
   disponível…", "Conversa aberta", formulário "Novo contato").
2. **Origem única do texto:** `STATUS_LABELS.NOT_FOUND` em
   `src/manychat-capture-bootstrap.js` — o runtime seller-facing legado do
   ManyChat (`git log -S`: introduzido em `1b9045ca`/`fc9f1528`, removido
   em `6d77bddf`, FASE 7). Esse runtime só pinta quando
   `MANYCHAT_CAPTURE_ENABLED === true`, isto é, num pacote **E2E** de um
   commit anterior a `6d77bddf`. Ele ainda existe em `origin/main`
   (`0c95b769`) e em `24f25c71` (`origin/claude/step-2b5-unified-companion-workspace`,
   o HEAD do diretório principal com merge em andamento).
3. **Pacotes E2E de commits diferentes eram indistinguíveis.** Build E2E
   de `24f25c71` feito em worktree temporário: nome `Yolen Companion [E2E]`,
   versão `1.0.0`, id `yolen-companion-e2e@gerson.local`, caminho relativo
   `dist/yolen-companion/e2e/firefox/staging/manifest.json`, flag ManyChat
   `true` — idênticos ao pacote aprovado — e contém exatamente
   `manychat-capture-bootstrap.js` com o texto observado. Os critérios
   usados no live para "build correto" (nome, caminho, grep de um diretório)
   não identificam qual código o Firefox está executando.
4. **Interação dos dois donos do painel:** o runtime legado e o Core usam o
   mesmo id `yolen-companion-panel`; o `createPanel()` do Core adota um
   elemento existente com esse id. Um painel pintado pelo runtime legado é
   exatamente a "superfície compacta" relatada.

Respostas às perguntas A–H do prompt, para o código testado: a superfície
observada **não é** um estado do Core compartilhado (nenhum estado do Core
renderiza esse texto); portanto não há `RESOLVE_LEAD`/ViewModel/outcome do
Core que a explique. O caminho ManyChatAdapter → bootstrap → Core →
resolução → workspace de `9e6a22c0` é o provado pela matriz de paridade
(51/51, inclusive NOT_FOUND → "Novo contato" com `can_create_lead` e
identidade segura).

**Root cause:** o código em execução no Firefox durante o live não era o
de `9e6a22c0`, e sim um pacote E2E anterior à FASE 7 (com o runtime
ManyChat legado). O defeito reproduzível do lado do repositório é que o
pacote E2E não se identificava pelo commit de origem, tornando os dois
indistinguíveis. **Camada:** OTHER — identidade do build E2E
(`scripts/build-package.mjs`); nenhuma falha em Core, adapter, bridge ou
backend foi reproduzida.

## 4. Teste red → correção → green

- **Teste:** `tests/e2e-build-identity.test.mjs` — pacotes E2E de commits
  diferentes nunca têm a mesma identidade visível; sem commit explícito, o
  pacote se identifica pelo HEAD do checkout.
- **Antes da correção:** FAIL 2/2 (`firefox: nome do pacote E2E não
  identifica o commit de origem`).
- **Correção (1 arquivo de tooling, nenhum arquivo de `src/`):**
  `toE2EManifest` nomeia o pacote `Yolen Companion [E2E] <sha curto>`
  (`readE2ESourceCommit`, `git rev-parse --short=8 HEAD`, fallback
  `unknown`). O validador E2E, que reconstrói a partir do checkout atual,
  confere o nome com o mesmo commit.
- **Depois:** PASS 2/2; testes de build/manifest/validador 58/58.

Nenhuma alteração em Core, adapters, views, controllers, backend,
Supabase, manifest de origem ou flags. ManyChat continua OFF em dev/prod.

## 5. Achado de harness durante os gates (categoria A)

O teste de paridade 51 (A→B→A enriquecimento) passou a falhar 4/4 —
também em `9e6a22c0`, portanto independente desta fase. Causa: a espera
exigia `LOAD_LEAD_SUMMARY` depois do último `RESOLVE_LEAD`; quando a
re-resolução pós-APPLY chega depois de B já carregado, o resumo continua
válido em cache e não é recarregado. A espera passou a exigir
`LOAD_CUSTOMER_VIEW_MODEL` de B depois dessa re-resolução (sempre
presente); comparação de paridade e asserções semânticas inalteradas.
3/3 PASS no HEAD e PASS em `9e6a22c0`.

## 6. Gates

| Gate | Comando | Exit | Resultado |
|---|---|---|---|
| Teste focal LIVE-01 | `node --test …/tests/e2e-build-identity.test.mjs` | 0 | 2/2 (antes: 0/2) |
| Build/manifest/validador (unit) | `node --test --test-force-exit` em e2e-build-identity, dev-prod-manifest-transform, final-release-manifest, validate-release-candidate, manychat-feature-flags | 0 | 58/58 |
| Paridade (oficial) | `node --test --test-force-exit …/e3-dom/cross-channel-parity.test.mjs` | 0 | 51/51 |
| Paridade (em processo) | `node --experimental-test-isolation=none --test --test-force-exit …` | 0 | 51/51 |
| Arquitetura | `node --experimental-test-isolation=none --test --test-force-exit …/companion-core-architecture-gates.test.mjs` e `node --test …` (sem force-exit) | 0 / 0 | 53/53 e 53/53; NEW=0, STALE=0, LEGACY=0 |
| ManyChat channel-only | `node --test --test-force-exit …/manychat-channel-only-architecture.test.mjs` | 0 | 6/6 |
| Adapter neutro | em processo | 0 | 14/14 |
| ManyChat | em processo (manychat-*, privacidade, comparação, composição E3) | 0 | 286/286 |
| WhatsApp | em processo (regressão FASE 5, bridge, corrida de inserção, chave canônica, enrichment) | 0 | 61/61 |
| `npm run test:companion` | idem | 1 | 2275/2279; as 4 falhas são as 4 conhecidas |
| Known failures companion | `node scripts/companion-known-failures-gate.mjs companion` | 0 | 4 conhecidas, 0 novas |
| E3 completo | `node --test --test-force-exit app/extension/yolen-companion/tests/e3-dom/*.test.mjs` | 0 | 349/349 |
| TypeScript | `./node_modules/.bin/tsc --noEmit` | 0 | limpo |
| Lint arquivos alterados | `eslint build-package.mjs e2e-build-identity.test.mjs cross-channel-parity.test.mjs` | 0 | PASS |
| Build + validador normal | `validate-release-candidate.mjs` (reconstrói) | 0 | PASS; ManyChat false em dev/prod |
| Build + validador E2E | `build-package.mjs --e2e`; `validate-release-candidate.mjs --e2e` | 0 / 0 | PASS; ManyChat true; `e2e_manifest_identification` com o commit |
| `git diff --check` | — | 0 | limpo |
| Autorização | não executado — nenhum backend/API tocado | — | — |

Novo pacote E2E para o retest:

| Item | Valor |
|---|---|
| HEAD | `e2aad24389c6cccb0e2af4b7a88a23f3ce02722a` |
| Gerado em | 2026-09-26T12:42:00Z |
| Pacote | `dist/yolen-companion/e2e/yolen-companion-firefox-e2e-v1.0.0.zip` |
| Manifest | `dist/yolen-companion/e2e/firefox/staging/manifest.json` |
| Nome exibido | `Yolen Companion [E2E] e2aad243` |
| SHA-256 | `0751107c2e2397adbaee981d5a6d03b576707b5324746d681d9bdbe924ad6792` |
| Texto legado no pacote | ausente |

## 7. Live retest

RETEST_PLACEHOLDER
