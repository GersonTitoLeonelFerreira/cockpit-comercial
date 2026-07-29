# Progresso do Yolen Companion V2

## Estado geral

| Campo | Valor |
|---|---|
| Fase atual | 0 - Congelamento e proteção |
| Estado | Concluída |
| Início | 2026-07-29 |
| Commit-base | `50059c32ac924302822a85d044c39890c628b441` |
| Tag de baseline | `yolen-companion-v1-baseline-2026-07-29` |
| Motor padrão | `v1` |
| Banco alterado | Não |
| Extensão alterada | Não |

## Checklist da Fase 0

- [x] `git status` e commit-base verificados.
- [x] GitHub, Supabase e Vercel auditados.
- [x] Escopo e arquivos permitidos definidos.
- [x] Roadmap V2 registrado.
- [x] ADR de convivência V1/V2 registrado.
- [x] Plano de rollback registrado.
- [x] Baseline de segurança e dados registrado.
- [x] Flag tipada criada com padrão `v1`.
- [x] `.env.example` documentado sem segredos reais.
- [x] Governança de RLS atualizada conforme o banco vivo.
- [x] TypeScript validado.
- [x] Lint do escopo Companion validado.
- [x] Build validado.
- [x] Referência remota de rollback criada no GitHub.
- [x] Tag anotada publicada no GitHub.
- [x] Commit da Fase 0 publicado.
- [x] Deployment canônico `READY`.
- [x] Verificação pós-deploy registrada.
- [x] Fluxo real no Firefox validado pelo operador.

## Evidências

| Evidência | Resultado |
|---|---|
| TypeScript | `npx tsc --noEmit` passou |
| Lint Companion | ESLint passou em rotas, tipos, biblioteca e extensão |
| Seletor do motor | 5 cenários passaram: ausência, vazio, `v1`, `v2` normalizado e valor inválido |
| Build | `next build` passou com certificados do sistema e variáveis temporárias sem segredos |
| Commit | `59842da36a407a727af6b2584c3eb9f65ad53780` publicado na `main` |
| Referência de rollback | `safety/yolen-companion-v1-baseline-2026-07-29` aponta para `50059c32` |
| Deployment | `dpl_DHdLFFuEgp8g2trVaoehz511ph1G` - `READY` em produção |
| Smoke test | `https://cockpit-comercial-vocn.vercel.app/login` respondeu HTTP 200 |
| Runtime | Nenhum erro encontrado na última hora após a publicação |
| Supabase após publicação | `ACTIVE_HEALTHY`; nenhuma mutation executada |
| Firefox + WhatsApp | Passou em conexão, resolução do lead, análise, aplicação, atualização do ciclo e registro no histórico sem duplicidade aparente |

## Aprovações

| Data | Decisão |
|---|---|
| 2026-07-29 | Usuário autorizou a execução completa da Fase 0 |
| 2026-07-29 | Usuário publicou a tag anotada e validou o fluxo real no Firefox |

## Restrições preservadas

- nenhuma migration criada ou aplicada;
- nenhuma policy, grant, RPC ou dado alterado;
- nenhum prompt comercial alterado;
- nenhum arquivo da extensão alterado;
- nenhum projeto Vercel duplicado removido.

## Correção operacional antes da Fase 1

O teste real revelou que uma sugestão podia carregar `next_action_date` anterior
ao momento da aplicação. A correção foi tratada como hotfix isolado do V1:

- a extração de data descarta horários que já passaram;
- a aplicação valida novamente a data no momento do clique;
- uma sugestão que envelheceu é bloqueada antes de alterar o ciclo;
- nenhum horário novo é inventado silenciosamente;
- banco, extensão e contratos do V2 permanecem inalterados.

O teste também produziu o primeiro caso obrigatório do corpus da Fase 1:
conversa pessoal interpretada como Agenda. A classificação não foi remendada no
V1, pois a correção estrutural pertence ao novo contrato de análise e ao motor
de decisão.

## Próximo gate

A Fase 0 está encerrada. A próxima entrega é a Fase 1 - Corpus de regressão.

O hotfix precisa estar publicado, com TypeScript, lint, cenários temporais,
deployment canônico e smoke test aprovados, antes de iniciar o corpus.
