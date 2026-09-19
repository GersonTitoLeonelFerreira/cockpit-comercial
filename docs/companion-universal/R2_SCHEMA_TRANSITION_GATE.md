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

A ordem proposta pelo controle foi conferida contra as dependências reais provadas neste gate e nos gates anteriores da R2, e revisada para incorporar a preservação do login aprovado (PR #152 — ver `PROTECTED_LOGIN_DEPLOY.md`). **Confirmada nesta forma final:**

```
0. MIGRATION HISTORY RECONCILIATION
   → reconciliar o drift 20260829010000 vs 20260829042244
   → nenhum repair automático sem revisão

1. SCHEMA R2
   → aplicar author_kind
   → aplicar lead_external_identities
   → validar schema/RPCs
   → smoke de compatibilidade com backend atual

2. RELEASE CANDIDATE DA APLICAÇÃO
   → integrar backend R2
   → preservar/reintegrar o login aprovado do PR #152
   → NÃO fazer merge cego do PR #152
   → reconciliar apenas o conteúdo aprovado e suas dependências necessárias
   → manter intacto o fluxo de autenticação

3. BUILD + GATES DA RELEASE CANDIDATE
   → build completo
   → TypeScript/ESLint
   → Companion/R1/R2
   → WhatsApp
   → /login
   → autenticação
   → seleção de empresa/redirecionamentos
   → páginas públicas afetadas pela integração

4. DEPLOY DA APLICAÇÃO
   → backend R2 + login aprovado juntos
   → ManyChat continua false

5. SMOKE PRODUÇÃO
   → /login visual
   → login real
   → WhatsApp
   → resolve-lead
   → capture
   → AGORA/ANÁLISE

6. EXTENSÃO UNIVERSAL
   → distribuir ainda com ManyChat=false

7. E2E MANYCHAT CONTROLADO

8. SOMENTE EM FASE POSTERIOR
   → considerar ManyChat=true
```

Justificativa por passo, com base no que foi efetivamente provado:

- **Passo 0 antes de tudo**: aplicar as migrations R2 (passo 1) sem antes reconciliar o histórico local/remoto arrisca um deploy automático de migrations agir sobre uma base de versões incompleta ou incorreta (ex.: uma ferramenta de CI que compara `supabase/migrations/` local contra o remoto e tenta "corrigir" a divergência sozinha). Ver RISCO RESIDUAL / DEPLOY BLOCKER abaixo para o escopo exato deste passo.
- **Passo 1 antes do 4**: a ROLLOUT MATRIX acima prova que backend novo + schema antigo é `UNSAFE` (falha dura), enquanto backend antigo + schema novo é `SAFE`. Schema sempre primeiro é a única ordem sem janela insegura — e este gate (FULL SCHEMA TRANSITION) é exatamente a verificação exigida dentro do passo 1.
- **Passo 2 antes do 4**: deploy de produção do backend R2 sem antes reconciliar o login aprovado significa publicar uma nova main que ainda serve o login antigo, deixando o trabalho aprovado do PR #152 sem caminho de volta. A reconciliação exigida é dirigida (só o conteúdo aprovado + `MarketingChrome`/`ProductStoryVisuals`, nunca um merge cego do PR inteiro), preservando o fluxo de autenticação Supabase e os redirecionamentos pós-login, que já são idênticos entre o PR e a main/R2 (ver `PROTECTED_LOGIN_DEPLOY.md`).
- **Passo 3 antes do 4**: nenhuma release candidate vai a deploy sem repetir os mesmos gates desta R2 (tsc/eslint, Companion/R1/R2, WhatsApp) mais os gates específicos da reconciliação de login (`/login` visual, autenticação, seleção de empresa/redirecionamentos, páginas públicas afetadas) — a integração do login introduz páginas/componentes novos que também precisam de smoke próprio.
- **Passo 4 antes do 6**: o WhatsApp legado é o único canal produtivo hoje; nenhuma mudança de extensão deve chegar aos vendedores sem a confirmação de smoke de produção do passo 5, que inclui explicitamente WhatsApp, resolve-lead, capture e AGORA/ANÁLISE — não só o login.
- **Passo 6 antes do 7**: a extensão universal (com os arquivos ManyChat portados nesta R2) já pode ser distribuída com segurança, porque `MANYCHAT_CAPTURE_ENABLED=false` mantém todo o runtime ManyChat inerte (confirmado no gate WhatsApp non-regression / ManyChat contract-integration).
- **Passo 7 antes do 8**: nenhuma validação E2E ManyChat foi feita contra tráfego real nesta R2 (só contrato/fixture) — habilitar em produção sem isso seria pular a única verificação que falta.
- Não há necessidade de intervalo produtivo com ManyChat ligado entre os passos 0-6: `MANYCHAT_CAPTURE_ENABLED` continua `false` durante toda a sequência até o passo 8.

## RISCO RESIDUAL / DEPLOY BLOCKER — MIGRATION HISTORY DRIFT

Não bloqueia a validação lógica desta R2 (o schema resultante está correto e provado pelo gate FULL SCHEMA TRANSITION), mas **bloqueia um futuro deploy automático de migrations** até reconciliação explícita.

**Estado comprovado:**

- **Local (`supabase/migrations/`)**: `20260829010000_add_message_deletion_reason.sql` existe e contém SQL historicamente quebrado (`do $ ... $;`, dollar-quoting inválido).
- **Produção (Supabase real, confirmado via `mcp__Supabase__list_migrations`, read-only)**: a migration realmente registrada/aplicada é `20260829042244_add_message_deletion_reason_safe` — esse arquivo/version não existe no repositório atual.
- A produção possui o end-state correto de `deletion_reason` (coluna + `CHECK` constraint íntegros, confirmado via `pg_get_constraintdef`) — a divergência é só entre o **nome do arquivo/histórico versionado** e o que está registrado como aplicado no projeto real.

**STEP 0 — MIGRATION HISTORY RECONCILIATION** (antes de aplicar qualquer migration R2 num pipeline automático):

- comparar a tabela de migrations remota (`mcp__Supabase__list_migrations` ou `supabase migration list`) com `supabase/migrations/` local, arquivo a arquivo;
- determinar a origem de `20260829042244_add_message_deletion_reason_safe` (quem a criou, quando, e por que não foi versionada com esse nome neste repositório);
- recuperar/versionar a migration realmente aplicada, se possível, para que o histórico local passe a refletir o que está de fato em produção;
- decidir o tratamento de `20260829010000_add_message_deletion_reason.sql` sem reexecutar uma alteração que já existe em produção sob outro nome (nunca aplicar esse arquivo como está — duplicaria/conflitaria com o que já rodou);
- validar com `supabase migration list` (ou mecanismo equivalente) que o histórico está consistente antes de prosseguir;
- **nunca** usar `supabase migration repair` (ou equivalente) nem alterar o histórico remoto sem revisão explícita de alguém com acesso e contexto completo do projeto real;
- só depois desse passo liberar a aplicação das migrations R2 (`20260915010000`, `20260915020000`) num pipeline de deploy automático.

Isso não foi investigado além da constatação acima nesta R2 — decidir a reconciliação em si é responsabilidade de quem tem acesso de escrita ao histórico de migrations do projeto real, fora do escopo (e das permissões) deste trabalho.

## RISCO RESIDUAL — LOGIN APROVADO NÃO RECONCILIADO (PR #152)

Auditado, não corrigido nesta R2 — ver `PROTECTED_LOGIN_DEPLOY.md` para o achado completo. Resumo: existe um redesenho de login aprovado, provado como uma Vercel preview deployment do PR #152 (`agent/yolen-public-marketing-clean`, HEAD `9f773e04edec54599cfecf14f8555342f368a96a`, OPEN/DRAFT, não mergeado), que **nunca foi promovido a produção**. A produção real hoje serve o login antigo (`main` @ `5e7181653c8d0dab71211b4961a5f77ab6880b35`, mesma base da R2). A R2 em si não toca `app/login/` (diff vazio contra main) — não há risco de sobrescrita imediata. O risco é de **perda por omissão**: um futuro deploy de produção da R2 (ou de qualquer outra branch) que não reconcilie o PR #152 primeiro perpetua o login antigo indefinidamente, sem caminho de volta para a decisão visual já aprovada. Coberto explicitamente no passo 2 do RELEASE_ORDER acima — nunca um merge cego do PR #152, só o conteúdo aprovado e suas dependências (`MarketingChrome`, `ProductStoryVisuals`) reconciliados sobre a nova main pós-schema/backend R2.
