# Progresso do Yolen Companion V2

## Estado geral

| Campo | Valor |
|---|---|
| Fase atual | 3 - Ledger canônico de mensagens |
| Estado | Em validação local |
| Início | 2026-07-29 |
| Commit-base da Fase 3 | `63a23fb36f319453b5e95bcd371a2ecccd277ba0` |
| Tag de baseline | `yolen-companion-v1-baseline-2026-07-29` |
| Motor padrão | `v1` |
| Banco alterado | Não |
| Extensão alterada | Não |
| Correção pré-Fase 1 | Concluída no PR #137 |

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

## Integridade de mensagens antes da Fase 1

A análise da branch local preservada revelou a necessidade de tratar edições e
exclusões no WhatsApp sem reintroduzir mensagens antigas nem gerar novas
orientações a cada clique. A implementação foi reconstruída sobre a árvore da
`main` e mantém as seguintes regras:

- mensagem nova continua em análise incremental;
- edição, exclusão ou restauração reprocessa somente o dia mais recente;
- o botão manual não força reanálise sem mudança real;
- a mesma fotografia da conversa reutiliza o resultado já salvo;
- horário legítimo no fim do texto e palavras repetidas não são cortados;
- conversas retomadas no mesmo dia não são divididas por intervalo arbitrário;
- o hotfix que bloqueia agenda vencida permanece preservado;
- nenhuma migration, policy, RPC, dado ou prompt comercial é alterado.

Validação técnica:

- 13 cenários automatizados passaram;
- ESLint passou nos arquivos afetados;
- `npx tsc --noEmit` passou;
- `next build` passou com 106 rotas.

## Fechamento da correção pré-Fase 1

