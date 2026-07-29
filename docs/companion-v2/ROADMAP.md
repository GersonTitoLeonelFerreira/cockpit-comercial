# Roadmap do Yolen Companion V2

## Objetivo

Evoluir o Companion sem interromper o V1, separando captura, estado de
mensagens, análise, decisão comercial, coaching e aplicação no CRM.

Este roadmap é sequencial. Uma fase só avança quando sua Definition of Done
estiver registrada em `PHASE_PROGRESS.md`.

## Princípios obrigatórios

1. O V1 permanece operacional até o aceite formal do V2.
2. Captura não decide estágio comercial.
3. Análise não grava alterações no CRM.
4. Coaching não redefine a decisão do motor.
5. Aplicação no CRM sempre exige autorização, empresa e ciclo válidos.
6. Toda mensagem possui identidade, versão e estado de exclusão auditáveis.
7. Nenhuma migration do V2 é aplicada sem baseline reproduzível e rollback.
8. Toda mudança é validada com isolamento multiempresa e corpus de regressão.

## Fases

| Fase | Entrega | Definition of Done |
|---|---|---|
| 0 | Congelamento e proteção do V1 | Tag do baseline, flag com padrão `v1`, documentação de arquitetura, segurança e rollback, validações verdes e deployment confirmado |
| 1 | Corpus de regressão | Conversas anonimizadas cobrem ganho, perda, agenda, negociação, ausência de resposta, edição, exclusão, áudio e falsos positivos conhecidos |
| 2 | Baseline reproduzível do schema | Histórico de migrations conciliado com produção, schema versionado e ambiente de teste capaz de reproduzir as tabelas canônicas |
| 3 | Ledger canônico de mensagens | `conversation_messages` armazena identidade, direção, horário, conteúdo, versão e exclusão sem misturar empresas |
| 4 | Cursor e estado de captura | `conversation_capture_state` controla última mensagem observada/processada por conversa e dispositivo, sem depender de JSON de coaching |
| 5 | Ingestão idempotente | Reenvio não duplica, edição gera nova versão, exclusão é refletida e lotes parciais podem ser reconciliados |
| 6 | Contrato de análise | Payloads de entrada/saída são tipados, versionados e validados; `conversation_analysis_runs` registra execução e proveniência |
| 7 | Extração de fatos | O modelo extrai somente fatos comerciais com evidências por mensagem, sem decidir o CRM |
| 8 | Motor de decisão | `conversation_decisions` converte fatos em decisão determinística, explicável e testada contra o corpus |
| 9 | Coaching independente | `conversation_coaching_outputs` recebe fatos e decisão, produz orientação sem alterar estágio ou agenda |
| 10 | Aplicação controlada no CRM | Sugestão e aplicação ficam separadas; idempotência, autorização, evento e auditoria são obrigatórios |
| 11 | Avaliação e observabilidade | Métricas de falso positivo, cobertura, latência, custo, reprocessamento e divergência V1/V2 ficam disponíveis |
| 12 | Privacidade, retenção e rollout | Redação de dados sensíveis, prazos de retenção, feature flag por empresa/usuário e piloto controlado são validados |
| 13 | Cutover e desativação do V1 | Paridade aprovada, rollback testado, V2 promovido gradualmente e V1 removido somente após janela de estabilidade |

## Modelo de dados alvo

As tabelas abaixo são nomes de arquitetura. Sua DDL será definida somente
depois da Fase 2.

| Tabela | Responsabilidade exclusiva |
|---|---|
| `conversation_messages` | Ledger versionado das mensagens |
| `conversation_capture_state` | Cursor e sincronização da captura |
| `conversation_analysis_runs` | Entradas, versão do motor e resultado de cada análise |
| `conversation_decisions` | Decisão comercial e evidências |
| `conversation_coaching_outputs` | Orientação e mensagem sugerida |

## Regra de promoção

O V2 não pode ser habilitado em produção apenas porque compila. A promoção
exige:

- corpus de regressão aprovado;
- isolamento multiempresa validado;
- migrations reproduzíveis;
- comparação V1/V2 documentada;
- rollback exercitado;
- autorização explícita para o piloto.
