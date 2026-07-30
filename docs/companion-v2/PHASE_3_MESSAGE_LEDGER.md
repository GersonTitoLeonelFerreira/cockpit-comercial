# Fase 3 - Ledger canônico de mensagens

## Objetivo

Criar a fundação persistente e versionada das mensagens do Companion V2 sem
alterar o V1, a extensão, os prompts ou o CRM.

A tabela `conversation_messages` registra cada versão observada como uma nova
linha. Mensagens editadas não sobrescrevem o conteúdo anterior. Uma exclusão é
uma nova versão sem conteúdo e com `is_deleted = true`.

## Limites da fase

Esta fase cria somente o ledger e seus testes.

Ela não:

- altera `COMPANION_ENGINE_VERSION`, que continua em `v1`;
- envia mensagens da extensão para a tabela;
- cria cursor de captura;
- implementa ingestão ou reconciliação;
- chama IA;
- decide etapa, agenda ou fechamento;
- aplica alterações no CRM;
- copia conversas ou dados de produção.

O cursor entra na Fase 4. A escrita idempotente entra na Fase 5.

## Modelo criado

| Coluna | Responsabilidade |
|---|---|
| `id` | Identidade interna sequencial da versão |
| `company_id` | Empresa proprietária do registro |
| `cycle_id` | Ciclo comercial associado no momento da captura |
| `conversation_key` | Identidade estável da conversa dentro da empresa |
| `message_key` | Identidade estável da mensagem na origem |
| `version` | Versão crescente da mesma mensagem |
| `direction` | `incoming` ou `outgoing` |
| `occurred_at` | Horário da mensagem na origem |
| `content_type` | `text` ou `audio` |
| `text_content` | Texto ou legenda da mensagem |
| `audio_transcription` | Transcrição, quando disponível |
| `is_deleted` | Indica que esta versão representa uma exclusão |
| `captured_by` | Usuário que originou a captura |
| `ingested_at` | Horário de entrada no ledger |

## Identidade e versionamento

A identidade lógica de uma versão é:

```text
company_id + conversation_key + message_key + version
```

Essa combinação é única.

O estado atual de uma mensagem é derivado da maior versão:

- maior versão com `is_deleted = false`: mensagem ativa;
- maior versão com `is_deleted = true`: mensagem apagada;
- versões anteriores: histórico superado.

Esse desenho evita atualizar versões anteriores e deixa o ledger append-only
para o `service_role`.

## Isolamento multiempresa

O vínculo composto:

```text
(company_id, cycle_id)
```

referencia:

```text
sales_cycles(company_id, id)
```

Com isso, um ciclo de uma empresa não pode ser gravado como mensagem de outra
empresa. A mesma chave externa pode existir em empresas diferentes sem colisão.

## Segurança

O projeto ainda possui privilégios padrão amplos para tabelas novas. A
migration não depende desses padrões:

- ativa e força RLS;
- cria uma policy restritiva que nega `anon` e `authenticated`;
- revoga todos os privilégios de `public`, `anon`, `authenticated` e
  `service_role`;
- devolve ao `service_role` apenas `SELECT` e `INSERT`;
- não concede `UPDATE`, `DELETE` ou `TRUNCATE`;
- concede à sequência apenas o necessário para gerar o `id`.

Nenhum cliente acessa o ledger diretamente. As fases futuras usarão rotas
server-side com autorização explícita.

## Integridade de conteúdo

As constraints impedem:

- versão igual ou menor que zero;
- direção fora do contrato;
- tipo de conteúdo desconhecido;
- chaves vazias, com espaços externos ou maiores que 500 caracteres;
- mensagem de texto ativa sem texto;
- transcrição em conteúdo que não seja áudio;
- versão apagada que ainda carregue texto ou transcrição.

Áudio sem transcrição é válido e permanece bloqueante para decisões comerciais
nas fases posteriores.

## Artefatos

- `supabase/migrations/20260730155903_create_conversation_messages_ledger.sql`
- `supabase/phase-tests/phase-3-message-ledger.test.mjs`
- `supabase/schema-baseline/schema-baseline.test.mjs`
- `supabase/schema-baseline/README.md`
- `package.json`

## Validação local

Execute:

```bash
npm run test:schema-baseline
npm run test:companion-ledger
npm run test:companion
npx tsc --noEmit --incremental false
```

O teste específico da Fase 3 comprova:

- criação da tabela e da identidade sequencial;
- RLS habilitado e forçado;
- acesso direto negado a `anon` e `authenticated`;
- `service_role` limitado a leitura e inserção;
- índices para identidade, ciclo, horário e usuário capturador;
- três versões preservadas para a mesma mensagem;
- exclusão sem conteúdo;
- mesma identidade externa permitida em empresas diferentes;
- duplicidade bloqueada dentro da mesma empresa;
- vínculo cruzado entre empresa e ciclo bloqueado;
- sobrescrita de versão bloqueada para o `service_role`.

## Aplicação e rollback

A migration é aditiva e o V1 não consulta a tabela.

Antes de qualquer escrita real, o rollback técnico pode remover a tabela em
ambiente descartável. Depois que o ledger receber mensagens reais, o rollback
operacional não deve apagar histórico:

1. manter `COMPANION_ENGINE_VERSION=v1`;
2. interromper a ingestão V2;
3. preservar `conversation_messages` sem novas escritas;
4. reverter somente os leitores ou gravadores defeituosos;
5. corrigir por uma nova migration, sem reescrever a migration aplicada.

## Definition of Done

- [x] Migration criada manualmente no formato oficial de migrations do Supabase
  após o CLI ser bloqueado pelas restrições do ambiente local.
- [x] Ledger append-only e versionado definido.
- [x] Exclusão representada sem preservar conteúdo na nova versão.
- [x] Vínculo composto impede ciclo de outra empresa.
- [x] RLS, policy e grants mínimos definidos.
- [x] Índices das chaves de consulta e foreign keys definidos.
- [x] Teste descartável da Fase 3 aprovado.
- [x] Baseline da Fase 2 continua reproduzível.
- [x] Gates completos do repositório aprovados.
- [x] PR #142 revisado e integrado no commit `b92bbd4`.
- [x] Migration aplicada no projeto remoto com autorização.
- [x] Advisors pós-migration sem novo alerta de segurança da Fase 3.
- [x] Deployment canônico confirmado como `READY`.
