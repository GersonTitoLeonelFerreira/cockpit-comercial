# R2 — gate de transição completa do schema

Estado: PASS. Provado num único Postgres efêmero (PGlite); nenhuma migration foi aplicada ao projeto Supabase real.

## FULL SCHEMA TRANSITION: PASS

`supabase/phase-tests/phase-full-r2-schema-transition.test.mjs` (`npm run test:companion-full-r2-schema-transition`) aplica, na mesma sessão de banco, o schema pré-R2 relevante ao ledger de mensagens e, em seguida, as duas migrations novas em ordem — e prova A-J nessa mesma sessão:

| # | Garantia | Resultado |
|---|---|---|
| A | `conversation_messages.author_kind` existe | PASS |
| B | `author_kind` tem `NOT NULL` + `CHECK` restringindo a `customer/human_agent/automation/unknown` | PASS |
| C | `rpc_ingest_companion_messages` continua executável | PASS |
| D | payload legado WhatsApp sem `author_kind` continua funcionando (incoming→customer, outgoing→human_agent) | PASS |
| E | payload novo com `customer`/`human_agent`/`automation`/`unknown` persiste corretamente | PASS |
| F | `lead_external_identities` existe | PASS |
| G | `rpc_link_companion_external_identity` executa | PASS |
| H | `rpc_touch_companion_external_identity_last_seen` executa | PASS |
| I | resolve/read da identidade externa aponta para o lead correto | PASS |
| J | nenhuma migration invalida objetos da anterior | PASS — A-E e os grants de `rpc_ingest_companion_messages` são reprovados, na mesma sessão, depois de aplicar a migration de external identity, com resultado idêntico |

## MIGRATION ORDER

```
1. 20260915010000_add_message_author_kind.sql
2. 20260915020000_create_lead_external_identities.sql
```

As duas migrations são independentes uma da outra (`lead_external_identities` só referencia `public.leads`, nunca `conversation_messages`/`author_kind`) — a ordem entre elas não é uma dependência técnica rígida, mas é a ordem provada por este gate e a que consta no RELEASE_ORDER.

## Achado corrigido nesta rodada: dollar-quoting inválido em `rpc_link_companion_external_identity`

Já documentado em `EXTERNAL_IDENTITY_RELINK_CONTRACT.md`. `#variable_conflict use_column` adicionado; sem mudança de comportamento pretendido.

## Achado corrigido nesta rodada: dollar-quoting inválido em `rpc_ingest_companion_messages` (author_kind)

O bloco `do $ ... $;` que cria `conversation_messages_author_kind_check` usava um único `$` como tag de abertura/fechamento — sintaxe de dollar-quoting inválida (o mínimo válido é `$$`, tag vazia). Isso só foi descoberto ao tentar aplicar `20260915010000_add_message_author_kind.sql` pela primeira vez neste gate, contra Postgres efêmero — nunca havia sido aplicada a lugar nenhum. Corrigido para `do $$ ... $$;`. Sem drift a reconciliar (esta migration nunca rodou de verdade), então a correção é direta e segura.

## Achado registrado, NÃO corrigido: drift entre este repositório e o projeto Supabase real

Ao tentar reproduzir a árvore completa e literal de migrations (não apenas o subconjunto curado necessário para este gate), foi descoberto que `supabase/migrations/20260829010000_add_message_deletion_reason.sql` tem o mesmo defeito de dollar-quoting (`do $ ... $;`). Investigação read-only do projeto Supabase real confirmou:

- a migration que de fato rodou em produção é `20260829042244_add_message_deletion_reason_safe` — nome e timestamp diferentes, arquivo **ausente** deste repositório;
- o efeito final está correto e íntegro no projeto real: `conversation_messages.deletion_reason` existe com a `CHECK` constraint `conversation_messages_deletion_reason_check` exatamente com a definição pretendida (confirmado via `pg_get_constraintdef`);
- ou seja, a produção está saudável — o problema é que o arquivo local com esse nome/timestamp nunca foi o que rodou, e a migration real que rodou não está versionada neste repositório.

Isso é **drift entre repositório e produção anterior à R2**, não relacionado a `author_kind`/`lead_external_identities`. Não foi corrigido nem reconciliado aqui — reconciliar migration history (via `supabase db pull` ou equivalente) é um projeto à parte, com risco próprio, e sair reescrevendo um arquivo de migration antigo sem entender a história completa de divergência seria abrir uma nova frente exatamente do tipo que este gate foi instruído a evitar. Fica registrado para decisão e priorização futura.

