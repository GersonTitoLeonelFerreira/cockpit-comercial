# Contrato de observabilidade — arquitetura progressiva

## Papel deste documento

Audita a telemetria hoje existente para o Companion stateful, define o
conjunto mínimo necessário para validar a arquitetura progressiva sem
registrar conteúdo sensível, e documenta os gaps. Não altera nenhum runtime
de produção nem nenhum schema de telemetria — é insumo para a Frente
Principal decidir o que instrumentar no PR A.

## O que já existe hoje

### Canal 1 — telemetria de shadow (em produção, não persistida em tabela dedicada)

`app/api/companion/analyze-conversation/route.ts`, dentro do `after()` da
rota: `console.info('YOLEN_COMPANION_STATEFUL_SHADOW', JSON.stringify({...}))`
com os campos `event`, `company_id`, `cycle_id`, `activation_mode`,
`runtime_mode`, `response_source`, `stateful_executed`, `duration_ms`,
`execution`, `failure`, `automatic_crm_write`, `automatic_agenda_write`. Em
falha não tratada, `console.warn` com `{event: 'stateful_shadow_unhandled_failure', company_id, cycle_id, duration_ms}`.

### Canal 2 — telemetria do piloto ativo (persistida)

`stateful-copilot-active-pilot-telemetry.ts` define
`StatefulCopilotActivePilotTelemetry`, gravado via
`rpc_record_companion_active_pilot_event` (RPC recebe `company_id`,
`cycle_id`, o payload de telemetria; retorna `event_id`+`recorded_at`).
Campos existentes: `phase`, `channel`, `event`
(`active_success`/`active_fallback_v1`/`active_unhandled_fallback_v1`),
`company_id`, `cycle_id`, `runtime_mode`, `response_source`,
`stateful_executed`, `v1_executed`, `duration_ms`, `fallback_reason`,
`failure_code`, `failure_status_code`, `failure_retryable`,
`diagnostic_failure_path`, `diagnostic_failure_invariant`,
`communication_failure_path`, `communication_failure_invariant`,
`communication_attempts`, `recovered_after_retry`, `engine_mode`,
`persistence_mode`, `persisted`, `automatic_crm_write`,
`automatic_agenda_write`, `safety.{automatic_writes_blocked, persistence_confirmed_before_exposure}`,
`health`, `kill_switch_recommended`, `signals[]`.

### O que os dois canais têm em comum (e em falta)

- Nenhum dos dois registra texto de conversa, prompt completo, ou qualquer
  conteúdo livre — só ids, enums, booleans, contagens e durações. Isso já
  atende à regra "não registrar texto da conversa/prompts completos" desta
  missão.
- **Nenhum dos dois tem um `job_id`/`run_id` emitido no início da execução.**
  O `event_id` do canal 2 é atribuído pelo banco no momento da escrita — só
  existe depois que tudo já terminou, não serve para correlacionar estágios
  de um job em andamento.
- **Nenhum dos dois quebra `duration_ms` por estágio.** Um único número
  agregado não permite calcular TTFV/TTDA separadamente (ver
  `LATENCY_MEASUREMENT_CRITERIA.md`).
- **Nenhum registra `attempt_number`** de forma genérica — `communication_attempts`
  existe só para o sub-estágio de comunicação, não para o pipeline inteiro.
- Nenhum campo indica se um resultado foi descartado por estar
  `superseded`/`stale` — porque esse conceito não existe hoje (não há job
  assíncrono para ficar obsoleto).

## Conjunto mínimo necessário para validar a arquitetura progressiva

Baseado na lista do mandato (seção 13), cruzada com os campos que já
existem, o que falta e o que pode ser reaproveitado:

| Campo pedido pelo mandato | Já existe? | Onde / o que falta |
|---|---|---|
| `job_id` | **Não** | Precisa ser emitido no momento do enqueue (não no momento da persistência), para permitir correlacionar `enqueued → started → completed/failed/superseded`. |
| Identificador seguro de company/cycle/conversation | **Sim, mas não são hashes** | `company_id`/`cycle_id` já trafegam como UUID nos dois canais — são identificadores internos, não conteúdo sensível; `conversation_key` (telefone) é mais sensível e não aparece em nenhum dos dois canais hoje — se vier a ser necessário para depuração, deveria ser hasheado, nunca em texto puro. |
| `watermark` | **Não, de forma unificada** | Existem três sinais de "versão"/"frescor" hoje (`state.version`+`updated_at`, conjunto de `message_ids`, fingerprint client-side) que não se referenciam entre si — ver `PROGRESSIVE_BACKGROUND_VALIDATION_CONTRACT.md`, seção "watermark canônico". A telemetria da arquitetura progressiva deveria registrar um único watermark canônico por job. |
| `created_at` | Parcial | `recorded_at` existe (quando o evento é gravado no banco), não é o mesmo que "quando o job foi criado/enfileirado". |
| `started_at` | **Não** | Falta. |
| `completed_at` | Parcial | `recorded_at` de novo — não distingue "quando terminou de executar" de "quando foi persistido/registrado". |
| `status` | Parcial | `event` (`active_success`/`active_fallback_v1`/`active_unhandled_fallback_v1`) cobre um subconjunto; falta um status explícito para `superseded`/`stale`/`cancelled`, que não existem no vocabulário atual. |
| `failure code` | **Sim** | `failure_code`, `failure_status_code`, `failure_retryable` já existem. |
| `superseded`/`stale` | **Não** | Não existe porque o conceito de job assíncrono descartável não existe hoje — ver gap central desta frente. |
| `deep analysis attempts` | Parcial | `communication_attempts` existe só para o sub-estágio de comunicação; falta um contador de nível de job para o pipeline profundo inteiro. |
| `time-to-first-value` | **Não** | Não existe estágio de "leitura rápida" separado hoje — todo o V1/V2 stateful é uma única chamada síncrona. |
| `time-to-deep-analysis` | Parcial | `duration_ms` existe, mas é o tempo da chamada inteira (não separa início do job profundo do fim). |

## O que NÃO deve ser registrado (regra dura, já respeitada hoje)

- Texto de mensagens, transcrições de áudio, ou qualquer trecho literal da
  conversa.
- Prompts completos enviados ao modelo (mesmo que só para depuração).
- `conversation_key` em texto puro fora do necessário para roteamento
  operacional já existente (hoje ele não trafega em nenhum dos dois canais de
  telemetria — não regredir isso ao adicionar novos campos).
- Qualquer campo que já é bloqueado pela lista `FORBIDDEN_METADATA_KEYS`
  (`action-events-contract.ts`) — essa disciplina já existe para a
  telemetria de ações do vendedor (`action-events-contract.ts`,
  `findForbiddenMetadataPath`) e deveria se estender a qualquer novo canal de
  telemetria de job em background.

## Gap declarado ao Controle Mestre

A telemetria atual foi desenhada para uma execução síncrona única por
ciclo. Ela não tem os campos necessários para: (1) correlacionar estágios de
um job assíncrono ao longo do tempo (`job_id` ausente), (2) medir TTFV/TTDA
separadamente (sem quebra de `duration_ms` por estágio), (3) expressar que um
resultado foi descartado por estar obsoleto (`superseded`/`stale` ausentes
do vocabulário). Nenhuma dessas lacunas foi fechada por esta frente — isso
exigiria alterar `stateful-copilot-active-pilot-telemetry.ts` e o schema de
persistência correspondente, fora do escopo desta missão (arquivos
protegidos). Esta seção documenta a lacuna para a Frente Principal decidir
como fechá-la no PR A.
