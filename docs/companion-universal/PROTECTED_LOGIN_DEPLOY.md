# Login aprovado — auditoria de preservação (PR #152)

Estado: AUDITADO, NÃO ALTERADO. Nenhum arquivo de login foi modificado, nenhum checkout/cherry-pick/merge/deploy foi feito. Investigação read-only via GitHub + Vercel.

## Resumo

Existe uma Vercel *preview deployment* que corresponde exatamente ao PR #152 (`feat(marketing): reposiciona a experiência pública da Yolen`, branch `agent/yolen-public-marketing-clean`, HEAD `9f773e04edec54599cfecf14f8555342f368a96a`, OPEN/DRAFT, não mergeado). Essa preview nunca foi promovida a produção. A produção real hoje está pinada em `main` @ `5e7181653c8d0dab71211b4961a5f77ab6880b35` — a mesma base da R2 — que ainda serve o login **antigo**. Ou seja: o redesenho de login aprovado nunca chegou à produção; o risco não é uma R2/deploy futuro "sobrescrever" algo que está no ar, é o trabalho aprovado ficar perdido numa branch órfã se ninguém o reconciliar antes do próximo deploy de produção.

## PROTECTED LOGIN DEPLOY

```
DEPLOY URL:
https://cockpit-comercial-vocn-git-agent-yolen-public-mark-230615-yolen.vercel.app
(alias estável de branch; deployment id dpl_GAZCbRP5WbGJvoDWHQuTkcX2UW7h, state READY)

DEPLOY SHA:
9f773e04edec54599cfecf14f8555342f368a96a

SOURCE BRANCH:
agent/yolen-public-marketing-clean (PR #152, OPEN, DRAFT, não mergeado)

MATCHES PR #152:
YES — SHA, branch e githubPrId batem exatamente entre GitHub e os
metadados do deployment na Vercel. Ressalva: não há comentário/registro
de aprovação humana no próprio GitHub (o único comentário no PR é o bot
da Vercel anunciando o deploy, 2026-08-15 22:20 UTC). A correspondência
deploy↔PR está 100% confirmada; o evento de "aprovação visual" em si
não deixou rastro auditável neste sistema.

LOGIN FILES:
- app/login/page.tsx (modificado: 78 adições / 59 remoções)
- app/login/layout.tsx (novo arquivo — não existe em main nem na R2)
- dependências novas que essas páginas importam, também no PR:
  app/components/marketing/MarketingChrome.tsx (+ .module.css)
  app/components/marketing/ProductStoryVisuals.tsx (+ .module.css)

DIFF VS MAIN (5e7181653c8d0dab71211b4961a5f77ab6880b35):
- headline: main = "Pare de perder lead na operação." com screenshot
  estático /branding/login-kanban.png via next/image
  PR #152 = "Inteligência para quem vende. Clareza para quem lidera."
  com <IntelligenceHeroVisual/>, sem imagem estática
- main não tem PublicHeader/IntelligenceHeroVisual (não existem);
  PR #152 os introduz
- app/login/layout.tsx: inexistente em main, novo no PR
  (metadata title="Entrar")
- fluxo de autenticação Supabase, redirecionamento pós-login
  (/select-company, /dashboard) e chamadas a /api/session/company,
  /api/me: idênticos nos dois lados (confirmado lendo o arquivo
  completo do PR, não só o diff stat)

DIFF VS R2 (claude/recovery-r2-universal-contract):
git diff 5e7181653c8d0dab71211b4961a5f77ab6880b35..HEAD -- app/login/
= vazio. A branch R2 nunca tocou app/login/ — idêntica a main nesses
arquivos. Diff vs R2 = diff vs main (acima).

PRESERVATION REQUIRED:
YES
```

## Produção real hoje (achado adicional)

Confirmado via Vercel (`target: "production"`, aliases `cockpit-comercial-vocn.vercel.app` e `cockpit-comercial-vocn-yolen.vercel.app`): produção está no commit `5e7181653c8d0dab71211b4961a5f77ab6880b35`, login antigo. Nenhum deploy mais recente (incluindo todos os da branch R2, todos `target: null`/preview) foi promovido a produção. A R2, isoladamente, não corre risco de sobrescrever o login aprovado — mas um futuro deploy de produção (R2 ou qualquer outro) que não reconcilie o PR #152 primeiro perpetua o login antigo indefinidamente.

## Regra de preservação para a release futura

Nesta fase: **não** alterar arquivos de login, **não** fazer checkout a partir da main, **não** restaurar versões antigas, **não** cherry-pickar o PR #152 cegamente, **não** mergeá-lo agora, **não** fazer deploy. Quando a reconciliação acontecer (ver RELEASE_ORDER em `R2_SCHEMA_TRANSITION_GATE.md`, passo 2): reconciliar apenas o conteúdo aprovado do PR #152 e suas dependências necessárias (`MarketingChrome`, `ProductStoryVisuals`) sobre a nova main pós-schema/backend R2 — nunca um merge cego — mantendo intacto o fluxo de autenticação Supabase e os redirecionamentos pós-login, que já são idênticos nos dois lados.