A correção de integridade foi publicada pelo PR
[#137](https://github.com/GersonTitoLeonelFerreira/cockpit-comercial/pull/137)
e validada no Firefox:

- mensagem nova gerou uma análise;
- edição gerou reanálise controlada;
- exclusão removeu a mensagem da fotografia atual;
- clique sem mudança reutilizou a orientação;
- nenhuma orientação duplicada foi criada;
- a aplicação da sugestão permaneceu separada da análise.

## Fase 1 - Corpus de regressão

### Escopo

- conversas exclusivamente sintéticas e anonimizadas;
- oráculo de fatos comerciais, decisão, evidências e proibições;
- identidade e versão para cenários de edição e exclusão;
- áudio transcrito e áudio sem transcrição;
- falsos positivos conhecidos de agenda;
- teste estrutural sem chamada de IA, banco ou rede.

### Checklist

- [x] Ganho explícito.
- [x] Perda explícita.
- [x] Agenda confirmada pelo cliente.
- [x] Negociação sem desfecho.
- [x] Ausência de resposta.
- [x] Mensagem editada.
- [x] Mensagem apagada.
- [x] Áudio transcrito.
- [x] Áudio sem transcrição.
- [x] Conversa pessoal com horário.
- [x] Convite feito só pelo vendedor.
- [x] Negociação superada por agendamento final.
- [x] Negociação superada por perda explícita.
- [x] Validador de cobertura, versão, evidência e anonimização.
- [x] Revisão comercial do corpus.
- [x] Validações técnicas registradas.
- [x] PR integrado e deployment canônico confirmado.

### Evidências técnicas

| Evidência | Resultado |
|---|---|
| Corpus | 14 casos e 10 coberturas obrigatórias |
| Testes Companion | 22 cenários passaram |
| ESLint | Passou nos três arquivos de teste do Companion |
| TypeScript | `npx tsc --noEmit` passou |
| Build | `next build` passou com 106 rotas |
| Dados externos | Nenhuma chamada de IA, banco ou rede durante o teste |
| Aprovação comercial | Aprovado pelo usuário em 2026-07-30 |
| Integração | PR #138 integrado por squash no commit `651765e` |
| Produção | Deployment canônico `READY`, login HTTP 200 e sem erros de runtime |

### Restrições preservadas

- nenhum arquivo de runtime alterado;
- nenhuma alteração na extensão;
- nenhum prompt comercial alterado;
- nenhuma migration, policy, grant, RPC ou dado alterado;
- motor padrão continua `v1`.

## Fase 2 - Baseline reproduzível do schema

### Escopo

- auditar schema e histórico remoto sem mutações;
- preservar os 94 arquivos SQL anteriores;
- alinhar a cadeia oficial aos 19 nomes registrados no Supabase;
- versionar a fotografia estrutural do schema `public`;
- reproduzir o schema em PostgreSQL descartável;
- comprovar RLS, policies, grants e ausência de DDL do V2.

### Checklist

- [x] Histórico remoto de 19 migrations auditado.
- [x] Schema vivo inventariado sem copiar dados.
- [x] 94 arquivos anteriores preservados em `migrations_legacy`.
- [x] Cadeia oficial alinhada aos 19 nomes remotos.
- [x] `lead_conversation_analyses` incluída no baseline.
- [x] Manifesto estrutural versionado.
- [x] Reprodução local descartável aprovada.
- [x] RLS habilitado nas 39 tabelas reproduzidas.
- [x] Advisors de segurança e performance registrados.
- [x] Nenhuma branch ou custo criado após o bloqueio do plano Supabase.
- [x] Nenhuma alteração aplicada em produção.
- [x] Gates completos do repositório aprovados.
- [x] PR integrado e deployment canônico confirmado.

### Evidências técnicas

| Evidência | Resultado |
|---|---|
| Produção | 19 migrations, 39 tabelas e 448 colunas |
| Schema | 162 constraints, 148 índices, 159 funções, 15 views e 27 triggers |
| Segurança | 103 policies e RLS em 39 de 39 tabelas |
| Histórico anterior | 94 arquivos preservados sem reescrita |
| Reprodução | `npm run test:schema-baseline` aplica e compara a cadeia em PGlite |
| Regressões | 22 testes do Companion aprovados |
| Qualidade | ESLint e `npx tsc --noEmit` aprovados |
| Build | `next build` aprovado com 106 rotas |
| Dados reais | Nenhuma linha de produção copiada |
| Mutação remota | Nenhuma migration, policy, grant, RPC ou dado alterado |
| Integração | PR #139 integrado no commit `84e57a3` |
| Produção | Deployment canônico `READY`; login HTTP 200 e sem erro de runtime |

### Restrição do ambiente

A branch temporária autorizada não foi criada porque o Supabase exige plano Pro.
Nenhum custo foi gerado. A validação foi transferida para PostgreSQL descartável
em memória; uma branch oficial continuará sendo um gate adicional quando o
recurso estiver disponível.

## Fase 3 - Ledger canônico de mensagens

### Escopo

- criar `conversation_messages` sem alterar o V1;
- registrar versões imutáveis de texto, áudio e exclusão;
- vincular cada registro à empresa e ao ciclo;
- impedir colisão entre empresas e sobrescrita do histórico;
- bloquear acesso direto de `anon` e `authenticated`;
- validar a migration em PostgreSQL descartável.

### Checklist

- [x] Pré-flight do schema e das migrations realizado sem mutação.
- [x] Mudanças recentes da Data API e RLS revisadas na documentação oficial.
- [x] Migration criada manualmente no formato oficial do Supabase após o CLI
  ser bloqueado pelas restrições do ambiente local.
- [x] Chave única por empresa, conversa, mensagem e versão.
- [x] Foreign key composta bloqueia ciclo de outra empresa.
- [x] Edição e exclusão modeladas como novas versões.
- [x] RLS habilitado e forçado.
- [x] `anon` e `authenticated` sem privilégios.
- [x] `service_role` limitado a `SELECT` e `INSERT`.
- [x] Índices de identidade, ciclo, horário e capturador.
- [x] Teste descartável da Fase 3 aprovado.
- [x] Baseline da Fase 2 permanece aprovado.
- [x] Testes de regressão do Companion aprovados.
- [x] TypeScript, lint e build aprovados.
- [ ] PR integrado e deployment canônico confirmado.
- [ ] Migration aplicada no Supabase com autorização explícita.
- [ ] Advisors pós-migration revisados.

### Evidências locais

| Evidência | Resultado |
|---|---|
| Banco vivo | 19 migrations e nenhuma tabela V2 antes da fase |
| Baseline | 1/1; schema anterior reconstruído do zero |
| Ledger | 1/1; versionamento, exclusão e duas empresas validados |
| Regressões Companion | 22/22 |
| Lint | Arquivos de teste da Fase 3 sem erros |
| TypeScript | `npx tsc --noEmit --incremental false` sem erros |
| Build | 106 rotas compiladas |
| Mutação remota | Nenhuma |
| Motor padrão | `v1` |

### Restrições preservadas

- nenhuma conversa ou linha de produção lida;
- nenhuma migration aplicada remotamente;
- nenhuma rota, extensão ou prompt alterado;
- nenhuma decisão ou alteração de CRM executada;
- nenhum custo ou branch Supabase criado.

## Próximo gate

Executar regressões do Companion, lint, TypeScript e build da árvore completa.
Depois, revisar o diff e abrir o PR da Fase 3 sem aplicar a migration em
produção.
