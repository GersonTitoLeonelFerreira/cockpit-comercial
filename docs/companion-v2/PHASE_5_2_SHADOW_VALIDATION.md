# Fase 5.2 — Validação do Motor V2 em Shadow

## Objetivo

Executar e medir o Motor V2 em paralelo ao Companion V1 antes de qualquer
exposição ao vendedor.

Fluxo:

```text
WhatsApp → captura/ledger → analyze-conversation → resposta V1
                                                ↓
                                           Next.js after()
                                                ↓
                                       gate → V2 stateful
                                                ↓
                                      persistência/auditoria
```

Guardrails:

```text
COMPANION_ENGINE_VERSION="v1"
COMPANION_STATEFUL_MODE="disabled"
COMPANION_STATEFUL_COMPANY_IDS=""
```

O V2 não pode alterar CRM, Agenda, ganho ou perda automaticamente.

## Relatório V1 x V2

Usa somente estruturas já existentes:

- V1: `public.ai_coaching_notes`, `source = whatsapp_companion`;
- V2: `public.companion_commercial_state_events`.

Mede:

- análises V1 e V2;
- pareamento por ciclo e proximidade temporal;
- V1 sem V2 persistido e V2 sem V1 correspondente;
- tokens;
- modelo;
- retries;
- latência aproximada entre contexto carregado e persistência;
- concordância de estágio CRM;
- violações dos guardrails de escrita automática.

Executar:

```bash
npm run report:companion-shadow -- <COMPANY_ID> 24
```

A janela padrão é 24 horas e o máximo é 720.

O custo é opcional e nunca fica congelado no código. Para estimá-lo:

```bash
COMPANION_SHADOW_INPUT_USD_PER_1M="<TARIFA>" \
COMPANION_SHADOW_OUTPUT_USD_PER_1M="<TARIFA>" \
npm run report:companion-shadow -- <COMPANY_ID> 24
```

Sem tarifas, os tokens permanecem exatos e `estimated_cost_usd` fica `null`.

Falhas que impedem persistência continuam identificadas nos logs por:

```text
YOLEN_COMPANION_STATEFUL_SHADOW
```

Durante um piloto controlado, `v1_without_persisted_v2` é um indicador para
investigação junto dos logs, não uma prova automática de falha.

## Gate do piloto

Antes de autorizar uma empresa em `shadow`:

1. Companion, runtime, TypeScript e build verdes;
2. relatório V1 x V2 disponível;
3. logs disponíveis;
4. engine mantido em `v1`;
5. UUID da empresa piloto definido explicitamente;
6. rollback imediato para `disabled`.

Ativação controlada:

```text
COMPANION_ENGINE_VERSION="v1"
COMPANION_STATEFUL_MODE="shadow"
COMPANION_STATEFUL_COMPANY_IDS="<UUID_EMPRESA_PILOTO>"
```

O curinga `*` continua proibido.

## Fechamento da Fase 5.2

Exige shadow real controlado, revisão comercial das divergências, medição de
tokens/custo/latência/retries, estabilidade e aceite funcional explícito.
