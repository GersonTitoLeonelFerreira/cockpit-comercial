# Registro técnico PT4-B - Cursor e estado de captura

> Nota de governança: este arquivo foi publicado originalmente como "Fase
> técnica 4". No roadmap oficial do produto, ele é o pacote PT4-B e compõe a
> fundação da Fase 4 - Captura completa, demonstrável e confiável.

## Objetivo

Criar o estado relacional que separa mensagens apenas observadas de mensagens
já processadas pelo Companion V2, sem depender do JSON salvo em
`ai_coaching_notes`.

A tabela `conversation_capture_state` mantém um cursor independente para cada:

```text
empresa + conversa + instalação do dispositivo
```

Ela aponta para versões imutáveis de `conversation_messages`. O ledger continua
sendo a fonte auditável; o estado de captura pode avançar sem reescrever
mensagens.

## Limites da fase

Esta fase cria somente a tabela de estado, sua migration e seus testes.

Ela não:

- altera `COMPANION_ENGINE_VERSION`, que continua em `v1`;
- envia mensagens da extensão para o ledger;
- cria rota de ingestão;
- altera o JSON produzido pelo V1;
- registra identidade de dispositivo na extensão;
- chama IA;
- decide etapa, agenda ou fechamento;
- aplica alterações no CRM;
- copia conversas ou dados de produção.

A ingestão e o avanço atômico do cursor pertencem ao pacote PT4-C, ainda
pendente na Fase 4 do produto. O motor de diagnóstico que avança o cursor
processado pertence à Fase 5 do produto.

## Semântica dos cursores

| Cursor | Momento em que avança |
|---|---|
| `last_observed_message_id` | Depois que a versão observada foi persistida no ledger |
| `last_processed_message_id` | Depois que um consumidor posterior confirmou o processamento |

O cursor processado pode ficar atrás do observado. Ele nunca pode ficar à
frente.

Os ponteiros usam o `id` sequencial do ledger, não horário, texto ou posição
visual no WhatsApp. Isso permite reconhecer mensagens inseridas depois,
inclusive edições e exclusões de mensagens mais antigas.

## Modelo criado

| Coluna | Responsabilidade |
|---|---|
| `company_id` | Empresa proprietária do estado |
| `conversation_key` | Identidade estável da conversa dentro da empresa |
| `device_key` | Identidade aleatória e pseudônima da instalação |
| `last_observed_message_id` | Última versão do ledger confirmada como persistida |
| `last_observed_at` | Horário em que o cursor observado avançou |
| `last_processed_message_id` | Última versão confirmada como processada |
| `last_processed_at` | Horário em que o cursor processado avançou |
| `state_version` | Versão usada para controle de concorrência |
| `created_at` | Criação do estado |
| `updated_at` | Última alteração do estado |

## Identidade e ciclo comercial

A chave primária é:

```text
company_id + conversation_key + device_key
```

`cycle_id` não faz parte do estado. Uma conversa de WhatsApp pode continuar
existindo quando o mesmo lead entra em um novo ciclo comercial. O ledger
registra o ciclo correspondente em cada versão; o cursor acompanha a conversa
sem reprocessar todo o histórico quando o ciclo muda.

O `device_key` deve ser um identificador aleatório criado pela instalação. Ele
não deve usar fingerprint de hardware, endereço de rede ou outro identificador
oculto do equipamento.

## Isolamento multiempresa e integridade

Os dois cursores possuem foreign keys compostas:

```text
company_id + conversation_key + message_id
```

Elas referenciam a mesma combinação no ledger. O banco bloqueia:

- ponteiro para mensagem de outra empresa;
- ponteiro para outra conversa da mesma empresa;
- cursor processado à frente do observado;
- ponteiro sem o horário correspondente;
- chaves vazias ou com espaços externos;
- versão de estado igual ou menor que zero.

A mesma `conversation_key` e o mesmo `device_key` podem existir em empresas
diferentes sem colisão. Dois dispositivos da mesma empresa também mantêm
cursores independentes.