Para o teste deste gate (`phase-full-r2-schema-transition.test.mjs`), o pré-requisito de `deletion_reason` foi reproduzido inline a partir do end-state real e verificado ao vivo (coluna + constraint), em vez de reexecutar o arquivo local quebrado — ver comentário no topo do arquivo de teste.

## ROLLOUT MATRIX

| Combinação | Resultado | Motivo / prova |
|---|---|---|
| OLD BACKEND + OLD SCHEMA | estado atual | produção hoje, sem mudança |
| OLD BACKEND + NEW FULL SCHEMA | **SAFE** | backend antigo nunca seleciona `author_kind` nem lê `lead_external_identities` — ambas as migrations só adicionam coluna/tabela nova (`add column if not exists`, `create table`); nenhum objeto existente é removido ou tem seu contrato quebrado. Provado pelo gate FULL SCHEMA TRANSITION: o schema resultante continua servindo `rpc_ingest_companion_messages` com o mesmo formato que o backend antigo já espera. |
| NEW BACKEND + OLD SCHEMA | **UNSAFE** | backend novo faz `select ... author_kind ...` no ledger (`MESSAGE_FIELDS` em `stateful-copilot-real-context-loader.ts`) e lê `lead_external_identities` (`resolve-lead/route.ts`) — ambos falham (coluna/tabela inexistente) se o schema novo não foi aplicado antes. |
| NEW BACKEND + NEW FULL SCHEMA | **SAFE**, sujeito aos gates R2 | author_kind propagado como autoridade de autoria (gates anteriores desta R2); external identity relink fechado (este gate); `MANYCHAT_CAPTURE_ENABLED` continua `false` no código-fonte. |
| OLD WHATSAPP EXTENSION + NEW BACKEND + NEW SCHEMA | **SAFE obrigatório** | provado nos gates anteriores (`capture-ingestion.test.mjs`, formato real de `conversation_key` sem prefixo): payload legado sem `author_kind` continua resolvendo via fallback derivado de `direction`, e este gate (E/D) prova que o mesmo payload persiste corretamente contra o schema completo. |
| NEW MANYCHAT EXTENSION + OLD BACKEND | **UNSAFE** (já conhecido) | o backend antigo não sabe interpretar `author_kind`/identidade externa; qualquer captura ManyChat seria tratada com a semântica WhatsApp (perigoso — automação poderia ser lida como ação humana). |
| NEW MANYCHAT EXTENSION + NEW BACKEND + NEW SCHEMA | contrato preparado, feature flag `false` | `MANYCHAT_CAPTURE_ENABLED` permanece `false` no código-fonte até uma validação E2E completa em fase posterior — este gate não habilita, nem testa, o caminho de captura ManyChat ao vivo. |

## RELEASE ORDER

A ordem proposta pelo controle foi conferida contra as dependências reais provadas neste gate e nos gates anteriores da R2. **Confirmada, sem correções**:

```
1. aplicar migrations de schema (author_kind, depois lead_external_identities);
2. verificar schema/RPCs (este gate: FULL SCHEMA TRANSITION);
3. deploy backend compatível;
4. smoke WhatsApp;
5. disponibilizar extensão universal ainda com ManyChat=false;
6. validar E2E ManyChat em ambiente controlado;
7. somente em fase posterior considerar habilitar ManyChat.
```

Justificativa por passo, com base no que foi efetivamente provado:

- **Passo 1 antes do 3**: a ROLLOUT MATRIX acima prova que backend novo + schema antigo é `UNSAFE` (falha dura), enquanto backend antigo + schema novo é `SAFE`. Schema sempre primeiro é a única ordem sem janela insegura.
- **Passo 2 antes do 3**: este gate É o passo 2 — sem ele, não há prova de que o schema aplicado é o que o backend espera.
- **Passo 4 antes do 5**: o WhatsApp legado é o único canal produtivo hoje; nenhuma mudança de extensão deve chegar aos vendedores sem essa confirmação.
- **Passo 5 antes do 6**: a extensão universal (com os arquivos ManyChat portados nesta R2) já pode ser distribuída com segurança, porque `MANYCHAT_CAPTURE_ENABLED=false` mantém todo o runtime ManyChat inerte (confirmado no gate WhatsApp non-regression / ManyChat contract-integration).
- **Passo 6 antes do 7**: nenhuma validação E2E ManyChat foi feita contra tráfego real nesta R2 (só contrato/fixture) — habilitar em produção sem isso seria pular a única verificação que falta.
- Não há necessidade de intervalo produtivo com ManyChat ligado entre os passos 1-6: `MANYCHAT_CAPTURE_ENABLED` continua `false` durante toda a sequência até o passo 7.
