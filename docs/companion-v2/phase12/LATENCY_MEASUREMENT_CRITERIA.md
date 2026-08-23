# Critérios de medição de latência — arquitetura progressiva

## Papel deste documento

Formaliza **Time to First Value (TTFV)** e **Time to Deep Analysis (TTDA)**
como métricas distintas, e define os pontos de instrumentação necessários
para medi-las com dados reais. Este documento **não define um número de
PASS**. O mandato desta frente é explícito: "Não definir um número mágico
como PASS sem evidência." A Fase 12A vai estabelecer thresholds depois que
esta bateria coletar dados reais contra os PRs A/B/C.

## Por que TTFV e TTDA não podem ser medidos juntos

A arquitetura descrita pela Frente Principal tem dois resultados distintos
que chegam em momentos diferentes:

```text
captura contínua
  → debounce ~8s
    → leitura rápida               (TTFV termina aqui)
      → relevance gate
        → V2 profundo em background (TTDA termina aqui, só se disparado)
          → resultado seller-facing quando estiver pronto
```

Misturar as duas métricas em um único "tempo de resposta" reproduz
exatamente o problema que motivou a Fase 12A (V2 profundo síncrono fazendo o
vendedor esperar). Qualquer relatório desta bateria que reportar um único
número está errado por construção.

## Definições

### Time to First Value (TTFV)

**Do que o vendedor vê primeiro.** Intervalo entre o fim do debounce (o
momento em que a captura contínua decide que a conversa "assentou" e está
pronta para leitura) e o momento em que a leitura rápida fica disponível na
UI — incluindo a decisão do relevance gate quando ela for parte do caminho
rápido.

```text
TTFV = timestamp(leitura_rapida_disponivel) - timestamp(fim_do_debounce)
```

- Se a leitura rápida determinar `non_commercial`/`uncertain` e a política do
  produto for não disparar análise profunda, o ciclo termina em TTFV — não
  existe TTDA para esse ciclo (ver seção "Non-commercial" do contrato de
  validação).
- TTFV é a métrica que substitui a antiga experiência de "8s de silêncio →
  V2 profundo síncrono → vendedor espera". Se TTFV também acabar
  bloqueando o vendedor por dezenas de segundos, a arquitetura progressiva
  não resolveu o problema que a motivou.

### Time to Deep Analysis (TTDA)

**Do que chega depois, sem bloquear.** Intervalo entre o início do job
profundo (V2 stateful em background) e o momento em que o resultado fica
disponível para o vendedor — só existe quando o relevance gate decidiu que a
análise profunda era necessária.

```text
TTDA = timestamp(resultado_profundo_disponivel) - timestamp(inicio_job_profundo)
```

TTDA pode (e frequentemente vai) ultrapassar o antigo deadline de ciclo
síncrono (`DEFAULT_STATEFUL_COPILOT_CYCLE_DEADLINE_MS = 25_000`,
`stateful-copilot-cycle-deadline.ts`) sem que isso seja um problema — desde
que o vendedor não esteja bloqueado esperando. O deadline de ciclo continua
relevante como orçamento interno do motor (evita ciclos infinitos), mas
deixa de ser o teto de experiência do vendedor.

## Pontos de instrumentação obrigatórios

Cada um destes pontos precisa de um timestamp registrado (ver
`OBSERVABILITY_CONTRACT.md` para o esquema de telemetria correspondente):

| # | Ponto | O que marca |
|---|---|---|
| 1 | `debounce_settled_at` | Fim do debounce de ~8s (captura decidiu que a conversa assentou). |
| 2 | `fast_read_started_at` | Início da leitura rápida. |
| 3 | `fast_read_available_at` | Leitura rápida disponível na UI — **fecha o TTFV**. |
| 4 | `relevance_gate_decided_at` | Decisão do relevance gate (`commercial`/`non_commercial`/`uncertain`) e se disparou ou não o job profundo. |
| 5 | `deep_job_enqueued_at` | Job profundo aceito para execução (se disparado). |
| 6 | `deep_job_started_at` | Execução do job profundo de fato começou (pode ser diferente de `enqueued_at` se houver fila). |
| 7 | `deep_job_available_at` | Resultado profundo disponível para o vendedor — **fecha o TTDA**. |
| 8 | `deep_job_failed_at` / `deep_job_timeout_at` | Falha ou timeout do job profundo (mutuamente exclusivo com o item 7 para o mesmo job). |
| 9 | `fallback_applied_at` | Se aplicável, quando o fallback (V1 ou "sem intervenção necessária") foi aplicado em vez do resultado profundo. |
| 10 | `deep_job_attempt_number` | Contagem de tentativas — não é timestamp, mas obrigatório para separar "TTDA da primeira tentativa" de "TTDA total incluindo retries" (relevante para P1-03, ver `P1_03_REVALIDATION_ROADMAP.md`). |

Nenhum destes pontos existe hoje como campo de telemetria dedicado — ver
gap em `OBSERVABILITY_CONTRACT.md`. O que existe hoje
(`stateful-copilot-active-pilot-telemetry.ts`) tem `duration_ms` agregado por
execução, sem quebra por estágio, e nenhum "job id" para correlacionar os
pontos 5-9 entre si ao longo do tempo (uma execução síncrona de hoje não
precisa disso; um job assíncrono real precisa).

## O que esta bateria mede vs. o que ela não decide

Esta bateria define **como medir**, coleta **evidência real** assim que os
PRs A/B/C existirem, e relata os números — TTFV p50/p95/p99, TTDA p50/p95/p99,
taxa de timeout, taxa de fallback, número médio de tentativas — sem propor um
limite de aceitação. A decisão de threshold (ex.: "TTFV p95 abaixo de X
segundos é aceitável") é uma decisão de produto do Controle Mestre, informada
por estes números, não uma conclusão técnica desta frente.

## Falha, fallback e retry — o que precisa ficar visível separadamente

- **Timeout do job profundo** não é o mesmo que "falha" — precisa de campo
  próprio (`deep_job_timeout_at` vs. `deep_job_failed_at`) porque as duas
  situações pedem UX diferente (timeout pode justificar "ainda estamos
  analisando", falha justifica "não foi possível analisar agora").
- **Fallback** (V1 ou silêncio operacional) precisa registrar o motivo
  (`fallback_reason`, já existe como conceito em
  `stateful-copilot-active-pilot-telemetry.ts`) e o timestamp em que foi
  aplicado, para permitir calcular "por quanto tempo o vendedor ficou sem
  nenhum resultado" — que é uma métrica de experiência distinta de TTFV/TTDA.
- **Número de tentativas** precisa ser reportado tanto para o estágio rápido
  quanto para o profundo — P1-03 já mostrou que retries podem inflar
  drasticamente a latência de um estágio sem que isso apareça em um
  `duration_ms` agregado único.

## Critério de aprovação desta seção

A bateria de latência está pronta para uso quando:

1. os 10 pontos de instrumentação acima estiverem disponíveis (mesmo que só
   em ambiente de shadow/staging) — hoje, gap;
2. TTFV e TTDA puderem ser calculados independentemente a partir dos dados
   coletados;
3. nenhum relatório desta frente apresentar um número de latência único sem
   dizer qual das duas métricas (ou qual delas nem se aplica, no caso
   non-commercial) ele representa.
