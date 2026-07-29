# Progresso do Yolen Companion V2

## Estado geral

| Campo | Valor |
|---|---|
| Fase atual | 0 - Congelamento e proteção |
| Estado | Em publicação |
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
- [ ] Tag criada no GitHub.
- [ ] Commit da Fase 0 publicado.
- [ ] Deployment canônico `READY`.
- [ ] Verificação pós-deploy registrada.

## Evidências

| Evidência | Resultado |
|---|---|
| TypeScript | `npx tsc --noEmit` passou |
| Lint Companion | ESLint passou em rotas, tipos, biblioteca e extensão |
| Seletor do motor | 5 cenários passaram: ausência, vazio, `v1`, `v2` normalizado e valor inválido |
| Build | `next build` passou com certificados do sistema e variáveis temporárias sem segredos |
| Commit | Pendente |
| Deployment | Pendente |
| Supabase após publicação | Pendente |

## Aprovações

| Data | Decisão |
|---|---|
| 2026-07-29 | Usuário autorizou a execução completa da Fase 0 |

## Restrições preservadas

- nenhuma migration criada ou aplicada;
- nenhuma policy, grant, RPC ou dado alterado;
- nenhum prompt comercial alterado;
- nenhum arquivo da extensão alterado;
- nenhum projeto Vercel duplicado removido.

## Próximo gate

A Fase 1 só pode começar após todas as evidências da Fase 0 estarem preenchidas
e o deployment canônico estar estável.
