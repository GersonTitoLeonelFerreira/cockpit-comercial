# External identity relink — contrato de segurança

Estado: gate fechado na R2, provado contra Postgres efêmero (nunca contra o projeto Supabase real — a migration segue não aplicada).

## Objetivo

Fechar explicitamente o contrato de `rpc_link_companion_external_identity` antes de declarar READY_FOR_R2_REVIEW: essa RPC permite `ON CONFLICT ... DO UPDATE SET lead_id = excluded.lead_id`, ou seja, uma identidade externa já vinculada pode tecnicamente ser reassociada a outro lead. Este documento prova onde essa capacidade pode e não pode ser acionada.

## As sete garantias

1. **CAPTURE NORMAL nunca chama essa RPC.**
   Evidência: nenhuma referência a `rpc_link_companion_external_identity` existe em `app/lib/companion/capture-ingestion.ts` nem em `app/api/companion/capture/messages/route.ts` (confirmado por busca textual no código-fonte). O pipeline de captura (WhatsApp legado, e o runtime ManyChat ainda atrás de `MANYCHAT_CAPTURE_ENABLED=false`) nunca referencia `lead_external_identities`.

2. **RESOLVE_LEAD nunca altera `lead_id`.**
   Evidência: `findLeadIdByExternalIdentity()` em `app/api/companion/resolve-lead/route.ts` é um `SELECT` puro (`.from('lead_external_identities').select('lead_id')...`). A única escrita que o caminho de identidade externa realiza é a chamada best-effort a `rpc_touch_companion_external_identity_last_seen` (route.ts:681), cujo corpo SQL (`update ... set last_seen_at = clock_timestamp() where ...`) nunca toca a coluna `lead_id`.

3. **Nenhum fluxo automático ManyChat relinka identidade.**
   Evidência: busca por `rpc_link_companion_external_identity` em toda a árvore `app/` não encontra nenhum chamador — nem na extensão (`manychat-*.js`), nem no backend.

4. **A RPC é `service_role` only.**
   Evidência (provada em `phase-lead-external-identity-relink-contract.test.mjs`, teste 1): `revoke all ... from public, anon, authenticated` + `grant execute ... to service_role` na definição da função; a tabela `lead_external_identities` tem `force row level security` e uma única policy restritiva `using (false) with check (false)` para `anon, authenticated`. Uma chamada real como `anon` ou `authenticated` é rejeitada.

5. **Reassociação só ocorre por ação explícita e autorizada.**
   Provado no teste 2: identidade vinculada ao lead 1 permanece no lead 1 através de leituras de resolve repetidas, de `rpc_touch_companion_external_identity_last_seen` e de retries do touch. Só uma segunda chamada explícita a `rpc_link_companion_external_identity` com `p_lead_id` diferente move o vínculo — e mesmo essa chamada exige `p_actor_user_id` e falha se o lead não pertencer à empresa informada (teste 3).

6. **Sem caller produtivo hoje → classificada como `UNUSED_EXPLICIT_RELINK_PRIMITIVE`.**
   Nenhum endpoint HTTP, UI ou runtime da extensão chama esta RPC atualmente. Ela existe como primitiva de infraestrutura pronta para um futuro fluxo de "confirmar e vincular"/"corrigir vínculo", mas não está exposta a nenhuma ação de usuário nesta fase. Não é um fluxo ativo — é capacidade não exposta.

7. **Identidade já ligada a outro lead nunca é reassociada silenciosamente por captura, resolve, retry ou touch de `last_seen`.**
   Coberto pelos mesmos testes 2 e 3: nenhuma dessas quatro operações jamais executa um `INSERT ... ON CONFLICT DO UPDATE` sobre `lead_external_identities` — apenas `rpc_link_companion_external_identity`, chamada explicitamente com um `lead_id` alvo, o faz.

## Achado de segurança fechado nesta rodada

O teste de contrato (`phase-lead-external-identity-relink-contract.test.mjs`) revelou, ao tentar executar `rpc_link_companion_external_identity` pela primeira vez contra um Postgres real (PGlite efêmero — a migration nunca foi aplicada ao projeto Supabase), que a função falhava com `column reference "company_id" is ambiguous`.

Causa raiz: toda coluna de `returns table (id, company_id, lead_id, platform, external_identity_key, identity_source, channel, created_at, updated_at, last_seen_at)` vira uma variável PL/pgSQL implícita com o mesmo nome dentro do corpo da função. A lista de colunas de `on conflict (company_id, platform, external_identity_key)` é resolvida em um contexto onde o Postgres não consegue decidir entre a variável implícita e a coluna real da tabela — isso teria falhado em **qualquer** Postgres real, não é uma particularidade deste teste, e só não foi descoberto antes porque a migration nunca foi aplicada.

Correção: adicionada a diretiva `#variable_conflict use_column` no início do corpo da função (padrão documentado do PostgreSQL para este exato cenário), fazendo a resolução preferir sempre a coluna real da tabela. Nenhuma mudança de comportamento pretendido: a função nunca lia/escrevia as variáveis implícitas diretamente (usa `v_row` para o resultado), então a pragma apenas remove a ambiguidade a favor do que já era a intenção.

## EXTERNAL IDENTITY RELINK

```
automatic = NO
capture can relink = NO
resolve can relink = NO
explicit RPC exists = YES
productive caller exists = NO (UNUSED_EXPLICIT_RELINK_PRIMITIVE)
authorization boundary = service_role only, chamada exige p_actor_user_id
  e o lead precisa pertencer à mesma company_id informada (RLS force +
  policy deny-all para anon/authenticated; sem endpoint HTTP/UI exposto
  nesta fase)
```

## Teste de contrato

`supabase/phase-tests/phase-lead-external-identity-relink-contract.test.mjs` (`npm run test:companion-external-identity-relink`), contra Postgres efêmero (PGlite):

- identidade A → lead 1 (via chamada explícita a `rpc_link_companion_external_identity`);
- resolve repetido (leitura pura) → continua lead 1;
- touch de `last_seen` (inclusive repetido, simulando retries) → continua lead 1;
- nenhuma dessas operações → muda para lead 2;
- só uma segunda chamada explícita a `rpc_link_companion_external_identity` com `lead_id` diferente → muda para lead 2;
- `anon`/`authenticated` não conseguem executar nenhuma das duas RPCs;
- lead de outra empresa é rejeitado explicitamente.