## Concorrência

`state_version` começa em `1`. O pacote PT4-C deverá avançá-la dentro do mesmo
`INSERT ... ON CONFLICT DO UPDATE` que mover os cursores. Esse padrão elimina a
janela de corrida de um fluxo `SELECT` seguido de `INSERT` ou `UPDATE`.

O pacote PT4-B comprova o contrato de upsert, mas ainda não cria a rota que o executa
em produção.

## Segurança

- RLS habilitado e forçado;
- policy restritiva para `anon` e `authenticated`;
- todos os privilégios padrão revogados;
- `service_role` limitado a `SELECT`, `INSERT` e `UPDATE`;
- `DELETE` e `TRUNCATE` não concedidos;
- nenhuma coluna JSON;
- nenhuma dependência de `ai_coaching_notes`;
- nenhum acesso direto do cliente.

O estado precisa de `UPDATE` porque é um cursor. Essa é a diferença intencional
em relação ao ledger append-only da Fase 3.

## Artefatos

- `supabase/migrations/20260730170515_create_conversation_capture_state.sql`
- `supabase/phase-tests/phase-4-capture-state.test.mjs`
- `docs/companion-v2/PHASE_4_CAPTURE_STATE.md`
- `docs/companion-v2/PHASE_PROGRESS.md`
- `docs/companion-v2/ROLLBACK.md`
- `package.json`

## Validação local

Execute:

```bash
npm run test:schema-baseline
npm run test:companion-ledger
npm run test:companion-capture-state
npm run test:companion
npx tsc --noEmit --incremental false
```

O teste específico da Fase 4 comprova:

- RLS habilitado e forçado;
- grants mínimos do `service_role`;
- ausência de acesso de `anon` e `authenticated`;
- ausência de JSON e de vínculo com coaching;
- índices de todas as foreign keys;
- cursores independentes por empresa e dispositivo;
- avanço observado sem avanço processado;
- upsert atômico com incremento da versão;
- bloqueio de ponteiro entre empresas e conversas;
- bloqueio do cursor processado à frente;
- proteção das mensagens já referenciadas;
- ausência de permissão de exclusão para o backend.

## Aplicação e rollback

A migration é aditiva. O V1 não consulta a nova tabela.

Antes de qualquer escrita real, um ambiente descartável pode remover
`conversation_capture_state` e o índice composto adicional do ledger. Depois
que o pacote PT4-C começar a gravar:

1. manter `COMPANION_ENGINE_VERSION=v1`;
2. interromper ingestão e avanço de cursor;
3. preservar ledger e estado existentes;
4. reverter somente o gravador ou consumidor defeituoso;
5. corrigir o schema por nova migration, sem reescrever migrations aplicadas.

O cursor pode ser reconstruído a partir do ledger, mas não deve ser apagado em
produção como primeira ação de rollback.

## Definition of Done

- [x] Base integrada e schema remoto auditados sem ler conversas.
- [x] Changelog, migrations, privilégios e RLS revisados.
- [x] Migration criada manualmente no formato oficial após o CLI ser bloqueado
  pelas restrições de escrita em `/root/.supabase`.
- [x] Identidade por empresa, conversa e dispositivo definida.
- [x] Ponteiros compostos impedem mistura de empresa e conversa.
- [x] Observado e processado possuem semânticas independentes.
- [x] Cursor processado não pode ultrapassar o observado.
- [x] Estado não depende de JSON de coaching.
- [x] RLS, policy e grants mínimos definidos.
- [x] Índices das foreign keys definidos.
- [x] Teste descartável da Fase 4 aprovado.
- [x] Baseline da Fase 2 e ledger da Fase 3 continuam reproduzíveis.
- [x] Gates completos do repositório aprovados.
- [x] PR #143 revisado e integrado no commit `516dc92`.
- [x] Migration `20260730170515` aplicada no projeto remoto com autorização.
- [x] Advisors pós-migration sem novo alerta de segurança do pacote PT4-B.
- [x] Deployment canônico confirmado como `READY`.
