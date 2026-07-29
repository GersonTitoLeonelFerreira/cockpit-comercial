# Progresso do Yolen Companion V2

## Estado geral

| Campo | Valor |
|---|---|
| Fase atual | 0 - Congelamento e proteção |
| Estado | Concluída tecnicamente; gates manuais pendentes |
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
- [ ] Tag anotada publicada no GitHub.
- [x] Commit da Fase 0 publicado.
- [x] Deployment canônico `READY`.
- [x] Verificação pós-deploy registrada.
- [ ] Fluxo real no Firefox validado pelo operador.

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
| Firefox + WhatsApp | Pendente: conectar, resolver lead, analisar e aplicar sugestão |

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

A tag anotada existe no checkout local, mas o aplicativo GitHub disponível
neste ambiente não publica refs de tag. Até o envio da tag, a branch de
segurança preserva o mesmo commit-base no GitHub.

Comandos para encerrar essa única pendência em um checkout autenticado:

```bash
git tag -a yolen-companion-v1-baseline-2026-07-29 50059c32ac924302822a85d044c39890c628b441 -m "Baseline do Yolen Companion V1 antes do desenvolvimento V2"
git push origin refs/tags/yolen-companion-v1-baseline-2026-07-29
```

A Fase 1 só pode começar depois que:

1. a tag estiver visível no GitHub;
2. o fluxo real no Firefox passar em conexão, resolução do lead, análise e
   aplicação da sugestão.
