# Rollback do Yolen Companion

## Objetivo

Restaurar rapidamente o V1 sem perder rastreabilidade, sem apagar histórico e
sem executar comandos destrutivos no repositório ou no banco.

## Baseline protegido

- Commit V1: `50059c32ac924302822a85d044c39890c628b441`
- Tag: `yolen-companion-v1-baseline-2026-07-29`
- Extensão: `0.1.4`
- Motor padrão: `v1`

## Rollback por configuração

Este é o primeiro mecanismo e deve ser usado sempre que o código implantado
ainda for compatível com o V1:

1. Definir `COMPANION_ENGINE_VERSION=v1` no ambiente afetado.
2. promover/reimplantar a mesma versão;
3. validar conexão, resolução do lead, análise e aplicação da sugestão;
4. registrar horário, responsável, deployment e motivo.

Variável ausente também resolve para `v1`, mas a produção deve usar valor
explícito quando o rollout do V2 começar.

## Rollback de deployment

Quando o artefato atual estiver defeituoso:

1. localizar o último deployment canônico `READY`;
2. confirmar que ele aponta para um commit conhecido;
3. usar o rollback/promote da Vercel para repontar o alias de produção;
4. validar os endpoints do Companion;
5. abrir um commit de correção ou reversão no GitHub.

Não usar `git reset --hard` nem reescrever o histórico da `main`.

## Recuperação pelo GitHub

Se for necessário remover uma alteração já publicada:

1. criar um commit de `revert` da mudança defeituosa;
2. executar TypeScript, lint do escopo e build;
3. publicar normalmente;
4. confirmar o deployment;
5. manter a tag de baseline imutável.

A tag é referência de recuperação e auditoria. Ela não deve ser movida.

## Banco de dados

A Fase 0 não altera o Supabase; portanto, seu rollback não executa SQL.

Para fases futuras, nenhuma migration pode ser aprovada sem:

- objetos e tabelas afetados;
- compatibilidade de leitura/escrita com V1;
- estratégia `expand/contract`;
- consulta de validação antes e depois;
- recuperação testada em ambiente separado;
- decisão explícita sobre dados produzidos durante a janela.

Rollback de banco não deve apagar dados de conversa por padrão. Preferir
desabilitar escrita nova, preservar o ledger e reverter leitores/aplicadores.

### Estado atual das migrations V2

A Fase 3 já criou `conversation_messages` em produção. O V1 não consulta essa
tabela e o ledger deve ser preservado mesmo durante um rollback.

A Fase 4 adiciona `conversation_capture_state`, mas não liga nenhum gravador.
Antes da aplicação remota, o rollback técnico é simplesmente não aplicar a
migration. Depois da aplicação:

1. manter o motor em `v1`;
2. não habilitar a ingestão da Fase 5;
3. preservar `conversation_messages` e `conversation_capture_state`;
4. se um gravador futuro falhar, interromper sua execução;
5. corrigir por nova migration ou novo deployment.

Em ambiente descartável e sem dados, a reversão estrutural da Fase 4 pode
remover primeiro `conversation_capture_state` e depois o índice
`conversation_messages_company_conversation_id_uidx`. Esse procedimento não é
o rollback padrão de produção.

## Checklist operacional

- [ ] incidente e impacto identificados;
- [ ] empresa/ambiente afetado confirmado;
- [ ] V1 reativado;
- [ ] deployment e commit registrados;
- [ ] endpoints do Companion validados;
- [ ] nenhuma escrita indevida continuou;
- [ ] Supabase permaneceu saudável;
- [ ] causa raiz e ação corretiva documentadas.
