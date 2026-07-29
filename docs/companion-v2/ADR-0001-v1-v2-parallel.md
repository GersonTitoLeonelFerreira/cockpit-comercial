# ADR-0001: Companion V1 e V2 em paralelo

- Status: aceito para a Fase 0
- Data: 2026-07-29
- Baseline: `50059c32ac924302822a85d044c39890c628b441`
- Tag: `yolen-companion-v1-baseline-2026-07-29`

## Contexto

O endpoint `app/api/companion/analyze-conversation/route.ts` concentra
autenticação, seleção de contexto, cursor incremental, análise, decisão,
coaching, persistência e criação de eventos. Esse acoplamento permite que uma
classificação incorreta contamine as etapas seguintes e dificulta reprocessar
mensagens editadas ou removidas.

O V1 está em uso. Uma substituição direta criaria risco desnecessário para a
operação comercial e para os dados já capturados.

## Decisão

O V1 e o V2 coexistirão durante a evolução.

`COMPANION_ENGINE_VERSION` seleciona o motor:

- variável ausente ou `v1`: executa o fluxo atual;
- `v2`: retorna indisponibilidade explícita até que o contrato V2 exista;
- qualquer outro valor: falha de configuração explícita.

O padrão seguro é sempre `v1`. Nenhuma empresa entra no V2 implicitamente.

## Fronteiras de responsabilidade

| Camada | Responsabilidade | Não pode fazer |
|---|---|---|
| Captura | Observar e transmitir mensagens com identidade e versão | Decidir estágio, agenda ou coaching |
| Ingestão | Validar, deduplicar, versionar e persistir mensagens | Alterar o CRM |
| Análise | Extrair fatos e evidências | Aplicar estágio ou próxima ação |
| Decisão | Converter fatos em decisão comercial explicável | Produzir coaching |
| Coaching | Orientar o vendedor com base em fatos e decisão | Redefinir a decisão |
| Aplicação CRM | Aplicar uma decisão autorizada e registrar evento | Reanalisar a conversa |

## Ownership das rotas

| Rota | Estado na Fase 0 | Ownership futuro |
|---|---|---|
| `/api/companion/connect` | Compartilhada, sem alteração | Autenticação e emissão de sessão |
| `/api/companion/me` | Compartilhada, sem alteração | Identidade e contexto do usuário |
| `/api/companion/resolve-lead` | Compartilhada, sem alteração | Resolução do lead/ciclo com autorização |
| `/api/companion/audio-transcriptions` | V1, sem alteração | Consulta de transcrições |
| `/api/companion/transcribe-audio` | V1, sem alteração | Ingestão/transcrição de áudio |
| `/api/companion/message-action` | V1, sem alteração | Ações manuais originadas da mensagem |
| `/api/companion/analyze-conversation` | Seletor V1/V2; apenas V1 implementado | Orquestrador compatível, sem lógica de domínio |
| `/api/companion/apply-suggestion` | V1, sem alteração | Aplicação idempotente e auditada no CRM |

## Baseline dos prompts e do orquestrador

Hashes SHA-256 calculados no commit-base:

| Arquivo | SHA-256 |
|---|---|
| `app/lib/ai/sales-copilot.ts` | `bf9a157d25802f8488f05984f8cdd0427ce7cfdd33dd50243031cd36f0896111` |
| `app/lib/ai/sales-coaching.ts` | `e8d71f7859c4caefbd2a5dbd9d9f9136c4a171a8f4ca6208195966d8fbb2f8bc` |
| `app/api/companion/analyze-conversation/route.ts` | `5f4f6cee70e1a4b1947a47dfe2d97146f47de51a9b8077d3c6e309da82f8ee89` |

Esses hashes registram o V1 congelado; o arquivo da rota muda na Fase 0 apenas
para receber o seletor de versão.

## Consequências

### Positivas

- rollback imediato para V1 por configuração;
- construção do V2 sem reescrever o motor operacional;
- responsabilidades testáveis de forma independente;
- comparação V1/V2 antes de qualquer aplicação no CRM.

### Custos

- coexistência temporária de dois contratos;
- necessidade de observabilidade por versão;
- manutenção do V1 até o aceite formal do cutover.

## Não decidido nesta ADR

- DDL final das cinco tabelas do V2;
- modelo e provedor de IA;
- retenção definitiva do conteúdo;
- critérios numéricos de aprovação do piloto;
- data de desativação do V1.
